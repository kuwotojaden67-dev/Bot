#!/usr/bin/env python3
"""
One-Click Launcher & Environment Preflight Checker for 2REAL AI TRADER.
- Performs environment, dependency, database, and MT5 terminal checks.
- Binds the dashboard backend to 127.0.0.1 (localhost) by default for security.
- Automatically opens the Chrome dashboard at http://127.0.0.1:8000 when launched on a laptop.
"""
import argparse
import os
import platform
import shutil
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

# Auto-install required packages if running in a fresh container/environment
try:
    import fastapi  # noqa: F401
    import uvicorn  # noqa: F401
    import cryptography  # noqa: F401
    import keyring  # noqa: F401
except ImportError:
    subprocess.check_call(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--quiet",
            "fastapi",
            "uvicorn[standard]",
            "cryptography",
            "keyring",
            "websockets",
            "python-multipart",
        ]
    )

from backend.core.database import DatabaseManager
from backend.core.logging_config import setup_logging
from backend.mt5_client.connector import MT5TerminalDetector
from backend.security.vault import SecureCredentialVault

logger = setup_logging()


def run_preflight_checks() -> None:
    logger.info("=== 2REAL AI TRADER — PREFLIGHT ENVIRONMENT CHECK ===")
    logger.info("OS Platform: %s %s | Python: %s", platform.system(), platform.release(), platform.python_version())

    db = DatabaseManager()
    logger.info("SQLite Database Health: %s (%s)", "OK" if db.is_healthy else "ERROR", db.db_path)

    vault = SecureCredentialVault()
    pub = vault.get_public_profile()
    logger.info("Credential Vault Backend: %s | Saved Profile: %s", pub["vault_backend"], pub["has_saved_credentials"])

    det = MT5TerminalDetector.detect_terminals()
    logger.info(
        "Native MetaTrader5 Python Package Installed: %s | Detected Terminals: %d",
        det["native_mt5_python_pkg_installed"],
        len(det["detected_terminals"]),
    )
    if det["recommended_path"]:
        logger.info("Recommended MT5 Terminal Path: %s", det["recommended_path"])
    else:
        logger.info("MT5 Terminal Notice: %s", det["installation_guide"])


def open_chrome_dashboard(url: str) -> None:
    time.sleep(1.8)
    sys_name = platform.system()
    try:
        if sys_name == "Windows":
            chrome_paths = [
                r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            ]
            for cp in chrome_paths:
                if os.path.isfile(cp):
                    subprocess.Popen([cp, "--new-window", url])
                    return
        elif sys_name == "Darwin":
            if os.path.isdir("/Applications/Google Chrome.app"):
                subprocess.Popen(["open", "-a", "Google Chrome", url])
                return
        else:
            for bin_name in ("google-chrome", "chromium-browser", "chromium"):
                if shutil.which(bin_name):
                    subprocess.Popen([bin_name, url])
                    return
        webbrowser.open(url)
    except Exception:
        pass


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch 2REAL AI TRADER local backend & Chrome dashboard.")
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind address (defaults to 127.0.0.1 for local security; use 0.0.0.0 for container preview).",
    )
    parser.add_argument("--port", type=int, default=8000, help="Port number (default: 8000).")
    parser.add_argument("--no-browser", action="store_true", help="Do not auto-open Chrome browser.")
    args = parser.parse_args()

    run_preflight_checks()

    dashboard_url = f"http://127.0.0.1:{args.port}"
    logger.info("Starting 2REAL AI TRADER Dashboard Server at %s (bind=%s:%d)", dashboard_url, args.host, args.port)

    if not args.no_browser and args.host == "127.0.0.1":
        threading.Thread(target=open_chrome_dashboard, args=(dashboard_url,), daemon=True).start()

    import uvicorn
    uvicorn.run("backend.api.server:app", host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
