import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  History,
  Layers,
  Lock,
  Pause,
  Play,
  Plug,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Square,
  Terminal,
  TrendingUp,
  AlertOctagon,
  AlertTriangle,
  FlaskConical,
  XCircle,
} from 'lucide-react';
import { api } from './services/api';
import { PriceStructureChart } from './components/PriceStructureChart';
import { EquityCurveChart } from './components/EquityCurveChart';
import { SetupWizardModal } from './components/SetupWizardModal';

type TabId =
  | 'overview'
  | 'live'
  | 'strategy'
  | 'risk'
  | 'backtest'
  | 'history'
  | 'diagnostics';

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [strategyConfig, setStrategyConfig] = useState<any>(null);
  const [riskConfig, setRiskConfig] = useState<any>(null);

  const [selectedSymbol, setSelectedSymbol] = useState<string>('EURUSD');
  const [symbolAnalysis, setSymbolAnalysis] = useState<any>(null);
  const [recentSignals, setRecentSignals] = useState<any[]>([]);
  const [tradeHistory, setTradeHistory] = useState<any[]>([]);
  const [diagnosticLogs, setDiagnosticLogs] = useState<any[]>([]);
  const [logCategoryFilter, setLogCategoryFilter] = useState<string>('ALL');

  // Backtest state
  const [btSymbol, setBtSymbol] = useState<string>('EURUSD');
  const [btTimeframe, setBtTimeframe] = useState<string>('M15');
  const [btStrategyMode, setBtStrategyMode] = useState<string>('ALL_CONFLUENCE');
  const [btBars, setBtBars] = useState<number>(240);
  const [btInitialBalance, setBtInitialBalance] = useState<number>(10000);
  const [btSpreadPips, setBtSpreadPips] = useState<number>(1.2);
  const [btCommission, setBtCommission] = useState<number>(7.0);
  const [btSlippage, setBtSlippage] = useState<number>(2.0);
  const [backtestReport, setBacktestReport] = useState<any>(null);
  const [btRunning, setBtRunning] = useState<boolean>(false);

  // Small Account ($5) Evaluator state
  const [smallAcctBalance, setSmallAcctBalance] = useState<number>(5.0);
  const [smallAcctSymbol, setSmallAcctSymbol] = useState<string>('EURUSD');
  const [smallAcctRiskPct, setSmallAcctRiskPct] = useState<number>(0.5);
  const [smallAcctSlPips, setSmallAcctSlPips] = useState<number>(15.0);
  const [smallAcctResult, setSmallAcctResult] = useState<any>(null);

  // Live Trading Explicit Authorization form
  const [livePhrase, setLivePhrase] = useState<string>('');
  const [ackRisk, setAckRisk] = useState<boolean>(false);
  const [ackDemoTested, setAckDemoTested] = useState<boolean>(false);

  // Modals & UI status
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [confirmCloseAll, setConfirmCloseAll] = useState<boolean>(false);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'info' | 'success' | 'error';
    text: string;
  } | null>(null);
  const [scenarioResult, setScenarioResult] = useState<any>(null);

  const loadAllData = useCallback(async () => {
    try {
      const [ov, sCfg, rCfg, analysis, sigs, trades, logs] = await Promise.all([
        api.getOverview(),
        api.getStrategyConfig(),
        api.getRiskConfig(),
        api.getSymbolAnalysis(selectedSymbol),
        api.getRecentSignals(),
        api.getTradeHistory(),
        api.getDiagnosticLogs(logCategoryFilter),
      ]);
      setOverview(ov);
      setStrategyConfig(sCfg);
      setRiskConfig(rCfg);
      setSymbolAnalysis(analysis);
      setRecentSignals(sigs.signals || []);
      setTradeHistory(trades.trades || []);
      setDiagnosticLogs(logs.logs || []);
    } catch (err: any) {
      console.error('Data refresh error:', err);
    }
  }, [selectedSymbol, logCategoryFilter]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    const init = async () => {
      try {
        const ov = await api.bootstrap();
        setOverview(ov);
        await loadAllData();
        // Run initial small-account ($5) check and initial backtest so data is ready
        const sa = await api.evaluateSmallAccount({
          balance_usd: 5.0,
          leverage: 100,
          symbol: 'EURUSD',
          risk_per_trade_pct: 0.5,
          stop_loss_pips: 15.0,
        });
        setSmallAcctResult(sa);

        const bt = await api.runBacktest({
          symbol: 'EURUSD',
          timeframe: 'M15',
          strategy_mode: 'ALL_CONFLUENCE',
          bars: 240,
          initial_balance: 10000,
          leverage: 100,
          spread_pips: 1.2,
          commission_per_lot_usd: 7.0,
          slippage_points: 2.0,
          out_of_sample_pct: 0.3,
        });
        setBacktestReport(bt);

        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${window.location.host}/ws/live`);
        ws.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            setOverview(payload);
          } catch {
            // ignore parse errors
          }
        };
      } catch (err: any) {
        setBannerMessage({ type: 'error', text: `Initialization error: ${err.message}` });
      }
    };
    init();
    return () => {
      if (ws) ws.close();
    };
  }, []);

  useEffect(() => {
    api.getSymbolAnalysis(selectedSymbol).then(setSymbolAnalysis).catch(() => {});
  }, [selectedSymbol]);

  useEffect(() => {
    api.getDiagnosticLogs(logCategoryFilter).then((r) => setDiagnosticLogs(r.logs || [])).catch(() => {});
  }, [logCategoryFilter]);

  const handleBotAction = async (action: 'START' | 'PAUSE' | 'STOP', mode: string = 'SIGNAL_ONLY') => {
    try {
      await api.controlBot(action, mode);
      await loadAllData();
      setBannerMessage({
        type: 'success',
        text: `Bot state updated: ${action} (${mode})`,
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleEvaluateAndExecute = async (autoExec: boolean) => {
    try {
      const res = await api.evaluateAndExecute(selectedSymbol, autoExec);
      await loadAllData();
      if (autoExec && res.execution) {
        if (res.execution.executed) {
          setBannerMessage({
            type: 'success',
            text: `Order Executed (#${res.execution.ticket}): ${res.signal.action} ${res.execution.trade.volume} lot ${selectedSymbol} @ ${res.execution.trade.entry_price}`,
          });
        } else {
          setBannerMessage({
            type: 'error',
            text: `Order Blocked (${res.execution.code}): ${res.execution.message}`,
          });
        }
      } else {
        setBannerMessage({
          type: 'info',
          text: `Evaluated ${selectedSymbol}: Signal=${res.signal.action} (Confluence Score: ${res.signal.score}/100)`,
        });
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleCloseAllPositions = async () => {
    try {
      const res = await api.closePositions({ confirmed: true });
      setConfirmCloseAll(false);
      await loadAllData();
      setBannerMessage({
        type: 'info',
        text: `Closed ${res.closed_count} open position(s).`,
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleCloseSinglePosition = async (ticket: number) => {
    try {
      const res = await api.closePositions({ confirmed: true, ticket });
      await loadAllData();
      setBannerMessage({
        type: res.closed ? 'success' : 'error',
        text: res.closed
          ? `Closed position #${ticket} | Realized P&L: $${res.realized_pnl?.toFixed(2) ?? '0.00'}`
          : res.message || 'Close failed',
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleEmergencyStop = async (active: boolean, closeAll: boolean = false) => {
    try {
      await api.setEmergencyStop({
        active,
        close_existing_positions: closeAll,
        confirmed: true,
      });
      await loadAllData();
      setBannerMessage({
        type: active ? 'error' : 'success',
        text: active
          ? 'EMERGENCY STOP ENGAGED: All new order entries are strictly blocked.'
          : 'Emergency Stop disengaged.',
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleRunBacktest = async () => {
    setBtRunning(true);
    try {
      const rep = await api.runBacktest({
        symbol: btSymbol,
        timeframe: btTimeframe,
        strategy_mode: btStrategyMode,
        bars: Number(btBars),
        initial_balance: Number(btInitialBalance),
        leverage: 100,
        spread_pips: Number(btSpreadPips),
        commission_per_lot_usd: Number(btCommission),
        slippage_points: Number(btSlippage),
        out_of_sample_pct: 0.3,
      });
      setBacktestReport(rep);
      await loadAllData();
      setBannerMessage({
        type: 'success',
        text: `Backtest Completed on ${btSymbol} (${btTimeframe}): ${rep.total_trades} trades | Net Profit: $${rep.net_profit?.toFixed(2)}`,
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    } finally {
      setBtRunning(false);
    }
  };

  const handleEvaluateSmallAccount = async () => {
    try {
      const res = await api.evaluateSmallAccount({
        balance_usd: Number(smallAcctBalance),
        leverage: 100,
        symbol: smallAcctSymbol,
        risk_per_trade_pct: Number(smallAcctRiskPct),
        stop_loss_pips: Number(smallAcctSlPips),
      });
      setSmallAcctResult(res);
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleSaveStrategyConfig = async () => {
    try {
      await api.updateStrategyConfig(strategyConfig);
      await loadAllData();
      setBannerMessage({ type: 'success', text: 'Strategy Center configuration saved.' });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleSaveRiskConfig = async () => {
    try {
      await api.updateRiskConfig(riskConfig);
      await loadAllData();
      setBannerMessage({ type: 'success', text: 'Risk Center limits saved.' });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleAuthorizeLive = async () => {
    try {
      await api.authorizeLive({
        confirmation_phrase: livePhrase,
        acknowledged_risk: ackRisk,
        demo_tested: ackDemoTested,
      });
      setLivePhrase('');
      await loadAllData();
      setBannerMessage({
        type: 'success',
        text: 'Live Trading Mode explicitly authorized for this session.',
      });
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const handleRunErrorScenario = async (scenario: string) => {
    try {
      const res = await api.testErrorScenario(scenario);
      setScenarioResult(res);
      await loadAllData();
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err.message });
    }
  };

  const conn = overview?.connection || {};
  const acct = overview?.account;
  const openPositions = overview?.open_positions || [];
  const botState = overview?.bot_state || { status: 'STOPPED', execution_mode: 'SIGNAL_ONLY' };
  const isEmergency = Boolean(overview?.emergency_stop_active);
  const sig = symbolAnalysis?.signal;

  return (
    <div className="min-h-screen bg-[#080a0f] text-slate-100 flex flex-col">
      {/* Top Institutional Header & Bot Control Bar */}
      <header className="sticky top-0 z-30 bg-[#0c0f18]/95 backdrop-blur border-b border-[#1c2336] px-5 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Connection Badge */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tracking-tight text-base text-white">
                    2REAL AI TRADER
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-mono-num">
                    MT5 AUTONOMOUS v1.0
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  ICT · SMC · FVG · Volume Profile · Fibonacci · Un-Bypassable Risk Guard
                </p>
              </div>
            </div>

            {/* Connection Status Pill */}
            <div
              onClick={() => setIsWizardOpen(true)}
              className={`cursor-pointer px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 transition ${
                conn.is_real_mt5_terminal
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : conn.is_paper_harness
                  ? 'bg-purple-500/15 border-purple-500/35 text-purple-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  conn.is_real_mt5_terminal
                    ? 'bg-emerald-400 animate-pulse'
                    : conn.is_paper_harness
                    ? 'bg-purple-400 animate-pulse'
                    : 'bg-amber-400'
                }`}
              />
              <span className="font-semibold">
                {conn.is_real_mt5_terminal
                  ? `MT5 CONNECTED (${conn.server})`
                  : conn.is_paper_harness
                  ? 'OFFLINE DEMO TEST HARNESS'
                  : 'MT5 DISCONNECTED'}
              </span>
            </div>
          </div>

          {/* Primary Bot Control Buttons (Section 2) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsWizardOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow shadow-blue-600/30"
            >
              <Plug className="w-3.5 h-3.5" /> Connect / Setup MT5
            </button>

            <button
              onClick={() =>
                handleBotAction(
                  'START',
                  conn.is_connected ? 'DEMO_AUTO' : 'SIGNAL_ONLY',
                )
              }
              className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" /> Start Bot
            </button>

            <button
              onClick={() => handleBotAction('PAUSE')}
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-1.5"
            >
              <Pause className="w-3.5 h-3.5" /> Pause Bot
            </button>

            <button
              onClick={() => handleBotAction('STOP')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600/50 text-slate-200 text-xs font-medium flex items-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5" /> Stop Bot
            </button>

            <button
              onClick={() => setConfirmCloseAll(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-medium"
            >
              Close Positions ({openPositions.length})
            </button>

            <button
              onClick={() => handleEmergencyStop(!isEmergency, false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                isEmergency
                  ? 'bg-rose-600 text-white border-rose-400 animate-pulse'
                  : 'bg-rose-950/60 hover:bg-rose-900/70 border-rose-500/50 text-rose-200'
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              {isEmergency ? 'EMERGENCY STOP ACTIVE' : 'Emergency Stop'}
            </button>

            <button
              onClick={loadAllData}
              title="Refresh Account & Market Information"
              className="p-1.5 rounded-lg bg-[#161c2d] hover:bg-[#1f2840] border border-[#26314d] text-slate-300"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs (7 Mandatory Chrome Dashboard Pages) */}
        <div className="max-w-[1600px] mx-auto mt-3 pt-2 border-t border-[#161c2c] flex flex-wrap items-center justify-between gap-2">
          <nav className="flex flex-wrap items-center gap-1">
            {[
              { id: 'overview', label: '1. Overview', icon: Activity },
              { id: 'live', label: '2. Live Trading', icon: TrendingUp },
              { id: 'strategy', label: '3. Strategy Center', icon: Layers },
              { id: 'risk', label: '4. Risk Center & $5 Guard', icon: ShieldCheck },
              { id: 'backtest', label: '5. Backtesting & OOS', icon: BarChart3 },
              { id: 'history', label: '6. Trade History', icon: History },
              { id: 'diagnostics', label: '7. Logs & Diagnostics', icon: Terminal },
            ].map((tab) => {
              const Icon = tab.icon;
              const isAct = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabId)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                    isAct
                      ? 'bg-gradient-to-r from-blue-600/25 to-purple-600/25 border border-blue-500/40 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#131826]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 text-blue-400" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono-num">
            <span>Bot Status: <strong className="text-blue-300">{botState.status}</strong></span>
            <span>·</span>
            <span>Session: <strong className="text-purple-300">{overview?.market_session || 'LONDON / NY'}</strong></span>
          </div>
        </div>
      </header>

      {/* Optional Notification Banner */}
      {bannerMessage && (
        <div className="max-w-[1600px] w-full mx-auto px-5 mt-3">
          <div
            className={`px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between ${
              bannerMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : bannerMessage.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-200'
            }`}
          >
            <span>{bannerMessage.text}</span>
            <button onClick={() => setBannerMessage(null)} className="text-slate-400 hover:text-white ml-4">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Closing All Positions */}
      {confirmCloseAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="bg-[#121726] border border-rose-500/40 rounded-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" /> Confirm Close All Open Positions
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to close all <strong>{openPositions.length}</strong> open position(s) at current market prices?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmCloseAll(false)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseAllPositions}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
              >
                Confirm Close All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="max-w-[1600px] w-full mx-auto px-5 py-5 flex-1 space-y-5">
        {/* ==================== PAGE 1: OVERVIEW ==================== */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Honest Connection Status Banner when Disconnected */}
            {!conn.is_connected && (
              <div className="bg-[#111624] border border-amber-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 max-w-3xl">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4" /> Honest MT5 Telemetry — No Active Terminal Connection
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    2REAL AI TRADER never fabricates live broker balances or fake MT5 connections. Account telemetry below shows{' '}
                    <code className="text-amber-200">— (Not Connected)</code> until you connect your MetaTrader 5 desktop terminal
                    or explicitly activate the <strong>Offline Demo Test Harness</strong> ($10,000 or $5.00 Small Account) for local dry-run testing.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setIsWizardOpen(true)}
                    className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                  >
                    Open MT5 Connection Wizard
                  </button>
                  <button
                    onClick={async () => {
                      await api.enablePaperHarness({ initial_balance: 10000, leverage: 100, currency: 'USD' });
                      await loadAllData();
                    }}
                    className="px-3.5 py-2 rounded-lg bg-purple-600/25 hover:bg-purple-600/40 border border-purple-500/40 text-purple-200 text-xs font-semibold"
                  >
                    Activate $10k Offline Demo Harness
                  </button>
                </div>
              </div>
            )}

            {/* 10 Overview KPI Cards required by Section 11 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                <div className="text-[11px] text-slate-400">Connection Status</div>
                <div className="mt-1 text-sm font-bold text-white flex items-center gap-2">
                  {conn.connection_state || 'DISCONNECTED'}
                </div>
                <div className="mt-1 text-[11px] text-slate-400 truncate">
                  {conn.is_connected ? `${conn.broker} (${conn.login})` : 'Click Connect to MT5'}
                </div>
              </div>

              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                <div className="text-[11px] text-slate-400">Account Balance</div>
                <div className="mt-1 text-lg font-bold font-mono-num text-white">
                  {acct ? `$${Number(acct.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '— (Not Connected)'}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {acct ? `${acct.currency} · Leverage 1:${acct.leverage}` : 'Awaiting MT5 / Harness'}
                </div>
              </div>

              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                <div className="text-[11px] text-slate-400">Account Equity</div>
                <div className="mt-1 text-lg font-bold font-mono-num text-blue-300">
                  {acct ? `$${Number(acct.equity).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Margin Level: {acct ? `${acct.margin_level}%` : '—'}
                </div>
              </div>

              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                <div className="text-[11px] text-slate-400">Free Margin</div>
                <div className="mt-1 text-lg font-bold font-mono-num text-slate-100">
                  {acct ? `$${Number(acct.free_margin).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Used Margin: {acct ? `$${Number(acct.margin).toFixed(2)}` : '—'}
                </div>
              </div>

              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                <div className="text-[11px] text-slate-400">Floating Profit / Loss</div>
                <div
                  className={`mt-1 text-lg font-bold font-mono-num ${
                    !acct
                      ? 'text-slate-400'
                      : acct.floating_pnl > 0
                      ? 'text-emerald-400'
                      : acct.floating_pnl < 0
                      ? 'text-rose-400'
                      : 'text-slate-200'
                  }`}
                >
                  {acct ? `${acct.floating_pnl >= 0 ? '+' : ''}$${Number(acct.floating_pnl).toFixed(2)}` : '—'}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Across {openPositions.length} open position(s)
                </div>
              </div>

              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                <div className="text-[11px] text-slate-400">Today's Realized P&L</div>
                <div
                  className={`mt-1 text-lg font-bold font-mono-num ${
                    (overview?.today_realized_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {overview?.today_realized_pnl >= 0 ? '+' : ''}$
                  {Number(overview?.today_realized_pnl || 0).toFixed(2)}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">Realized closed trades today</div>
              </div>

              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                <div className="text-[11px] text-slate-400">Open Positions</div>
                <div className="mt-1 text-lg font-bold font-mono-num text-white">
                  {openPositions.length} / {riskConfig?.max_open_positions ?? 3}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">Max Simultaneous Limit</div>
              </div>

              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                <div className="text-[11px] text-slate-400">Current Drawdown</div>
                <div className="mt-1 text-lg font-bold font-mono-num text-amber-300">
                  {Number(overview?.current_drawdown_pct || 0).toFixed(2)}%
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Hard Cap: {riskConfig?.max_overall_drawdown_pct ?? 5.0}%
                </div>
              </div>

              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                <div className="text-[11px] text-slate-400">Bot Operating Mode</div>
                <div className="mt-1 text-sm font-bold text-blue-400">
                  {botState.status}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Style: {overview?.active_timeframes?.style || 'DAY_TRADING'} ({overview?.active_timeframes?.htf}/{overview?.active_timeframes?.ltf})
                </div>
              </div>

              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                <div className="text-[11px] text-slate-400">Current Market Session</div>
                <div className="mt-1 text-xs font-bold text-purple-300">
                  {overview?.market_session || 'LONDON / NY'}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  Live Auth: {overview?.live_trading_authorized ? 'AUTHORIZED' : 'DISABLED (Safe)'}
                </div>
              </div>
            </div>

            {/* Live Quotes & Structure Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <PriceStructureChart
                  symbol={selectedSymbol}
                  timeframe={symbolAnalysis?.timeframe || 'M15'}
                  candles={symbolAnalysis?.candles || []}
                  signal={sig}
                />
              </div>

              {/* Active Signal & Confluence Breakdown Card */}
              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between border-b border-[#1d2538] pb-3">
                    <div>
                      <span className="text-xs text-slate-400">Multi-Strategy Confluence Decision</span>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        {selectedSymbol} ({symbolAnalysis?.timeframe || 'M15'})
                      </h3>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-bold ${
                        sig?.action === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : sig?.action === 'SELL'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {sig?.action || 'WAIT'}
                    </span>
                  </div>

                  {/* Score Meter */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">
                        Confluence Score (Threshold: {sig?.min_required_score ?? 65})
                      </span>
                      <span className="font-mono-num font-bold text-blue-300">
                        {sig?.score ?? 0} / 100
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#192032] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        style={{ width: `${Math.min(sig?.score || 0, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Rule-alignment score across 8 modules (not a win probability).
                    </p>
                  </div>

                  {/* Trade Levels */}
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs font-mono-num">
                    <div className="p-2 rounded bg-[#0b0e17] border border-[#1a2133]">
                      <span className="text-slate-400 block text-[10px]">Entry Reference</span>
                      <span className="text-white">{sig?.entry_price ?? '—'}</span>
                    </div>
                    <div className="p-2 rounded bg-[#0b0e17] border border-[#1a2133]">
                      <span className="text-slate-400 block text-[10px]">Est. Risk:Reward</span>
                      <span className="text-blue-300">1 : {sig?.risk_reward ?? '—'}</span>
                    </div>
                    <div className="p-2 rounded bg-[#0b0e17] border border-[#1a2133]">
                      <span className="text-slate-400 block text-[10px]">Stop Loss</span>
                      <span className="text-rose-400">{sig?.stop_loss ?? '—'}</span>
                    </div>
                    <div className="p-2 rounded bg-[#0b0e17] border border-[#1a2133]">
                      <span className="text-slate-400 block text-[10px]">Take Profit</span>
                      <span className="text-emerald-400">{sig?.take_profit ?? '—'}</span>
                    </div>
                  </div>

                  {/* Confirmations & Rejections */}
                  <div className="mt-3 space-y-2 max-h-40 overflow-y-auto text-[11px]">
                    {sig?.confirmations?.map((c: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5 text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{c}</span>
                      </div>
                    ))}
                    {sig?.rejections?.map((r: string, i: number) => (
                      <div key={i} className="flex items-start gap-1.5 text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-[#1d2538]">
                  <button
                    onClick={() => handleEvaluateAndExecute(false)}
                    className="flex-1 py-2 rounded-lg bg-[#171e30] hover:bg-[#212b44] border border-[#2a3656] text-xs font-medium text-slate-200"
                  >
                    Re-Evaluate Signal
                  </button>
                  <button
                    onClick={() => handleEvaluateAndExecute(true)}
                    className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                  >
                    Execute If Approved
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAGE 2: LIVE TRADING ==================== */}
        {activeTab === 'live' && (
          <div className="space-y-5">
            {/* Active Symbol Selector & Live Quotes Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {['EURUSD', 'XAUUSD', 'GBPUSD', 'USDJPY'].map((sym) => {
                const q = overview?.quotes?.[sym];
                const isSel = selectedSymbol === sym;
                return (
                  <div
                    key={sym}
                    onClick={() => setSelectedSymbol(sym)}
                    className={`cursor-pointer rounded-xl p-4 border transition ${
                      isSel
                        ? 'bg-[#13192b] border-blue-500 shadow-lg shadow-blue-600/10'
                        : 'bg-[#10141f] border-[#1e263b] hover:border-[#2e3a59]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">{sym}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono-num">
                        Spread: {q?.spread_pips ?? '—'} pips
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2.5 font-mono-num">
                      <div>
                        <span className="text-[10px] text-slate-400 block">BID</span>
                        <span className="text-sm font-semibold text-rose-300">{q?.bid ?? '—'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">ASK</span>
                        <span className="text-sm font-semibold text-emerald-300">{q?.ask ?? '—'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <PriceStructureChart
                  symbol={selectedSymbol}
                  timeframe={symbolAnalysis?.timeframe || 'M15'}
                  candles={symbolAnalysis?.candles || []}
                  signal={sig}
                />
              </div>

              {/* Factor Score Breakdown */}
              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-white border-b border-[#1d2538] pb-2">
                  8-Module Confluence Factor Breakdown ({selectedSymbol})
                </h3>
                {sig?.factors &&
                  Object.entries(sig.factors).map(([k, val]: [string, any]) => (
                    <div key={k} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 uppercase tracking-wide text-[11px]">
                          {k.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono-num text-blue-300 font-semibold">+{val} pts</span>
                      </div>
                      <div className="w-full h-1.5 rounded bg-[#181f30] overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${Math.min((Number(val) / 18) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                <div className="pt-2 border-t border-[#1d2538] text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Permitted Lot Size:</span>
                    <span className="font-mono-num text-white font-semibold">
                      {sig?.lot_size ?? 0} lots (Calc: {sig?.calculated_lot_size ?? 0})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Volume Profile Source:</span>
                    <span className="font-mono-num text-purple-300">
                      {sig?.diagnostics?.volume_profile?.volume_type || 'TICK_VOLUME'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Open Positions Table */}
            <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">
                  Current Open Positions ({openPositions.length})
                </h3>
                <span className="text-xs text-slate-400">
                  Execution Source: {conn.connection_state}
                </span>
              </div>
              {openPositions.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No open positions currently active.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-slate-400 border-b border-[#1d2538]">
                      <tr>
                        <th className="py-2 px-3">Ticket</th>
                        <th className="py-2 px-3">Symbol</th>
                        <th className="py-2 px-3">Direction</th>
                        <th className="py-2 px-3">Volume</th>
                        <th className="py-2 px-3">Entry Price</th>
                        <th className="py-2 px-3">Stop Loss</th>
                        <th className="py-2 px-3">Take Profit</th>
                        <th className="py-2 px-3">Floating P&L</th>
                        <th className="py-2 px-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#181f30] font-mono-num">
                      {openPositions.map((pos: any) => (
                        <tr key={pos.ticket}>
                          <td className="py-2.5 px-3 text-slate-300">#{pos.ticket}</td>
                          <td className="py-2.5 px-3 font-bold text-white">{pos.symbol}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                pos.direction === 'BUY'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {pos.direction}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">{pos.volume}</td>
                          <td className="py-2.5 px-3">{pos.entry_price}</td>
                          <td className="py-2.5 px-3 text-rose-400">{pos.stop_loss}</td>
                          <td className="py-2.5 px-3 text-emerald-400">{pos.take_profit}</td>
                          <td
                            className={`py-2.5 px-3 font-bold ${
                              pos.floating_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {pos.floating_pnl >= 0 ? '+' : ''}${Number(pos.floating_pnl).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              onClick={() => handleCloseSinglePosition(pos.ticket)}
                              className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 text-[11px]"
                            >
                              Close
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== PAGE 3: STRATEGY CENTER ==================== */}
        {activeTab === 'strategy' && strategyConfig && (
          <div className="space-y-5">
            <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1d2538] pb-4 mb-5">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Multi-Strategy & Multi-Timeframe Configuration Center
                  </h2>
                  <p className="text-xs text-slate-400">
                    Configure ICT, SMC, FVG, POC Volume Profile, Breakout/Fakeout, Candlestick, Fibonacci, and MTF rules.
                  </p>
                </div>
                <button
                  onClick={handleSaveStrategyConfig}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Save Strategy Settings
                </button>
              </div>

              {/* Multi-Timeframe & Confluence Score Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-[#0b0e17] border border-[#1c2336]">
                  <label className="block text-xs font-semibold text-blue-400 mb-1.5">
                    Multi-Timeframe Trading Mode
                  </label>
                  <select
                    value={strategyConfig.trading_style}
                    onChange={(e) =>
                      setStrategyConfig({ ...strategyConfig, trading_style: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-white"
                  >
                    <option value="SCALPING">Scalping (HTF: 1H · Execution: 5M)</option>
                    <option value="DAY_TRADING">Day Trading (HTF: 4H · Execution: 15M)</option>
                    <option value="SWING">Swing Mode (HTF: Daily · Execution: 4H)</option>
                  </select>
                  <label className="flex items-center gap-2 mt-2.5 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(strategyConfig.swing_mode_enabled)}
                      onChange={(e) =>
                        setStrategyConfig({
                          ...strategyConfig,
                          swing_mode_enabled: e.target.checked,
                        })
                      }
                    />
                    Explicitly Enable Optional Swing Mode (D1/4H)
                  </label>
                </div>

                <div className="p-4 rounded-xl bg-[#0b0e17] border border-[#1c2336]">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-semibold text-purple-400">Minimum Confluence Score</span>
                    <span className="font-mono-num font-bold text-white">
                      {strategyConfig.min_confluence_score} / 100
                    </span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="90"
                    step="1"
                    value={strategyConfig.min_confluence_score}
                    onChange={(e) =>
                      setStrategyConfig({
                        ...strategyConfig,
                        min_confluence_score: Number(e.target.value),
                      })
                    }
                    className="w-full accent-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Confluence score reflects multi-factor alignment, never a guaranteed probability of winning.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#0b0e17] border border-[#1c2336]">
                  <label className="block text-xs font-semibold text-emerald-400 mb-1.5">
                    Trend & Volatility Filters (ADX / ATR)
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Min ADX Trend</span>
                      <input
                        type="number"
                        value={strategyConfig.filters?.min_adx_trend ?? 18}
                        onChange={(e) =>
                          setStrategyConfig({
                            ...strategyConfig,
                            filters: {
                              ...strategyConfig.filters,
                              min_adx_trend: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#121726] border border-[#252e47] text-white font-mono-num"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Min ATR (Pips)</span>
                      <input
                        type="number"
                        value={strategyConfig.filters?.min_atr_pips ?? 3.0}
                        onChange={(e) =>
                          setStrategyConfig({
                            ...strategyConfig,
                            filters: {
                              ...strategyConfig.filters,
                              min_atr_pips: Number(e.target.value),
                            },
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded bg-[#121726] border border-[#252e47] text-white font-mono-num"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Module Cards for the 7 Strategy Sub-Engines */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    key: 'ict',
                    title: 'A. ICT — Inner Circle Trader',
                    desc: 'BSL/SSL Liquidity Pools, Sweeps, Dealing Ranges, Premium/Discount, OTE & MSS.',
                    paramKey: 'displacement_atr_mult',
                    paramLabel: 'Displacement ATR Multiplier',
                  },
                  {
                    key: 'smc',
                    title: 'B. SMC — Smart Money Concepts',
                    desc: 'BOS, CHoCH, Validated Order Blocks (requiring displacement), Mitigation & Supply/Demand.',
                    paramKey: 'ob_max_age_bars',
                    paramLabel: 'Max Order Block Age (Bars)',
                  },
                  {
                    key: 'fvg',
                    title: 'C. Fair Value Gap (FVG) Engine',
                    desc: '3-Candle Bullish & Bearish Imbalances, Consequent Encroachment (50%) & Mitigation.',
                    paramKey: 'min_gap_atr_ratio',
                    paramLabel: 'Minimum FVG Gap / ATR Ratio',
                  },
                  {
                    key: 'volume_profile',
                    title: 'D. POC & Volume Profile',
                    desc: 'Proportional price-bin volume distribution, POC, VAH/VAL (70% Value Area), HVNs & LVNs.',
                    paramKey: 'num_bins',
                    paramLabel: 'Price Distribution Bins',
                  },
                  {
                    key: 'breakout',
                    title: 'E. Breakout & Fakeout Engine',
                    desc: 'Confirmed Range Breakouts, Break-and-Retest, and Liquidity Trap Fakeouts.',
                    paramKey: 'range_lookback',
                    paramLabel: 'Consolidation Range Lookback',
                  },
                  {
                    key: 'candlesticks',
                    title: 'F. Contextual Candlestick Engine',
                    desc: 'Engulfing, Pin Bars, Hammer/Shooting Star, Inside Bars, Momentum & Star Reversals.',
                    paramKey: 'pinbar_wick_ratio',
                    paramLabel: 'Pin Bar Wick-to-Body Ratio',
                  },
                  {
                    key: 'fibonacci',
                    title: 'G. Fibonacci Confluence Engine',
                    desc: 'Confirmed Swing Retracements (0.50, 0.618, 0.705, 0.786) aligned with OBs & FVGs.',
                    paramKey: 'zone_tolerance_atr',
                    paramLabel: 'Zone Tolerance (ATR Multiple)',
                  },
                ].map((mod) => {
                  const modCfg = strategyConfig[mod.key] || {};
                  return (
                    <div
                      key={mod.key}
                      className="p-4 rounded-xl bg-[#0b0e17] border border-[#1d2538] flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-white">{mod.title}</h4>
                          <input
                            type="checkbox"
                            checked={modCfg.enabled !== false}
                            onChange={(e) =>
                              setStrategyConfig({
                                ...strategyConfig,
                                [mod.key]: { ...modCfg, enabled: e.target.checked },
                              })
                            }
                            className="accent-blue-500"
                          />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{mod.desc}</p>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-1">
                          {mod.paramLabel}
                        </label>
                        <input
                          type="number"
                          step="0.05"
                          value={modCfg[mod.paramKey] ?? ''}
                          onChange={(e) =>
                            setStrategyConfig({
                              ...strategyConfig,
                              [mod.key]: {
                                ...modCfg,
                                [mod.paramKey]: Number(e.target.value),
                              },
                            })
                          }
                          className="w-full px-2.5 py-1.5 text-xs rounded bg-[#121726] border border-[#252e47] text-white font-mono-num"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAGE 4: RISK CENTER & $5 GUARD ==================== */}
        {activeTab === 'risk' && riskConfig && (
          <div className="space-y-5">
            {/* Risk Parameters Panel */}
            <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1d2538] pb-4 mb-5">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Un-Bypassable Risk Management Center
                  </h2>
                  <p className="text-xs text-slate-400">
                    Hard safety limits enforced on every trade. Strategy modules cannot bypass these controls.
                  </p>
                </div>
                <button
                  onClick={handleSaveRiskConfig}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Save Risk Limits
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { key: 'risk_per_trade_pct', label: 'Risk Per Trade (% of Equity)', step: '0.1' },
                  { key: 'max_daily_loss_pct', label: 'Max Daily Loss Limit (%)', step: '0.5' },
                  { key: 'max_overall_drawdown_pct', label: 'Max Overall Drawdown (%)', step: '0.5' },
                  { key: 'max_open_positions', label: 'Max Simultaneous Open Positions', step: '1' },
                  { key: 'max_consecutive_losses', label: 'Max Consecutive Losses', step: '1' },
                  { key: 'max_total_exposure_lots', label: 'Max Total Exposure (Lots)', step: '0.5' },
                  { key: 'max_margin_usage_pct', label: 'Max Margin Usage (% of Equity)', step: '1' },
                  { key: 'min_risk_reward_ratio', label: 'Minimum Risk:Reward Ratio', step: '0.1' },
                ].map((item) => (
                  <div key={item.key} className="p-3.5 rounded-xl bg-[#0b0e17] border border-[#1c2336]">
                    <label className="block text-xs text-slate-400 mb-1.5">{item.label}</label>
                    <input
                      type="number"
                      step={item.step}
                      value={riskConfig[item.key] ?? ''}
                      onChange={(e) =>
                        setRiskConfig({ ...riskConfig, [item.key]: Number(e.target.value) })
                      }
                      className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-white font-mono-num"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Small Account Compatibility ($5 Balance Validator — Section 10) */}
              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#1d2538] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Small Account Compatibility & $5.00 Risk Validator
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Evaluates minimum broker volume (0.01 lot), contract specs, commission, and stop distance.
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Section 10 Compliance
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Account Balance ($)</label>
                    <input
                      type="number"
                      step="1"
                      value={smallAcctBalance}
                      onChange={(e) => setSmallAcctBalance(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded bg-[#0b0e17] border border-[#252e47] text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Symbol</label>
                    <select
                      value={smallAcctSymbol}
                      onChange={(e) => setSmallAcctSymbol(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-[#0b0e17] border border-[#252e47] text-white"
                    >
                      <option value="EURUSD">EURUSD</option>
                      <option value="XAUUSD">XAUUSD</option>
                      <option value="GBPUSD">GBPUSD</option>
                      <option value="USDJPY">USDJPY</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Risk %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={smallAcctRiskPct}
                      onChange={(e) => setSmallAcctRiskPct(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded bg-[#0b0e17] border border-[#252e47] text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">SL Distance (Pips)</label>
                    <input
                      type="number"
                      step="1"
                      value={smallAcctSlPips}
                      onChange={(e) => setSmallAcctSlPips(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded bg-[#0b0e17] border border-[#252e47] text-white font-mono-num"
                    />
                  </div>
                </div>

                <button
                  onClick={handleEvaluateSmallAccount}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold"
                >
                  Evaluate Account Feasibility
                </button>

                {smallAcctResult && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                      smallAcctResult.approved
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}
                  >
                    <div className="flex justify-between font-mono-num">
                      <span>Permitted Risk Budget: <strong>${smallAcctResult.risk_budget_usd}</strong></span>
                      <span>Min Lot (0.01) Risk: <strong>${smallAcctResult.min_lot_risk_usd}</strong></span>
                      <span>Approved Lot Size: <strong>{smallAcctResult.lot_size} lots</strong></span>
                    </div>
                    {smallAcctResult.rejections?.map((r: string, idx: number) => (
                      <div key={idx} className="font-semibold flex items-start gap-1.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Explicit Live Execution Authorization Gate (Section 13 & Stage 6) */}
              <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[#1d2538] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Explicit Live Automated Trading Authorization Gate
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Live trading is disabled by default. Never switches from Demo to Live automatically.
                    </p>
                  </div>
                  <span
                    className={`text-[10px] px-2.5 py-1 rounded font-bold ${
                      overview?.live_trading_authorized
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {overview?.live_trading_authorized ? 'LIVE AUTHORIZED' : 'LIVE LOCKED (SAFE)'}
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ackDemoTested}
                      onChange={(e) => setAckDemoTested(e.target.checked)}
                    />
                    I have validated strategy & risk behavior on a Demo account / Backtest first.
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ackRisk}
                      onChange={(e) => setAckRisk(e.target.checked)}
                    />
                    I understand leveraged FX/CFD trading carries real risk of loss and no profit is guaranteed.
                  </label>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Type <code className="text-amber-300">ENABLE LIVE TRADING</code> to unlock:
                    </label>
                    <input
                      type="text"
                      value={livePhrase}
                      onChange={(e) => setLivePhrase(e.target.value)}
                      placeholder="ENABLE LIVE TRADING"
                      className="w-full px-3 py-2 rounded-lg bg-[#0b0e17] border border-[#252e47] text-white font-mono-num"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleAuthorizeLive}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                    >
                      Authorize Live Execution
                    </button>
                    {overview?.live_trading_authorized && (
                      <button
                        onClick={async () => {
                          await api.revokeLive();
                          await loadAllData();
                        }}
                        className="px-4 py-2 rounded-lg bg-rose-600/25 border border-rose-500/40 text-rose-200 font-semibold"
                      >
                        Revoke Live Authorization
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== PAGE 5: BACKTESTING ==================== */}
        {activeTab === 'backtest' && (
          <div className="space-y-5">
            {/* Backtest Controls */}
            <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1d2538] pb-4 mb-4">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Zero Look-Ahead Historical Backtesting & Walk-Forward Validation
                  </h2>
                  <p className="text-xs text-slate-400">
                    Models spread, round-trip commission, overnight swap, slippage, and broker minimum volume rules.
                  </p>
                </div>
                <button
                  onClick={handleRunBacktest}
                  disabled={btRunning}
                  className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-blue-600/20"
                >
                  {btRunning ? 'Running Bar-by-Bar Simulation...' : 'Run Backtest'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Symbol</label>
                  <select
                    value={btSymbol}
                    onChange={(e) => setBtSymbol(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#0b0e17] border border-[#252e47] text-white"
                  >
                    <option value="EURUSD">EURUSD</option>
                    <option value="XAUUSD">XAUUSD</option>
                    <option value="GBPUSD">GBPUSD</option>
                    <option value="USDJPY">USDJPY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Timeframe</label>
                  <select
                    value={btTimeframe}
                    onChange={(e) => setBtTimeframe(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#0b0e17] border border-[#252e47] text-white"
                  >
                    <option value="M5">M5 (Scalping)</option>
                    <option value="M15">M15 (Day Trading)</option>
                    <option value="H1">H1 (Intraday)</option>
                    <option value="H4">H4 (Swing)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Strategy Mode</label>
                  <select
                    value={btStrategyMode}
                    onChange={(e) => setBtStrategyMode(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#0b0e17] border border-[#252e47] text-white"
                  >
                    <option value="ALL_CONFLUENCE">All 8 Modules Confluence</option>
                    <option value="ICT_SMC_CORE">ICT + SMC + FVG Focus</option>
                    <option value="VOLUME_BREAKOUT">POC + Breakout Focus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Historical Bars</label>
                  <input
                    type="number"
                    min="80"
                    max="1000"
                    value={btBars}
                    onChange={(e) => setBtBars(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#0b0e17] border border-[#252e47] text-white font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Initial Balance ($)</label>
                  <input
                    type="number"
                    value={btInitialBalance}
                    onChange={(e) => setBtInitialBalance(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#0b0e17] border border-[#252e47] text-white font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Spread (Pips)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={btSpreadPips}
                    onChange={(e) => setBtSpreadPips(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#0b0e17] border border-[#252e47] text-white font-mono-num"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Commission ($/Lot)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={btCommission}
                    onChange={(e) => setBtCommission(Number(e.target.value))}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#0b0e17] border border-[#252e47] text-white font-mono-num"
                  />
                </div>
              </div>
            </div>

            {backtestReport && (
              <>
                {/* Warnings & Sample-Size Honesty Notice */}
                {backtestReport.warnings?.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                    {backtestReport.warnings.map((w: string, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Backtest Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                  <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-3.5">
                    <span className="text-[10px] text-slate-400 block">Net Result (After Costs)</span>
                    <span
                      className={`text-sm font-bold font-mono-num ${
                        backtestReport.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {backtestReport.net_profit >= 0 ? '+' : ''}${backtestReport.net_profit} (
                      {backtestReport.net_return_pct}%)
                    </span>
                  </div>
                  <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-3.5">
                    <span className="text-[10px] text-slate-400 block">Max Drawdown</span>
                    <span className="text-sm font-bold font-mono-num text-amber-300">
                      {backtestReport.max_drawdown_pct}% (${backtestReport.max_drawdown_usd})
                    </span>
                  </div>
                  <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-3.5">
                    <span className="text-[10px] text-slate-400 block">Win Rate</span>
                    <span className="text-sm font-bold font-mono-num text-white">
                      {backtestReport.win_rate_pct}%
                    </span>
                  </div>
                  <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-3.5">
                    <span className="text-[10px] text-slate-400 block">Profit Factor</span>
                    <span className="text-sm font-bold font-mono-num text-blue-300">
                      {backtestReport.profit_factor}
                    </span>
                  </div>
                  <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-3.5">
                    <span className="text-[10px] text-slate-400 block">Total Trades</span>
                    <span className="text-sm font-bold font-mono-num text-white">
                      {backtestReport.total_trades} ({backtestReport.winning_trades}W / {backtestReport.losing_trades}L)
                    </span>
                  </div>
                  <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-3.5">
                    <span className="text-[10px] text-slate-400 block">Average Win / Loss</span>
                    <span className="text-xs font-bold font-mono-num text-slate-200">
                      +${backtestReport.average_win_usd} / ${backtestReport.average_loss_usd}
                    </span>
                  </div>
                  <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-3.5">
                    <span className="text-[10px] text-slate-400 block">In-Sample (70%)</span>
                    <span className="text-xs font-bold font-mono-num text-blue-300">
                      {backtestReport.in_sample?.trades} tr · ${backtestReport.in_sample?.net_profit}
                    </span>
                  </div>
                  <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-3.5">
                    <span className="text-[10px] text-slate-400 block">Out-of-Sample (30%)</span>
                    <span className="text-xs font-bold font-mono-num text-purple-300">
                      {backtestReport.out_of_sample?.trades} tr · ${backtestReport.out_of_sample?.net_profit}
                    </span>
                  </div>
                </div>

                {/* Equity Curve Chart */}
                <EquityCurveChart
                  curve={backtestReport.equity_curve || []}
                  initialBalance={backtestReport.initial_balance || 10000}
                />

                {/* Modeled Backtest Trades List */}
                <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white">
                      Modeled Backtest Execution Log ({backtestReport.trades?.length || 0} Trades)
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      {backtestReport.execution_disclaimer}
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs text-left">
                      <thead className="text-slate-400 border-b border-[#1d2538]">
                        <tr>
                          <th className="py-2 px-2">#</th>
                          <th className="py-2 px-2">Segment</th>
                          <th className="py-2 px-2">Direction</th>
                          <th className="py-2 px-2">Lots</th>
                          <th className="py-2 px-2">Entry</th>
                          <th className="py-2 px-2">Exit</th>
                          <th className="py-2 px-2">Exit Reason</th>
                          <th className="py-2 px-2">Commission</th>
                          <th className="py-2 px-2">Net P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#181f30] font-mono-num">
                        {backtestReport.trades?.map((t: any) => (
                          <tr key={t.ticket}>
                            <td className="py-2 px-2 text-slate-400">#{t.ticket}</td>
                            <td className="py-2 px-2">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  t.sample_segment === 'OUT_OF_SAMPLE'
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : 'bg-blue-500/15 text-blue-300'
                                }`}
                              >
                                {t.sample_segment}
                              </span>
                            </td>
                            <td className="py-2 px-2 font-bold">{t.direction}</td>
                            <td className="py-2 px-2">{t.volume}</td>
                            <td className="py-2 px-2">{t.entry_price}</td>
                            <td className="py-2 px-2">{t.exit_price}</td>
                            <td className="py-2 px-2 text-slate-300">{t.exit_reason}</td>
                            <td className="py-2 px-2 text-slate-400">-${t.commission}</td>
                            <td
                              className={`py-2 px-2 font-bold ${
                                t.realized_pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {t.realized_pnl >= 0 ? '+' : ''}${t.realized_pnl}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ==================== PAGE 6: TRADE HISTORY ==================== */}
        {activeTab === 'history' && (
          <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1d2538] pb-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  Executed Trade History & Reconciliation Ledger
                </h2>
                <p className="text-xs text-slate-400">
                  Records only actual executed MT5 / Paper Harness orders — never fabricated trades.
                </p>
              </div>
              <button
                onClick={loadAllData}
                className="px-3 py-1.5 rounded-lg bg-[#171e30] text-slate-200 text-xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Ledger
              </button>
            </div>

            {tradeHistory.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No executed trades in ledger yet. Connect to MT5 or activate the Offline Demo Test Harness and execute a signal to record trades.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-slate-400 border-b border-[#1d2538]">
                    <tr>
                      <th className="py-2.5 px-3">Ticket</th>
                      <th className="py-2.5 px-3">Symbol</th>
                      <th className="py-2.5 px-3">Direction</th>
                      <th className="py-2.5 px-3">Volume</th>
                      <th className="py-2.5 px-3">Entry Price</th>
                      <th className="py-2.5 px-3">Exit Price</th>
                      <th className="py-2.5 px-3">Entry Time</th>
                      <th className="py-2.5 px-3">Exit Time</th>
                      <th className="py-2.5 px-3">Commission / Swap</th>
                      <th className="py-2.5 px-3">Realized P&L</th>
                      <th className="py-2.5 px-3">Strategy / Source</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#181f30] font-mono-num">
                    {tradeHistory.map((t: any) => (
                      <tr key={t.ticket}>
                        <td className="py-2.5 px-3 text-slate-300">#{t.ticket}</td>
                        <td className="py-2.5 px-3 font-bold text-white">{t.symbol}</td>
                        <td className="py-2.5 px-3">{t.direction}</td>
                        <td className="py-2.5 px-3">{t.volume}</td>
                        <td className="py-2.5 px-3">{t.entry_price}</td>
                        <td className="py-2.5 px-3">{t.exit_price ?? '—'}</td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">
                          {t.entry_time?.slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-400">
                          {t.exit_time ? t.exit_time.slice(0, 19).replace('T', ' ') : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          ${Number(t.commission || 0).toFixed(2)} / ${Number(t.swap || 0).toFixed(2)}
                        </td>
                        <td
                          className={`py-2.5 px-3 font-bold ${
                            Number(t.realized_pnl) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {Number(t.realized_pnl) >= 0 ? '+' : ''}${Number(t.realized_pnl || 0).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {t.strategy_tag} ({t.execution_source})
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px]">
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================== PAGE 7: LOGS & DIAGNOSTICS ==================== */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-5">
            {/* Mandatory Error-Handling Scenario Tester (Section 15) */}
            <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1d2538] pb-3">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Mandatory Safety & Error-Handling Verification Suite (Section 15)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Trigger any fault condition below to verify that 2REAL AI TRADER fails safely without retrying or duplicating orders.
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  SQLite DB Healthy: {overview?.db_healthy ? 'YES (WAL Mode)' : 'ERROR'}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'SMALL_ACCOUNT_5_USD', label: 'Test $5 Small Account Rejection' },
                  { id: 'STALE_PRICES', label: 'Test Stale Price Feed Suspension' },
                  { id: 'DUPLICATE_ORDER', label: 'Test Duplicate Order Prevention' },
                  { id: 'MARKET_CLOSED', label: 'Test Market Closed (10018)' },
                  { id: 'SYMBOL_UNAVAILABLE', label: 'Test Symbol Unavailable' },
                  { id: 'INVALID_VOLUME', label: 'Test Invalid Volume (10014)' },
                  { id: 'INVALID_STOPS', label: 'Test Invalid Stop Loss (10016)' },
                  { id: 'INSUFFICIENT_MARGIN', label: 'Test Insufficient Margin (10019)' },
                  { id: 'ORDER_REJECTED', label: 'Test Broker Rejection (10006)' },
                  { id: 'ORDER_TIMEOUT', label: 'Test Order Timeout Safe Handling' },
                ].map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => handleRunErrorScenario(sc.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#161c2e] hover:bg-blue-600/25 border border-[#273252] hover:border-blue-500/50 text-xs text-slate-200 transition"
                  >
                    {sc.label}
                  </button>
                ))}
              </div>

              {scenarioResult && (
                <div className="p-3.5 rounded-xl bg-[#0b0e17] border border-blue-500/30 text-xs font-mono-num text-blue-200 overflow-x-auto">
                  <div className="font-bold text-emerald-400 mb-1">
                    ✓ Scenario Verified Safely: {scenarioResult.scenario}
                  </div>
                  <pre className="text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(scenarioResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Diagnostic Event Stream */}
            <div className="bg-[#10141f] border border-[#1e263b] rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-white">
                  System Diagnostic & Audit Logs ({diagnosticLogs.length})
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'ALL',
                    'MT5_CONNECTION',
                    'RISK_REJECTION',
                    'INVALID_VOLUME',
                    'BROKER_REJECTION',
                    'STRATEGY_DECISION',
                    'DATA_FRESHNESS',
                    'SYSTEM_STATUS',
                  ].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setLogCategoryFilter(cat)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                        logCategoryFilter === cat
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#161c2e] text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {diagnosticLogs.map((log: any) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg bg-[#0b0e17] border border-[#1a2236] text-xs flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.level === 'ERROR'
                              ? 'bg-rose-500/20 text-rose-300'
                              : log.level === 'WARNING'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {log.level}
                        </span>
                        <span className="text-[11px] font-semibold text-purple-300">
                          [{log.category}]
                        </span>
                        {log.symbol && (
                          <span className="text-[11px] font-bold text-white">{log.symbol}</span>
                        )}
                      </div>
                      <div className="text-slate-200">{log.message}</div>
                    </div>
                    <span className="text-[10px] font-mono-num text-slate-400 shrink-0">
                      {log.timestamp?.slice(0, 19).replace('T', ' ')} UTC
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Connection Setup Wizard Modal */}
      <SetupWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        overview={overview}
        strategyConfig={strategyConfig}
        riskConfig={riskConfig}
        onRefresh={loadAllData}
      />
    </div>
  );
}

export default App;
