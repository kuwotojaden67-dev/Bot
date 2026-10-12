"""
Inner Circle Trader (ICT) Engine for 2REAL AI TRADER.
Implements measurable, deterministic rules without future look-ahead:
- Buy-Side Liquidity (BSL) & Sell-Side Liquidity (SSL) pools (swing highs/lows & equal H/L)
- Liquidity Sweeps (pierce beyond BSL/SSL with close back inside structure)
- Dealing Range (High, Low, 50% Equilibrium, Premium > 50%, Discount < 50%, OTE 0.618-0.786)
- Displacement candles (body >= displacement_atr_mult * ATR and body/range >= displacement_body_ratio)
- Market Structure Shift (MSS) confirmed by displacement after a liquidity raid
- Session Killzone detection (Asian, London Open, NY Open, London Close)
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd

from backend.strategies.fvg import compute_atr_series


class ICTEngine:
    """
    Deterministic ICT Strategy Module.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        cfg = config or {}
        self.swing_lookback: int = int(cfg.get("swing_lookback", 5))
        self.equal_hl_atr_tolerance: float = float(cfg.get("equal_hl_atr_tolerance", 0.18))
        self.displacement_atr_mult: float = float(cfg.get("displacement_atr_mult", 1.35))
        self.displacement_body_ratio: float = float(cfg.get("displacement_body_ratio", 0.60))
        self.require_killzone: bool = bool(cfg.get("require_killzone", False))
        self.dealing_range_bars: int = int(cfg.get("dealing_range_bars", 60))

    def analyze(self, df: pd.DataFrame) -> Dict[str, Any]:
        n = len(df)
        if n < max(20, self.swing_lookback * 2 + 5):
            return {
                "bias": "NEUTRAL",
                "zone": "EQUILIBRIUM",
                "dealing_range": None,
                "bsl_levels": [],
                "ssl_levels": [],
                "recent_sweeps": [],
                "displacement_candles": [],
                "mss_events": [],
                "session": "OFF_SESSION",
                "in_killzone": False,
            }

        opens = df["open"].to_numpy(dtype=float)
        highs = df["high"].to_numpy(dtype=float)
        lows = df["low"].to_numpy(dtype=float)
        closes = df["close"].to_numpy(dtype=float)
        times = pd.to_datetime(df["time"], utc=True)
        atr = compute_atr_series(df, 14)

        # 1. Identify confirmed swing highs (BSL) and swing lows (SSL) without future look-ahead
        lb = self.swing_lookback
        swing_highs: List[Dict[str, Any]] = []
        swing_lows: List[Dict[str, Any]] = []

        # A swing at index `k` is confirmed at index `k + lb`
        for k in range(lb, n - lb):
            window_h = highs[k - lb : k + lb + 1]
            if highs[k] >= np.max(window_h):
                swing_highs.append(
                    {
                        "index": int(k),
                        "confirmed_at": int(k + lb),
                        "price": round(float(highs[k]), 6),
                        "time": str(times.iloc[k]),
                        "type": "BSL_SWING_HIGH",
                    }
                )
            window_l = lows[k - lb : k + lb + 1]
            if lows[k] <= np.min(window_l):
                swing_lows.append(
                    {
                        "index": int(k),
                        "confirmed_at": int(k + lb),
                        "price": round(float(lows[k]), 6),
                        "time": str(times.iloc[k]),
                        "type": "SSL_SWING_LOW",
                    }
                )

        # Detect Equal Highs (EQH) and Equal Lows (EQL)
        last_atr = max(float(atr[-1]), 1e-9)
        for idx in range(1, len(swing_highs)):
            if abs(swing_highs[idx]["price"] - swing_highs[idx - 1]["price"]) <= self.equal_hl_atr_tolerance * last_atr:
                swing_highs[idx]["type"] = "BSL_EQUAL_HIGHS"
        for idx in range(1, len(swing_lows)):
            if abs(swing_lows[idx]["price"] - swing_lows[idx - 1]["price"]) <= self.equal_hl_atr_tolerance * last_atr:
                swing_lows[idx]["type"] = "SSL_EQUAL_LOWS"

        # 2. Dealing Range (Premium / Discount / Equilibrium / OTE)
        dr_slice_start = max(0, n - self.dealing_range_bars)
        dr_high = float(np.max(highs[dr_slice_start:]))
        dr_low = float(np.min(lows[dr_slice_start:]))
        dr_span = max(dr_high - dr_low, 1e-9)
        equilibrium = (dr_high + dr_low) / 2.0
        current_price = float(closes[-1])
        range_position = (current_price - dr_low) / dr_span  # 0.0 at low, 1.0 at high

        if range_position < 0.50:
            zone = "DISCOUNT"
        elif range_position > 0.50:
            zone = "PREMIUM"
        else:
            zone = "EQUILIBRIUM"

        # Bullish OTE is 61.8% - 78.6% retracement from dr_high down toward dr_low
        bullish_ote_top = dr_high - 0.618 * dr_span
        bullish_ote_bottom = dr_high - 0.786 * dr_span
        # Bearish OTE is 61.8% - 78.6% retracement from dr_low up toward dr_high
        bearish_ote_bottom = dr_low + 0.618 * dr_span
        bearish_ote_top = dr_low + 0.786 * dr_span

        dealing_range = {
            "high": round(dr_high, 6),
            "low": round(dr_low, 6),
            "equilibrium": round(equilibrium, 6),
            "current_position_pct": round(range_position * 100.0, 1),
            "zone": zone,
            "bullish_ote": [round(bullish_ote_bottom, 6), round(bullish_ote_top, 6)],
            "bearish_ote": [round(bearish_ote_bottom, 6), round(bearish_ote_top, 6)],
            "in_bullish_ote": bullish_ote_bottom <= current_price <= bullish_ote_top,
            "in_bearish_ote": bearish_ote_bottom <= current_price <= bearish_ote_top,
        }

        # 3. Detect Liquidity Sweeps (BSL / SSL raids that close back inside)
        recent_sweeps: List[Dict[str, Any]] = []
        scan_start = max(lb * 2, n - 35)
        for i in range(scan_start, n):
            # Active SSL levels confirmed before bar i
            prior_ssls = [s for s in swing_lows if s["confirmed_at"] < i and s["index"] >= i - 50]
            for ssl in prior_ssls[-3:]:
                lvl = ssl["price"]
                # Sweep condition: wick goes below SSL, candle closes above SSL
                if lows[i] < lvl and closes[i] > lvl:
                    recent_sweeps.append(
                        {
                            "bar_index": int(i),
                            "time": str(times.iloc[i]),
                            "type": "SSL_SWEEP_BULLISH",
                            "swept_level": lvl,
                            "wick_extreme": round(float(lows[i]), 6),
                            "close_price": round(float(closes[i]), 6),
                        }
                    )
                    break

            prior_bsls = [s for s in swing_highs if s["confirmed_at"] < i and s["index"] >= i - 50]
            for bsl in prior_bsls[-3:]:
                lvl = bsl["price"]
                if highs[i] > lvl and closes[i] < lvl:
                    recent_sweeps.append(
                        {
                            "bar_index": int(i),
                            "time": str(times.iloc[i]),
                            "type": "BSL_SWEEP_BEARISH",
                            "swept_level": lvl,
                            "wick_extreme": round(float(highs[i]), 6),
                            "close_price": round(float(closes[i]), 6),
                        }
                    )
                    break

        # 4. Detect Displacement Candles & Market Structure Shifts (MSS)
        displacement_candles: List[Dict[str, Any]] = []
        mss_events: List[Dict[str, Any]] = []
        for i in range(scan_start, n):
            body = abs(closes[i] - opens[i])
            rng = max(highs[i] - lows[i], 1e-9)
            body_ratio = body / rng
            cur_atr = max(atr[i], 1e-9)
            if body >= self.displacement_atr_mult * cur_atr and body_ratio >= self.displacement_body_ratio:
                direction = "BULLISH" if closes[i] > opens[i] else "BEARISH"
                disp = {
                    "bar_index": int(i),
                    "time": str(times.iloc[i]),
                    "direction": direction,
                    "body_atr_ratio": round(body / cur_atr, 2),
                    "body_to_range": round(body_ratio, 2),
                }
                displacement_candles.append(disp)

                # Check if this displacement broke a short-term swing high/low after a sweep (MSS)
                if direction == "BULLISH":
                    recent_sh = [s for s in swing_highs if s["confirmed_at"] <= i]
                    has_recent_ssl_sweep = any(
                        sw["type"] == "SSL_SWEEP_BULLISH" and (i - 12 <= sw["bar_index"] <= i)
                        for sw in recent_sweeps
                    )
                    if recent_sh and closes[i] > recent_sh[-1]["price"]:
                        mss_events.append(
                            {
                                "bar_index": int(i),
                                "time": str(times.iloc[i]),
                                "type": "BULLISH_MSS",
                                "broken_level": recent_sh[-1]["price"],
                                "followed_liquidity_sweep": has_recent_ssl_sweep,
                            }
                        )
                else:
                    recent_sl = [s for s in swing_lows if s["confirmed_at"] <= i]
                    has_recent_bsl_sweep = any(
                        sw["type"] == "BSL_SWEEP_BEARISH" and (i - 12 <= sw["bar_index"] <= i)
                        for sw in recent_sweeps
                    )
                    if recent_sl and closes[i] < recent_sl[-1]["price"]:
                        mss_events.append(
                            {
                                "bar_index": int(i),
                                "time": str(times.iloc[i]),
                                "type": "BEARISH_MSS",
                                "broken_level": recent_sl[-1]["price"],
                                "followed_liquidity_sweep": has_recent_bsl_sweep,
                            }
                        )

        # 5. Determine overall ICT Bias
        ema20 = float(pd.Series(closes).ewm(span=20, adjust=False).mean().iloc[-1])
        ema50 = float(pd.Series(closes).ewm(span=50, adjust=False).mean().iloc[-1])
        if mss_events:
            last_mss = mss_events[-1]
            bias = "BULLISH" if last_mss["type"] == "BULLISH_MSS" else "BEARISH"
        elif current_price > ema20 > ema50:
            bias = "BULLISH"
        elif current_price < ema20 < ema50:
            bias = "BEARISH"
        else:
            bias = "NEUTRAL"

        # 6. Session & Killzone analysis
        last_dt: datetime = times.iloc[-1].to_pydatetime()
        session_name, in_killzone = self._classify_session(last_dt)

        return {
            "bias": bias,
            "zone": zone,
            "dealing_range": dealing_range,
            "bsl_levels": swing_highs[-8:],
            "ssl_levels": swing_lows[-8:],
            "recent_sweeps": recent_sweeps[-6:],
            "displacement_candles": displacement_candles[-8:],
            "mss_events": mss_events[-6:],
            "session": session_name,
            "in_killzone": in_killzone,
        }

    @staticmethod
    def _classify_session(dt_utc: datetime) -> tuple[str, bool]:
        hr = dt_utc.hour
        if 7 <= hr < 10:
            return "LONDON_KILLZONE", True
        if 12 <= hr < 15:
            return "NEW_YORK_KILLZONE", True
        if 15 <= hr < 17:
            return "LONDON_CLOSE_KILLZONE", True
        if 0 <= hr < 6:
            return "ASIAN_SESSION", False
        if 6 <= hr < 12:
            return "LONDON_SESSION", False
        if 12 <= hr < 21:
            return "NEW_YORK_SESSION", False
        return "OFF_SESSION", False
