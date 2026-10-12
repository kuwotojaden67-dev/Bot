"""
Smart Money Concepts (SMC) Engine for 2REAL AI TRADER.
Implements explicit, testable structural rules:
- Confirmed Swing Highs & Swing Lows (fractal left/right bars)
- Break of Structure (BOS) in trend direction
- Change of Character (CHoCH) when opposing structure breaks
- Bullish & Bearish Order Blocks: strictly requires a confirmed structural break
  (BOS/CHoCH) AND displacement confirmation (never labels every candle as an OB!)
- Order Block mitigation tracking (UNMITIGATED, TOUCHED, MEAN_THRESHOLD_50, INVALIDATED)
- Supply & Demand Zones and Structural Bias
"""
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd

from backend.strategies.fvg import compute_atr_series


class SMCEngine:
    """
    Deterministic Smart Money Concepts Engine.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        cfg = config or {}
        self.fractal_left: int = int(cfg.get("fractal_left", 3))
        self.fractal_right: int = int(cfg.get("fractal_right", 3))
        self.ob_max_age_bars: int = int(cfg.get("ob_max_age_bars", 80))
        self.require_displacement_for_ob: bool = bool(cfg.get("require_displacement_for_ob", True))
        self.mitigation_mode: str = str(cfg.get("mitigation_mode", "MEAN_THRESHOLD_50"))

    def analyze(self, df: pd.DataFrame) -> Dict[str, Any]:
        n = len(df)
        fl = self.fractal_left
        fr = self.fractal_right
        if n < fl + fr + 15:
            return {
                "structural_bias": "NEUTRAL",
                "swing_highs": [],
                "swing_lows": [],
                "structure_events": [],
                "order_blocks": [],
                "active_bullish_obs": [],
                "active_bearish_obs": [],
                "price_in_bullish_ob": False,
                "price_in_bearish_ob": False,
                "supply_zones": [],
                "demand_zones": [],
            }

        opens = df["open"].to_numpy(dtype=float)
        highs = df["high"].to_numpy(dtype=float)
        lows = df["low"].to_numpy(dtype=float)
        closes = df["close"].to_numpy(dtype=float)
        times = df["time"].astype(str).to_list()
        atr = compute_atr_series(df, 14)

        swing_highs: List[Dict[str, Any]] = []
        swing_lows: List[Dict[str, Any]] = []
        structure_events: List[Dict[str, Any]] = []
        order_blocks: List[Dict[str, Any]] = []

        trend_state = "NEUTRAL"  # BULLISH, BEARISH, NEUTRAL
        last_confirmed_sh: Optional[Dict[str, Any]] = None
        last_confirmed_sl: Optional[Dict[str, Any]] = None
        broken_sh_indices = set()
        broken_sl_indices = set()

        for i in range(fl + fr, n):
            # Pivot candidate at index p = i - fr is confirmed at bar i
            p = i - fr
            if highs[p] >= np.max(highs[p - fl : p + fr + 1]):
                sh = {
                    "index": int(p),
                    "confirmed_at": int(i),
                    "price": round(float(highs[p]), 6),
                    "time": times[p],
                }
                swing_highs.append(sh)
                last_confirmed_sh = sh

            if lows[p] <= np.min(lows[p - fl : p + fr + 1]):
                sl = {
                    "index": int(p),
                    "confirmed_at": int(i),
                    "price": round(float(lows[p]), 6),
                    "time": times[p],
                }
                swing_lows.append(sl)
                last_confirmed_sl = sl

            cur_atr = max(atr[i], 1e-9)

            # Check bullish break of last confirmed swing high
            if (
                last_confirmed_sh is not None
                and last_confirmed_sh["index"] not in broken_sh_indices
                and closes[i] > last_confirmed_sh["price"]
            ):
                broken_sh_indices.add(last_confirmed_sh["index"])
                ev_type = "BULLISH_BOS" if trend_state == "BULLISH" else "BULLISH_CHOCH"
                trend_state = "BULLISH"
                structure_events.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "type": ev_type,
                        "broken_level": last_confirmed_sh["price"],
                        "swing_index": last_confirmed_sh["index"],
                    }
                )

                # Identify Bullish Order Block: last bearish candle before the impulsive move that caused this break
                has_disp = any(
                    (closes[k] - opens[k]) >= 1.15 * max(atr[k], 1e-9)
                    for k in range(max(last_confirmed_sh["index"], i - 8), i + 1)
                )
                if has_disp or not self.require_displacement_for_ob:
                    ob_cand = self._find_last_opposing_candle(
                        direction="BULLISH",
                        break_idx=i,
                        search_back=12,
                        opens=opens,
                        highs=highs,
                        lows=lows,
                        closes=closes,
                        times=times,
                        structural_event=ev_type,
                    )
                    if ob_cand is not None:
                        order_blocks.append(ob_cand)

            # Check bearish break of last confirmed swing low
            if (
                last_confirmed_sl is not None
                and last_confirmed_sl["index"] not in broken_sl_indices
                and closes[i] < last_confirmed_sl["price"]
            ):
                broken_sl_indices.add(last_confirmed_sl["index"])
                ev_type = "BEARISH_BOS" if trend_state == "BEARISH" else "BEARISH_CHOCH"
                trend_state = "BEARISH"
                structure_events.append(
                    {
                        "bar_index": int(i),
                        "time": times[i],
                        "type": ev_type,
                        "broken_level": last_confirmed_sl["price"],
                        "swing_index": last_confirmed_sl["index"],
                    }
                )

                has_disp = any(
                    (opens[k] - closes[k]) >= 1.15 * max(atr[k], 1e-9)
                    for k in range(max(last_confirmed_sl["index"], i - 8), i + 1)
                )
                if has_disp or not self.require_displacement_for_ob:
                    ob_cand = self._find_last_opposing_candle(
                        direction="BEARISH",
                        break_idx=i,
                        search_back=12,
                        opens=opens,
                        highs=highs,
                        lows=lows,
                        closes=closes,
                        times=times,
                        structural_event=ev_type,
                    )
                    if ob_cand is not None:
                        order_blocks.append(ob_cand)

        # Evaluate mitigation of all identified Order Blocks up to current bar n - 1
        evaluated_obs: List[Dict[str, Any]] = []
        seen_ob_indices = set()
        for ob in order_blocks:
            if ob["candle_index"] in seen_ob_indices:
                continue
            seen_ob_indices.add(ob["candle_index"])
            evaluated = self._evaluate_ob_mitigation(ob, highs, lows, closes, n - 1)
            evaluated_obs.append(evaluated)

        active_bullish_obs = [ob for ob in evaluated_obs if ob["type"] == "BULLISH_OB" and ob["is_valid"]]
        active_bearish_obs = [ob for ob in evaluated_obs if ob["type"] == "BEARISH_OB" and ob["is_valid"]]

        current_price = float(closes[-1])
        current_low = float(lows[-1])
        current_high = float(highs[-1])
        last_atr = float(atr[-1])

        in_bull_ob = any(
            (ob["bottom"] - 0.15 * last_atr) <= current_low <= (ob["top"] + 0.25 * last_atr)
            and current_price >= ob["bottom"]
            for ob in active_bullish_obs
        )
        in_bear_ob = any(
            (ob["bottom"] - 0.25 * last_atr) <= current_high <= (ob["top"] + 0.15 * last_atr)
            and current_price <= ob["top"]
            for ob in active_bearish_obs
        )

        # Supply & Demand zones derived from active OBs
        demand_zones = [
            {"bottom": ob["bottom"], "top": ob["top"], "mid": ob["mean_threshold"], "time": ob["time"]}
            for ob in active_bullish_obs[-5:]
        ]
        supply_zones = [
            {"bottom": ob["bottom"], "top": ob["top"], "mid": ob["mean_threshold"], "time": ob["time"]}
            for ob in active_bearish_obs[-5:]
        ]

        return {
            "structural_bias": trend_state,
            "swing_highs": swing_highs[-10:],
            "swing_lows": swing_lows[-10:],
            "structure_events": structure_events[-10:],
            "order_blocks": evaluated_obs[-20:],
            "active_bullish_obs": active_bullish_obs[-6:],
            "active_bearish_obs": active_bearish_obs[-6:],
            "price_in_bullish_ob": in_bull_ob,
            "price_in_bearish_ob": in_bear_ob,
            "supply_zones": supply_zones,
            "demand_zones": demand_zones,
        }

    def _find_last_opposing_candle(
        self,
        direction: str,
        break_idx: int,
        search_back: int,
        opens: np.ndarray,
        highs: np.ndarray,
        lows: np.ndarray,
        closes: np.ndarray,
        times: List[str],
        structural_event: str,
    ) -> Optional[Dict[str, Any]]:
        start = max(0, break_idx - search_back)
        for k in range(break_idx - 1, start - 1, -1):
            if direction == "BULLISH" and closes[k] < opens[k]:
                bottom = float(lows[k])
                top = float(highs[k])
                return {
                    "type": "BULLISH_OB",
                    "candle_index": int(k),
                    "confirmed_at_index": int(break_idx),
                    "time": times[k],
                    "bottom": round(bottom, 6),
                    "top": round(top, 6),
                    "mean_threshold": round((bottom + top) / 2.0, 6),
                    "structural_event": structural_event,
                }
            if direction == "BEARISH" and closes[k] > opens[k]:
                bottom = float(lows[k])
                top = float(highs[k])
                return {
                    "type": "BEARISH_OB",
                    "candle_index": int(k),
                    "confirmed_at_index": int(break_idx),
                    "time": times[k],
                    "bottom": round(bottom, 6),
                    "top": round(top, 6),
                    "mean_threshold": round((bottom + top) / 2.0, 6),
                    "structural_event": structural_event,
                }
        return None

    def _evaluate_ob_mitigation(
        self,
        ob: Dict[str, Any],
        highs: np.ndarray,
        lows: np.ndarray,
        closes: np.ndarray,
        current_idx: int,
    ) -> Dict[str, Any]:
        status = "UNMITIGATED"
        conf_idx = ob["confirmed_at_index"]
        bottom = ob["bottom"]
        top = ob["top"]
        mt = ob["mean_threshold"]

        for j in range(conf_idx + 1, current_idx + 1):
            if ob["type"] == "BULLISH_OB":
                if closes[j] < bottom:
                    status = "INVALIDATED"
                    break
                if lows[j] <= mt:
                    status = "MITIGATED_MEAN_THRESHOLD"
                elif lows[j] <= top and status == "UNMITIGATED":
                    status = "TOUCHED"
            else:
                if closes[j] > top:
                    status = "INVALIDATED"
                    break
                if highs[j] >= mt:
                    status = "MITIGATED_MEAN_THRESHOLD"
                elif highs[j] >= bottom and status == "UNMITIGATED":
                    status = "TOUCHED"

        age = current_idx - ob["candle_index"]
        is_valid = status != "INVALIDATED" and age <= self.ob_max_age_bars
        out = dict(ob)
        out["mitigation_status"] = status
        out["age_bars"] = int(age)
        out["is_valid"] = bool(is_valid)
        return out
