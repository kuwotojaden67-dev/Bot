"""
Breakout & Fakeout Engine for 2REAL AI TRADER.
Identifies:
- Confirmed range breakouts (decisive candle close outside prior range + ATR & volume confirmation)
- Failed breakouts / Fakeouts (significant liquidity pierce beyond range high/low >= min_pierce_atr * ATR
  followed by rejection close back inside the range; trivial noise wicks are ignored)
- Break-and-retest setups
"""
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd

from backend.strategies.fvg import compute_atr_series


class BreakoutFakeoutEngine:
    """
    Detects range boundaries, confirmed breakouts, break-and-retests, and engineered fakeouts.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        cfg = config or {}
        self.range_lookback: int = max(8, int(cfg.get("range_lookback", 24)))
        self.min_pierce_atr: float = float(cfg.get("min_pierce_atr", 0.15))
        self.confirm_body_atr: float = float(cfg.get("confirm_body_atr", 0.65))
        self.volume_mult_threshold: float = float(cfg.get("volume_mult_threshold", 1.15))

    def analyze(self, df: pd.DataFrame) -> Dict[str, Any]:
        n = len(df)
        lb = self.range_lookback
        if n < lb + 10:
            return {
                "range_high": None,
                "range_low": None,
                "breakouts": [],
                "fakeouts": [],
                "retests": [],
                "active_signal": "NONE",
            }

        opens = df["open"].to_numpy(dtype=float)
        highs = df["high"].to_numpy(dtype=float)
        lows = df["low"].to_numpy(dtype=float)
        closes = df["close"].to_numpy(dtype=float)
        vols = df["tick_volume"].to_numpy(dtype=float)
        times = df["time"].astype(str).to_list()
        atr = compute_atr_series(df, 14)

        breakouts: List[Dict[str, Any]] = []
        fakeouts: List[Dict[str, Any]] = []
        retests: List[Dict[str, Any]] = []

        scan_start = max(lb + 2, n - 35)
        for i in range(scan_start, n):
            # Reference range is [i - lb - 1 : i - 1]
            r_high = float(np.max(highs[i - lb : i]))
            r_low = float(np.min(lows[i - lb : i]))
            avg_vol = max(float(np.mean(vols[i - lb : i])), 1.0)
            cur_atr = max(float(atr[i]), 1e-9)
            body = abs(closes[i] - opens[i])
            vol_ratio = vols[i] / avg_vol

            # 1. Check Confirmed Bullish Breakout
            if closes[i] > r_high + 0.10 * cur_atr and body >= self.confirm_body_atr * cur_atr and vol_ratio >= self.volume_mult_threshold:
                breakouts.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "type": "BULLISH_BREAKOUT",
                        "level": round(r_high, 6),
                        "close_price": round(float(closes[i]), 6),
                        "volume_ratio": round(vol_ratio, 2),
                    }
                )
            # 2. Check Confirmed Bearish Breakout
            elif closes[i] < r_low - 0.10 * cur_atr and body >= self.confirm_body_atr * cur_atr and vol_ratio >= self.volume_mult_threshold:
                breakouts.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "type": "BEARISH_BREAKOUT",
                        "level": round(r_low, 6),
                        "close_price": round(float(closes[i]), 6),
                        "volume_ratio": round(vol_ratio, 2),
                    }
                )

            # 3. Check Bullish Fakeout (Bearish trap below range low that rejects back inside)
            lower_pierce = r_low - lows[i]
            lower_wick = min(opens[i], closes[i]) - lows[i]
            if (
                lower_pierce >= self.min_pierce_atr * cur_atr
                and closes[i] > r_low
                and lower_wick >= 0.40 * max(highs[i] - lows[i], 1e-9)
            ):
                fakeouts.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "type": "BULLISH_FAKEOUT_SWEEP",
                        "swept_level": round(r_low, 6),
                        "extreme": round(float(lows[i]), 6),
                        "close_price": round(float(closes[i]), 6),
                        "pierce_atr": round(lower_pierce / cur_atr, 2),
                    }
                )

            # 4. Check Bearish Fakeout (Bullish trap above range high that rejects back inside)
            upper_pierce = highs[i] - r_high
            upper_wick = highs[i] - max(opens[i], closes[i])
            if (
                upper_pierce >= self.min_pierce_atr * cur_atr
                and closes[i] < r_high
                and upper_wick >= 0.40 * max(highs[i] - lows[i], 1e-9)
            ):
                fakeouts.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "type": "BEARISH_FAKEOUT_SWEEP",
                        "swept_level": round(r_high, 6),
                        "extreme": round(float(highs[i]), 6),
                        "close_price": round(float(closes[i]), 6),
                        "pierce_atr": round(upper_pierce / cur_atr, 2),
                    }
                )

        # 5. Check Break-and-Retest setups from recent breakouts
        for bo in breakouts:
            b_idx = bo["bar_index"]
            lvl = bo["level"]
            for j in range(b_idx + 1, n):
                cur_atr = max(float(atr[j]), 1e-9)
                if bo["type"] == "BULLISH_BREAKOUT":
                    if (lvl - 0.25 * cur_atr) <= lows[j] <= (lvl + 0.30 * cur_atr) and closes[j] > lvl:
                        retests.append(
                            {
                                "bar_index": int(j),
                                "time": times[j],
                                "type": "BULLISH_BREAK_RETEST",
                                "retested_level": lvl,
                                "close_price": round(float(closes[j]), 6),
                            }
                        )
                        break
                else:
                    if (lvl - 0.30 * cur_atr) <= highs[j] <= (lvl + 0.25 * cur_atr) and closes[j] < lvl:
                        retests.append(
                            {
                                "bar_index": int(j),
                                "time": times[j],
                                "type": "BEARISH_BREAK_RETEST",
                                "retested_level": lvl,
                                "close_price": round(float(closes[j]), 6),
                            }
                        )
                        break

        active_signal = "NONE"
        recent_cutoff = n - 6
        for f in reversed(fakeouts):
            if f["bar_index"] >= recent_cutoff:
                active_signal = f["type"]
                break
        if active_signal == "NONE":
            for rt in reversed(retests):
                if rt["bar_index"] >= recent_cutoff:
                    active_signal = rt["type"]
                    break
        if active_signal == "NONE":
            for bo in reversed(breakouts):
                if bo["bar_index"] >= recent_cutoff:
                    active_signal = bo["type"]
                    break

        cur_range_high = float(np.max(highs[-lb - 1 : -1]))
        cur_range_low = float(np.min(lows[-lb - 1 : -1]))

        return {
            "range_high": round(cur_range_high, 6),
            "range_low": round(cur_range_low, 6),
            "breakouts": breakouts[-6:],
            "fakeouts": fakeouts[-6:],
            "retests": retests[-6:],
            "active_signal": active_signal,
        }
