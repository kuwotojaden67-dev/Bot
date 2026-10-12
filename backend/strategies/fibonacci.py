"""
Fibonacci Retracement Engine for 2REAL AI TRADER.
Calculates retracement levels (0.50, 0.618, 0.705, 0.786) from confirmed structural swing points.
Used strictly as a confluence factor alongside market structure, Order Blocks, and FVGs.
"""
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd

from backend.strategies.fvg import compute_atr_series


class FibonacciEngine:
    """
    Computes Fibonacci retracement levels and OTE zone alignment from confirmed swings.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        cfg = config or {}
        self.levels: List[float] = [float(x) for x in cfg.get("levels", [0.50, 0.618, 0.705, 0.786])]
        self.zone_tolerance_atr: float = float(cfg.get("zone_tolerance_atr", 0.25))

    def analyze(
        self,
        df: pd.DataFrame,
        swing_highs: Optional[List[Dict[str, Any]]] = None,
        swing_lows: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        n = len(df)
        if n < 20:
            return {
                "swing_high": None,
                "swing_low": None,
                "leg_direction": "NEUTRAL",
                "bullish_retracements": {},
                "bearish_retracements": {},
                "in_bullish_fib_zone": False,
                "in_bearish_fib_zone": False,
                "active_fib_level": None,
            }

        highs = df["high"].to_numpy(dtype=float)
        lows = df["low"].to_numpy(dtype=float)
        closes = df["close"].to_numpy(dtype=float)
        atr = compute_atr_series(df, 14)
        last_atr = max(float(atr[-1]), 1e-9)

        # Use confirmed swings from SMC/ICT or recent 45-bar extremes
        if swing_highs and swing_lows:
            sh = max(swing_highs[-4:], key=lambda x: x["price"])
            sl = min(swing_lows[-4:], key=lambda x: x["price"])
            sh_price, sh_idx = float(sh["price"]), int(sh["index"])
            sl_price, sl_idx = float(sl["price"]), int(sl["index"])
        else:
            lookback = min(n, 50)
            sub_h = highs[-lookback:]
            sub_l = lows[-lookback:]
            sh_idx = int(n - lookback + np.argmax(sub_h))
            sl_idx = int(n - lookback + np.argmin(sub_l))
            sh_price = float(highs[sh_idx])
            sl_price = float(lows[sl_idx])

        leg_span = max(sh_price - sl_price, 1e-9)
        leg_direction = "BULLISH" if sh_idx > sl_idx else "BEARISH"

        bull_levels: Dict[str, float] = {}
        bear_levels: Dict[str, float] = {}
        for lvl in self.levels:
            key = f"{lvl:.3f}".rstrip("0").rstrip(".") if lvl != 0.5 else "0.50"
            if lvl == 0.705:
                key = "0.705"
            elif lvl == 0.618:
                key = "0.618"
            elif lvl == 0.786:
                key = "0.786"
            # Bullish retracement: pullback down from swing_high toward swing_low
            bull_levels[key] = round(sh_price - lvl * leg_span, 6)
            # Bearish retracement: pullback up from swing_low toward swing_high
            bear_levels[key] = round(sl_price + lvl * leg_span, 6)

        current_price = float(closes[-1])
        tol = self.zone_tolerance_atr * last_atr

        in_bull_fib = False
        in_bear_fib = False
        active_fib_level: Optional[str] = None

        # Check if price is within the 0.50..0.786 retracement pocket or near a specific Fib level
        b_top = bull_levels.get("0.50", sh_price - 0.50 * leg_span) + tol
        b_bot = bull_levels.get("0.786", sh_price - 0.786 * leg_span) - tol
        if b_bot <= current_price <= b_top:
            in_bull_fib = True
            # Find closest level
            closest_k = min(bull_levels.keys(), key=lambda k: abs(current_price - bull_levels[k]))
            active_fib_level = f"BULL_FIB_{closest_k}"

        s_bot = bear_levels.get("0.50", sl_price + 0.50 * leg_span) - tol
        s_top = bear_levels.get("0.786", sl_price + 0.786 * leg_span) + tol
        if s_bot <= current_price <= s_top:
            in_bear_fib = True
            closest_k = min(bear_levels.keys(), key=lambda k: abs(current_price - bear_levels[k]))
            if active_fib_level is None:
                active_fib_level = f"BEAR_FIB_{closest_k}"

        return {
            "swing_high": round(sh_price, 6),
            "swing_low": round(sl_price, 6),
            "leg_direction": leg_direction,
            "bullish_retracements": bull_levels,
            "bearish_retracements": bear_levels,
            "in_bullish_fib_zone": in_bull_fib,
            "in_bearish_fib_zone": in_bear_fib,
            "active_fib_level": active_fib_level,
        }
