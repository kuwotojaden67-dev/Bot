"""
Multi-Timeframe Analysis, Signal Scoring, and Trade Decision Engine for 2REAL AI TRADER.
Executes the 10-step evaluation pipeline across all 8 strategy modules and the un-bypassable Risk Engine.
Never represents the confluence score as a probability of winning.
Never allows a high confluence score to override a hard filter or risk limit.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd

from backend.core.database import DEFAULT_STRATEGY_CONFIG
from backend.mt5_client.connector import STANDARD_SYMBOL_SPECS
from backend.risk.engine import RiskEngine
from backend.strategies.breakout import BreakoutFakeoutEngine
from backend.strategies.candlesticks import CandlestickEngine
from backend.strategies.fibonacci import FibonacciEngine
from backend.strategies.filters import MarketFilterEngine
from backend.strategies.fvg import FairValueGapEngine
from backend.strategies.ict import ICTEngine
from backend.strategies.smc import SMCEngine
from backend.strategies.volume_profile import VolumeProfileEngine


class MultiStrategyConfluenceEngine:
    """
    Coordinates Higher-Timeframe (HTF) and Lower-Timeframe (LTF) analysis across all
    8 strategy modules and validates every candidate trade through the Risk Engine.
    """

    def __init__(
        self,
        strategy_config: Optional[Dict[str, Any]] = None,
        risk_engine: Optional[RiskEngine] = None,
    ):
        self.config: Dict[str, Any] = dict(DEFAULT_STRATEGY_CONFIG)
        if strategy_config:
            self.config.update(strategy_config)
        self.risk_engine = risk_engine or RiskEngine()
        self._init_subengines()

    def _init_subengines(self) -> None:
        self.ict_engine = ICTEngine(self.config.get("ict"))
        self.smc_engine = SMCEngine(self.config.get("smc"))
        self.fvg_engine = FairValueGapEngine(self.config.get("fvg"))
        self.vp_engine = VolumeProfileEngine(self.config.get("volume_profile"))
        self.bo_engine = BreakoutFakeoutEngine(self.config.get("breakout"))
        self.cs_engine = CandlestickEngine(self.config.get("candlesticks"))
        self.fib_engine = FibonacciEngine(self.config.get("fibonacci"))
        self.filter_engine = MarketFilterEngine(self.config.get("filters"))

    def update_config(self, new_config: Dict[str, Any]) -> None:
        self.config.update(new_config)
        self._init_subengines()

    def get_active_timeframes(self) -> Dict[str, str]:
        style = str(self.config.get("trading_style", "DAY_TRADING")).upper()
        if style == "SWING" and not self.config.get("swing_mode_enabled", False):
            # Optional Swing mode remains disabled unless explicitly enabled
            style = "DAY_TRADING"
        tf_map = self.config.get("timeframes", DEFAULT_STRATEGY_CONFIG["timeframes"])
        pair = tf_map.get(style, {"htf": "H4", "ltf": "M15"})
        return {"style": style, "htf": pair["htf"], "ltf": pair["ltf"]}

    def evaluate(
        self,
        symbol: str,
        ltf_df: pd.DataFrame,
        htf_df: Optional[pd.DataFrame] = None,
        ltf_timeframe: str = "M15",
        htf_timeframe: str = "H4",
        account_info: Optional[Dict[str, Any]] = None,
        open_positions: Optional[List[Dict[str, Any]]] = None,
        current_spread_pips: Optional[float] = None,
        data_is_fresh: bool = True,
        bot_state: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Run the 10-step evaluation pipeline on confirmed OHLCV bars.
        Returns a structured signal dictionary with BUY, SELL, or WAIT.
        """
        sym = symbol.upper().strip()
        spec = STANDARD_SYMBOL_SPECS.get(sym, STANDARD_SYMBOL_SPECS["EURUSD"])
        digits = int(spec["digits"])
        pip_size = float(spec["pip_size"])

        confirmations: List[str] = []
        rejections: List[str] = []

        # Check data sufficiency & freshness first
        if ltf_df is None or len(ltf_df) < 35:
            rejections.append("INSUFFICIENT_MARKET_DATA: Fewer than 35 LTF bars available for structural analysis.")
            return self._build_wait_response(sym, ltf_timeframe, htf_timeframe, 0.0, confirmations, rejections, {})

        if not data_is_fresh:
            rejections.append("STALE_MARKET_DATA: Price feed is stale; new entries are suspended.")

        # Step 1: Higher-Timeframe Directional Bias
        if htf_df is not None and len(htf_df) >= 30:
            htf_ict = self.ict_engine.analyze(htf_df)
            htf_smc = self.smc_engine.analyze(htf_df)
            htf_bias = htf_smc["structural_bias"] if htf_smc["structural_bias"] != "NEUTRAL" else htf_ict["bias"]
        else:
            # Derive HTF bias from longer lookback on LTF when HTF DataFrame is not passed separately
            htf_ict = self.ict_engine.analyze(ltf_df)
            htf_smc = self.smc_engine.analyze(ltf_df)
            htf_bias = htf_smc["structural_bias"] if htf_smc["structural_bias"] != "NEUTRAL" else htf_ict["bias"]

        # Step 2 & 3: Run all LTF Strategy Engines & Market Regime Filters
        ict_res = self.ict_engine.analyze(ltf_df)
        smc_res = self.smc_engine.analyze(ltf_df)
        fvg_res = self.fvg_engine.analyze(ltf_df)
        vp_res = self.vp_engine.analyze(ltf_df)
        bo_res = self.bo_engine.analyze(ltf_df)
        cs_res = self.cs_engine.analyze(ltf_df)
        fib_res = self.fib_engine.analyze(ltf_df, smc_res.get("swing_highs"), smc_res.get("swing_lows"))

        max_spread_map = self.risk_engine.config.get("max_spread_pips", {})
        max_sym_spread = float(max_spread_map.get(sym, max_spread_map.get("DEFAULT", 3.0)))
        filter_res = self.filter_engine.analyze(
            ltf_df,
            symbol=sym,
            current_spread_pips=current_spread_pips,
            max_spread_pips=max_sym_spread,
        )

        # Score both Bullish and Bearish confluence independently so we can see if strategies disagree
        bull_score, bull_factors, bull_confirms = self._score_direction(
            direction="BUY",
            htf_bias=htf_bias,
            ict_res=ict_res,
            smc_res=smc_res,
            fvg_res=fvg_res,
            vp_res=vp_res,
            bo_res=bo_res,
            cs_res=cs_res,
            fib_res=fib_res,
            filter_res=filter_res,
        )
        bear_score, bear_factors, bear_confirms = self._score_direction(
            direction="SELL",
            htf_bias=htf_bias,
            ict_res=ict_res,
            smc_res=smc_res,
            fvg_res=fvg_res,
            vp_res=vp_res,
            bo_res=bo_res,
            cs_res=cs_res,
            fib_res=fib_res,
            filter_res=filter_res,
        )

        # Check for strategy conflict
        if bull_score >= 50.0 and bear_score >= 50.0 and abs(bull_score - bear_score) < 12.0:
            rejections.append(
                f"CONFLICTING_SIGNALS: Bullish score ({bull_score:.1f}) and Bearish score ({bear_score:.1f}) conflict; returning WAIT."
            )

        if bull_score >= bear_score:
            candidate_dir = "BUY"
            raw_score = bull_score
            factors = bull_factors
            confirmations = bull_confirms
        else:
            candidate_dir = "SELL"
            raw_score = bear_score
            factors = bear_factors
            confirmations = bear_confirms

        min_score = float(self.config.get("min_confluence_score", 65.0))
        if raw_score < min_score:
            rejections.append(
                f"BELOW_MIN_CONFLUENCE_SCORE: Score {raw_score:.1f}/100 is below minimum required threshold ({min_score:.1f})."
            )

        # Check Hard Market Filters
        if not filter_res["spread_ok"]:
            rejections.append(
                f"SPREAD_FILTER_REJECTED: Current spread ({filter_res['spread_pips']}p) exceeds limit ({filter_res['max_spread_pips']}p)."
            )
        if not filter_res["session_ok"]:
            rejections.append(
                f"SESSION_FILTER_REJECTED: Current bar time ({filter_res['current_bar_utc']}) is outside allowed sessions."
            )
        if not filter_res["news_ok"]:
            rejections.append("NEWS_RISK_BLACKOUT: High-impact scheduled economic news window active.")
        if filter_res["volatility_regime"] == "LOW_DEAD":
            rejections.append(f"LOW_VOLATILITY_REJECTED: ATR ({filter_res['atr_pips']} pips) indicates dead/illiquid market.")
        elif filter_res["volatility_regime"] == "EXTREME_SPIKE":
            rejections.append("EXTREME_VOLATILITY_SPIKE: ATR exceeds safe spike multiple.")

        # Step 6: Calculate structural Stop Loss and Take Profit
        current_price = float(ltf_df["close"].iloc[-1])
        atr_val = max(float(filter_res["atr"]), pip_size * 5.0)
        sl_price, tp_price = self._calculate_structural_sl_tp(
            direction=candidate_dir,
            entry_price=current_price,
            atr_val=atr_val,
            smc_res=smc_res,
            ict_res=ict_res,
            digits=digits,
        )

        # Step 7 & 8: Evaluate through the un-bypassable Risk Engine
        last_bar_dt = pd.to_datetime(ltf_df["time"].iloc[-1], utc=True).to_pydatetime()
        risk_eval = self.risk_engine.evaluate_trade_risk(
            symbol=sym,
            direction=candidate_dir,
            entry_price=current_price,
            stop_loss=sl_price,
            take_profit=tp_price,
            account_info=account_info,
            symbol_spec=spec,
            open_positions=open_positions,
            current_spread_pips=filter_res["spread_pips"],
            bot_state=bot_state,
            now_utc=last_bar_dt,
        )

        for r in risk_eval.get("rejections", []):
            if r not in rejections:
                rejections.append(r)

        # Step 9: Final Action Decision (High score NEVER overrides any rejection)
        final_action = candidate_dir if (len(rejections) == 0 and raw_score >= min_score) else "WAIT"
        status = "ACTIONABLE_" + final_action if final_action in ("BUY", "SELL") else "FILTERED_WAIT"

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "bar_time": str(ltf_df["time"].iloc[-1]),
            "symbol": sym,
            "timeframe": ltf_timeframe,
            "htf_timeframe": htf_timeframe,
            "htf_bias": htf_bias,
            "action": final_action,
            "candidate_direction": candidate_dir,
            "score": round(raw_score, 1),
            "min_required_score": round(min_score, 1),
            "score_disclaimer": "Confluence score (0-100) measures rule alignment across active modules, NOT a statistical win probability.",
            "entry_price": round(current_price, digits),
            "stop_loss": round(sl_price, digits),
            "take_profit": round(tp_price, digits),
            "risk_reward": risk_eval.get("risk_reward_ratio", 0.0),
            "lot_size": risk_eval.get("lot_size", 0.0),
            "calculated_lot_size": risk_eval.get("calculated_lot_size", 0.0),
            "risk_evaluation": risk_eval,
            "confirmations": confirmations,
            "rejections": rejections,
            "factors": factors,
            "status": status,
            "diagnostics": {
                "ict": ict_res,
                "smc": smc_res,
                "fvg": fvg_res,
                "volume_profile": {
                    k: v for k, v in vp_res.items() if k != "bins"
                },
                "volume_profile_bins": vp_res.get("bins", []),
                "breakout": bo_res,
                "candlesticks": cs_res,
                "fibonacci": fib_res,
                "filters": filter_res,
            },
        }

    def _score_direction(
        self,
        direction: str,
        htf_bias: str,
        ict_res: Dict[str, Any],
        smc_res: Dict[str, Any],
        fvg_res: Dict[str, Any],
        vp_res: Dict[str, Any],
        bo_res: Dict[str, Any],
        cs_res: Dict[str, Any],
        fib_res: Dict[str, Any],
        filter_res: Dict[str, Any],
    ) -> tuple[float, Dict[str, float], List[str]]:
        factors: Dict[str, float] = {
            "htf_alignment": 0.0,         # Max 15
            "structure_bos_mss": 0.0,     # Max 18
            "liquidity_or_breakout": 0.0, # Max 15
            "fvg_or_order_block": 0.0,    # Max 17
            "poc_volume_profile": 0.0,    # Max 10
            "fibonacci_ote": 0.0,         # Max 10
            "candlestick_trigger": 0.0,   # Max 10
            "spread_volatility": 0.0,     # Max 5
        }
        confirms: List[str] = []
        is_buy = direction == "BUY"
        target_bias = "BULLISH" if is_buy else "BEARISH"

        # 1. HTF Direction (max 15)
        if htf_bias == target_bias:
            factors["htf_alignment"] = 15.0
            confirms.append(f"HTF Bias aligned ({target_bias})")
        elif htf_bias == "NEUTRAL":
            factors["htf_alignment"] = 6.0

        # 2. Structure: BOS / CHoCH / MSS (max 18)
        smc_enabled = self.config.get("smc", {}).get("enabled", True)
        ict_enabled = self.config.get("ict", {}).get("enabled", True)
        if smc_enabled and smc_res["structural_bias"] == target_bias:
            factors["structure_bos_mss"] += 11.0
            if smc_res["structure_events"]:
                last_ev = smc_res["structure_events"][-1]["type"]
                confirms.append(f"SMC Structure confirmed ({last_ev})")
        if ict_enabled and ict_res["mss_events"]:
            last_mss = ict_res["mss_events"][-1]
            if (is_buy and last_mss["type"] == "BULLISH_MSS") or (not is_buy and last_mss["type"] == "BEARISH_MSS"):
                factors["structure_bos_mss"] = min(18.0, factors["structure_bos_mss"] + 10.0)
                confirms.append(f"ICT {last_mss['type']} with displacement")

        # 3. Liquidity Sweep or Confirmed Breakout/Fakeout (max 15)
        if ict_enabled and ict_res["recent_sweeps"]:
            last_sw = ict_res["recent_sweeps"][-1]
            if (is_buy and last_sw["type"] == "SSL_SWEEP_BULLISH") or (not is_buy and last_sw["type"] == "BSL_SWEEP_BEARISH"):
                factors["liquidity_or_breakout"] += 12.0
                confirms.append(f"ICT Liquidity Raid ({last_sw['type']} @ {last_sw['swept_level']})")
        if self.config.get("breakout", {}).get("enabled", True):
            bo_sig = bo_res.get("active_signal", "NONE")
            if is_buy and "BULLISH" in bo_sig:
                factors["liquidity_or_breakout"] = min(15.0, factors["liquidity_or_breakout"] + 10.0)
                confirms.append(f"Breakout/Fakeout Engine ({bo_sig})")
            elif not is_buy and "BEARISH" in bo_sig:
                factors["liquidity_or_breakout"] = min(15.0, factors["liquidity_or_breakout"] + 10.0)
                confirms.append(f"Breakout/Fakeout Engine ({bo_sig})")

        # 4. FVG or Order Block Alignment + ICT Discount/Premium (max 17)
        if self.config.get("fvg", {}).get("enabled", True):
            if is_buy and (fvg_res["price_in_bullish_fvg"] or len(fvg_res["active_bullish_fvgs"]) > 0):
                pts = 10.0 if fvg_res["price_in_bullish_fvg"] else 6.0
                factors["fvg_or_order_block"] += pts
                confirms.append("Bullish Fair Value Gap (FVG) alignment")
            elif not is_buy and (fvg_res["price_in_bearish_fvg"] or len(fvg_res["active_bearish_fvgs"]) > 0):
                pts = 10.0 if fvg_res["price_in_bearish_fvg"] else 6.0
                factors["fvg_or_order_block"] += pts
                confirms.append("Bearish Fair Value Gap (FVG) alignment")

        if smc_enabled:
            if is_buy and (smc_res["price_in_bullish_ob"] or len(smc_res["active_bullish_obs"]) > 0):
                pts = 10.0 if smc_res["price_in_bullish_ob"] else 6.0
                factors["fvg_or_order_block"] = min(17.0, factors["fvg_or_order_block"] + pts)
                confirms.append("SMC Bullish Order Block (Demand Zone) active")
            elif not is_buy and (smc_res["price_in_bearish_ob"] or len(smc_res["active_bearish_obs"]) > 0):
                pts = 10.0 if smc_res["price_in_bearish_ob"] else 6.0
                factors["fvg_or_order_block"] = min(17.0, factors["fvg_or_order_block"] + pts)
                confirms.append("SMC Bearish Order Block (Supply Zone) active")

        # 5. POC & Volume Profile Confluence (max 10)
        if self.config.get("volume_profile", {}).get("enabled", True) and vp_res.get("poc") is not None:
            if is_buy and (vp_res["price_near_poc"] or vp_res["price_near_val"]):
                factors["poc_volume_profile"] = 10.0
                confirms.append(f"Volume Profile confluence near POC/VAL ({vp_res['poc']})")
            elif not is_buy and (vp_res["price_near_poc"] or vp_res["price_near_vah"]):
                factors["poc_volume_profile"] = 10.0
                confirms.append(f"Volume Profile confluence near POC/VAH ({vp_res['poc']})")
            else:
                factors["poc_volume_profile"] = 4.0

        # 6. Fibonacci & Dealing Range Discount/Premium Confluence (max 10)
        if self.config.get("fibonacci", {}).get("enabled", True):
            if is_buy and (fib_res["in_bullish_fib_zone"] or ict_res["zone"] == "DISCOUNT"):
                factors["fibonacci_ote"] = 10.0 if fib_res["in_bullish_fib_zone"] else 7.0
                confirms.append(f"Fibonacci / Discount Zone confluence ({ict_res['zone']})")
            elif not is_buy and (fib_res["in_bearish_fib_zone"] or ict_res["zone"] == "PREMIUM"):
                factors["fibonacci_ote"] = 10.0 if fib_res["in_bearish_fib_zone"] else 7.0
                confirms.append(f"Fibonacci / Premium Zone confluence ({ict_res['zone']})")

        # 7. Candlestick Confirmation (max 10)
        if self.config.get("candlesticks", {}).get("enabled", True):
            if is_buy and cs_res["bullish_confirmation"]:
                pat_names = ", ".join({p["pattern"] for p in cs_res["latest_bullish_patterns"]})
                factors["candlestick_trigger"] = 10.0
                confirms.append(f"Candlestick confirmation ({pat_names})")
            elif not is_buy and cs_res["bearish_confirmation"]:
                pat_names = ", ".join({p["pattern"] for p in cs_res["latest_bearish_patterns"]})
                factors["candlestick_trigger"] = 10.0
                confirms.append(f"Candlestick confirmation ({pat_names})")

        # 8. Spread & Volatility Conditions (max 5)
        if filter_res["spread_ok"] and filter_res["volatility_regime"] in ("NORMAL", "HIGH_EXPANSION"):
            factors["spread_volatility"] = 5.0
            confirms.append(f"Healthy Volatility ({filter_res['volatility_regime']}) & Spread ({filter_res['spread_pips']}p)")

        total_score = round(sum(factors.values()), 1)
        return total_score, factors, confirms

    @staticmethod
    def _calculate_structural_sl_tp(
        direction: str,
        entry_price: float,
        atr_val: float,
        smc_res: Dict[str, Any],
        ict_res: Dict[str, Any],
        digits: int,
    ) -> tuple[float, float]:
        """
        Places stop loss beyond the nearest invalidation swing low/high or Order Block boundary,
        bounded to a sensible [1.2 * ATR, 3.0 * ATR] range, and targets Liquidity Pool / 2.2R Take Profit.
        """
        min_sl_dist = 1.2 * atr_val
        max_sl_dist = 2.8 * atr_val
        default_sl_dist = 1.6 * atr_val

        if direction == "BUY":
            candidate_lows: List[float] = []
            if smc_res.get("active_bullish_obs"):
                candidate_lows.append(float(smc_res["active_bullish_obs"][-1]["bottom"]) - 0.25 * atr_val)
            if smc_res.get("swing_lows"):
                candidate_lows.append(float(smc_res["swing_lows"][-1]["price"]) - 0.20 * atr_val)
            valid_lows = [lvl for lvl in candidate_lows if min_sl_dist <= (entry_price - lvl) <= max_sl_dist]
            sl_price = valid_lows[-1] if valid_lows else (entry_price - default_sl_dist)
            sl_dist = entry_price - sl_price
            tp_price = entry_price + (sl_dist * 2.2)
        else:
            candidate_highs: List[float] = []
            if smc_res.get("active_bearish_obs"):
                candidate_highs.append(float(smc_res["active_bearish_obs"][-1]["top"]) + 0.25 * atr_val)
            if smc_res.get("swing_highs"):
                candidate_highs.append(float(smc_res["swing_highs"][-1]["price"]) + 0.20 * atr_val)
            valid_highs = [lvl for lvl in candidate_highs if min_sl_dist <= (lvl - entry_price) <= max_sl_dist]
            sl_price = valid_highs[-1] if valid_highs else (entry_price + default_sl_dist)
            sl_dist = sl_price - entry_price
            tp_price = entry_price - (sl_dist * 2.2)

        return round(sl_price, digits), round(tp_price, digits)

    @staticmethod
    def _build_wait_response(
        symbol: str,
        ltf_timeframe: str,
        htf_timeframe: str,
        score: float,
        confirmations: List[str],
        rejections: List[str],
        factors: Dict[str, float],
    ) -> Dict[str, Any]:
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "symbol": symbol,
            "timeframe": ltf_timeframe,
            "htf_timeframe": htf_timeframe,
            "htf_bias": "NEUTRAL",
            "action": "WAIT",
            "candidate_direction": "NONE",
            "score": score,
            "min_required_score": 65.0,
            "entry_price": None,
            "stop_loss": None,
            "take_profit": None,
            "risk_reward": 0.0,
            "lot_size": 0.0,
            "confirmations": confirmations,
            "rejections": rejections,
            "factors": factors,
            "status": "FILTERED_WAIT",
        }
