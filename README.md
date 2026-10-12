# 2REAL AI TRADER — Autonomous MT5 Multi-Strategy Trading System

**2REAL AI TRADER** is a modular, production-oriented local automated trading system and Chrome dashboard built for **MetaTrader 5 (MT5)**. It combines an 8-module deterministic quantitative strategy engine (ICT, SMC, Fair Value Gaps, POC & Volume Profile, Breakout/Fakeout, Candlesticks, Fibonacci, and ADX/ATR/Session Filters) with an **un-bypassable Risk Management Engine**, encrypted local credential storage, zero look-ahead backtesting, and position-state reconciliation.

---

## Key Architectural Principles

1. **Honest MT5 Telemetry & Zero Fabricated Data**:
   - Connects directly to the official **MetaTrader 5 Desktop Terminal** on Windows via the official `MetaTrader5` Python IPC package, or via the authenticated local MQL5 Expert Advisor bridge (`mql5/TwoRealBridgeEA.mq5` over `127.0.0.1:18555`).
   - **Never fabricates broker connections, live account balances, or trade history.** If the MT5 terminal is not installed or running, the application reports `DISCONNECTED` with the exact diagnostic error code and remediation instructions.
   - Includes an explicitly separated **Offline Demo Test Harness (Non-Broker Local Simulator)** that you can deliberately activate when testing on a machine without MT5 installed (including $10,000 Demo and $5.00 Small-Account test presets).

2. **Mandatory Security & Credential Protection**:
   - Trading passwords are **never** hardcoded, printed to logs (`CredentialRedactingFilter`), or saved in browser `localStorage`, URLs, or plaintext config files.
   - Credentials are stored in the Operating System Keyring (`keyring`) or an **AES-256-GCM (PBKDF2-HMAC-SHA256, 600,000 iterations)** encrypted local vault (`backend/data/.mt5_credentials.vault` with `0600` permissions).
   - State-changing API actions are protected by an in-memory session token (`X-2Real-Session-Token`).
   - Includes a one-click **Disconnect & Forget Credentials** button that cryptographic-wipes the local vault.

3. **Un-Bypassable Risk Engine & Small Account ($5.00) Compatibility**:
   - Starts with conservative defaults (`0.5%` planned risk per trade, `2.0%` daily loss limit, `5.0%` maximum drawdown).
   - Calculates exact lot size using entry price, stop-loss distance, `trade_tick_size`, `trade_tick_value`, `trade_contract_size`, `volume_min`, `volume_step`, leverage, and expected round-trip commissions.
   - **Small Account Guard ($5.00 test)**: If a `$5.00` account's permitted risk budget (e.g., `0.5%` = `$0.025`) is smaller than the monetary risk of the broker's minimum permitted volume (`0.01` lot), the risk engine strictly blocks the trade and displays:
     > `"Trade skipped: minimum volume exceeds permitted risk."`

---

## Project Structure

```text
2real-ai-trader/
├── backend/
│   ├── api/
│   │   └── server.py             # FastAPI REST & WebSocket server + static SPA host
│   ├── backtest/
│   │   └── engine.py             # Zero look-ahead historical backtester + OOS & Walk-Forward
│   ├── core/
│   │   ├── database.py           # Thread-safe SQLite WAL persistence layer
│   │   └── logging_config.py     # Structured logger with CredentialRedactingFilter
│   ├── engine/
│   │   └── confluence.py         # 10-step Multi-Timeframe Confluence & Signal Scoring Engine
│   ├── execution/
│   │   └── executor.py           # MT5/EA/Paper order dispatcher, idempotency & reconciler
│   ├── mt5_client/
│   │   ├── connector.py          # MT5 Terminal Detector, IPC connector & Local EA Bridge
│   │   └── market_data.py        # OHLCV bar loader, freshness guard & historical datasets
│   ├── risk/
│   │   └── engine.py             # Un-bypassable Risk Engine & $5 Small Account Validator
│   ├── security/
│   │   ├── auth.py               # Session token guard & Explicit Live Trading Authorization
│   │   └── vault.py              # OS Keyring + AES-256-GCM encrypted credential vault
│   └── strategies/
│       ├── ict.py                # A. Inner Circle Trader (BSL/SSL, Sweeps, OTE, MSS, Killzones)
│       ├── smc.py                # B. Smart Money Concepts (BOS, CHoCH, Validated Order Blocks)
│       ├── fvg.py                # C. 3-Candle Fair Value Gap & Consequent Encroachment Engine
│       ├── volume_profile.py     # D. Price-Bin Volume Profile (POC, VAH, VAL, HVNs, LVNs)
│       ├── breakout.py           # E. Range Breakout, Break-and-Retest & Fakeout Engine
│       ├── candlesticks.py       # F. Contextual Candlestick Pattern Confirmation Engine
│       ├── fibonacci.py          # G. Confirmed Swing Fibonacci (0.50, 0.618, 0.705, 0.786)
│       └── filters.py            # H. ADX Trend, ATR Volatility, Choppiness, Spread, Session & News
├── frontend/                     # React 18 + TypeScript + Tailwind CSS Chrome Dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── EquityCurveChart.tsx
│   │   │   ├── PriceStructureChart.tsx
│   │   │   └── SetupWizardModal.tsx
│   │   ├── services/api.ts
│   │   └── App.tsx               # All 7 Dashboard Pages + Emergency Controls
│   └── dist/                     # Pre-compiled production frontend bundle
├── mql5/
│   └── TwoRealBridgeEA.mq5       # Official MQL5 Expert Advisor for terminal-side bridge
├── tests/
│   └── test_2real_system.py      # Automated pytest unit & integration test suite
├── docs/
│   └── TROUBLESHOOTING_AND_HANDOVER.md
├── launch.py                     # Cross-platform preflight checker & Chrome auto-launcher
├── start_windows.bat             # One-click Windows laptop startup script
├── start_macos_linux.sh          # One-click macOS/Linux startup script
└── requirements.txt
```

---

## Quick Start on Your Laptop

### Windows Laptop (Native MetaTrader 5 IPC)
1. Install the official **MetaTrader 5 desktop terminal** from your broker or [metatrader5.com](https://www.metatrader5.com/).
2. Open MT5, log into your Demo or Live account, and enable **Tools → Options → Expert Advisors → Allow algorithmic trading**.
3. Double-click **`start_windows.bat`** (or run `python launch.py`).
4. The script automatically installs dependencies (including `MetaTrader5`), starts the backend bound strictly to `127.0.0.1:8000`, and opens the **Chrome Dashboard**.
5. Click **Connect / Setup MT5** in the top bar, verify your auto-detected terminal path, enter your account login/server/password, and click **Connect to MT5**.

### macOS / Linux Laptop
1. Run `./start_macos_linux.sh` (or `python3 launch.py`).
2. If running MT5 under Wine/CrossOver, compile and attach `mql5/TwoRealBridgeEA.mq5` to a chart in MT5 and check **Use MQL5 EA Bridge** in the Setup Wizard, or use the built-in **Offline Demo Test Harness** and **Historical Backtesting** pages.

---

## Running the Automated Test Suite

```bash
PYTHONPATH=. pytest -v tests/test_2real_system.py
```
