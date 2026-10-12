"""
Dedicated Un-Bypassable Risk Management Engine for 2REAL AI TRADER.
- Calculates exact position sizes from entry price, stop-loss distance, tick size, tick value,
  contract size, volume step, minimum/maximum volume, and expected commissions.
- Enforces Small Account Compatibility ($5 test): if the minimum permitted broker volume
  (e.g., 0.01 lot) exceeds the configured monetary risk budget, rejects the trade with the exact message:
  "Trade skipped: minimum volume exceeds permitted risk."
- Enforces daily loss limits, maximum drawdown, maximum open positions, consecutive losses,
  spread limits, margin usage limits, stop-distance rules, and Emergency Stop.
"""
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.core.database import DEFAULT_RISK_CONFIG
from backend.mt5_client.connector import STANDARD_SYMBOL_SPECS


class RiskEngine:
    """
    Deterministic Risk Gate that cannot be bypassed by strategy modules.
    """

    def __init__(self, risk_config: Optional[Dict[str, Any]] = None):
        self.config: Dict[str, Any] = dict(DEFAULT_RISK_CONFIG)
        if risk_config:
            self.config.update(risk_config)

    def update_config(self, new_config: Dict[str, Any]) -> None:
        self.config.update(new_config)

    def evaluate_trade_risk(
        self,
        symbol: str,
        direction: str,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        account_info: Optional[Dict[str, Any]],
        symbol_spec: Optional[Dict[str, Any]] = None,
        open_positions: Optional[List[Dict[str, Any]]] = None,
        current_spread_pips: float = 1.2,
        bot_state: Optional[Dict[str, Any]] = None,
        now_utc: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Comprehensive pre-trade risk check and position-size calculation.
        Returns `approved: True/False`, `lot_size`, `monetary_risk`, and explicit `rejections`.
        """
        rejections: List[str] = []
        warnings: List[str] = []
        sym = symbol.upper().strip()
        spec = symbol_spec or STANDARD_SYMBOL_SPECS.get(sym, STANDARD_SYMBOL_SPECS["EURUSD"])
        positions = open_positions or []
        state = bot_state or {}

        # 0. Emergency Stop check
        if self.config.get("emergency_stop_active", False):
            rejections.append("EMERGENCY_STOP_ACTIVE: Manual emergency stop is engaged; all new orders are blocked.")

        # 1. Verify Account Info availability
        if not account_info:
            rejections.append("ACCOUNT_UNAVAILABLE: No active MT5 account or test harness balance available.")
            return {
                "approved": False,
                "lot_size": 0.0,
                "rejections": rejections,
                "warnings": warnings,
                "risk_budget_usd": 0.0,
                "actual_monetary_risk_usd": 0.0,
                "min_lot_risk_usd": 0.0,
            }

        balance = float(account_info.get("balance", 0.0))
        equity = float(account_info.get("equity", balance))
        free_margin = float(account_info.get("free_margin", equity))
        used_margin = float(account_info.get("margin", 0.0))
        leverage = max(int(account_info.get("leverage", 100)), 1)

        if equity <= 0.0 or balance <= 0.0:
            rejections.append("ZERO_OR_NEGATIVE_EQUITY: Account equity is insufficient to trade.")
            return {
                "approved": False,
                "lot_size": 0.0,
                "rejections": rejections,
                "warnings": warnings,
                "risk_budget_usd": 0.0,
                "actual_monetary_risk_usd": 0.0,
                "min_lot_risk_usd": 0.0,
            }

        # 2. Check Daily Loss Limit & Maximum Overall Drawdown
        daily_start_eq = float(state.get("daily_starting_equity") or balance)
        peak_eq = float(state.get("peak_equity") or max(balance, equity))

        daily_loss_pct = ((daily_start_eq - equity) / daily_start_eq * 100.0) if daily_start_eq > 0 else 0.0
        overall_dd_pct = ((peak_eq - equity) / peak_eq * 100.0) if peak_eq > 0 else 0.0

        max_daily_loss_pct = float(self.config.get("max_daily_loss_pct", 2.0))
        max_overall_dd_pct = float(self.config.get("max_overall_drawdown_pct", 5.0))

        if daily_loss_pct >= max_daily_loss_pct:
            rejections.append(
                f"DAILY_LOSS_LIMIT_BREACHED: Current daily loss ({daily_loss_pct:.2f}%) >= limit ({max_daily_loss_pct:.2f}%)."
            )
        if overall_dd_pct >= max_overall_dd_pct:
            rejections.append(
                f"MAX_DRAWDOWN_BREACHED: Current drawdown ({overall_dd_pct:.2f}%) >= limit ({max_overall_dd_pct:.2f}%)."
            )

        # 3. Check Consecutive Losses
        consec_losses = int(state.get("consecutive_losses", 0))
        max_consec_losses = int(self.config.get("max_consecutive_losses", 3))
        if consec_losses >= max_consec_losses:
            rejections.append(
                f"MAX_CONSECUTIVE_LOSSES_REACHED: {consec_losses} consecutive losses >= limit ({max_consec_losses})."
            )

        # 4. Check Maximum Open Positions & Per-Symbol Exposure
        max_open_pos = int(self.config.get("max_open_positions", 3))
        max_per_sym = int(self.config.get("max_positions_per_symbol", 1))
        if len(positions) >= max_open_pos:
            rejections.append(
                f"MAX_OPEN_POSITIONS_REACHED: {len(positions)} open positions >= limit ({max_open_pos})."
            )
        sym_positions = [p for p in positions if str(p.get("symbol", "")).upper() == sym]
        if len(sym_positions) >= max_per_sym:
            rejections.append(
                f"SYMBOL_EXPOSURE_LIMIT: Already holding {len(sym_positions)} open position(s) on {sym} (max {max_per_sym})."
            )

        # 5. Validate Stop Loss & Take Profit geometry + Broker Stops Level
        point = float(spec["point"])
        pip_size = float(spec["pip_size"])
        stops_level_pts = int(spec.get("stops_level_points", 10))
        min_stop_dist = stops_level_pts * point

        if direction.upper() == "BUY":
            sl_dist = entry_price - stop_loss
            tp_dist = take_profit - entry_price
        elif direction.upper() == "SELL":
            sl_dist = stop_loss - entry_price
            tp_dist = entry_price - take_profit
        else:
            sl_dist = 0.0
            tp_dist = 0.0

        if sl_dist <= 0:
            rejections.append("INVALID_STOP_LOSS: Stop loss is on the wrong side of entry or equal to entry.")
        elif sl_dist < min_stop_dist:
            rejections.append(
                f"STOP_LOSS_TOO_CLOSE: SL distance ({sl_dist / point:.1f} pts) < broker minimum stops_level ({stops_level_pts} pts)."
            )

        if tp_dist <= 0:
            rejections.append("INVALID_TAKE_PROFIT: Take profit is on the wrong side of entry or equal to entry.")

        rr_ratio = round(tp_dist / sl_dist, 2) if sl_dist > 0 else 0.0
        min_rr = float(self.config.get("min_risk_reward_ratio", 1.5))
        if rr_ratio < min_rr:
            rejections.append(
                f"INSUFFICIENT_RISK_REWARD: R:R ({rr_ratio:.2f}) is below minimum required ({min_rr:.2f})."
            )

        # 6. Check Spread Filter
        spread_limits = self.config.get("max_spread_pips", {})
        max_sym_spread = float(spread_limits.get(sym, spread_limits.get("DEFAULT", 3.0)))
        if current_spread_pips > max_sym_spread:
            rejections.append(
                f"EXCESSIVE_SPREAD: Current spread ({current_spread_pips:.2f} pips) > max allowed ({max_sym_spread:.2f} pips)."
            )

        sl_pips = (sl_dist / pip_size) if sl_dist > 0 else 0.0
        max_spread_sl_ratio = float(self.config.get("max_spread_to_sl_ratio", 0.25))
        if sl_pips > 0 and (current_spread_pips / sl_pips) > max_spread_sl_ratio:
            rejections.append(
                f"SPREAD_TO_SL_RATIO_TOO_HIGH: Spread ({current_spread_pips:.2f}p) is {(current_spread_pips/sl_pips)*100:.1f}% of SL ({sl_pips:.1f}p)."
            )

        # 7. Calculate Exact Monetary Risk per 1.0 Lot and Minimum Lot (`volume_min`)
        tick_size = max(float(spec["trade_tick_size"]), 1e-9)
        tick_value = max(float(spec["trade_tick_value"]), 1e-9)
        vol_min = float(spec["volume_min"])
        vol_max = float(spec["volume_max"])
        vol_step = float(spec["volume_step"])
        commission_per_lot = float(self.config.get("default_commission_per_lot_usd", 7.0))

        risk_pct = float(self.config.get("risk_per_trade_pct", 0.5))
        risk_budget_usd = round(equity * (risk_pct / 100.0), 4)

        if sl_dist <= 0:
            return {
                "approved": False,
                "lot_size": 0.0,
                "rejections": rejections,
                "warnings": warnings,
                "risk_budget_usd": round(risk_budget_usd, 2),
                "actual_monetary_risk_usd": 0.0,
                "min_lot_risk_usd": 0.0,
                "risk_reward_ratio": rr_ratio,
            }

        sl_ticks = sl_dist / tick_size
        price_risk_per_lot = sl_ticks * tick_value
        total_risk_per_lot = price_risk_per_lot + commission_per_lot

        # Small Account Check ($5 account safety rule):
        min_lot_risk_usd = round(total_risk_per_lot * vol_min, 4)
        if min_lot_risk_usd > risk_budget_usd + 1e-6:
            # Mandatory exact message from prompt Section 10:
            rejections.append("Trade skipped: minimum volume exceeds permitted risk.")
            rejections.append(
                f"SMALL_ACCOUNT_SAFETY_GUARD: Minimum broker volume ({vol_min} lot) carries ${min_lot_risk_usd:.2f} risk "
                f"(SL + commission), which exceeds your permitted {risk_pct}% risk budget of ${risk_budget_usd:.2f} on ${equity:.2f} equity."
            )
            return {
                "approved": False,
                "lot_size": 0.0,
                "rejections": rejections,
                "warnings": warnings,
                "risk_budget_usd": round(risk_budget_usd, 2),
                "actual_monetary_risk_usd": 0.0,
                "min_lot_risk_usd": round(min_lot_risk_usd, 2),
                "risk_reward_ratio": rr_ratio,
                "small_account_blocked": True,
            }

        # Calculate stepped lot size rounded DOWN so risk budget is NEVER exceeded
        raw_lots = risk_budget_usd / total_risk_per_lot
        steps = math.floor((raw_lots + 1e-9) / vol_step)
        lot_size = round(steps * vol_step, 4)

        if lot_size < vol_min:
            rejections.append("Trade skipped: minimum volume exceeds permitted risk.")
            return {
                "approved": False,
                "lot_size": 0.0,
                "rejections": rejections,
                "warnings": warnings,
                "risk_budget_usd": round(risk_budget_usd, 2),
                "actual_monetary_risk_usd": 0.0,
                "min_lot_risk_usd": round(min_lot_risk_usd, 2),
                "risk_reward_ratio": rr_ratio,
                "small_account_blocked": True,
            }

        lot_size = min(lot_size, vol_max)

        # 8. Check Total Exposure Limit
        current_total_lots = sum(float(p.get("volume", 0.0)) for p in positions)
        max_total_lots = float(self.config.get("max_total_exposure_lots", 5.0))
        if current_total_lots + lot_size > max_total_lots:
            rejections.append(
                f"MAX_TOTAL_EXPOSURE_EXCEEDED: New total exposure ({current_total_lots + lot_size:.2f} lots) > max ({max_total_lots:.2f} lots)."
            )

        # 9. Check Margin Requirement & Free Margin
        contract_size = float(spec["trade_contract_size"])
        notional_usd = lot_size * contract_size * (entry_price if sym in ("XAUUSD", "EURUSD", "GBPUSD") else 1.0)
        required_margin = round(notional_usd / leverage, 2)
        projected_margin_pct = ((used_margin + required_margin) / equity) * 100.0
        max_margin_pct = float(self.config.get("max_margin_usage_pct", 35.0))

        if required_margin > free_margin:
            rejections.append(
                f"INSUFFICIENT_MARGIN: Required margin (${required_margin:.2f}) exceeds free margin (${free_margin:.2f})."
            )
        elif projected_margin_pct > max_margin_pct:
            rejections.append(
                f"MAX_MARGIN_USAGE_EXCEEDED: Projected margin usage ({projected_margin_pct:.1f}%) > max limit ({max_margin_pct:.1f}%)."
            )

        # 10. Daily Session Window Check (if enforced in Risk Center)
        if self.config.get("enforce_session_window", False):
            dt = now_utc or datetime.now(timezone.utc)
            start_s = str(self.config.get("daily_session_start_utc", "06:00"))
            end_s = str(self.config.get("daily_session_end_utc", "21:00"))
            sh, sm = [int(x) for x in start_s.split(":")]
            eh, em = [int(x) for x in end_s.split(":")]
            cur_m = dt.hour * 60 + dt.minute
            if not (sh * 60 + sm <= cur_m <= eh * 60 + em):
                rejections.append(
                    f"OUTSIDE_TRADING_SESSION: Current time ({dt.strftime('%H:%M UTC')}) is outside session ({start_s}-{end_s} UTC)."
                )

        actual_risk_usd = round(lot_size * total_risk_per_lot, 2)
        actual_risk_pct = round((actual_risk_usd / equity) * 100.0, 3)

        return {
            "approved": len(rejections) == 0,
            "lot_size": lot_size if len(rejections) == 0 else 0.0,
            "calculated_lot_size": lot_size,
            "risk_budget_usd": round(risk_budget_usd, 2),
            "actual_monetary_risk_usd": actual_risk_usd,
            "actual_risk_pct": actual_risk_pct,
            "min_lot_risk_usd": round(min_lot_risk_usd, 2),
            "required_margin_usd": required_margin,
            "projected_margin_usage_pct": round(projected_margin_pct, 2),
            "stop_loss_pips": round(sl_pips, 1),
            "take_profit_pips": round(tp_dist / pip_size, 1) if tp_dist > 0 else 0.0,
            "risk_reward_ratio": rr_ratio,
            "rejections": rejections,
            "warnings": warnings,
            "small_account_blocked": False,
        }
