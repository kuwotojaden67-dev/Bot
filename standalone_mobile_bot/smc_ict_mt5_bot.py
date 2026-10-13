#!/usr/bin/env python3
"""
===============================================================================
2REAL QUANT — STANDALONE MULTI-ASSET SMC / ICT PYTHON BOT FOR METATRADER 5
===============================================================================
Designed for mobile-friendly cloud VPS deployment (Windows VPS + MT5 Desktop).

Core Specifications:
1. Multi-Asset Auto-Adaptation:
   - Forex (EURUSD, GBPUSD, USDJPY), Gold (XAUUSD), Crypto (BTCUSD), Indices (NAS100)
   - Automatically reads tick_size, tick_value, contract_size, and min/max lot from MT5.
2. Core Strategy (SMC + ICT Confluence):
   - Higher-Timeframe (H1) Bias via EMA(50) & Market Structure
   - Liquidity Sweep Detection (Sell-Side Liquidity SSL / Buy-Side Liquidity BSL)
   - Displacement + Market Structure Shift (MSS / BOS)
   - 3-Candle Fair Value Gap (FVG) + Validated Order Block (OB) Retracement Entry
3. Prop-Firm Grade Risk Management:
   - 0.5% Account Balance Risk per trade
   - Dynamic Structural + ATR(14) Stop Loss
   - 1:2.5 Reward-to-Risk Take Profit
   - Max Daily Loss Guard (2.0%) & Small-Account ($5) Minimum-Lot Safety Guard
4. Security:
   - Reads credentials from environment variables (`MT5_LOGIN`, `MT5_PASSWORD`, `MT5_SERVER`)
   - Never hardcodes or logs your trading password.
===============================================================================
"""

import os
import time
import math
import logging
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

# Optional import so you can syntax-check or dry-run even before MT5 is installed
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None
    MT5_AVAILABLE = False


# =====================================================================
# MODULE 1: CONFIGURATION & LOGGING SETUP
# =====================================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("2REAL_SMC_BOT")


@dataclass
class BotConfig:
    # Multi-Asset Watchlist (automatically resolves broker suffixes like EURUSDm or EURUSD.pro)
    symbols: Tuple[str, ...] = ("EURUSD", "XAUUSD", "GBPUSD", "BTCUSD", "NAS100")

    # Timeframes: H1 for Higher-Timeframe Bias, M15 for Execution
    htf_name: str = "H1"
    ltf_name: str = "M15"

    # Risk Management (0.5% risk, Dynamic ATR Stop, 1:2.5 R:R)
    risk_per_trade_pct: float = 0.5        # Risk 0.5% of account balance per trade
    reward_to_risk_ratio: float = 2.5      # 1:2.5 Risk-to-Reward target
    atr_period: int = 14                   # 14-bar ATR for volatility & dynamic stops
    sl_atr_buffer_mult: float = 1.5        # Stop Loss buffer = 1.5x ATR beyond sweep/OB
    max_daily_loss_pct: float = 2.0        # Hard daily drawdown circuit breaker (2.0%)
    max_open_positions: int = 3            # Maximum simultaneous open trades
    commission_per_lot_usd: float = 7.0    # Estimated round-turn commission per 1.0 lot

    # SMC / ICT Strategy Parameters
    swing_lookback: int = 20               # Lookback bars for BSL / SSL liquidity pools
    displacement_atr_mult: float = 1.25    # Impulse candle body >= 1.25x ATR
    min_fvg_atr_ratio: float = 0.12        # Minimum 3-candle FVG size >= 0.12x ATR
    magic_number: int = 202602             # Unique EA Magic Number for position tracking
    poll_interval_seconds: int = 15        # Loop scan interval


# =====================================================================
# MODULE 2: METATRADER 5 CONNECTION & SYMBOL AUTO-DETECTION
# =====================================================================
class MT5Bridge:
    def __init__(self, config: BotConfig):
        self.cfg = config
        self.day_start_balance: float = 0.0
        self.current_utc_day: int = -1

    def connect(self) -> bool:
        """Connects to MT5 using environment variables (never hardcode passwords)."""
        if not MT5_AVAILABLE:
            logger.error("MetaTrader5 Python package not installed. Run: pip install MetaTrader5")
            return False

        login_str = os.getenv("MT5_LOGIN", "")
        password = os.getenv("MT5_PASSWORD", "")
        server = os.getenv("MT5_SERVER", "")
        terminal_path = os.getenv("MT5_PATH", "")

        init_kwargs = {}
        if terminal_path:
            init_kwargs["path"] = terminal_path
        if login_str.isdigit():
            init_kwargs["login"] = int(login_str)
        if password:
            init_kwargs["password"] = password
        if server:
            init_kwargs["server"] = server

        if not mt5.initialize(**init_kwargs):
            err = mt5.last_error()
            logger.error("MT5 initialize failed: %s", err)
            return False

        acct = mt5.account_info()
        if acct is None:
            logger.error("Could not read MT5 account_info: %s", mt5.last_error())
            return False

        logger.info(
            "Connected to MT5 | Server: %s | Login: %d | Balance: %.2f %s | Leverage: 1:%d",
            acct.server,
            acct.login,
            acct.balance,
            acct.currency,
            acct.leverage,
        )
        self._update_daily_anchor(acct.balance)
        return True

    def _update_daily_anchor(self, current_balance: float) -> None:
        today = datetime.now(timezone.utc).day
        if today != self.current_utc_day:
            self.current_utc_day = today
            self.day_start_balance = current_balance
            logger.info("New UTC trading day anchored. Starting balance: $%.2f", current_balance)

    def resolve_broker_symbol(self, base_symbol: str) -> Optional[str]:
        """Automatically matches EURUSD to EURUSD, EURUSDm, EURUSD.pro, etc."""
        if not MT5_AVAILABLE:
            return None
        info = mt5.symbol_info(base_symbol)
        if info is not None:
            mt5.symbol_select(base_symbol, True)
            return base_symbol

        all_syms = mt5.symbols_get() or []
        for s in all_syms:
            if s.name.upper().startswith(base_symbol.upper()):
                mt5.symbol_select(s.name, True)
                return s.name
        return None

    def fetch_candles(self, symbol: str, tf_name: str, count: int = 150) -> Optional[pd.DataFrame]:
        """Fetches closed OHLCV bars from MT5 (excludes index 0 forming bar to prevent repainting)."""
        tf_map = {
            "M1": mt5.TIMEFRAME_M1,
            "M5": mt5.TIMEFRAME_M5,
            "M15": mt5.TIMEFRAME_M15,
            "H1": mt5.TIMEFRAME_H1,
            "H4": mt5.TIMEFRAME_H4,
            "D1": mt5.TIMEFRAME_D1,
        }
        mt5_tf = tf_map.get(tf_name, mt5.TIMEFRAME_M15)
        # Start from pos=1 so we only evaluate 100% CLOSED candles (zero repainting)
        rates = mt5.copy_rates_from_pos(symbol, mt5_tf, 1, count)
        if rates is None or len(rates) < 60:
            return None

        df = pd.DataFrame(rates)
        df["time"] = pd.to_datetime(df["time"], unit="s", utc=True)
        return df


# =====================================================================
# MODULE 3: SMC + ICT STRATEGY ENGINE (SWEEP + MSS/BOS + FVG + OB)
# =====================================================================
@dataclass
class TradeSignal:
    symbol: str
    direction: str          # "BUY", "SELL", or "WAIT"
    entry_price: float
    stop_loss: float
    take_profit: float
    atr_value: float
    reason: str
    bar_time: str


class SmcIctStrategyEngine:
    def __init__(self, config: BotConfig):
        self.cfg = config

    @staticmethod
    def compute_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
        high = df["high"]
        low = df["low"]
        prev_close = df["close"].shift(1)
        tr = pd.concat(
            [
                (high - low),
                (high - prev_close).abs(),
                (low - prev_close).abs(),
            ],
            axis=1,
        ).max(axis=1)
        return tr.rolling(window=period, min_periods=1).mean()

    @staticmethod
    def compute_htf_bias(htf_df: pd.DataFrame) -> str:
        """Determines Higher-Timeframe (H1) institutional bias using EMA(50) + swing structure."""
        ema50 = htf_df["close"].ewm(span=50, adjust=False).mean()
        last_close = float(htf_df["close"].iloc[-1])
        last_ema = float(ema50.iloc[-1])

        recent_high = float(htf_df["high"].iloc[-20:-1].max())
        recent_low = float(htf_df["low"].iloc[-20:-1].min())
        mid_point = (recent_high + recent_low) / 2.0

        if last_close > last_ema and last_close >= mid_point:
            return "BULLISH"
        if last_close < last_ema and last_close <= mid_point:
            return "BEARISH"
        return "NEUTRAL"

    def evaluate_setup(
        self, symbol: str, htf_df: pd.DataFrame, ltf_df: pd.DataFrame, current_bid: float, current_ask: float
    ) -> TradeSignal:
        """
        Step-by-Step SMC / ICT Confluence Evaluation on Closed Candles:
        1. Confirm HTF (H1) Bias (BULLISH or BEARISH).
        2. Detect Liquidity Sweep (SSL sweep below recent swing low for BUY, or BSL sweep above swing high for SELL)
           OR price trading inside Discount (<50% dealing range for BUY) / Premium (>50% for SELL).
        3. Detect Market Structure Shift (MSS / BOS) with Displacement candle.
        4. Confirm active Fair Value Gap (FVG) + Order Block (OB) zone alignment.
        5. Compute Dynamic ATR Stop Loss & 1:2.5 Take Profit.
        """
        ltf = ltf_df.copy().reset_index(drop=True)
        ltf["atr"] = self.compute_atr(ltf, self.cfg.atr_period)

        last_idx = len(ltf) - 1
        last_bar = ltf.iloc[last_idx]
        atr_val = float(last_bar["atr"])
        bar_time_str = str(last_bar["time"])

        if atr_val <= 0:
            return TradeSignal(symbol, "WAIT", 0, 0, 0, 0, "Invalid ATR", bar_time_str)

        htf_bias = self.compute_htf_bias(htf_df)

        # Dealing Range & Liquidity Pools over lookback window (excluding last 3 bars)
        lookback_slice = ltf.iloc[-(self.cfg.swing_lookback + 4) : -3]
        bsl_pool = float(lookback_slice["high"].max())  # Buy-Side Liquidity
        ssl_pool = float(lookback_slice["low"].min())   # Sell-Side Liquidity
        dealing_mid = (bsl_pool + ssl_pool) / 2.0

        # Check recent 4 candles for Liquidity Sweep + Displacement + 3-Candle FVG
        recent_bars = ltf.iloc[-5:]
        swept_ssl = bool((recent_bars["low"] < ssl_pool).any() and last_bar["close"] > ssl_pool)
        swept_bsl = bool((recent_bars["high"] > bsl_pool).any() and last_bar["close"] < bsl_pool)

        in_discount = float(last_bar["close"]) <= dealing_mid
        in_premium = float(last_bar["close"]) >= dealing_mid

        # Scan recent 12 bars for an unmitigated Bullish or Bearish Fair Value Gap + Order Block
        bullish_fvg_ob: Optional[Tuple[float, float]] = None
        bearish_fvg_ob: Optional[Tuple[float, float]] = None

        for i in range(last_idx - 10, last_idx + 1):
            if i < 2:
                continue
            c0 = ltf.iloc[i - 2]
            c1 = ltf.iloc[i - 1]  # Displacement middle candle
            c2 = ltf.iloc[i]

            body_size = abs(float(c1["close"]) - float(c1["open"]))
            is_displacement = body_size >= (self.cfg.displacement_atr_mult * atr_val)

            # Bullish FVG: Low of candle i > High of candle i-2
            bull_gap = float(c2["low"]) - float(c0["high"])
            if (
                float(c1["close"]) > float(c1["open"])
                and is_displacement
                and bull_gap >= (self.cfg.min_fvg_atr_ratio * atr_val)
            ):
                ob_low = min(float(c0["low"]), float(c1["low"]))
                fvg_top = float(c2["low"])
                # Ensure subsequent bars haven't invalidated the OB low
                post_bars = ltf.iloc[i + 1 :]
                if len(post_bars) == 0 or float(post_bars["close"].min()) > ob_low:
                    bullish_fvg_ob = (ob_low, fvg_top)

            # Bearish FVG: High of candle i < Low of candle i-2
            bear_gap = float(c0["low"]) - float(c2["high"])
            if (
                float(c1["close"]) < float(c1["open"])
                and is_displacement
                and bear_gap >= (self.cfg.min_fvg_atr_ratio * atr_val)
            ):
                fvg_bottom = float(c2["high"])
                ob_high = max(float(c0["high"]), float(c1["high"]))
                post_bars = ltf.iloc[i + 1 :]
                if len(post_bars) == 0 or float(post_bars["close"].max()) < ob_high:
                    bearish_fvg_ob = (fvg_bottom, ob_high)

        # Short-term structure break check (BOS / MSS)
        short_high = float(ltf.iloc[-8:-1]["high"].max())
        short_low = float(ltf.iloc[-8:-1]["low"].min())
        bull_bos = float(last_bar["close"]) > short_high or (
            bullish_fvg_ob is not None and float(last_bar["close"]) >= bullish_fvg_ob[0]
        )
        bear_bos = float(last_bar["close"]) < short_low or (
            bearish_fvg_ob is not None and float(last_bar["close"]) <= bearish_fvg_ob[1]
        )

        # --- EVALUATE BUY CONFLUENCE ---
        if htf_bias == "BULLISH" and bullish_fvg_ob is not None and (swept_ssl or in_discount) and bull_bos:
            ob_low, _ = bullish_fvg_ob
            entry = current_ask
            # Dynamic Stop Loss placed below structural OB/SSL sweep + ATR buffer
            raw_sl = min(ob_low, float(last_bar["low"])) - (0.5 * atr_val)
            min_sl_dist = self.cfg.sl_atr_buffer_mult * atr_val
            sl = min(raw_sl, entry - min_sl_dist)
            sl_dist = entry - sl
            tp = entry + (sl_dist * self.cfg.reward_to_risk_ratio)

            reason = (
                f"HTF={htf_bias} | {'SSL Liquidity Sweep' if swept_ssl else 'Discount Zone'} "
                f"+ Bullish OB/FVG + Displacement MSS | ATR={atr_val:.5f}"
            )
            return TradeSignal(symbol, "BUY", entry, sl, tp, atr_val, reason, bar_time_str)

        # --- EVALUATE SELL CONFLUENCE ---
        if htf_bias == "BEARISH" and bearish_fvg_ob is not None and (swept_bsl or in_premium) and bear_bos:
            _, ob_high = bearish_fvg_ob
            entry = current_bid
            # Dynamic Stop Loss placed above structural OB/BSL sweep + ATR buffer
            raw_sl = max(ob_high, float(last_bar["high"])) + (0.5 * atr_val)
            min_sl_dist = self.cfg.sl_atr_buffer_mult * atr_val
            sl = max(raw_sl, entry + min_sl_dist)
            sl_dist = sl - entry
            tp = entry - (sl_dist * self.cfg.reward_to_risk_ratio)

            reason = (
                f"HTF={htf_bias} | {'BSL Liquidity Sweep' if swept_bsl else 'Premium Zone'} "
                f"+ Bearish OB/FVG + Displacement MSS | ATR={atr_val:.5f}"
            )
            return TradeSignal(symbol, "SELL", entry, sl, tp, atr_val, reason, bar_time_str)

        return TradeSignal(
            symbol,
            "WAIT",
            0.0,
            0.0,
            0.0,
            atr_val,
            f"Waiting for full SMC/ICT alignment (HTF={htf_bias})",
            bar_time_str,
        )


# =====================================================================
# MODULE 4: UN-BYPASSABLE RISK & LOT SIZING ENGINE (0.5% + ATR + $5 GUARD)
# =====================================================================
class RiskManager:
    def __init__(self, config: BotConfig):
        self.cfg = config

    def check_daily_drawdown_safe(self, day_start_balance: float, current_equity: float) -> Tuple[bool, str]:
        if day_start_balance <= 0:
            return True, "OK"
        daily_loss_usd = max(0.0, day_start_balance - current_equity)
        daily_loss_pct = (daily_loss_usd / day_start_balance) * 100.0
        if daily_loss_pct >= self.cfg.max_daily_loss_pct:
            return (
                False,
                f"DAILY_LOSS_LIMIT_REACHED: Lost {daily_loss_pct:.2f}% today (Max allowed: {self.cfg.max_daily_loss_pct:.2f}%)",
            )
        return True, "OK"

    def calculate_safe_lot_size(
        self,
        account_balance: float,
        entry_price: float,
        stop_loss: float,
        sym_info: Dict[str, float],
    ) -> Tuple[bool, float, str]:
        """
        Calculates exact position size for 0.5% risk across ANY asset (Forex, Gold, Crypto, Indices)
        using broker tick_size, tick_value, volume_min, volume_step, and commission.
        Includes the $5 Micro-Account Safety Guard.
        """
        sl_distance = abs(entry_price - stop_loss)
        if sl_distance <= 0:
            return False, 0.0, "Invalid Stop Loss distance (0.0)."

        allowed_risk_usd = account_balance * (self.cfg.risk_per_trade_pct / 100.0)

        tick_size = max(sym_info.get("trade_tick_size", 0.00001), 1e-9)
        tick_value = max(sym_info.get("trade_tick_value", 1.0), 1e-6)
        vol_min = sym_info.get("volume_min", 0.01)
        vol_max = sym_info.get("volume_max", 100.0)
        vol_step = max(sym_info.get("volume_step", 0.01), 0.001)

        ticks_at_risk = sl_distance / tick_size
        sl_loss_per_lot_usd = ticks_at_risk * tick_value
        total_risk_per_lot_usd = sl_loss_per_lot_usd + self.cfg.commission_per_lot_usd

        # Check minimum lot (0.01) risk against allowed risk ($5 Small Account Guard)
        min_lot_risk_usd = total_risk_per_lot_usd * vol_min
        if min_lot_risk_usd > allowed_risk_usd:
            return (
                False,
                0.0,
                f"Trade skipped: minimum volume exceeds permitted risk. "
                f"(Min lot {vol_min} risks ${min_lot_risk_usd:.2f} vs allowed ${allowed_risk_usd:.2f})",
            )

        raw_lots = allowed_risk_usd / total_risk_per_lot_usd
        # Round DOWN to nearest broker volume_step so risk never exceeds 0.5%
        steps = math.floor((raw_lots + 1e-9) / vol_step)
        lot_size = round(steps * vol_step, 4)
        lot_size = max(vol_min, min(vol_max, lot_size))

        return (
            True,
            lot_size,
            f"Approved {lot_size} lots (Risk: ${lot_size * total_risk_per_lot_usd:.2f} / Allowed: ${allowed_risk_usd:.2f})",
        )


# =====================================================================
# MODULE 5: ORDER EXECUTION & DUPLICATE GUARD
# =====================================================================
class OrderExecutor:
    def __init__(self, config: BotConfig, risk: RiskManager):
        self.cfg = config
        self.risk = risk
        self.executed_bar_keys: set = set()

    def execute_signal(self, signal: TradeSignal, day_start_balance: float) -> bool:
        if not MT5_AVAILABLE or signal.direction not in ("BUY", "SELL"):
            return False

        # Idempotency check: never fire twice on the same symbol + bar timestamp
        idem_key = f"{signal.symbol}_{signal.direction}_{signal.bar_time}"
        if idem_key in self.executed_bar_keys:
            return False

        acct = mt5.account_info()
        if acct is None:
            return False

        # 1. Check Daily Loss Limit
        dd_ok, dd_msg = self.risk.check_daily_drawdown_safe(day_start_balance, acct.equity)
        if not dd_ok:
            logger.warning("[%s] %s", signal.symbol, dd_msg)
            return False

        # 2. Check Max Open Positions
        open_positions = mt5.positions_get(magic=self.cfg.magic_number) or []
        if len(open_positions) >= self.cfg.max_open_positions:
            logger.info("[%s] Max open positions (%d) reached. Skipping.", signal.symbol, self.cfg.max_open_positions)
            return False

        # Prevent duplicate open position on the same symbol
        if any(p.symbol == signal.symbol for p in open_positions):
            return False

        # 3. Read Symbol Contract Specs from MT5
        s_info = mt5.symbol_info(signal.symbol)
        if s_info is None:
            return False

        sym_specs = {
            "trade_tick_size": s_info.trade_tick_size or s_info.point,
            "trade_tick_value": s_info.trade_tick_value or 1.0,
            "volume_min": s_info.volume_min,
            "volume_max": s_info.volume_max,
            "volume_step": s_info.volume_step,
            "digits": s_info.digits,
        }

        # 4. Calculate 0.5% Risk Position Size
        lot_ok, lot_size, lot_msg = self.risk.calculate_safe_lot_size(
            acct.balance, signal.entry_price, signal.stop_loss, sym_specs
        )
        if not lot_ok:
            logger.warning("[%s] %s", signal.symbol, lot_msg)
            return False

        digits = int(sym_specs["digits"])
        order_type = mt5.ORDER_TYPE_BUY if signal.direction == "BUY" else mt5.ORDER_TYPE_SELL

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": signal.symbol,
            "volume": float(lot_size),
            "type": order_type,
            "price": round(signal.entry_price, digits),
            "sl": round(signal.stop_loss, digits),
            "tp": round(signal.take_profit, digits),
            "deviation": 20,
            "magic": self.cfg.magic_number,
            "comment": "2REAL_SMC_ICT_0.5PCT",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        result = mt5.order_send(request)
        if result is None:
            logger.error("[%s] order_send returned None: %s", signal.symbol, mt5.last_error())
            return False

        if result.retcode != mt5.TRADE_RETCODE_DONE:
            logger.warning(
                "[%s] Broker rejected order | Retcode: %d | Comment: %s",
                signal.symbol,
                result.retcode,
                result.comment,
            )
            return False

        self.executed_bar_keys.add(idem_key)
        logger.info(
            "✓ ORDER EXECUTED | %s %s %.2f lots @ %.5f | SL: %.5f | TP: %.5f | Ticket #%d | %s",
            signal.symbol,
            signal.direction,
            lot_size,
            signal.entry_price,
            signal.stop_loss,
            signal.take_profit,
            result.order,
            signal.reason,
        )
        return True


# =====================================================================
# MODULE 6: MAIN BOT LOOP & DRY-RUN SELF-TEST
# =====================================================================
def run_self_test() -> None:
    """Runs an instant offline verification of the SMC/ICT + 0.5% Risk Engine."""
    logger.info("Running built-in SMC/ICT Strategy & Risk Engine self-test...")
    cfg = BotConfig()
    risk = RiskManager(cfg)

    # Test 1: Standard $10,000 Prop/Demo Account on EURUSD
    ok_10k, lots_10k, msg_10k = risk.calculate_safe_lot_size(
        account_balance=10000.0,
        entry_price=1.08500,
        stop_loss=1.08300,  # 20 pips SL
        sym_info={
            "trade_tick_size": 0.00001,
            "trade_tick_value": 1.0,
            "volume_min": 0.01,
            "volume_max": 100.0,
            "volume_step": 0.01,
        },
    )
    logger.info("[Self-Test $10,000 Account] %s (Approved=%s, Lots=%.2f)", msg_10k, ok_10k, lots_10k)

    # Test 2: $5.00 Micro Account Safety Guard
    ok_5, lots_5, msg_5 = risk.calculate_safe_lot_size(
        account_balance=5.0,
        entry_price=1.08500,
        stop_loss=1.08350,  # 15 pips SL
        sym_info={
            "trade_tick_size": 0.00001,
            "trade_tick_value": 1.0,
            "volume_min": 0.01,
            "volume_max": 100.0,
            "volume_step": 0.01,
        },
    )
    logger.info("[Self-Test $5.00 Micro Account] %s (Approved=%s)", msg_5, ok_5)


def run_live_bot() -> None:
    cfg = BotConfig()
    bridge = MT5Bridge(cfg)
    strategy = SmcIctStrategyEngine(cfg)
    risk = RiskManager(cfg)
    executor = OrderExecutor(cfg, risk)

    if not bridge.connect():
        logger.warning("MT5 terminal not connected. Running offline self-test instead:")
        run_self_test()
        return

    try:
        while True:
            acct = mt5.account_info()
            if acct is not None:
                bridge._update_daily_anchor(acct.balance)

            for base_sym in cfg.symbols:
                broker_sym = bridge.resolve_broker_symbol(base_sym)
                if not broker_sym:
                    continue

                htf_df = bridge.fetch_candles(broker_sym, cfg.htf_name, count=120)
                ltf_df = bridge.fetch_candles(broker_sym, cfg.ltf_name, count=120)
                tick = mt5.symbol_info_tick(broker_sym)
                if htf_df is None or ltf_df is None or tick is None:
                    continue

                signal = strategy.evaluate_setup(
                    symbol=broker_sym,
                    htf_df=htf_df,
                    ltf_df=ltf_df,
                    current_bid=float(tick.bid),
                    current_ask=float(tick.ask),
                )

                if signal.direction in ("BUY", "SELL"):
                    logger.info("[%s] SIGNAL: %s | %s", broker_sym, signal.direction, signal.reason)
                    executor.execute_signal(signal, bridge.day_start_balance)

            time.sleep(cfg.poll_interval_seconds)
    except KeyboardInterrupt:
        logger.info("Bot stopped by user.")
    finally:
        if MT5_AVAILABLE:
            mt5.shutdown()


if __name__ == "__main__":
    run_live_bot()
