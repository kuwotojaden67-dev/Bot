"""
Contextual Candlestick Pattern Engine for 2REAL AI TRADER.
Detects:
- Bullish and Bearish Engulfing patterns
- Bullish and Bearish Pin Bars
- Hammer and Shooting Star patterns (with prior swing leg context)
- Strong Momentum / Expansion candles
- Inside Bars
- Rejection Candles
- 3-Candle Morning Star and Evening Star reversals
Note: Candlestick patterns are confirmation factors and never trigger a standalone trade without structural confluence.
"""
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd

from backend.strategies.fvg import compute_atr_series


class CandlestickEngine:
    """
    Identifies single- and multi-candle price action confirmations.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        cfg = config or {}
        self.pinbar_wick_ratio: float = float(cfg.get("pinbar_wick_ratio", 2.2))
        self.momentum_body_ratio: float = float(cfg.get("momentum_body_ratio", 0.72))
        self.require_structural_context: bool = bool(cfg.get("require_structural_context", True))

    def analyze(self, df: pd.DataFrame) -> Dict[str, Any]:
        n = len(df)
        if n < 10:
            return {
                "patterns": [],
                "latest_bullish_patterns": [],
                "latest_bearish_patterns": [],
                "bullish_confirmation": False,
                "bearish_confirmation": False,
            }

        opens = df["open"].to_numpy(dtype=float)
        highs = df["high"].to_numpy(dtype=float)
        lows = df["low"].to_numpy(dtype=float)
        closes = df["close"].to_numpy(dtype=float)
        times = df["time"].astype(str).to_list()
        atr = compute_atr_series(df, 14)

        patterns: List[Dict[str, Any]] = []
        scan_start = max(5, n - 25)

        for i in range(scan_start, n):
            op, hi, lo, cl = opens[i], highs[i], lows[i], closes[i]
            prev_op, prev_hi, prev_lo, prev_cl = opens[i - 1], highs[i - 1], lows[i - 1], closes[i - 1]
            cur_atr = max(float(atr[i]), 1e-9)

            body = abs(cl - op)
            prev_body = abs(prev_cl - prev_op)
            full_range = max(hi - lo, 1e-9)
            upper_wick = hi - max(op, cl)
            lower_wick = min(op, cl) - lo
            prior_slope = closes[i - 1] - closes[max(0, i - 5)]

            # 1. Bullish Engulfing
            if (
                prev_cl < prev_op
                and cl > op
                and cl >= prev_op
                and op <= prev_cl
                and body > prev_body * 1.05
                and body >= 0.45 * cur_atr
            ):
                patterns.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "pattern": "BULLISH_ENGULFING",
                        "direction": "BULLISH",
                        "strength": round(min(body / cur_atr, 3.0), 2),
                    }
                )

            # 2. Bearish Engulfing
            if (
                prev_cl > prev_op
                and cl < op
                and cl <= prev_op
                and op >= prev_cl
                and body > prev_body * 1.05
                and body >= 0.45 * cur_atr
            ):
                patterns.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "pattern": "BEARISH_ENGULFING",
                        "direction": "BEARISH",
                        "strength": round(min(body / cur_atr, 3.0), 2),
                    }
                )

            # 3. Bullish Pin Bar / Hammer
            eff_body = max(body, 0.10 * full_range)
            if lower_wick >= self.pinbar_wick_ratio * eff_body and upper_wick <= 0.35 * full_range and full_range >= 0.50 * cur_atr:
                pat_name = "HAMMER" if prior_slope < 0 else "BULLISH_PIN_BAR"
                patterns.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "pattern": pat_name,
                        "direction": "BULLISH",
                        "strength": round(min(lower_wick / eff_body, 4.0), 2),
                    }
                )

            # 4. Bearish Pin Bar / Shooting Star
            if upper_wick >= self.pinbar_wick_ratio * eff_body and lower_wick <= 0.35 * full_range and full_range >= 0.50 * cur_atr:
                pat_name = "SHOOTING_STAR" if prior_slope > 0 else "BEARISH_PIN_BAR"
                patterns.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "pattern": pat_name,
                        "direction": "BEARISH",
                        "strength": round(min(upper_wick / eff_body, 4.0), 2),
                    }
                )

            # 5. Strong Momentum Candle
            if (body / full_range) >= self.momentum_body_ratio and body >= 1.10 * cur_atr:
                patterns.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "pattern": "BULLISH_MOMENTUM" if cl > op else "BEARISH_MOMENTUM",
                        "direction": "BULLISH" if cl > op else "BEARISH",
                        "strength": round(body / cur_atr, 2),
                    }
                )

            # 6. Inside Bar
            if hi < prev_hi and lo > prev_lo:
                patterns.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "pattern": "INSIDE_BAR",
                        "direction": "BULLISH" if cl > op else "BEARISH",
                        "strength": 1.0,
                    }
                )

            # 7. Rejection Candle (wick >= 55% of range)
            if lower_wick >= 0.55 * full_range and cl > (hi + lo) / 2.0:
                patterns.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "pattern": "BULLISH_REJECTION",
                        "direction": "BULLISH",
                        "strength": round(lower_wick / full_range, 2),
                    }
                )
            elif upper_wick >= 0.55 * full_range and cl < (hi + lo) / 2.0:
                patterns.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "pattern": "BEARISH_REJECTION",
                        "direction": "BEARISH",
                        "strength": round(upper_wick / full_range, 2),
                    }
                )

            # 8. 3-Candle Morning Star / Evening Star
            if i >= 2:
                c1_op, c1_cl = opens[i - 2], closes[i - 2]
                c2_body = abs(closes[i - 1] - opens[i - 1])
                c1_body = abs(c1_cl - c1_op)
                c1_mid = (c1_op + c1_cl) / 2.0
                if (
                    c1_cl < c1_op
                    and c1_body >= 0.60 * cur_atr
                    and c2_body <= 0.45 * c1_body
                    and cl > op
                    and cl > c1_mid
                ):
                    patterns.append(
                        {
                            "bar_index": int(i),
                            "time": times[i],
                            "pattern": "MORNING_STAR_REVERSAL",
                            "direction": "BULLISH",
                            "strength": 2.0,
                        }
                    )
                elif (
                    c1_cl > c1_op
                    and c1_body >= 0.60 * cur_atr
                    and c2_body <= 0.45 * c1_body
                    and cl < op
                    and cl < c1_mid
                ):
                    patterns.append(
                        {
                            "bar_index": int(i),
                            "time": times[i],
                            "pattern": "EVENING_STAR_REVERSAL",
                            "direction": "BEARISH",
                            "strength": 2.0,
                        }
                    )

        # Patterns occurring within the last 3 closed bars count as active confirmation
        recent_cutoff = n - 4
        latest_bullish = [p for p in patterns if p["bar_index"] >= recent_cutoff and p["direction"] == "BULLISH"]
        latest_bearish = [p for p in patterns if p["bar_index"] >= recent_cutoff and p["direction"] == "BEARISH"]

        return {
            "patterns": patterns[-20:],
            "latest_bullish_patterns": latest_bullish,
            "latest_bearish_patterns": latest_bearish,
            "bullish_confirmation": len(latest_bullish) > 0,
            "bearish_confirmation": len(latest_bearish) > 0,
        }
