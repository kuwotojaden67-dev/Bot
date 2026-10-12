"""
Trend, Volatility, Range, Spread, Session, and News Filters for 2REAL AI TRADER.
- ADX-based trend strength (+DI, -DI, ADX)
- ATR-based volatility assessment
- Choppiness / Market range detection
- Spread filter
- Trading session window filter
- Scheduled news-risk control (explicitly disabled with status 'DISABLED_NO_VERIFIED_DATA_SOURCE'
  when no verified economic calendar feed is configured, never pretending to work when unavailable).
"""
from datetime import datetime
from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd

from backend.mt5_client.connector import STANDARD_SYMBOL_SPECS
from backend.strategies.fvg import compute_atr_series


class MarketFilterEngine:
    """
    Computes market regime filters and hard execution safety gates.
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        cfg = config or {}
        self.adx_period: int = int(cfg.get("adx_period", 14))
        self.min_adx_trend: float = float(cfg.get("min_adx_trend", 18.0))
        self.atr_period: int = int(cfg.get("atr_period", 14))
        self.min_atr_pips: float = float(cfg.get("min_atr_pips", 3.0))
        self.max_atr_spike_mult: float = float(cfg.get("max_atr_spike_mult", 3.5))
        self.session_filter_enabled: bool = bool(cfg.get("session_filter_enabled", True))
        self.allowed_sessions_utc: List[str] = list(cfg.get("allowed_sessions_utc", ["07:00-20:00"]))
        self.news_filter_enabled: bool = bool(cfg.get("news_filter_enabled", False))
        self.scheduled_news_events: List[Dict[str, Any]] = list(cfg.get("scheduled_news_events", []))

    def analyze(
        self,
        df: pd.DataFrame,
        symbol: str = "EURUSD",
        current_spread_pips: Optional[float] = None,
        max_spread_pips: float = 2.5,
    ) -> Dict[str, Any]:
        n = len(df)
        spec = STANDARD_SYMBOL_SPECS.get(symbol.upper(), STANDARD_SYMBOL_SPECS["EURUSD"])
        pip_size = float(spec["pip_size"])
        point_size = float(spec["point"])

        if n < max(self.adx_period * 2, 20):
            return {
                "adx": 0.0,
                "plus_di": 0.0,
                "minus_di": 0.0,
                "trend_strength": "INSUFFICIENT_DATA",
                "atr": 0.0,
                "atr_pips": 0.0,
                "volatility_regime": "INSUFFICIENT_DATA",
                "choppiness_index": 50.0,
                "is_ranging": True,
                "spread_pips": current_spread_pips or 0.0,
                "spread_ok": True,
                "session_ok": True,
                "news_filter_status": "DISABLED_NO_VERIFIED_DATA_SOURCE",
                "news_ok": True,
            }

        highs = df["high"].to_numpy(dtype=float)
        lows = df["low"].to_numpy(dtype=float)
        closes = df["close"].to_numpy(dtype=float)
        atr_arr = compute_atr_series(df, self.atr_period)
        current_atr = float(atr_arr[-1])
        avg_atr = max(float(np.mean(atr_arr[-min(n, 50) :])), 1e-9)
        atr_pips = round(current_atr / pip_size, 2)

        # 1. Wilder ADX (+DI, -DI, ADX)
        adx_val, plus_di, minus_di = self._compute_adx(highs, lows, closes, self.adx_period)
        if adx_val >= 25.0:
            trend_strength = "STRONG_TREND"
        elif adx_val >= self.min_adx_trend:
            trend_strength = "MODERATE_TREND"
        else:
            trend_strength = "WEAK_RANGING"

        # 2. Volatility Regime
        atr_ratio = current_atr / avg_atr
        if atr_pips < self.min_atr_pips * 0.5:
            volatility_regime = "LOW_DEAD"
        elif atr_ratio > self.max_atr_spike_mult:
            volatility_regime = "EXTREME_SPIKE"
        elif atr_ratio >= 1.35:
            volatility_regime = "HIGH_EXPANSION"
        else:
            volatility_regime = "NORMAL"

        # 3. Choppiness Index (14 period)
        chop_p = min(14, n - 1)
        tr_sum = float(np.sum(atr_arr[-chop_p:]))
        hh = float(np.max(highs[-chop_p:]))
        ll = float(np.min(lows[-chop_p:]))
        hl_span = max(hh - ll, 1e-9)
        chop = 100.0 * np.log10(max(tr_sum / hl_span, 1.0)) / np.log10(chop_p)
        chop = float(np.clip(chop, 0.0, 100.0))
        is_ranging = chop >= 61.8 or adx_val < self.min_adx_trend

        # 4. Spread Filter
        if current_spread_pips is None:
            last_spread_pts = float(df["spread"].iloc[-1]) if "spread" in df.columns else float(spec["spread_points_typical"])
            current_spread_pips = round((last_spread_pts * point_size) / pip_size, 2)
        spread_ok = current_spread_pips <= max_spread_pips

        # 5. Session Filter
        last_time: datetime = pd.to_datetime(df["time"].iloc[-1], utc=True).to_pydatetime()
        session_ok = True
        if self.session_filter_enabled and self.allowed_sessions_utc:
            session_ok = self._check_in_session_windows(last_time, self.allowed_sessions_utc)

        # 6. News Filter (Strictly honest if no verified calendar feed is loaded)
        if not self.news_filter_enabled or not self.scheduled_news_events:
            news_status = "DISABLED_NO_VERIFIED_DATA_SOURCE"
            news_ok = True
        else:
            news_status = "ACTIVE_CALENDAR_FEED"
            news_ok = not self._is_near_high_impact_news(last_time, symbol, self.scheduled_news_events)

        return {
            "adx": round(adx_val, 2),
            "plus_di": round(plus_di, 2),
            "minus_di": round(minus_di, 2),
            "trend_strength": trend_strength,
            "atr": round(current_atr, 6),
            "atr_pips": atr_pips,
            "atr_ratio_to_mean": round(atr_ratio, 2),
            "volatility_regime": volatility_regime,
            "choppiness_index": round(chop, 1),
            "is_ranging": bool(is_ranging),
            "spread_pips": round(current_spread_pips, 2),
            "max_spread_pips": round(max_spread_pips, 2),
            "spread_ok": bool(spread_ok),
            "session_ok": bool(session_ok),
            "current_bar_utc": last_time.strftime("%Y-%m-%d %H:%M UTC"),
            "news_filter_status": news_status,
            "news_ok": bool(news_ok),
        }

    @staticmethod
    def _compute_adx(highs: np.ndarray, lows: np.ndarray, closes: np.ndarray, period: int = 14) -> tuple[float, float, float]:
        n = len(closes)
        up_move = highs[1:] - highs[:-1]
        down_move = lows[:-1] - lows[1:]

        plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
        minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

        tr = np.maximum(
            highs[1:] - lows[1:],
            np.maximum(np.abs(highs[1:] - closes[:-1]), np.abs(lows[1:] - closes[:-1])),
        )

        tr_s = pd.Series(tr).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()
        plus_s = pd.Series(plus_dm).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()
        minus_s = pd.Series(minus_dm).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()

        safe_tr = np.where(tr_s == 0, 1e-9, tr_s)
        p_di = 100.0 * (plus_s / safe_tr)
        m_di = 100.0 * (minus_s / safe_tr)
        denom = np.where((p_di + m_di) == 0, 1e-9, p_di + m_di)
        dx = 100.0 * np.abs(p_di - m_di) / denom
        adx = pd.Series(dx).ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()
        if len(adx) == 0:
            return 0.0, 0.0, 0.0
        return float(adx[-1]), float(p_di[-1]), float(m_di[-1])

    @staticmethod
    def _check_in_session_windows(dt_utc: datetime, windows: List[str]) -> bool:
        cur_min = dt_utc.hour * 60 + dt_utc.minute
        for w in windows:
            try:
                start_s, end_s = w.strip().split("-")
                sh, sm = [int(x) for x in start_s.split(":")]
                eh, em = [int(x) for x in end_s.split(":")]
                s_min = sh * 60 + sm
                e_min = eh * 60 + em
                if s_min <= e_min:
                    if s_min <= cur_min <= e_min:
                        return True
                else:
                    if cur_min >= s_min or cur_min <= e_min:
                        return True
            except Exception:
                return True
        return False

    @staticmethod
    def _is_near_high_impact_news(dt_utc: datetime, symbol: str, events: List[Dict[str, Any]]) -> bool:
        for ev in events:
            try:
                ev_time = pd.to_datetime(ev["timestamp"], utc=True).to_pydatetime()
                currency = str(ev.get("currency", "")).upper()
                if currency and currency not in symbol.upper():
                    continue
                diff_min = abs((dt_utc - ev_time).total_seconds()) / 60.0
                if diff_min <= float(ev.get("blackout_minutes", 30)):
                    return True
            except Exception:
                continue
        return False
