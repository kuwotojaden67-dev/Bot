# 2REAL AI TRADER — Troubleshooting & Complete Handover Guide

## 1. Common MetaTrader 5 Connection Errors & Fixes

| Error Code | Meaning | How to Fix |
| :--- | :--- | :--- |
| `MT5_TERMINAL_NOT_DETECTED` | The MetaTrader 5 desktop terminal is not installed or not running. | Install the official MT5 terminal from your broker, launch it on your desktop, and click **Auto-Detect Terminal** in the Setup Wizard. |
| `MT5_INIT_ERROR_-10004` / `IPC_TIMEOUT` | Python could not establish an IPC pipe to `terminal64.exe`. | Make sure both MT5 and `start_windows.bat` are running under the same Windows user account (do not run one as Administrator and the other as a standard user). |
| `MT5_AUTH_FAILED_10004` | Invalid login number, trading password, or server name. | Verify your exact server string in MT5 under **File → Login to Trade Account**. Use your Trading password (not Investor password) if you plan to execute Demo/Live orders. |
| `ACCOUNT_MODE_MISMATCH` | You entered a Real (Live) broker account while the Setup Wizard is set to `DEMO`. | Switch to a Demo account login, or switch the Setup Wizard mode to `LIVE` and complete the explicit Live Authorization Gate in **Risk Center**. |
| `MT5_TERMINAL_NOT_RUNNING_ON_HOST` | Running on Linux/macOS where the Windows-only `MetaTrader5` Python package is unavailable. | Run on Windows for native IPC, attach `mql5/TwoRealBridgeEA.mq5` in Wine, or click **Activate Offline Demo Test Harness** in the Setup Wizard for local dry-run testing. |

---

## 2. Broker Order Rejection Codes (`TRADE_RETCODE_*`)

- **`10014` (`TRADE_RETCODE_INVALID_VOLUME`)**: Lot size is below `volume_min` or not a multiple of `volume_step`. 2REAL AI TRADER pre-calculates `volume_step` and blocks orders whose `volume_min` exceeds your risk budget.
- **`10016` (`TRADE_RETCODE_INVALID_STOPS`)**: Stop Loss or Take Profit is closer to current market price than the broker's `trade_stops_level`. The Risk Engine checks `stops_level_points` before sending any order.
- **`10018` (`TRADE_RETCODE_MARKET_CLOSED`)**: The symbol's trading session is closed at the broker.
- **`10019` (`TRADE_RETCODE_NO_MONEY`)**: Insufficient free margin. The Risk Engine checks both `free_margin` and `max_margin_usage_pct` (default 35%) prior to order dispatch.

---

## 3. Small Account ($5.00) Compatibility Explained

On standard FX/CFD accounts where `volume_min = 0.01` lot (`1,000` units of base currency, `~$0.10/pip` on EURUSD), a `15-pip` Stop Loss plus `$0.07` round-trip commission equals **`$1.57` monetary risk**.
- On a **`$5.00` account**, a `$1.57` stop loss represents **`31.4%` of account equity** on a single trade.
- If your configured risk per trade is `0.5%` (`$0.025`) or `2.0%` (`$0.10`), the Risk Engine **refuses** to force the `0.01` lot order and displays:
  > `"Trade skipped: minimum volume exceeds permitted risk."`
- To trade a `$5.00` balance within a `1%–2%` risk budget, your broker must offer **MT5 Cent Accounts** (where `1.0` Cent lot = `0.01` standard lot and `0.01` Cent lot = `$0.001/pip`).

---

## 4. Safe Stop, Restart & Position Reconciliation

- **Safe Stop**: Clicking **Pause Bot** or **Stop Bot** halts new entries immediately without forcefully liquidating open trades unless you click **Close Positions** (with confirmation) or engage **Emergency Stop** with position closing enabled.
- **Restart without Duplicate Trades**: Every executed order is assigned a deterministic idempotency key (`ORD_{SYMBOL}_{TIMEFRAME}_{DIRECTION}_{BAR_TIME}`) persisted in SQLite (`backend/data/2real_trader.db`). On startup or reconnection, `ExecutionEngine.reconcile_positions()` syncs SQLite `OPEN` records with actual open positions in MT5.
