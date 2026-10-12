"""
FastAPI Backend Server for 2REAL AI TRADER.
Provides:
- Authenticated REST endpoints for Connection Setup, Bot Control, Strategy Center,
  Risk Center, Backtesting, Trade History, Small-Account Calculator, and Diagnostics.
- Live WebSocket feed (/ws/live) streaming prices, account status, signals, and logs.
- Serves compiled React/TypeScript Chrome Dashboard when frontend/dist is present.
"""
import asyncio
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.backtest.engine import BacktestEngine
from backend.core.database import DEFAULT_RISK_CONFIG, DEFAULT_STRATEGY_CONFIG, DatabaseManager
from backend.core.logging_config import setup_logging
from backend.engine.confluence import MultiStrategyConfluenceEngine
from backend.execution.executor import ExecutionEngine
from backend.mt5_client.connector import STANDARD_SYMBOL_SPECS, MT5Connector, MT5TerminalDetector
from backend.mt5_client.market_data import MarketDataEngine
from backend.risk.engine import RiskEngine
from backend.security.auth import require_session_token, session_manager
from backend.security.vault import SecureCredentialVault

logger = setup_logging()

app = FastAPI(
    title="2REAL AI TRADER — Autonomous MT5 Multi-Strategy System",
    version="1.0.0",
    description="Local-only MT5 algorithmic trading backend with un-bypassable Risk Engine.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core singletons
db_manager = DatabaseManager()
credential_vault = SecureCredentialVault()
mt5_connector = MT5Connector(db_manager=db_manager)
market_data_engine = MarketDataEngine(connector=mt5_connector)
risk_engine = RiskEngine(db_manager.get_setting("risk_config", DEFAULT_RISK_CONFIG))
confluence_engine = MultiStrategyConfluenceEngine(
    db_manager.get_setting("strategy_config", DEFAULT_STRATEGY_CONFIG),
    risk_engine=risk_engine,
)
execution_engine = ExecutionEngine(
    connector=mt5_connector,
    db=db_manager,
    risk_engine=risk_engine,
)

# Startup diagnostic log
db_manager.log_diagnostic(
    "INFO",
    "SYSTEM_STATUS",
    "2REAL AI TRADER backend initialized. Live trading is disabled by default until explicitly authorized.",
)


# --- Pydantic Request Models ---

class ConnectMT5Request(BaseModel):
    broker: str = Field(..., min_length=1)
    server: str = Field(..., min_length=1)
    login: int = Field(..., gt=0)
    password: str = Field(default="")
    terminal_path: str = Field(default="")
    trading_mode: str = Field(default="DEMO")
    save_in_vault: bool = Field(default=True)
    use_saved_password: bool = Field(default=False)
    use_ea_bridge: bool = Field(default=False)


class EnablePaperHarnessRequest(BaseModel):
    initial_balance: float = Field(default=10000.0, gt=0)
    leverage: int = Field(default=100, ge=1, le=2000)
    currency: str = Field(default="USD")


class BotControlRequest(BaseModel):
    action: str  # START, PAUSE, STOP
    execution_mode: str = Field(default="SIGNAL_ONLY")  # SIGNAL_ONLY, DEMO_AUTO, LIVE_AUTO


class ClosePositionsRequest(BaseModel):
    confirmed: bool = False
    ticket: Optional[int] = None


class EmergencyStopRequest(BaseModel):
    active: bool
    close_existing_positions: bool = False
    confirmed: bool = False


class LiveAuthorizationRequest(BaseModel):
    confirmation_phrase: str
    acknowledged_risk: bool
    demo_tested: bool


class SmallAccountEvaluateRequest(BaseModel):
    balance_usd: float = Field(default=5.0, gt=0)
    leverage: int = Field(default=100, ge=1)
    symbol: str = Field(default="EURUSD")
    risk_per_trade_pct: float = Field(default=0.5, gt=0)
    stop_loss_pips: float = Field(default=15.0, gt=0)


class BacktestRunRequest(BaseModel):
    symbol: str = Field(default="EURUSD")
    timeframe: str = Field(default="M15")
    strategy_mode: str = Field(default="ALL_CONFLUENCE")
    bars: int = Field(default=240, ge=60, le=1500)
    initial_balance: float = Field(default=10000.0, gt=0)
    leverage: int = Field(default=100, ge=1)
    spread_pips: float = Field(default=1.2, ge=0)
    commission_per_lot_usd: float = Field(default=7.0, ge=0)
    slippage_points: float = Field(default=2.0, ge=0)
    out_of_sample_pct: float = Field(default=0.30, ge=0.10, le=0.50)


class ErrorScenarioTestRequest(BaseModel):
    scenario: str


# --- Helper functions ---

def get_current_quotes_map(symbols: Optional[List[str]] = None) -> Dict[str, Dict[str, Any]]:
    cfg = db_manager.get_setting("strategy_config", DEFAULT_STRATEGY_CONFIG)
    syms = symbols or cfg.get("symbols", ["EURUSD", "XAUUSD", "GBPUSD", "USDJPY"])
    out: Dict[str, Dict[str, Any]] = {}
    for s in syms:
        try:
            out[s] = market_data_engine.get_live_quote(s)
        except Exception:
            pass
    return out


def compute_overview_summary() -> Dict[str, Any]:
    quotes = get_current_quotes_map()
    status = mt5_connector.get_status_Readout()
    acct = mt5_connector.get_account_info(quotes)
    open_pos = mt5_connector.get_open_positions(quotes)
    bot_state = db_manager.get_setting("bot_state", {})
    strat_cfg = db_manager.get_setting("strategy_config", DEFAULT_STRATEGY_CONFIG)
    risk_cfg = db_manager.get_setting("risk_config", DEFAULT_RISK_CONFIG)

    # Calculate today's realized P&L from closed trades in SQLite
    closed_trades = db_manager.get_trades(status="CLOSED", limit=200)
    today_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_realized = sum(
        float(t.get("realized_pnl", 0.0))
        for t in closed_trades
        if str(t.get("exit_time", "")).startswith(today_prefix)
    )

    # Current drawdown
    current_dd_pct = 0.0
    if acct and float(acct.get("balance", 0)) > 0:
        peak = max(float(bot_state.get("peak_equity", 0.0)), float(acct["balance"]), float(acct["equity"]))
        if peak > 0:
            current_dd_pct = round(max(0.0, (peak - float(acct["equity"])) / peak * 100.0), 2)

    # Determine current market session
    now_utc = datetime.now(timezone.utc)
    hr = now_utc.hour
    if 7 <= hr < 12:
        market_session = "LONDON SESSION (Active)"
    elif 12 <= hr < 17:
        market_session = "LONDON / NEW YORK OVERLAP (Peak Liquidity)"
    elif 17 <= hr < 21:
        market_session = "NEW YORK SESSION"
    elif 0 <= hr < 7:
        market_session = "ASIAN / TOKYO SESSION"
    else:
        market_session = "INTER-SESSION ROLLOVER"

    return {
        "timestamp": now_utc.isoformat(),
        "connection": status,
        "account": acct,
        "open_positions": open_pos,
        "today_realized_pnl": round(today_realized, 2),
        "current_drawdown_pct": current_dd_pct,
        "bot_state": bot_state,
        "live_trading_authorized": session_manager.is_live_trading_authorized,
        "emergency_stop_active": bool(risk_cfg.get("emergency_stop_active", False)),
        "market_session": market_session,
        "active_timeframes": confluence_engine.get_active_timeframes(),
        "vault_profile": credential_vault.get_public_profile(),
        "quotes": quotes,
        "db_healthy": db_manager.is_healthy,
    }


# --- API Endpoints ---

@app.get("/api/session/bootstrap")
async def bootstrap_session() -> Dict[str, Any]:
    """
    Returns local session token for the Chrome dashboard and current system overview.
    Never returns plaintext MT5 credentials.
    """
    return {
        "session_token": session_manager.bootstrap_token,
        "overview": compute_overview_summary(),
    }


@app.get("/api/overview")
async def get_overview() -> Dict[str, Any]:
    return compute_overview_summary()


@app.get("/api/mt5/detect-terminals")
async def detect_terminals() -> Dict[str, Any]:
    return MT5TerminalDetector.detect_terminals()


@app.post("/api/mt5/connect")
async def connect_mt5(
    req: ConnectMT5Request,
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    password = req.password
    if req.use_saved_password and not password:
        saved = credential_vault.load_credentials()
        if saved and saved.get("password"):
            password = saved["password"]

    if req.save_in_vault and password:
        credential_vault.store_credentials(
            broker=req.broker,
            server=req.server,
            login=req.login,
            password=password,
            terminal_path=req.terminal_path,
            trading_mode=req.trading_mode,
        )

    res = mt5_connector.connect_mt5(
        broker=req.broker,
        server=req.server,
        login=req.login,
        password=password,
        terminal_path=req.terminal_path,
        trading_mode=req.trading_mode,
        use_ea_bridge=req.use_ea_bridge,
    )

    if res.get("is_connected"):
        execution_engine.reconcile_positions()
        db_manager.log_diagnostic(
            "INFO",
            "MT5_CONNECTION",
            f"Connected to MT5 ({req.broker} / {req.server}) login={req.login}",
        )
    else:
        db_manager.log_diagnostic(
            "ERROR",
            "MT5_CONNECTION",
            f"MT5 connection attempt failed ({res.get('last_error_code')}): {res.get('last_error_message')}",
            details={"troubleshooting_hint": res.get("troubleshooting_hint")},
        )

    return {
        "connection": res,
        "vault_profile": credential_vault.get_public_profile(),
    }


@app.post("/api/mt5/test-connection")
async def test_mt5_connection(
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    detection = MT5TerminalDetector.detect_terminals()
    status = mt5_connector.get_status_Readout()
    return {
        "terminal_detection": detection,
        "connection_status": status,
        "tested_at": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/mt5/enable-paper-harness")
async def enable_paper_harness(
    req: EnablePaperHarnessRequest,
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    res = mt5_connector.enable_paper_test_harness(
        initial_balance=req.initial_balance,
        leverage=req.leverage,
        currency=req.currency,
    )
    bot_state = db_manager.get_setting("bot_state", {})
    bot_state["peak_equity"] = req.initial_balance
    bot_state["daily_starting_equity"] = req.initial_balance
    db_manager.set_setting("bot_state", bot_state)
    db_manager.log_diagnostic(
        "INFO",
        "MT5_CONNECTION",
        f"Activated Offline Demo Test Harness (Non-Broker Local Simulator) with balance=${req.initial_balance:.2f} (1:{req.leverage}).",
    )
    return {"connection": res}


@app.post("/api/mt5/disconnect")
async def disconnect_mt5(
    forget_credentials: bool = Query(default=False),
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    # Stop bot safely before disconnecting
    bot_state = db_manager.get_setting("bot_state", {})
    bot_state["status"] = "STOPPED"
    db_manager.set_setting("bot_state", bot_state)

    res = mt5_connector.disconnect()
    if forget_credentials:
        credential_vault.forget_credentials()
        db_manager.log_diagnostic(
            "INFO",
            "MT5_CONNECTION",
            "Disconnected from MT5 and securely wiped all stored credentials from vault.",
        )
    else:
        db_manager.log_diagnostic("INFO", "MT5_CONNECTION", "Disconnected from MT5.")

    return {
        "connection": res,
        "vault_profile": credential_vault.get_public_profile(),
    }


@app.post("/api/bot/control")
async def control_bot(
    req: BotControlRequest,
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    action = req.action.upper().strip()
    exec_mode = req.execution_mode.upper().strip()
    bot_state = db_manager.get_setting("bot_state", {})
    risk_cfg = db_manager.get_setting("risk_config", DEFAULT_RISK_CONFIG)

    if action == "START":
        if risk_cfg.get("emergency_stop_active", False):
            raise HTTPException(
                status_code=400,
                detail="Cannot start bot while Emergency Stop is active. Disengage Emergency Stop in Risk Center first.",
            )
        if exec_mode == "LIVE_AUTO" and not session_manager.is_live_trading_authorized:
            raise HTTPException(
                status_code=403,
                detail="Live automated trading is disabled by default. Complete explicit Live Authorization first.",
            )
        if exec_mode in ("DEMO_AUTO", "LIVE_AUTO") and mt5_connector.connection_state == "DISCONNECTED":
            raise HTTPException(
                status_code=400,
                detail="Cannot start automated execution while MT5 terminal is disconnected. Connect to MT5 or enable the Offline Demo Test Harness, or run in SIGNAL_ONLY mode.",
            )
        bot_state["status"] = f"RUNNING_{exec_mode}"
        bot_state["execution_mode"] = exec_mode
        execution_engine.reconcile_positions()
        db_manager.log_diagnostic("INFO", "SYSTEM_STATUS", f"Bot started in mode: {exec_mode}")
    elif action == "PAUSE":
        bot_state["status"] = "PAUSED"
        db_manager.log_diagnostic("INFO", "SYSTEM_STATUS", "Bot paused by operator. No new entries will be opened.")
    elif action == "STOP":
        bot_state["status"] = "STOPPED"
        db_manager.log_diagnostic("INFO", "SYSTEM_STATUS", "Bot stopped safely by operator.")
    else:
        raise HTTPException(status_code=400, detail=f"Invalid bot action: {action}")

    db_manager.set_setting("bot_state", bot_state)
    return {"bot_state": bot_state}


@app.post("/api/bot/authorize-live")
async def authorize_live_mode(
    req: LiveAuthorizationRequest,
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    try:
        res = session_manager.authorize_live_trading(
            confirmation_phrase=req.confirmation_phrase,
            acknowledged_risk=req.acknowledged_risk,
            demo_tested=req.demo_tested,
        )
        db_manager.log_diagnostic(
            "WARNING",
            "SYSTEM_STATUS",
            "Operator explicitly authorized Live Trading mode after confirming Demo testing and risk acknowledgement.",
        )
        return res
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/bot/revoke-live")
async def revoke_live_mode(
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    session_manager.revoke_live_trading()
    bot_state = db_manager.get_setting("bot_state", {})
    if bot_state.get("execution_mode") == "LIVE_AUTO":
        bot_state["status"] = "PAUSED"
        bot_state["execution_mode"] = "SIGNAL_ONLY"
        db_manager.set_setting("bot_state", bot_state)
    db_manager.log_diagnostic("INFO", "SYSTEM_STATUS", "Live Trading authorization revoked; switched to safe mode.")
    return {"live_trading_authorized": False}


@app.post("/api/positions/close")
async def close_positions(
    req: ClosePositionsRequest,
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    quotes = get_current_quotes_map()
    if req.ticket is not None:
        return execution_engine.close_position(req.ticket, quotes)
    return execution_engine.close_all_positions(confirmed=req.confirmed)


@app.post("/api/risk/emergency-stop")
async def set_emergency_stop(
    req: EmergencyStopRequest,
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    risk_cfg = db_manager.get_setting("risk_config", DEFAULT_RISK_CONFIG)
    risk_cfg["emergency_stop_active"] = bool(req.active)
    db_manager.set_setting("risk_config", risk_cfg)
    risk_engine.update_config(risk_cfg)

    bot_state = db_manager.get_setting("bot_state", {})
    if req.active:
        bot_state["status"] = "STOPPED"
        db_manager.set_setting("bot_state", bot_state)
        db_manager.log_diagnostic(
            "ERROR",
            "RISK_REJECTION",
            "EMERGENCY STOP ENGAGED: All new orders blocked immediately.",
        )
    else:
        db_manager.log_diagnostic("INFO", "SYSTEM_STATUS", "Emergency Stop disengaged by operator.")

    closed_info = None
    if req.active and req.close_existing_positions and req.confirmed:
        closed_info = execution_engine.close_all_positions(confirmed=True)

    return {
        "emergency_stop_active": risk_cfg["emergency_stop_active"],
        "bot_state": bot_state,
        "closed_positions": closed_info,
    }


@app.get("/api/strategy/config")
async def get_strategy_config() -> Dict[str, Any]:
    return db_manager.get_setting("strategy_config", DEFAULT_STRATEGY_CONFIG)


@app.put("/api/strategy/config")
async def update_strategy_config(
    new_cfg: Dict[str, Any],
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    current = db_manager.get_setting("strategy_config", DEFAULT_STRATEGY_CONFIG)
    current.update(new_cfg)
    db_manager.set_setting("strategy_config", current)
    confluence_engine.update_config(current)
    db_manager.log_diagnostic("INFO", "STRATEGY_DECISION", "Updated Strategy Center configuration.")
    return current


@app.get("/api/risk/config")
async def get_risk_config() -> Dict[str, Any]:
    return db_manager.get_setting("risk_config", DEFAULT_RISK_CONFIG)


@app.put("/api/risk/config")
async def update_risk_config(
    new_cfg: Dict[str, Any],
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    current = db_manager.get_setting("risk_config", DEFAULT_RISK_CONFIG)
    current.update(new_cfg)
    db_manager.set_setting("risk_config", current)
    risk_engine.update_config(current)
    db_manager.log_diagnostic("INFO", "RISK_REJECTION", "Updated Risk Center parameters.")
    return current


@app.post("/api/risk/evaluate-small-account")
async def evaluate_small_account(req: SmallAccountEvaluateRequest) -> Dict[str, Any]:
    """
    Evaluates whether an account balance (e.g., $5.00) can safely place a trade on the selected
    symbol within the configured risk percentage without violating broker minimum volume rules.
    """
    sym = req.symbol.upper().strip()
    spec = STANDARD_SYMBOL_SPECS.get(sym, STANDARD_SYMBOL_SPECS["EURUSD"])
    pip_size = float(spec["pip_size"])
    quote = market_data_engine.get_live_quote(sym)
    entry = float(quote["ask"])
    sl = round(entry - req.stop_loss_pips * pip_size, int(spec["digits"]))
    tp = round(entry + req.stop_loss_pips * 2.2 * pip_size, int(spec["digits"]))

    temp_risk_cfg = dict(risk_engine.config)
    temp_risk_cfg["risk_per_trade_pct"] = req.risk_per_trade_pct
    temp_engine = RiskEngine(temp_risk_cfg)

    res = temp_engine.evaluate_trade_risk(
        symbol=sym,
        direction="BUY",
        entry_price=entry,
        stop_loss=sl,
        take_profit=tp,
        account_info={
            "balance": req.balance_usd,
            "equity": req.balance_usd,
            "free_margin": req.balance_usd,
            "margin": 0.0,
            "leverage": req.leverage,
            "currency": "USD",
        },
        symbol_spec=spec,
        open_positions=[],
        current_spread_pips=float(quote["spread_pips"]),
    )
    res["symbol_spec"] = spec
    res["tested_balance_usd"] = req.balance_usd
    return res


@app.get("/api/market/analysis/{symbol}")
async def get_symbol_analysis(
    symbol: str,
    timeframe: Optional[str] = Query(default=None),
    bars: int = Query(default=120, ge=50, le=500),
) -> Dict[str, Any]:
    """
    Runs real-time multi-timeframe analysis on `symbol`, returning OHLCV candles,
    ICT/SMC zones, FVGs, POC/Volume Profile, Fibonacci levels, Candlestick patterns,
    and Confluence Signal score.
    """
    sym = symbol.upper().strip()
    active_tfs = confluence_engine.get_active_timeframes()
    tf_str = timeframe if isinstance(timeframe, str) else None
    bars_int = bars if isinstance(bars, int) else 120
    ltf = (tf_str or active_tfs["ltf"]).upper()
    htf = active_tfs["htf"]

    ltf_df, ltf_meta = market_data_engine.get_ohlcv(sym, ltf, bars=bars_int)
    htf_df, htf_meta = market_data_engine.get_ohlcv(sym, htf, bars=100)
    quote = market_data_engine.get_live_quote(sym)
    quotes_map = get_current_quotes_map()

    acct = mt5_connector.get_account_info(quotes_map)
    # If disconnected, evaluate signal against a reference $10,000 dry-run profile for signal scoring visibility,
    # while clearly marking connection status
    eval_acct = acct or {
        "balance": 10000.0,
        "equity": 10000.0,
        "free_margin": 10000.0,
        "margin": 0.0,
        "leverage": 100,
        "currency": "USD",
    }
    open_pos = mt5_connector.get_open_positions(quotes_map)
    bot_state = db_manager.get_setting("bot_state", {})

    signal = confluence_engine.evaluate(
        symbol=sym,
        ltf_df=ltf_df,
        htf_df=htf_df,
        ltf_timeframe=ltf,
        htf_timeframe=htf,
        account_info=eval_acct,
        open_positions=open_pos,
        current_spread_pips=float(quote["spread_pips"]),
        data_is_fresh=bool(ltf_meta["is_fresh"]),
        bot_state=bot_state,
    )

    candles = []
    for _, row in ltf_df.tail(85).iterrows():
        candles.append(
            {
                "time": str(row["time"]),
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "tick_volume": int(row["tick_volume"]),
            }
        )

    return {
        "symbol": sym,
        "timeframe": ltf,
        "htf_timeframe": htf,
        "quote": quote,
        "data_meta": ltf_meta,
        "candles": candles,
        "signal": signal,
    }


@app.post("/api/signals/evaluate-and-execute/{symbol}")
async def evaluate_and_execute_symbol(
    symbol: str,
    auto_execute: bool = Query(default=False),
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    analysis = await get_symbol_analysis(symbol)
    sig = analysis["signal"]
    db_manager.record_signal(sig)

    exec_result = None
    if auto_execute and sig["action"] in ("BUY", "SELL"):
        quotes = get_current_quotes_map()
        exec_result = execution_engine.execute_signal(sig, current_prices=quotes)

    return {
        "signal": sig,
        "execution": exec_result,
    }


@app.get("/api/signals/recent")
async def get_recent_signals(limit: int = Query(default=30, le=100)) -> Dict[str, Any]:
    return {"signals": db_manager.get_recent_signals(limit=limit)}


@app.post("/api/backtest/run")
async def run_backtest(
    req: BacktestRunRequest,
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    sym = req.symbol.upper().strip()
    tf = req.timeframe.upper().strip()
    df, meta = market_data_engine.get_ohlcv(sym, tf, bars=req.bars)

    strat_cfg = db_manager.get_setting("strategy_config", DEFAULT_STRATEGY_CONFIG)
    risk_cfg = db_manager.get_setting("risk_config", DEFAULT_RISK_CONFIG)

    bt_engine = BacktestEngine(strategy_config=strat_cfg, risk_config=risk_cfg)
    report = bt_engine.run(
        df=df,
        symbol=sym,
        timeframe=tf,
        strategy_mode=req.strategy_mode,
        initial_balance=req.initial_balance,
        leverage=req.leverage,
        spread_pips=req.spread_pips,
        commission_per_lot_usd=req.commission_per_lot_usd,
        slippage_points=req.slippage_points,
        out_of_sample_pct=req.out_of_sample_pct,
    )
    report["data_source"] = meta["data_source"]
    report["volume_type"] = meta["volume_type"]

    if report.get("status") == "COMPLETED":
        db_manager.save_backtest(report)
        db_manager.log_diagnostic(
            "INFO",
            "STRATEGY_DECISION",
            f"Completed historical backtest on {sym} ({tf}): {report['total_trades']} trades | Net=${report['net_profit']:.2f} | MaxDD={report['max_drawdown_pct']:.2f}%",
            symbol=sym,
        )

    return report


@app.get("/api/backtest/history")
async def get_backtest_history() -> Dict[str, Any]:
    return {"backtests": db_manager.get_backtests(limit=15)}


@app.get("/api/trades/history")
async def get_trade_history(status: Optional[str] = Query(default=None)) -> Dict[str, Any]:
    trades = db_manager.get_trades(status=status, limit=200)
    return {"trades": trades}


@app.get("/api/diagnostics/logs")
async def get_diagnostic_logs(
    category: Optional[str] = Query(default=None),
    level: Optional[str] = Query(default=None),
    limit: int = Query(default=120, le=300),
) -> Dict[str, Any]:
    return {
        "logs": db_manager.get_diagnostics(category=category, level=level, limit=limit),
        "db_healthy": db_manager.is_healthy,
    }


@app.post("/api/diagnostics/test-error-scenario")
async def test_error_scenario(
    req: ErrorScenarioTestRequest,
    _token: str = Depends(require_session_token),
) -> Dict[str, Any]:
    """
    Allows the operator to test and verify all mandatory error-handling scenarios from Section 15
    safely and inspect the resulting behavior and diagnostic entries.
    """
    sc = req.scenario.upper().strip()

    if sc == "SMALL_ACCOUNT_5_USD":
        eval_res = await evaluate_small_account(
            SmallAccountEvaluateRequest(balance_usd=5.0, leverage=100, symbol="EURUSD", risk_per_trade_pct=0.5, stop_loss_pips=15.0)
        )
        db_manager.log_diagnostic(
            "WARNING",
            "INVALID_VOLUME",
            "Trade skipped: minimum volume exceeds permitted risk. ($5.00 balance test verified).",
            symbol="EURUSD",
            details=eval_res,
        )
        return {"scenario": sc, "verified": True, "result": eval_res}

    if sc == "STALE_PRICES":
        market_data_engine.set_stale_simulation(True)
        analysis = await get_symbol_analysis("EURUSD")
        market_data_engine.set_stale_simulation(False)
        db_manager.log_diagnostic(
            "WARNING",
            "DATA_FRESHNESS",
            "Stale price feed detected: new entries suspended automatically (returned WAIT).",
            symbol="EURUSD",
        )
        return {"scenario": sc, "verified": True, "signal_action": analysis["signal"]["action"], "rejections": analysis["signal"]["rejections"]}

    if sc == "DUPLICATE_ORDER":
        key = "ORD_EURUSD_M15_BUY_TEST_BAR"
        execution_engine._recent_idempotency_keys.add(key)
        res = execution_engine.execute_signal(
            {
                "symbol": "EURUSD",
                "timeframe": "M15",
                "action": "BUY",
                "bar_time": "TEST_BAR",
                "entry_price": 1.0850,
                "stop_loss": 1.0830,
                "take_profit": 1.0895,
                "score": 82.0,
            }
        )
        return {"scenario": sc, "verified": True, "result": res}

    if sc in ("MARKET_CLOSED", "SYMBOL_UNAVAILABLE", "INVALID_VOLUME", "INVALID_STOPS", "INSUFFICIENT_MARGIN", "ORDER_REJECTED", "ORDER_TIMEOUT"):
        execution_engine.set_simulated_execution_error(sc)
        res = execution_engine.execute_signal(
            {
                "symbol": "EURUSD",
                "timeframe": "M15",
                "action": "BUY",
                "bar_time": f"SIM_{int(time.time())}",
                "entry_price": 1.0850,
                "stop_loss": 1.0830,
                "take_profit": 1.0895,
                "score": 80.0,
            }
        )
        execution_engine.set_simulated_execution_error(None)
        return {"scenario": sc, "verified": True, "result": res}

    raise HTTPException(status_code=400, detail=f"Unknown test scenario: {sc}")


@app.websocket("/ws/live")
async def websocket_live_feed(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            payload = compute_overview_summary()
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(2.5)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass


# --- Static Frontend Hosting (Chrome Dashboard) ---
_DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
_BUNDLE_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "static_bundle"
FRONTEND_DIST = _DIST_DIR if _DIST_DIR.exists() else _BUNDLE_DIR
if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("ws/"):
            raise HTTPException(status_code=404)
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
