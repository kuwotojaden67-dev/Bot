"""
Automated Trade Execution & Reconciliation Engine for 2REAL AI TRADER.
- Executes approved trades through MT5 native IPC, local EA bridge, or the Offline Paper Test Harness.
- Never bypasses RiskEngine.
- Enforces idempotency keys to prevent duplicate orders across ticks or application restarts.
- Verifies order result codes (TRADE_RETCODE_DONE, partial fills, rejections, timeouts).
- Performs startup and periodic position-state reconciliation between SQLite and MT5.
- Blocks Live trading unless explicit Live Authorization has been completed by the user.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.core.database import DatabaseManager
from backend.core.logging_config import setup_logging
from backend.mt5_client.connector import HAS_NATIVE_MT5_PKG, MT5Connector, mt5_pkg
from backend.risk.engine import RiskEngine
from backend.security.auth import session_manager

logger = setup_logging()

MT5_RETCODE_DONE = 10009
MT5_RETCODE_DONE_PARTIAL = 10010
MT5_RETCODE_PLACED = 10008


class ExecutionEngine:
    """
    Handles order submission, result verification, duplicate prevention, and state reconciliation.
    """

    def __init__(
        self,
        connector: MT5Connector,
        db: DatabaseManager,
        risk_engine: RiskEngine,
    ):
        self.connector = connector
        self.db = db
        self.risk_engine = risk_engine
        self._recent_idempotency_keys: set[str] = set()
        self._simulated_execution_error: Optional[str] = None

    def set_simulated_execution_error(self, error_code: Optional[str]) -> None:
        """Used for automated error-handling tests and Diagnostics Scenario verification."""
        self._simulated_execution_error = error_code

    def build_idempotency_key(self, symbol: str, timeframe: str, direction: str, bar_time: str) -> str:
        return f"ORD_{symbol.upper()}_{timeframe.upper()}_{direction.upper()}_{bar_time}"

    def execute_signal(
        self,
        signal: Dict[str, Any],
        order_type: str = "MARKET",
        current_prices: Optional[Dict[str, Dict[str, float]]] = None,
    ) -> Dict[str, Any]:
        """
        Attempt to execute a validated signal.
        Performs mandatory pre-flight checks:
        1. Bot state & Emergency stop check
        2. Connection check
        3. Live mode explicit authorization check
        4. Duplicate order / Idempotency key check
        5. Un-bypassable Risk Engine re-verification
        6. Dispatch to MT5 / EA Bridge / Paper Harness & verify result code
        """
        sym = str(signal.get("symbol", "EURUSD")).upper()
        direction = str(signal.get("action", "WAIT")).upper()
        timeframe = str(signal.get("timeframe", "M15")).upper()
        bar_time = str(signal.get("bar_time") or signal.get("timestamp") or "NOW")

        if direction not in ("BUY", "SELL"):
            return {"executed": False, "code": "SIGNAL_WAIT", "message": "Signal is WAIT; no order sent."}

        # 1. Check Simulated Execution Error Modes (for mandatory error-handling verification)
        if self._simulated_execution_error:
            err = self._handle_simulated_error(sym, self._simulated_execution_error)
            return err

        # 2. Check Connection State
        if self.connector.connection_state == "DISCONNECTED":
            self.db.log_diagnostic(
                "ERROR",
                "MT5_CONNECTION",
                f"Order blocked on {sym}: MT5 terminal is disconnected.",
                symbol=sym,
            )
            return {
                "executed": False,
                "code": "TERMINAL_DISCONNECTED",
                "message": "Cannot execute trade: MT5 terminal is disconnected.",
            }

        # 3. Check Live Mode Explicit Authorization
        if self.connector.active_mode == "LIVE" and not session_manager.is_live_trading_authorized:
            self.db.log_diagnostic(
                "WARNING",
                "RISK_REJECTION",
                f"Live order blocked on {sym}: Live automated execution has not been explicitly authorized.",
                symbol=sym,
            )
            return {
                "executed": False,
                "code": "LIVE_NOT_AUTHORIZED",
                "message": "Live trading is disabled by default until you explicitly authorize it in the Setup/Risk Center.",
            }

        # 4. Duplicate-Order Prevention (Idempotency check in memory + SQLite)
        idem_key = self.build_idempotency_key(sym, timeframe, direction, bar_time)
        if idem_key in self._recent_idempotency_keys or self.db.check_idempotency_key_exists(idem_key):
            self.db.log_diagnostic(
                "WARNING",
                "BROKER_REJECTION",
                f"Duplicate order prevented for {sym} ({idem_key}).",
                symbol=sym,
            )
            return {
                "executed": False,
                "code": "DUPLICATE_ORDER_PREVENTED",
                "message": f"Duplicate order prevented: Signal {idem_key} was already executed.",
            }

        # 5. Re-verify through Un-bypassable Risk Engine
        acct = self.connector.get_account_info(current_prices)
        open_pos = self.connector.get_open_positions(current_prices)
        spec = self.connector.get_symbol_spec(sym)
        bot_state = self.db.get_setting("bot_state", {})

        entry_price = float(signal["entry_price"])
        stop_loss = float(signal["stop_loss"])
        take_profit = float(signal["take_profit"])
        spread_pips = float(signal.get("diagnostics", {}).get("filters", {}).get("spread_pips", 1.2))

        risk_check = self.risk_engine.evaluate_trade_risk(
            symbol=sym,
            direction=direction,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            account_info=acct,
            symbol_spec=spec,
            open_positions=open_pos,
            current_spread_pips=spread_pips,
            bot_state=bot_state,
        )

        if not risk_check["approved"] or risk_check["lot_size"] <= 0:
            reasons = "; ".join(risk_check["rejections"])
            cat = "INVALID_VOLUME" if risk_check.get("small_account_blocked") else "RISK_REJECTION"
            self.db.log_diagnostic("WARNING", cat, f"Order blocked on {sym}: {reasons}", symbol=sym, details=risk_check)
            return {
                "executed": False,
                "code": "RISK_REJECTED",
                "message": reasons,
                "risk_evaluation": risk_check,
            }

        lot_size = float(risk_check["lot_size"])

        # 6. Dispatch Order according to active connection backend
        if self.connector.connection_state == "CONNECTED_MT5" and HAS_NATIVE_MT5_PKG:
            return self._send_native_mt5_order(
                sym=sym,
                direction=direction,
                order_type=order_type,
                lot_size=lot_size,
                entry_price=entry_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                timeframe=timeframe,
                idem_key=idem_key,
                score=float(signal.get("score", 0.0)),
            )

        if self.connector.connection_state == "CONNECTED_EA_BRIDGE":
            return self._send_ea_bridge_order(
                sym=sym,
                direction=direction,
                order_type=order_type,
                lot_size=lot_size,
                entry_price=entry_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                timeframe=timeframe,
                idem_key=idem_key,
                score=float(signal.get("score", 0.0)),
            )

        if self.connector.connection_state == "PAPER_HARNESS":
            return self._send_paper_harness_order(
                sym=sym,
                direction=direction,
                order_type=order_type,
                lot_size=lot_size,
                entry_price=entry_price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                timeframe=timeframe,
                idem_key=idem_key,
                score=float(signal.get("score", 0.0)),
            )

        return {"executed": False, "code": "UNKNOWN_CONNECTION_STATE", "message": "No valid execution target."}

    def _send_native_mt5_order(
        self,
        sym: str,
        direction: str,
        order_type: str,
        lot_size: float,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        timeframe: str,
        idem_key: str,
        score: float,
    ) -> Dict[str, Any]:
        tick = mt5_pkg.symbol_info_tick(sym)
        if tick is None:
            self.db.log_diagnostic("ERROR", "BROKER_REJECTION", f"MT5 tick unavailable for {sym}", symbol=sym)
            return {"executed": False, "code": "SYMBOL_UNAVAILABLE", "message": f"Symbol {sym} tick unavailable in MT5."}

        price = float(tick.ask) if direction == "BUY" else float(tick.bid)
        mt5_order_type = mt5_pkg.ORDER_TYPE_BUY if direction == "BUY" else mt5_pkg.ORDER_TYPE_SELL
        request = {
            "action": mt5_pkg.TRADE_ACTION_DEAL,
            "symbol": sym,
            "volume": lot_size,
            "type": mt5_order_type,
            "price": price,
            "sl": stop_loss,
            "tp": take_profit,
            "deviation": 15,
            "magic": 20261012,
            "comment": f"2REAL_{timeframe}_{int(score)}",
            "type_time": mt5_pkg.ORDER_TIME_GTC,
            "type_filling": mt5_pkg.ORDER_FILLING_IOC,
        }
        result = mt5_pkg.order_send(request)
        if result is None:
            err_code, err_desc = mt5_pkg.last_error()
            self.db.log_diagnostic(
                "ERROR",
                "BROKER_REJECTION",
                f"MT5 order_send returned None ({err_code}): {err_desc}",
                symbol=sym,
            )
            return {"executed": False, "code": f"MT5_SEND_ERROR_{err_code}", "message": err_desc}

        retcode = int(result.retcode)
        if retcode not in (MT5_RETCODE_DONE, MT5_RETCODE_DONE_PARTIAL, MT5_RETCODE_PLACED):
            self.db.log_diagnostic(
                "ERROR",
                "BROKER_REJECTION",
                f"MT5 rejected order on {sym} (retcode={retcode}): {result.comment}",
                symbol=sym,
            )
            return {
                "executed": False,
                "code": f"MT5_REJECT_{retcode}",
                "message": f"Broker rejected order (retcode {retcode}): {result.comment}",
            }

        filled_vol = float(getattr(result, "volume", lot_size))
        fill_price = float(getattr(result, "price", price))
        ticket = int(result.order)
        self._recent_idempotency_keys.add(idem_key)

        trade_rec = {
            "ticket": ticket,
            "idempotency_key": idem_key,
            "symbol": sym,
            "timeframe": timeframe,
            "direction": direction,
            "order_type": order_type,
            "volume": filled_vol,
            "entry_price": fill_price,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "entry_time": datetime.now(timezone.utc).isoformat(),
            "strategy_tag": "MULTI_CONFLUENCE",
            "confluence_score": score,
            "execution_source": "MT5_TERMINAL",
            "status": "PARTIAL_OPEN" if retcode == MT5_RETCODE_DONE_PARTIAL else "OPEN",
        }
        self.db.upsert_trade(trade_rec)
        self.db.log_diagnostic(
            "INFO",
            "STRATEGY_DECISION",
            f"Executed {direction} {filled_vol} lot {sym} @ {fill_price} (Ticket #{ticket})",
            symbol=sym,
            details=trade_rec,
        )
        return {"executed": True, "code": "ORDER_FILLED", "ticket": ticket, "trade": trade_rec}

    def _send_ea_bridge_order(
        self,
        sym: str,
        direction: str,
        order_type: str,
        lot_size: float,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        timeframe: str,
        idem_key: str,
        score: float,
    ) -> Dict[str, Any]:
        resp = self.connector._query_ea_bridge(
            "EXECUTE_ORDER",
            {
                "symbol": sym,
                "direction": direction,
                "volume": lot_size,
                "sl": stop_loss,
                "tp": take_profit,
                "comment": f"2REAL_{timeframe}_{int(score)}",
            },
            self.connector.ea_shared_secret,
        )
        if not resp.get("ok"):
            err = resp.get("error", "EA_ORDER_FAILED")
            self.db.log_diagnostic("ERROR", "BROKER_REJECTION", f"EA Bridge rejected order on {sym}: {err}", symbol=sym)
            return {"executed": False, "code": "EA_REJECTED", "message": f"EA Bridge order failed: {err}"}

        ticket = int(resp["ticket"])
        self._recent_idempotency_keys.add(idem_key)
        trade_rec = {
            "ticket": ticket,
            "idempotency_key": idem_key,
            "symbol": sym,
            "timeframe": timeframe,
            "direction": direction,
            "order_type": order_type,
            "volume": lot_size,
            "entry_price": float(resp.get("price", entry_price)),
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "entry_time": datetime.now(timezone.utc).isoformat(),
            "strategy_tag": "MULTI_CONFLUENCE",
            "confluence_score": score,
            "execution_source": "MT5_EA_BRIDGE",
            "status": "OPEN",
        }
        self.db.upsert_trade(trade_rec)
        return {"executed": True, "code": "ORDER_FILLED", "ticket": ticket, "trade": trade_rec}

    def _send_paper_harness_order(
        self,
        sym: str,
        direction: str,
        order_type: str,
        lot_size: float,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        timeframe: str,
        idem_key: str,
        score: float,
    ) -> Dict[str, Any]:
        ticket = self.connector._next_paper_ticket
        self.connector._next_paper_ticket += 1
        self._recent_idempotency_keys.add(idem_key)
        now_iso = datetime.now(timezone.utc).isoformat()

        pos_obj = {
            "ticket": ticket,
            "idempotency_key": idem_key,
            "symbol": sym,
            "timeframe": timeframe,
            "direction": direction,
            "order_type": order_type,
            "volume": lot_size,
            "entry_price": entry_price,
            "current_price": entry_price,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "floating_pnl": 0.0,
            "swap": 0.0,
            "entry_time": now_iso,
            "strategy_tag": "MULTI_CONFLUENCE",
            "confluence_score": score,
            "execution_source": "PAPER_HARNESS",
            "status": "OPEN",
        }
        self.connector._paper_positions[ticket] = pos_obj
        self.connector._update_paper_floating_pnl()
        self.db.upsert_trade(pos_obj)
        self.db.log_diagnostic(
            "INFO",
            "STRATEGY_DECISION",
            f"[Paper Harness] Opened {direction} {lot_size} lot {sym} @ {entry_price} (Ticket #{ticket})",
            symbol=sym,
            details=pos_obj,
        )
        return {"executed": True, "code": "PAPER_ORDER_FILLED", "ticket": ticket, "trade": pos_obj}

    def close_position(
        self,
        ticket: int,
        current_prices: Optional[Dict[str, Dict[str, float]]] = None,
    ) -> Dict[str, Any]:
        """Close a specific open position by ticket and verify result."""
        if self.connector.connection_state == "CONNECTED_MT5" and HAS_NATIVE_MT5_PKG:
            positions = mt5_pkg.positions_get(ticket=int(ticket))
            if not positions:
                return {"closed": False, "message": f"Position #{ticket} not found in MT5."}
            pos = positions[0]
            sym = str(pos.symbol)
            tick = mt5_pkg.symbol_info_tick(sym)
            close_type = mt5_pkg.ORDER_TYPE_SELL if pos.type == 0 else mt5_pkg.ORDER_TYPE_BUY
            close_price = float(tick.bid) if pos.type == 0 else float(tick.ask)
            req = {
                "action": mt5_pkg.TRADE_ACTION_DEAL,
                "position": int(ticket),
                "symbol": sym,
                "volume": float(pos.volume),
                "type": close_type,
                "price": close_price,
                "deviation": 20,
                "magic": 20261012,
                "comment": "2REAL_CLOSE",
                "type_time": mt5_pkg.ORDER_TIME_GTC,
                "type_filling": mt5_pkg.ORDER_FILLING_IOC,
            }
            res = mt5_pkg.order_send(req)
            if res is None or int(res.retcode) != MT5_RETCODE_DONE:
                return {"closed": False, "message": f"Failed to close #{ticket} in MT5."}
            now_iso = datetime.now(timezone.utc).isoformat()
            self.db.upsert_trade(
                {
                    "ticket": int(ticket),
                    "symbol": sym,
                    "direction": "BUY" if pos.type == 0 else "SELL",
                    "volume": float(pos.volume),
                    "entry_price": float(pos.price_open),
                    "stop_loss": float(pos.sl),
                    "take_profit": float(pos.tp),
                    "exit_price": close_price,
                    "entry_time": datetime.fromtimestamp(int(pos.time), tz=timezone.utc).isoformat(),
                    "exit_time": now_iso,
                    "realized_pnl": round(float(pos.profit), 2),
                    "execution_source": "MT5_TERMINAL",
                    "status": "CLOSED",
                }
            )
            return {"closed": True, "ticket": int(ticket), "exit_price": close_price}

        if self.connector.connection_state == "PAPER_HARNESS":
            pos = self.connector._paper_positions.pop(int(ticket), None)
            if not pos:
                return {"closed": False, "message": f"Position #{ticket} not found in Paper Harness."}
            self.connector._update_paper_floating_pnl(current_prices)
            pnl = float(pos.get("floating_pnl", 0.0))
            comm = round(float(pos["volume"]) * 7.0, 2)
            net_pnl = round(pnl - comm, 2)
            self.connector._paper_account["balance"] = round(float(self.connector._paper_account["balance"]) + net_pnl, 2)
            self.connector._update_paper_floating_pnl(current_prices)
            pos["exit_price"] = pos.get("current_price", pos["entry_price"])
            pos["exit_time"] = datetime.now(timezone.utc).isoformat()
            pos["realized_pnl"] = net_pnl
            pos["commission"] = comm
            pos["status"] = "CLOSED"
            self.db.upsert_trade(pos)
            self.db.log_diagnostic(
                "INFO",
                "STRATEGY_DECISION",
                f"Closed position #{ticket} ({pos['symbol']}) | Realized P&L: ${net_pnl:.2f}",
                symbol=pos["symbol"],
            )
            return {"closed": True, "ticket": int(ticket), "realized_pnl": net_pnl, "trade": pos}

        return {"closed": False, "message": "Terminal is disconnected."}

    def close_all_positions(self, confirmed: bool = False) -> Dict[str, Any]:
        """Close all open positions (requires explicit confirmation=True)."""
        if not confirmed:
            return {"closed_count": 0, "error": "CONFIRMATION_REQUIRED", "message": "Explicit confirmation required to close all positions."}
        open_positions = self.connector.get_open_positions()
        closed_tickets: List[int] = []
        for p in list(open_positions):
            res = self.close_position(int(p["ticket"]))
            if res.get("closed"):
                closed_tickets.append(int(p["ticket"]))
        return {"closed_count": len(closed_tickets), "closed_tickets": closed_tickets}

    def reconcile_positions(self) -> Dict[str, Any]:
        """
        Reconcile SQLite OPEN trade records against live MT5 / Paper Harness positions
        after an application restart or reconnection so trades are never orphaned or duplicated.
        """
        if self.connector.connection_state == "DISCONNECTED":
            return {"reconciled": False, "reason": "DISCONNECTED"}

        actual_positions = self.connector.get_open_positions()
        actual_tickets = {int(p["ticket"]): p for p in actual_positions}
        db_open_trades = self.db.get_trades(status="OPEN")

        imported_count = 0
        closed_externally_count = 0

        # 1. Mark DB trades that are no longer open in terminal as CLOSED_RECONCILED
        for dbt in db_open_trades:
            t_id = int(dbt["ticket"])
            if dbt.get("execution_source") == "PAPER_HARNESS" and self.connector.connection_state != "PAPER_HARNESS":
                continue
            if t_id not in actual_tickets:
                dbt["status"] = "CLOSED_RECONCILED"
                dbt["exit_time"] = datetime.now(timezone.utc).isoformat()
                self.db.upsert_trade(dbt)
                closed_externally_count += 1

        # 2. Import any open terminal positions missing from local DB
        db_tickets = {int(t["ticket"]) for t in db_open_trades}
        for tk, pos in actual_tickets.items():
            if tk not in db_tickets:
                self.db.upsert_trade(
                    {
                        "ticket": tk,
                        "symbol": pos["symbol"],
                        "timeframe": "M15",
                        "direction": pos["direction"],
                        "order_type": "MARKET",
                        "volume": pos["volume"],
                        "entry_price": pos["entry_price"],
                        "stop_loss": pos["stop_loss"],
                        "take_profit": pos["take_profit"],
                        "entry_time": pos.get("entry_time", datetime.now(timezone.utc).isoformat()),
                        "strategy_tag": "RECONCILED_IMPORT",
                        "execution_source": pos.get("execution_source", "MT5_TERMINAL"),
                        "status": "OPEN",
                    }
                )
                imported_count += 1

        return {
            "reconciled": True,
            "active_terminal_positions": len(actual_positions),
            "imported_positions": imported_count,
            "closed_externally": closed_externally_count,
        }

    def _handle_simulated_error(self, symbol: str, err_mode: str) -> Dict[str, Any]:
        error_catalog = {
            "MARKET_CLOSED": ("BROKER_REJECTION", "MT5 Retcode 10018: Market is closed for symbol."),
            "SYMBOL_UNAVAILABLE": ("BROKER_REJECTION", f"Symbol {symbol} is disabled or unavailable on broker server."),
            "INVALID_VOLUME": ("INVALID_VOLUME", "MT5 Retcode 10014: Invalid volume specification."),
            "INVALID_STOPS": ("BROKER_REJECTION", "MT5 Retcode 10016: Invalid stop loss / take profit distance."),
            "INSUFFICIENT_MARGIN": ("INSUFFICIENT_MARGIN", "MT5 Retcode 10019: Not enough free margin to open position."),
            "ORDER_REJECTED": ("BROKER_REJECTION", "MT5 Retcode 10006: Request rejected by broker dealer."),
            "ORDER_TIMEOUT": ("BROKER_REJECTION", "MT5 Retcode 10012: Request timed out; order state verified safe (no retry loop)."),
        }
        cat, msg = error_catalog.get(err_mode, ("BROKER_REJECTION", f"Simulated execution failure: {err_mode}"))
        self.db.log_diagnostic("ERROR", cat, msg, symbol=symbol)
        return {"executed": False, "code": err_mode, "message": msg}
