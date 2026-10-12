"""
MetaTrader 5 Terminal Detection, Connection Manager, and Authenticated Local EA Bridge.
Strictly adheres to honest connection reporting:
- Uses official MetaTrader5 Python package on Windows when installed.
- Supports HMAC-SHA256 authenticated local TCP/JSON-RPC bridge to TwoRealBridgeEA.mq5.
- Never fabricates broker connections or fake live account balances.
- Provides an explicitly labeled 'PAPER_HARNESS' (Offline Demo Test Harness) ONLY when
  deliberately enabled for local dry-run testing without an installed MT5 terminal.
"""
import glob
import hashlib
import hmac
import json
import os
import platform
import socket
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.core.logging_config import setup_logging

logger = setup_logging()

# Attempt to import official MetaTrader5 package (Windows native)
try:
    import MetaTrader5 as mt5_pkg  # type: ignore
    HAS_NATIVE_MT5_PKG = True
except ImportError:
    mt5_pkg = None
    HAS_NATIVE_MT5_PKG = False


STANDARD_SYMBOL_SPECS: Dict[str, Dict[str, Any]] = {
    "EURUSD": {
        "symbol": "EURUSD",
        "description": "Euro vs US Dollar",
        "digits": 5,
        "point": 0.00001,
        "pip_size": 0.0001,
        "trade_contract_size": 100000.0,
        "trade_tick_size": 0.00001,
        "trade_tick_value": 1.0,
        "volume_min": 0.01,
        "volume_max": 100.0,
        "volume_step": 0.01,
        "stops_level_points": 10,
        "currency_base": "EUR",
        "currency_profit": "USD",
        "currency_margin": "EUR",
        "spread_points_typical": 11,
    },
    "GBPUSD": {
        "symbol": "GBPUSD",
        "description": "Great Britain Pound vs US Dollar",
        "digits": 5,
        "point": 0.00001,
        "pip_size": 0.0001,
        "trade_contract_size": 100000.0,
        "trade_tick_size": 0.00001,
        "trade_tick_value": 1.0,
        "volume_min": 0.01,
        "volume_max": 100.0,
        "volume_step": 0.01,
        "stops_level_points": 12,
        "currency_base": "GBP",
        "currency_profit": "USD",
        "currency_margin": "GBP",
        "spread_points_typical": 14,
    },
    "USDJPY": {
        "symbol": "USDJPY",
        "description": "US Dollar vs Japanese Yen",
        "digits": 3,
        "point": 0.001,
        "pip_size": 0.01,
        "trade_contract_size": 100000.0,
        "trade_tick_size": 0.001,
        "trade_tick_value": 0.67,
        "volume_min": 0.01,
        "volume_max": 100.0,
        "volume_step": 0.01,
        "stops_level_points": 12,
        "currency_base": "USD",
        "currency_profit": "JPY",
        "currency_margin": "USD",
        "spread_points_typical": 12,
    },
    "XAUUSD": {
        "symbol": "XAUUSD",
        "description": "Spot Gold vs US Dollar",
        "digits": 2,
        "point": 0.01,
        "pip_size": 0.10,
        "trade_contract_size": 100.0,
        "trade_tick_size": 0.01,
        "trade_tick_value": 1.0,
        "volume_min": 0.01,
        "volume_max": 50.0,
        "volume_step": 0.01,
        "stops_level_points": 25,
        "currency_base": "XAU",
        "currency_profit": "USD",
        "currency_margin": "USD",
        "spread_points_typical": 22,
    },
}


class MT5TerminalDetector:
    """Scans the operating system for installed MetaTrader 5 desktop terminals."""

    @staticmethod
    def detect_terminals() -> Dict[str, Any]:
        sys_name = platform.system()
        found_paths: List[Dict[str, str]] = []

        # 1. Windows standard & broker-specific paths
        win_candidates = [
            r"C:\Program Files\MetaTrader 5\terminal64.exe",
            r"C:\Program Files (x86)\MetaTrader 5\terminal.exe",
        ]
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        if os.path.isdir(program_files):
            for match in glob.glob(os.path.join(program_files, "*", "terminal64.exe")):
                win_candidates.append(match)

        appdata = os.environ.get("APPDATA", "")
        if appdata:
            origins = glob.glob(os.path.join(appdata, "MetaQuotes", "Terminal", "*", "origin.txt"))
            for origin_file in origins:
                try:
                    install_dir = Path(origin_file).read_text(encoding="utf-16", errors="ignore").strip()
                    if not install_dir:
                        install_dir = Path(origin_file).read_text(encoding="utf-8", errors="ignore").strip()
                    exe_candidate = os.path.join(install_dir, "terminal64.exe")
                    win_candidates.append(exe_candidate)
                except Exception:
                    pass

        for path in win_candidates:
            if os.path.isfile(path) and not any(p["path"] == path for p in found_paths):
                found_paths.append({"path": path, "type": "WINDOWS_NATIVE", "broker_hint": Path(path).parent.name})

        # 2. Wine / macOS CrossOver paths for Linux & macOS laptops
        home = str(Path.home())
        wine_candidates = [
            os.path.join(home, ".wine", "drive_c", "Program Files", "MetaTrader 5", "terminal64.exe"),
            os.path.join(home, ".mt5", "drive_c", "Program Files", "MetaTrader 5", "terminal64.exe"),
            "/Applications/MetaTrader 5.app/Contents/SharedSupport/wine/drive_c/Program Files/MetaTrader 5/terminal64.exe",
        ]
        for path in wine_candidates:
            if os.path.isfile(path) and not any(p["path"] == path for p in found_paths):
                found_paths.append({"path": path, "type": "WINE_WRAPPER", "broker_hint": "MetaTrader 5 (Wine)"})

        return {
            "os_platform": sys_name,
            "os_release": platform.release(),
            "native_mt5_python_pkg_installed": HAS_NATIVE_MT5_PKG,
            "detected_terminals": found_paths,
            "recommended_path": found_paths[0]["path"] if found_paths else "",
            "installation_guide": (
                "Official MetaTrader 5 terminal detected."
                if found_paths
                else (
                    "No MetaTrader 5 desktop terminal installation was detected on this machine. "
                    "On Windows: Download the official MT5 terminal from your broker or metatrader5.com "
                    "and install `pip install MetaTrader5`. "
                    "On Linux/macOS: Install MT5 via Wine/CrossOver and attach `mql5/TwoRealBridgeEA.mq5` "
                    "to connect via the local authenticated EA bridge on 127.0.0.1:18555."
                )
            ),
        }


class MT5Connector:
    """
    Manages connection to the official MetaTrader 5 terminal (via native Python IPC or Local EA Bridge)
    and provides an explicitly separated Offline Paper Test Harness for non-broker testing.
    """

    def __init__(self, db_manager: Any = None):
        self.db = db_manager
        self.connection_state: str = "DISCONNECTED"  # DISCONNECTED, CONNECTED_MT5, CONNECTED_EA_BRIDGE, PAPER_HARNESS
        self.last_error_code: Optional[str] = None
        self.last_error_message: Optional[str] = None
        self.troubleshooting_hint: Optional[str] = None
        self.connected_at: Optional[str] = None
        self.last_heartbeat: Optional[float] = None

        # Active connection metadata
        self.active_broker: str = ""
        self.active_server: str = ""
        self.active_login: Optional[int] = None
        self.active_mode: str = "DEMO"  # DEMO or LIVE
        self.terminal_path: str = ""
        self.ea_bridge_host: str = "127.0.0.1"
        self.ea_bridge_port: int = 18555
        self.ea_shared_secret: str = ""

        # Offline Paper Test Harness state (ONLY active when connection_state == "PAPER_HARNESS")
        self._paper_account: Dict[str, Any] = {
            "login": 9900001,
            "broker": "OFFLINE DEMO TEST HARNESS (Non-Broker Local Simulator)",
            "server": "Local-Paper-Test-Server",
            "currency": "USD",
            "leverage": 100,
            "balance": 10000.00,
            "equity": 10000.00,
            "margin": 0.0,
            "free_margin": 10000.00,
            "margin_level": 0.0,
            "floating_pnl": 0.0,
            "is_real_mt5": False,
            "trading_mode": "DEMO",
        }
        self._paper_positions: Dict[int, Dict[str, Any]] = {}
        self._next_paper_ticket: int = 500001
        self._simulated_error_mode: Optional[str] = None

    def set_simulated_error_mode(self, error_mode: Optional[str]) -> None:
        """Used by automated tests and the Diagnostics Error Tester to verify failure handling."""
        self._simulated_error_mode = error_mode

    def connect_mt5(
        self,
        broker: str,
        server: str,
        login: int,
        password: str,
        terminal_path: str = "",
        trading_mode: str = "DEMO",
        ea_shared_secret: str = "",
        use_ea_bridge: bool = False,
    ) -> Dict[str, Any]:
        """
        Attempt a genuine connection to MetaTrader 5 via official Python package or local EA bridge.
        Never fabricates success if the terminal is absent or unreachable.
        """
        if not server or not login or not password:
            self.connection_state = "DISCONNECTED"
            self.last_error_code = "INVALID_CREDENTIALS_INPUT"
            self.last_error_message = "MT5 server, account login number, and trading password are required."
            self.troubleshooting_hint = "Complete all fields in the Connection Setup Wizard before connecting."
            return self.get_status_Readout()

        if self._simulated_error_mode == "INVALID_CREDENTIALS":
            self.connection_state = "DISCONNECTED"
            self.last_error_code = "MT5_AUTH_FAILED_10004"
            self.last_error_message = f"MT5 terminal rejected login {login} on server '{server}': Invalid account or password."
            self.troubleshooting_hint = "Verify your account login number, trading/investor password, and exact broker server name in the MT5 terminal."
            return self.get_status_Readout()

        if self._simulated_error_mode == "WRONG_SERVER":
            self.connection_state = "DISCONNECTED"
            self.last_error_code = "MT5_SERVER_UNREACHABLE"
            self.last_error_message = f"Broker server '{server}' could not be resolved by the MT5 terminal."
            self.troubleshooting_hint = "In MetaTrader 5, go to File -> Open an Account -> search for your broker to load the server definition."
            return self.get_status_Readout()

        # 1. Try Native MetaTrader5 Python IPC (Windows)
        if HAS_NATIVE_MT5_PKG and not use_ea_bridge:
            init_kwargs: Dict[str, Any] = {
                "login": int(login),
                "password": password,
                "server": server.strip(),
                "timeout": 10000,
            }
            if terminal_path and os.path.isfile(terminal_path):
                init_kwargs["path"] = terminal_path

            try:
                initialized = mt5_pkg.initialize(**init_kwargs)
                if not initialized:
                    err_code, err_desc = mt5_pkg.last_error()
                    self.connection_state = "DISCONNECTED"
                    self.last_error_code = f"MT5_INIT_ERROR_{err_code}"
                    self.last_error_message = f"MetaTrader 5 initialization failed ({err_code}): {err_desc}"
                    self.troubleshooting_hint = (
                        "Ensure the MetaTrader 5 desktop terminal is installed, running under the same user account, "
                        "and 'Allow algorithmic trading' is enabled under Tools -> Options -> Expert Advisors."
                    )
                    return self.get_status_Readout()

                acct = mt5_pkg.account_info()
                if acct is None:
                    err_code, err_desc = mt5_pkg.last_error()
                    self.connection_state = "DISCONNECTED"
                    self.last_error_code = f"MT5_ACCOUNT_READ_ERROR_{err_code}"
                    self.last_error_message = f"Connected to terminal IPC but failed to read account info: {err_desc}"
                    return self.get_status_Readout()

                # Verify demo vs live mode matches actual account trade_mode
                # ACCOUNT_TRADE_MODE_DEMO = 0, CONTEST = 1, REAL = 2
                actual_is_real = getattr(acct, "trade_mode", 0) == 2
                if actual_is_real and trading_mode.upper() == "DEMO":
                    mt5_pkg.shutdown()
                    self.connection_state = "DISCONNECTED"
                    self.last_error_code = "ACCOUNT_MODE_MISMATCH"
                    self.last_error_message = (
                        "Safety Block: Account is a REAL (Live) broker account, but setup mode is set to DEMO."
                    )
                    self.troubleshooting_hint = "Select a Demo account login or explicitly authorize Live mode."
                    return self.get_status_Readout()

                self.connection_state = "CONNECTED_MT5"
                self.active_broker = getattr(acct, "company", broker)
                self.active_server = getattr(acct, "server", server)
                self.active_login = int(getattr(acct, "login", login))
                self.active_mode = "LIVE" if actual_is_real else "DEMO"
                self.terminal_path = terminal_path
                self.last_error_code = None
                self.last_error_message = None
                self.troubleshooting_hint = None
                self.connected_at = datetime.now(timezone.utc).isoformat()
                self.last_heartbeat = time.time()
                return self.get_status_Readout()
            except Exception as exc:
                self.connection_state = "DISCONNECTED"
                self.last_error_code = "MT5_EXCEPTION"
                self.last_error_message = f"Unexpected MT5 IPC exception: {exc}"
                return self.get_status_Readout()

        # 2. Try Local Authenticated MQL5 Expert Advisor Bridge (127.0.0.1:18555)
        bridge_resp = self._query_ea_bridge(
            command="PING_ACCOUNT",
            payload={"login": int(login), "server": server},
            secret=ea_shared_secret,
        )
        if bridge_resp.get("ok"):
            self.connection_state = "CONNECTED_EA_BRIDGE"
            self.active_broker = bridge_resp.get("company", broker)
            self.active_server = bridge_resp.get("server", server)
            self.active_login = int(bridge_resp.get("login", login))
            self.active_mode = bridge_resp.get("mode", trading_mode.upper())
            self.ea_shared_secret = ea_shared_secret
            self.last_error_code = None
            self.last_error_message = None
            self.troubleshooting_hint = None
            self.connected_at = datetime.now(timezone.utc).isoformat()
            self.last_heartbeat = time.time()
            return self.get_status_Readout()

        # 3. Neither native MT5 IPC nor Local EA Bridge is reachable -> report honest diagnostic error
        self.connection_state = "DISCONNECTED"
        sys_name = platform.system()
        if not HAS_NATIVE_MT5_PKG and sys_name != "Windows":
            self.last_error_code = "MT5_TERMINAL_NOT_RUNNING_ON_HOST"
            self.last_error_message = (
                f"Cannot establish live MT5 connection on {sys_name}: Official MetaTrader5 Python IPC requires Windows "
                f"and no local MQL5 EA Bridge responded on {self.ea_bridge_host}:{self.ea_bridge_port}."
            )
            self.troubleshooting_hint = (
                "To connect to your live/demo MT5 broker account: "
                "(1) Run 2REAL AI TRADER on your Windows laptop with the official MetaTrader 5 terminal installed and open, OR "
                "(2) If running MT5 under Wine/macOS/Linux, compile and attach `mql5/TwoRealBridgeEA.mq5` to any chart in MT5 "
                "with port 18555 enabled. For local non-broker strategy & risk engine testing right now, you may explicitly "
                "activate the 'Offline Demo Test Harness' in the Setup panel."
            )
        else:
            self.last_error_code = "MT5_TERMINAL_NOT_DETECTED"
            self.last_error_message = (
                "MetaTrader 5 desktop terminal is not running or did not respond to local IPC."
            )
            self.troubleshooting_hint = (
                "Launch the official MetaTrader 5 terminal on your laptop, log into your broker account, "
                "and click 'Connect to MT5' again."
            )
        return self.get_status_Readout()

    def enable_paper_test_harness(
        self,
        initial_balance: float = 10000.0,
        leverage: int = 100,
        currency: str = "USD",
    ) -> Dict[str, Any]:
        """
        Explicitly activates the local non-broker Offline Demo Test Harness so the user
        can test execution workflows, $5 small-account safety checks, risk limits, and position
        reconciliation when no MT5 terminal is installed. Clearly labeled as non-broker simulator.
        """
        self.connection_state = "PAPER_HARNESS"
        self.active_broker = "OFFLINE DEMO TEST HARNESS (Local Simulator)"
        self.active_server = "Local-Paper-Test-Server"
        self.active_login = 9900001
        self.active_mode = "DEMO"
        self._paper_account = {
            "login": 9900001,
            "broker": "OFFLINE DEMO TEST HARNESS (Local Simulator)",
            "server": "Local-Paper-Test-Server",
            "currency": currency.upper(),
            "leverage": int(leverage),
            "balance": round(float(initial_balance), 2),
            "equity": round(float(initial_balance), 2),
            "margin": 0.0,
            "free_margin": round(float(initial_balance), 2),
            "margin_level": 0.0,
            "floating_pnl": 0.0,
            "is_real_mt5": False,
            "trading_mode": "DEMO",
        }
        self._paper_positions.clear()
        self.last_error_code = None
        self.last_error_message = None
        self.troubleshooting_hint = (
            "Operating in Offline Demo Test Harness mode. All balances and fills are local dry-run simulations, "
            "not connected to a broker."
        )
        self.connected_at = datetime.now(timezone.utc).isoformat()
        self.last_heartbeat = time.time()
        return self.get_status_Readout()

    def disconnect(self) -> Dict[str, Any]:
        if HAS_NATIVE_MT5_PKG and self.connection_state == "CONNECTED_MT5":
            try:
                mt5_pkg.shutdown()
            except Exception:
                pass
        self.connection_state = "DISCONNECTED"
        self.active_broker = ""
        self.active_server = ""
        self.active_login = None
        self.connected_at = None
        self.last_heartbeat = None
        return self.get_status_Readout()

    def _query_ea_bridge(self, command: str, payload: Dict[str, Any], secret: str = "") -> Dict[str, Any]:
        """Communicates over localhost TCP with TwoRealBridgeEA.mq5 using HMAC-SHA256 authentication."""
        ts = int(time.time())
        body_str = json.dumps({"command": command, "timestamp": ts, "payload": payload}, sort_keys=True)
        sig = hmac.new((secret or "default_local_key").encode("utf-8"), body_str.encode("utf-8"), hashlib.sha256).hexdigest()
        packet = json.dumps({"body": body_str, "signature": sig}) + "\n"
        try:
            with socket.create_connection((self.ea_bridge_host, self.ea_bridge_port), timeout=1.5) as sock:
                sock.sendall(packet.encode("utf-8"))
                raw_reply = sock.recv(65536).decode("utf-8").strip()
                if not raw_reply:
                    return {"ok": False, "error": "EMPTY_EA_RESPONSE"}
                return json.loads(raw_reply)
        except OSError as exc:
            return {"ok": False, "error": str(exc)}

    def get_account_info(self, current_prices: Optional[Dict[str, Dict[str, float]]] = None) -> Optional[Dict[str, Any]]:
        """
        Retrieve real account info when connected to MT5, or None when disconnected.
        When in PAPER_HARNESS mode, returns the explicitly marked paper test account.
        """
        if self._simulated_error_mode == "TERMINAL_DISCONNECTED":
            self.connection_state = "DISCONNECTED"
            self.last_error_code = "IPC_DISCONNECTED"
            self.last_error_message = "Lost connection to MetaTrader 5 terminal IPC."
            return None

        if self.connection_state == "DISCONNECTED":
            return None

        if self.connection_state == "CONNECTED_MT5" and HAS_NATIVE_MT5_PKG:
            acct = mt5_pkg.account_info()
            if acct is None:
                self.connection_state = "DISCONNECTED"
                self.last_error_code = "ACCOUNT_READ_LOST"
                self.last_error_message = "Lost connection to MT5 terminal while reading account info."
                return None
            self.last_heartbeat = time.time()
            return {
                "login": int(acct.login),
                "broker": str(acct.company),
                "server": str(acct.server),
                "currency": str(acct.currency),
                "leverage": int(acct.leverage),
                "balance": round(float(acct.balance), 2),
                "equity": round(float(acct.equity), 2),
                "margin": round(float(acct.margin), 2),
                "free_margin": round(float(acct.margin_free), 2),
                "margin_level": round(float(acct.margin_level), 2),
                "floating_pnl": round(float(acct.profit), 2),
                "is_real_mt5": True,
                "trading_mode": self.active_mode,
            }

        if self.connection_state == "CONNECTED_EA_BRIDGE":
            resp = self._query_ea_bridge("GET_ACCOUNT", {}, self.ea_shared_secret)
            if not resp.get("ok"):
                self.connection_state = "DISCONNECTED"
                self.last_error_code = "EA_BRIDGE_LOST"
                self.last_error_message = "Lost connection to MQL5 Expert Advisor Bridge."
                return None
            self.last_heartbeat = time.time()
            acct_data = resp["account"]
            acct_data["is_real_mt5"] = True
            return acct_data

        if self.connection_state == "PAPER_HARNESS":
            self._update_paper_floating_pnl(current_prices)
            self.last_heartbeat = time.time()
            return dict(self._paper_account)

        return None

    def _update_paper_floating_pnl(self, current_prices: Optional[Dict[str, Dict[str, float]]] = None) -> None:
        floating = 0.0
        used_margin = 0.0
        leverage = max(int(self._paper_account.get("leverage", 100)), 1)
        for pos in self._paper_positions.values():
            sym = pos["symbol"]
            spec = self.get_symbol_spec(sym)
            vol = float(pos["volume"])
            entry = float(pos["entry_price"])
            cur_price = float(pos.get("current_price", entry))
            if current_prices and sym in current_prices:
                cur_price = (
                    current_prices[sym]["bid"]
                    if pos["direction"] == "BUY"
                    else current_prices[sym]["ask"]
                )
                pos["current_price"] = cur_price
            diff = (cur_price - entry) if pos["direction"] == "BUY" else (entry - cur_price)
            ticks = diff / spec["trade_tick_size"]
            pnl = round(ticks * spec["trade_tick_value"] * vol, 2)
            pos["floating_pnl"] = pnl
            floating += pnl
            notional = vol * spec["trade_contract_size"] * (entry if sym == "XAUUSD" else 1.0)
            used_margin += notional / leverage

        balance = float(self._paper_account["balance"])
        equity = round(balance + floating, 2)
        free_margin = round(equity - used_margin, 2)
        margin_level = round((equity / used_margin) * 100.0, 2) if used_margin > 0 else 0.0
        self._paper_account["floating_pnl"] = round(floating, 2)
        self._paper_account["equity"] = equity
        self._paper_account["margin"] = round(used_margin, 2)
        self._paper_account["free_margin"] = free_margin
        self._paper_account["margin_level"] = margin_level

    def get_symbol_spec(self, symbol: str) -> Dict[str, Any]:
        """Read symbol specification from MT5 when connected, or standard broker contract spec."""
        sym = symbol.upper().strip()
        if self.connection_state == "CONNECTED_MT5" and HAS_NATIVE_MT5_PKG:
            info = mt5_pkg.symbol_info(sym)
            if info is not None:
                digits = int(info.digits)
                point = float(info.point)
                return {
                    "symbol": sym,
                    "description": str(getattr(info, "description", sym)),
                    "digits": digits,
                    "point": point,
                    "pip_size": point * 10.0 if digits in (3, 5) else point * 10.0,
                    "trade_contract_size": float(info.trade_contract_size),
                    "trade_tick_size": float(info.trade_tick_size or point),
                    "trade_tick_value": float(info.trade_tick_value or 1.0),
                    "volume_min": float(info.volume_min),
                    "volume_max": float(info.volume_max),
                    "volume_step": float(info.volume_step),
                    "stops_level_points": int(getattr(info, "trade_stops_level", 10)),
                    "currency_base": str(getattr(info, "currency_base", "USD")),
                    "currency_profit": str(getattr(info, "currency_profit", "USD")),
                    "currency_margin": str(getattr(info, "currency_margin", "USD")),
                    "spread_points_typical": int(getattr(info, "spread", 12)),
                }
        return dict(STANDARD_SYMBOL_SPECS.get(sym, STANDARD_SYMBOL_SPECS["EURUSD"]))

    def get_open_positions(self, current_prices: Optional[Dict[str, Dict[str, float]]] = None) -> List[Dict[str, Any]]:
        if self.connection_state == "CONNECTED_MT5" and HAS_NATIVE_MT5_PKG:
            raw_positions = mt5_pkg.positions_get()
            if raw_positions is None:
                return []
            out = []
            for p in raw_positions:
                out.append(
                    {
                        "ticket": int(p.ticket),
                        "symbol": str(p.symbol),
                        "direction": "BUY" if p.type == 0 else "SELL",
                        "volume": float(p.volume),
                        "entry_price": float(p.price_open),
                        "current_price": float(p.price_current),
                        "stop_loss": float(p.sl),
                        "take_profit": float(p.tp),
                        "floating_pnl": round(float(p.profit), 2),
                        "swap": round(float(getattr(p, "swap", 0.0)), 2),
                        "entry_time": datetime.fromtimestamp(int(p.time), tz=timezone.utc).isoformat(),
                        "execution_source": "MT5_TERMINAL",
                    }
                )
            return out

        if self.connection_state == "CONNECTED_EA_BRIDGE":
            resp = self._query_ea_bridge("GET_POSITIONS", {}, self.ea_shared_secret)
            return resp.get("positions", []) if resp.get("ok") else []

        if self.connection_state == "PAPER_HARNESS":
            self._update_paper_floating_pnl(current_prices)
            return list(self._paper_positions.values())

        return []

    def get_status_Readout(self) -> Dict[str, Any]:
        acct = self.get_account_info()
        return {
            "connection_state": self.connection_state,
            "is_connected": self.connection_state in ("CONNECTED_MT5", "CONNECTED_EA_BRIDGE", "PAPER_HARNESS"),
            "is_real_mt5_terminal": self.connection_state in ("CONNECTED_MT5", "CONNECTED_EA_BRIDGE"),
            "is_paper_harness": self.connection_state == "PAPER_HARNESS",
            "broker": self.active_broker,
            "server": self.active_server,
            "login": self.active_login,
            "trading_mode": self.active_mode,
            "connected_at": self.connected_at,
            "last_heartbeat": self.last_heartbeat,
            "last_error_code": self.last_error_code,
            "last_error_message": self.last_error_message,
            "troubleshooting_hint": self.troubleshooting_hint,
            "account": acct,
            "open_positions": self.get_open_positions(),
            "terminal_detection": MT5TerminalDetector.detect_terminals(),
        }
