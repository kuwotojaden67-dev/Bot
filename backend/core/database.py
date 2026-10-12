"""
SQLite Persistence Layer for 2REAL AI TRADER.
Stores non-sensitive settings, strategy parameters, risk controls, signal audit logs,
trade execution history, position reconciliation state, backtest reports, and diagnostics.
Never stores plaintext passwords.
"""
import json
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.core.logging_config import CredentialRedactingFilter, setup_logging

logger = setup_logging()

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "2real_trader.db"


DEFAULT_STRATEGY_CONFIG: Dict[str, Any] = {
    "trading_style": "DAY_TRADING",  # SCALPING, DAY_TRADING, SWING
    "swing_mode_enabled": False,     # Explicitly disabled unless user enables it
    "min_confluence_score": 65.0,    # Configurable minimum score (0 - 100), not a win probability
    "symbols": ["EURUSD", "XAUUSD", "GBPUSD", "USDJPY"],
    "ict": {
        "enabled": True,
        "swing_lookback": 5,
        "equal_hl_atr_tolerance": 0.18,
        "displacement_atr_mult": 1.35,
        "displacement_body_ratio": 0.60,
        "require_killzone": False,
        "dealing_range_bars": 60,
    },
    "smc": {
        "enabled": True,
        "fractal_left": 3,
        "fractal_right": 3,
        "ob_max_age_bars": 80,
        "require_displacement_for_ob": True,
        "mitigation_mode": "MEAN_THRESHOLD_50",  # TOUCH or MEAN_THRESHOLD_50
    },
    "fvg": {
        "enabled": True,
        "min_gap_atr_ratio": 0.12,
        "max_unmitigated_age_bars": 60,
        "check_consequent_encroachment": True,
    },
    "volume_profile": {
        "enabled": True,
        "num_bins": 50,
        "value_area_pct": 0.70,
        "lookback_bars": 100,
        "hvn_percentile": 80.0,
        "lvn_percentile": 20.0,
    },
    "breakout": {
        "enabled": True,
        "range_lookback": 24,
        "min_pierce_atr": 0.15,
        "confirm_body_atr": 0.65,
        "volume_mult_threshold": 1.15,
    },
    "candlesticks": {
        "enabled": True,
        "pinbar_wick_ratio": 2.2,
        "momentum_body_ratio": 0.72,
        "require_structural_context": True,
    },
    "fibonacci": {
        "enabled": True,
        "levels": [0.50, 0.618, 0.705, 0.786],
        "zone_tolerance_atr": 0.25,
    },
    "filters": {
        "adx_period": 14,
        "min_adx_trend": 18.0,
        "atr_period": 14,
        "min_atr_pips": 3.0,
        "max_atr_spike_mult": 3.5,
        "session_filter_enabled": True,
        "allowed_sessions_utc": ["07:00-20:00"],
        "news_filter_enabled": False,  # Disabled unless verified calendar feed is provided
    },
    "timeframes": {
        "SCALPING": {"htf": "H1", "ltf": "M5"},
        "DAY_TRADING": {"htf": "H4", "ltf": "M15"},
        "SWING": {"htf": "D1", "ltf": "H4"},
    },
}


DEFAULT_RISK_CONFIG: Dict[str, Any] = {
    "risk_per_trade_pct": 0.5,           # Conservative 0.5% default
    "max_daily_loss_pct": 2.0,           # Stop new entries if daily loss >= 2.0%
    "max_overall_drawdown_pct": 5.0,     # Stop new entries if overall drawdown >= 5.0%
    "max_open_positions": 3,
    "max_positions_per_symbol": 1,
    "max_consecutive_losses": 3,
    "max_spread_pips": {
        "EURUSD": 2.0,
        "GBPUSD": 2.5,
        "USDJPY": 2.2,
        "XAUUSD": 35.0,
        "BTCUSD": 45.0,
        "NAS100": 3.5,
        "US30": 4.5,
        "GBPJPY": 3.2,
        "DEFAULT": 5.0,
    },
    "max_spread_to_sl_ratio": 0.20,      # Spread must not exceed 20% of SL distance
    "max_total_exposure_lots": 5.0,
    "max_margin_usage_pct": 35.0,        # Max margin used as % of equity
    "min_risk_reward_ratio": 1.5,        # Minimum R:R required
    "default_commission_per_lot_usd": 7.0,
    "daily_session_start_utc": "06:00",
    "daily_session_end_utc": "21:00",
    "enforce_session_window": False,     # Can be toggled in Risk Center
    "emergency_stop_active": False,
}


class DatabaseManager:
    """Thread-safe SQLite manager with graceful error handling."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = Path(db_path) if db_path else DEFAULT_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._healthy = True
        self._last_error: Optional[str] = None
        self._initialize_schema()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=15.0, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    def _initialize_schema(self) -> None:
        with self._lock:
            try:
                with self._get_conn() as conn:
                    conn.executescript(
                        """
                        CREATE TABLE IF NOT EXISTS settings (
                            key TEXT PRIMARY KEY,
                            value_json TEXT NOT NULL,
                            updated_at TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS signals (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            timestamp TEXT NOT NULL,
                            symbol TEXT NOT NULL,
                            timeframe TEXT NOT NULL,
                            htf_timeframe TEXT NOT NULL,
                            action TEXT NOT NULL,
                            score REAL NOT NULL,
                            min_required_score REAL NOT NULL,
                            entry_price REAL,
                            stop_loss REAL,
                            take_profit REAL,
                            risk_reward REAL,
                            lot_size REAL,
                            confirmations_json TEXT NOT NULL,
                            rejections_json TEXT NOT NULL,
                            factors_json TEXT NOT NULL,
                            status TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS trades (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            ticket INTEGER UNIQUE NOT NULL,
                            idempotency_key TEXT UNIQUE,
                            symbol TEXT NOT NULL,
                            timeframe TEXT NOT NULL,
                            direction TEXT NOT NULL,
                            order_type TEXT NOT NULL,
                            volume REAL NOT NULL,
                            entry_price REAL NOT NULL,
                            stop_loss REAL NOT NULL,
                            take_profit REAL NOT NULL,
                            exit_price REAL,
                            entry_time TEXT NOT NULL,
                            exit_time TEXT,
                            realized_pnl REAL DEFAULT 0.0,
                            commission REAL DEFAULT 0.0,
                            swap REAL DEFAULT 0.0,
                            strategy_tag TEXT NOT NULL,
                            confluence_score REAL DEFAULT 0.0,
                            execution_source TEXT NOT NULL,
                            status TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS backtests (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            created_at TEXT NOT NULL,
                            symbol TEXT NOT NULL,
                            timeframe TEXT NOT NULL,
                            strategy_mode TEXT NOT NULL,
                            start_date TEXT NOT NULL,
                            end_date TEXT NOT NULL,
                            initial_balance REAL NOT NULL,
                            final_balance REAL NOT NULL,
                            net_profit REAL NOT NULL,
                            max_drawdown_pct REAL NOT NULL,
                            win_rate_pct REAL NOT NULL,
                            profit_factor REAL NOT NULL,
                            total_trades INTEGER NOT NULL,
                            summary_json TEXT NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS diagnostic_logs (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            timestamp TEXT NOT NULL,
                            level TEXT NOT NULL,
                            category TEXT NOT NULL,
                            symbol TEXT,
                            message TEXT NOT NULL,
                            details_json TEXT
                        );
                        """
                    )
                # Seed default configs if absent
                if self.get_setting("strategy_config") is None:
                    self.set_setting("strategy_config", DEFAULT_STRATEGY_CONFIG)
                if self.get_setting("risk_config") is None:
                    self.set_setting("risk_config", DEFAULT_RISK_CONFIG)
                if self.get_setting("bot_state") is None:
                    self.set_setting(
                        "bot_state",
                        {
                            "status": "STOPPED",  # STOPPED, PAUSED, RUNNING_SIGNAL_ONLY, RUNNING_DEMO, RUNNING_LIVE
                            "execution_mode": "SIGNAL_ONLY",  # SIGNAL_ONLY, PAPER_HARNESS, MT5_DEMO, MT5_LIVE
                            "consecutive_losses": 0,
                            "peak_equity": 0.0,
                            "daily_starting_equity": 0.0,
                            "daily_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        },
                    )
                self._healthy = True
                self._last_error = None
            except sqlite3.Error as exc:
                self._healthy = False
                self._last_error = str(exc)
                logger.error("Database initialization error: %s", exc)

    @property
    def is_healthy(self) -> bool:
        try:
            with self._lock, self._get_conn() as conn:
                conn.execute("SELECT 1").fetchone()
            self._healthy = True
            return True
        except sqlite3.Error as exc:
            self._healthy = False
            self._last_error = str(exc)
            return False

    def get_setting(self, key: str, default: Any = None) -> Any:
        with self._lock:
            try:
                with self._get_conn() as conn:
                    row = conn.execute("SELECT value_json FROM settings WHERE key = ?", (key,)).fetchone()
                    if not row:
                        return default
                    return json.loads(row["value_json"])
            except Exception as exc:
                self._last_error = str(exc)
                logger.error("DB read error for key=%s: %s", key, exc)
                return default

    def set_setting(self, key: str, value: Any) -> bool:
        with self._lock:
            try:
                now_iso = datetime.now(timezone.utc).isoformat()
                serialized = json.dumps(value)
                with self._get_conn() as conn:
                    conn.execute(
                        """
                        INSERT INTO settings (key, value_json, updated_at)
                        VALUES (?, ?, ?)
                        ON CONFLICT(key) DO UPDATE SET
                            value_json = excluded.value_json,
                            updated_at = excluded.updated_at
                        """,
                        (key, serialized, now_iso),
                    )
                return True
            except Exception as exc:
                self._last_error = str(exc)
                logger.error("DB write error for key=%s: %s", key, exc)
                return False

    def record_signal(self, signal_data: Dict[str, Any]) -> Optional[int]:
        with self._lock:
            try:
                with self._get_conn() as conn:
                    cur = conn.execute(
                        """
                        INSERT INTO signals (
                            timestamp, symbol, timeframe, htf_timeframe, action,
                            score, min_required_score, entry_price, stop_loss,
                            take_profit, risk_reward, lot_size,
                            confirmations_json, rejections_json, factors_json, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            signal_data.get("timestamp", datetime.now(timezone.utc).isoformat()),
                            signal_data["symbol"],
                            signal_data["timeframe"],
                            signal_data.get("htf_timeframe", "H4"),
                            signal_data["action"],
                            float(signal_data.get("score", 0.0)),
                            float(signal_data.get("min_required_score", 65.0)),
                            signal_data.get("entry_price"),
                            signal_data.get("stop_loss"),
                            signal_data.get("take_profit"),
                            signal_data.get("risk_reward"),
                            signal_data.get("lot_size"),
                            json.dumps(signal_data.get("confirmations", [])),
                            json.dumps(signal_data.get("rejections", [])),
                            json.dumps(signal_data.get("factors", {})),
                            signal_data.get("status", "EVALUATED"),
                        ),
                    )
                    return int(cur.lastrowid)
            except Exception as exc:
                self._last_error = str(exc)
                logger.error("Failed to record signal: %s", exc)
                return None

    def get_recent_signals(self, limit: int = 50, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        with self._lock:
            try:
                with self._get_conn() as conn:
                    if symbol:
                        rows = conn.execute(
                            "SELECT * FROM signals WHERE symbol = ? ORDER BY id DESC LIMIT ?",
                            (symbol, limit),
                        ).fetchall()
                    else:
                        rows = conn.execute(
                            "SELECT * FROM signals ORDER BY id DESC LIMIT ?",
                            (limit,),
                        ).fetchall()
                    result = []
                    for r in rows:
                        d = dict(r)
                        d["confirmations"] = json.loads(d.pop("confirmations_json", "[]"))
                        d["rejections"] = json.loads(d.pop("rejections_json", "[]"))
                        d["factors"] = json.loads(d.pop("factors_json", "{}"))
                        result.append(d)
                    return result
            except Exception as exc:
                self._last_error = str(exc)
                return []

    def upsert_trade(self, trade: Dict[str, Any]) -> bool:
        with self._lock:
            try:
                with self._get_conn() as conn:
                    conn.execute(
                        """
                        INSERT INTO trades (
                            ticket, idempotency_key, symbol, timeframe, direction,
                            order_type, volume, entry_price, stop_loss, take_profit,
                            exit_price, entry_time, exit_time, realized_pnl,
                            commission, swap, strategy_tag, confluence_score,
                            execution_source, status
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(ticket) DO UPDATE SET
                            stop_loss = excluded.stop_loss,
                            take_profit = excluded.take_profit,
                            exit_price = excluded.exit_price,
                            exit_time = excluded.exit_time,
                            realized_pnl = excluded.realized_pnl,
                            commission = excluded.commission,
                            swap = excluded.swap,
                            status = excluded.status
                        """,
                        (
                            int(trade["ticket"]),
                            trade.get("idempotency_key") or f"tk_{trade['ticket']}_{int(time.time()*1000)}",
                            trade["symbol"],
                            trade.get("timeframe", "M15"),
                            trade["direction"],
                            trade.get("order_type", "MARKET"),
                            float(trade["volume"]),
                            float(trade["entry_price"]),
                            float(trade["stop_loss"]),
                            float(trade["take_profit"]),
                            trade.get("exit_price"),
                            trade.get("entry_time", datetime.now(timezone.utc).isoformat()),
                            trade.get("exit_time"),
                            float(trade.get("realized_pnl", 0.0)),
                            float(trade.get("commission", 0.0)),
                            float(trade.get("swap", 0.0)),
                            trade.get("strategy_tag", "MULTI_CONFLUENCE"),
                            float(trade.get("confluence_score", 0.0)),
                            trade.get("execution_source", "MT5_TERMINAL"),
                            trade.get("status", "OPEN"),
                        ),
                    )
                return True
            except Exception as exc:
                self._last_error = str(exc)
                logger.error("Failed to upsert trade: %s", exc)
                return False

    def get_trades(
        self,
        status: Optional[str] = None,
        execution_source: Optional[str] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        with self._lock:
            try:
                query = "SELECT * FROM trades WHERE 1=1"
                params: List[Any] = []
                if status:
                    query += " AND status = ?"
                    params.append(status)
                if execution_source:
                    query += " AND execution_source = ?"
                    params.append(execution_source)
                query += " ORDER BY id DESC LIMIT ?"
                params.append(limit)
                with self._get_conn() as conn:
                    rows = conn.execute(query, tuple(params)).fetchall()
                    return [dict(r) for r in rows]
            except Exception as exc:
                self._last_error = str(exc)
                return []

    def check_idempotency_key_exists(self, idempotency_key: str) -> bool:
        with self._lock:
            try:
                with self._get_conn() as conn:
                    row = conn.execute(
                        "SELECT 1 FROM trades WHERE idempotency_key = ?",
                        (idempotency_key,),
                    ).fetchone()
                    return row is not None
            except Exception:
                return False

    def save_backtest(self, bt: Dict[str, Any]) -> Optional[int]:
        with self._lock:
            try:
                with self._get_conn() as conn:
                    cur = conn.execute(
                        """
                        INSERT INTO backtests (
                            created_at, symbol, timeframe, strategy_mode,
                            start_date, end_date, initial_balance, final_balance,
                            net_profit, max_drawdown_pct, win_rate_pct,
                            profit_factor, total_trades, summary_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            bt.get("created_at", datetime.now(timezone.utc).isoformat()),
                            bt["symbol"],
                            bt["timeframe"],
                            bt["strategy_mode"],
                            bt["start_date"],
                            bt["end_date"],
                            float(bt["initial_balance"]),
                            float(bt["final_balance"]),
                            float(bt["net_profit"]),
                            float(bt["max_drawdown_pct"]),
                            float(bt["win_rate_pct"]),
                            float(bt["profit_factor"]),
                            int(bt["total_trades"]),
                            json.dumps(bt),
                        ),
                    )
                    return int(cur.lastrowid)
            except Exception as exc:
                self._last_error = str(exc)
                logger.error("Failed to save backtest: %s", exc)
                return None

    def get_backtests(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self._lock:
            try:
                with self._get_conn() as conn:
                    rows = conn.execute(
                        "SELECT * FROM backtests ORDER BY id DESC LIMIT ?", (limit,)
                    ).fetchall()
                    out = []
                    for r in rows:
                        d = dict(r)
                        d["summary"] = json.loads(d.pop("summary_json", "{}"))
                        out.append(d)
                    return out
            except Exception:
                return []

    def log_diagnostic(
        self,
        level: str,
        category: str,
        message: str,
        symbol: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        safe_msg = CredentialRedactingFilter.sanitize_text(message)
        safe_details = (
            CredentialRedactingFilter.sanitize_text(json.dumps(details))
            if details is not None
            else None
        )
        with self._lock:
            try:
                with self._get_conn() as conn:
                    conn.execute(
                        """
                        INSERT INTO diagnostic_logs (timestamp, level, category, symbol, message, details_json)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            datetime.now(timezone.utc).isoformat(),
                            level.upper(),
                            category.upper(),
                            symbol,
                            safe_msg,
                            safe_details,
                        ),
                    )
            except Exception as exc:
                self._last_error = str(exc)

    def get_diagnostics(
        self,
        category: Optional[str] = None,
        level: Optional[str] = None,
        limit: int = 150,
    ) -> List[Dict[str, Any]]:
        with self._lock:
            try:
                query = "SELECT * FROM diagnostic_logs WHERE 1=1"
                params: List[Any] = []
                if category and category != "ALL":
                    query += " AND category = ?"
                    params.append(category.upper())
                if level and level != "ALL":
                    query += " AND level = ?"
                    params.append(level.upper())
                query += " ORDER BY id DESC LIMIT ?"
                params.append(limit)
                with self._get_conn() as conn:
                    rows = conn.execute(query, tuple(params)).fetchall()
                    result = []
                    for r in rows:
                        d = dict(r)
                        raw_det = d.pop("details_json", None)
                        d["details"] = json.loads(raw_det) if raw_det else None
                        result.append(d)
                    return result
            except Exception:
                return []
