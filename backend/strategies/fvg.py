"""
Fair Value Gap (FVG) Engine for 2REAL AI TRADER.
Detects bullish and bearish 3-candle price imbalances without look-ahead bias:
- Bullish FVG: third candle's low > first candle's high (low[i] > high[i-2])
- Bearish FVG: third candle's high < first candle's low (high[i] < low[i-2])
Tracks zone boundaries, Consequent Encroachment (50% midpoint), creation time,
mitigation status, and whether the zone remains valid.
"""
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd


def compute_atr_series(df: pd.DataFrame, period: int = 14) -> np.ndarray:
    high = df["high"].to_numpy(dtype=float)
    low = df["low"].to_numpy(dtype=float)
    close = df["close"].to_numpy(dtype=float)
    tr = np.zeros(len(df), dtype=float)
    if len(df) == 0:
        return tr
    tr[0] = high[0] - low[0]
    for i in range(1, len(df)):
        tr[i] = max(
            high[i] - low[i],
            abs(high[i] - close[i - 1]),
            abs(low[i] - close[i - 1]),
        )
    atr = pd.Series(tr).rolling(window=period, min_periods=1).mean().to_numpy()
    return atr


class FairValueGapEngine:
    """
    Identifies and tracks 3-candle Fair Value Gaps (FVGs).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        cfg = config or {}
        self.min_gap_atr_ratio: float = float(cfg.get("min_gap_atr_ratio", 0.12))
        self.max_unmitigated_age_bars: int = int(cfg.get("max_unmitigated_age_bars", 60))
        self.check_consequent_encroachment: bool = bool(cfg.get("check_consequent_encroachment", True))

    def analyze(self, df: pd.DataFrame) -> Dict[str, Any]:
        if len(df) < 5:
            return {
                "fvgs": [],
                "active_bullish_fvgs": [],
                "active_bearish_fvgs": [],
                "price_in_bullish_fvg": False,
                "price_in_bearish_fvg": False,
                "nearest_bullish_fvg": None,
                "nearest_bearish_fvg": None,
            }

        highs = df["high"].to_numpy(dtype=float)
        lows = df["low"].to_numpy(dtype=float)
        closes = df["close"].to_numpy(dtype=float)
        times = df["time"].astype(str).to_list()
        atr = compute_atr_series(df, 14)

        all_fvgs: List[Dict[str, Any]] = []
        n = len(df)

        for i in range(2, n):
            cur_atr = max(atr[i], 1e-9)
            # Bullish FVG: 3rd candle low (index i) > 1st candle high (index i-2)
            if lows[i] > highs[i - 2]:
                bottom = float(highs[i - 2])
                top = float(lows[i])
                gap_size = top - bottom
                if gap_size >= self.min_gap_atr_ratio * cur_atr:
                    ce_mid = (top + bottom) / 2.0
                    fvg = self._evaluate_mitigation(
                        fvg_type="BULLISH",
                        created_idx=i,
                        created_time=times[i],
                        bottom=bottom,
                        top=top,
                        ce_mid=ce_mid,
                        highs=highs,
                        lows=lows,
                        closes=closes,
                        current_idx=n - 1,
                    )
                    all_fvgs.append(fvg)

            # Bearish FVG: 3rd candle high (index i) < 1st candle low (index i-2)
            elif highs[i] < lows[i - 2]:
                top = float(lows[i - 2])
                bottom = float(highs[i])
                gap_size = top - bottom
                if gap_size >= self.min_gap_atr_ratio * cur_atr:
                    ce_mid = (top + bottom) / 2.0
                    fvg = self._evaluate_mitigation(
                        fvg_type="BEARISH",
                        created_idx=i,
                        created_time=times[i],
                        bottom=bottom,
                        top=top,
                        ce_mid=ce_mid,
                        highs=highs,
                        lows=lows,
                        closes=closes,
                        current_idx=n - 1,
                    )
                    all_fvgs.append(fvg)

        active_bullish = [f for f in all_fvgs if f["type"] == "BULLISH" and f["is_valid"]]
        active_bearish = [f for f in all_fvgs if f["type"] == "BEARISH" and f["is_valid"]]

        current_price = float(closes[-1])
        current_low = float(lows[-1])
        current_high = float(highs[-1])
        last_atr = float(atr[-1])

        in_bull_fvg = False
        in_bear_fvg = False
        nearest_bull: Optional[Dict[str, Any]] = None
        nearest_bear: Optional[Dict[str, Any]] = None

        for f in reversed(active_bullish):
            # Price is in or touching bullish FVG (within small ATR tolerance)
            if (f["bottom"] - 0.15 * last_atr) <= current_low <= (f["top"] + 0.25 * last_atr) and current_price >= f["bottom"]:
                in_bull_fvg = True
                nearest_bull = f
                break
        if nearest_bull is None and active_bullish:
            nearest_bull = active_bullish[-1]

        for f in reversed(active_bearish):
            if (f["bottom"] - 0.25 * last_atr) <= current_high <= (f["top"] + 0.15 * last_atr) and current_price <= f["top"]:
                in_bear_fvg = True
                nearest_bear = f
                break
        if nearest_bear is None and active_bearish:
            nearest_bear = active_bearish[-1]

        return {
            "fvgs": all_fvgs[-30:],
            "active_bullish_fvgs": active_bullish[-10:],
            "active_bearish_fvgs": active_bearish[-10:],
            "price_in_bullish_fvg": in_bull_fvg,
            "price_in_bearish_fvg": in_bear_fvg,
            "nearest_bullish_fvg": nearest_bull,
            "nearest_bearish_fvg": nearest_bear,
        }

    def _evaluate_mitigation(
        self,
        fvg_type: str,
        created_idx: int,
        created_time: str,
        bottom: float,
        top: float,
        ce_mid: float,
        highs: np.ndarray,
        lows: np.ndarray,
        closes: np.ndarray,
        current_idx: int,
    ) -> Dict[str, Any]:
        mitigation_status = "UNMITIGATED"
        mitigated_at_idx: Optional[int] = None
        fill_pct = 0.0
        gap_size = max(top - bottom, 1e-12)

        for j in range(created_idx + 1, current_idx + 1):
            if fvg_type == "BULLISH":
                if lows[j] <= top:
                    penetration = min(top - lows[j], gap_size)
                    fill_pct = max(fill_pct, round((penetration / gap_size) * 100.0, 1))
                    if closes[j] < bottom:
                        mitigation_status = "FULLY_MITIGATED"
                        mitigated_at_idx = j
                        break
                    elif lows[j] <= ce_mid:
                        mitigation_status = "MITIGATED_CE"
                    else:
                        mitigation_status = "PARTIALLY_MITIGATED"
            else:
                if highs[j] >= bottom:
                    penetration = min(highs[j] - bottom, gap_size)
                    fill_pct = max(fill_pct, round((penetration / gap_size) * 100.0, 1))
                    if closes[j] > top:
                        mitigation_status = "FULLY_MITIGATED"
                        mitigated_at_idx = j
                        break
                    elif highs[j] >= ce_mid:
                        mitigation_status = "MITIGATED_CE"
                    else:
                        mitigation_status = "PARTIALLY_MITIGATED"

        age_bars = current_idx - created_idx
        is_valid = (
            mitigation_status != "FULLY_MITIGATED"
            and age_bars <= self.max_unmitigated_age_bars
        )

        return {
            "type": fvg_type,
            "created_idx": int(created_idx),
            "created_time": created_time,
            "bottom": round(bottom, 6),
            "top": round(top, 6),
            "ce_midpoint": round(ce_mid, 6),
            "gap_size": round(gap_size, 6),
            "fill_pct": fill_pct,
            "mitigation_status": mitigation_status,
            "mitigated_at_idx": mitigated_at_idx,
            "age_bars": int(age_bars),
            "is_valid": bool(is_valid),
        }
