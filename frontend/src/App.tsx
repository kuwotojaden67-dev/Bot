import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  Play,
  Pause,
  Square,
  Sliders,
  BarChart3,
  History,
  Terminal,
  Lock,
  Unlock,
  AlertOctagon,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Layers,
  TrendingUp,
  Cpu,
  Wifi,
  WifiOff,
  BookOpen,
  Sparkles,
  Compass,
  Zap,
} from 'lucide-react';
import { api } from './services/api';
import { PriceChart } from './components/PriceChart';
import { EquityChart } from './components/EquityChart';
import { SYMBOL_SPECS, TRADING_KNOWLEDGE_ENCYCLOPEDIA } from './services/tradingKnowledgeEngine';

type TabKey =
  | 'overview'
  | 'knowledge'
  | 'setup'
  | 'strategy'
  | 'risk'
  | 'backtest'
  | 'trades'
  | 'diagnostics';

const ALL_SYMBOLS = Object.keys(SYMBOL_SPECS);
const ALL_TIMEFRAMES = ['M5', 'M15', 'H1', 'H4', 'D1'];

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('EURUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('M15');
  const [symbolAnalysis, setSymbolAnalysis] = useState<any>(null);
  const [strategyConfig, setStrategyConfig] = useState<any>(null);
  const [riskConfig, setRiskConfig] = useState<any>(null);
  const [tradesHistory, setTradesHistory] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilter, setLogFilter] = useState<string>('ALL');
  const [selectedKnowledgeId, setSelectedKnowledgeId] = useState<string>('ict');

  // Connection Wizard form
  const [connForm, setConnForm] = useState({
    broker: 'ICMarkets / Pepperstone / FTMO',
    server: 'MetaQuotes-Demo',
    login: 10054821,
    password: '',
    terminal_path: 'C:\\Program Files\\MetaTrader 5\\terminal64.exe',
    trading_mode: 'DEMO',
    save_in_vault: true,
    use_saved_password: false,
    use_ea_bridge: false,
  });
  const [connMessage, setConnMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Small Account ($5) Simulator State
  const [smallAcctForm, setSmallAcctForm] = useState({
    balance_usd: 5.0,
    leverage: 100,
    symbol: 'EURUSD',
    risk_per_trade_pct: 0.5,
    stop_loss_pips: 15.0,
  });
  const [smallAcctResult, setSmallAcctResult] = useState<any>(null);

  // Backtest Form & Results
  const [btForm, setBtForm] = useState({
    symbol: 'EURUSD',
    timeframe: 'M15',
    bars: 260,
    initial_balance: 10000,
    spread_pips: 1.0,
    commission_per_lot_usd: 7.0,
    slippage_pips: 0.3,
  });
  const [btResult, setBtResult] = useState<any>(null);
  const [btLoading, setBtLoading] = useState(false);

  // Modals / Confirmations
  const [showLiveModal, setShowLiveModal] = useState(false);
  const [livePhrase, setLivePhrase] = useState('');
  const [liveAckRisk, setLiveAckRisk] = useState(false);
  const [liveAckDemo, setLiveAckDemo] = useState(false);
  const [confirmCloseAll, setConfirmCloseAll] = useState(false);
  const [executionFeedback, setExecutionFeedback] = useState<string | null>(null);

  const loadSymbolAnalysis = useCallback(
    async (sym: string, tf?: string) => {
      try {
        const res = await api.getSymbolAnalysis(sym, tf || selectedTimeframe);
        setSymbolAnalysis(res);
      } catch (e) {
        console.error('Failed loading symbol analysis', e);
      }
    },
    [selectedTimeframe],
  );

  const loadAll = useCallback(async () => {
    try {
      const ov = await api.bootstrap();
      setOverview(ov);
      if (ov?.vault_profile?.has_saved_credentials) {
        setConnForm((prev) => ({
          ...prev,
          broker: ov.vault_profile.broker || prev.broker,
          server: ov.vault_profile.server || prev.server,
          login: ov.vault_profile.login || prev.login,
          terminal_path: ov.vault_profile.terminal_path || prev.terminal_path,
          trading_mode: ov.vault_profile.trading_mode || prev.trading_mode,
          use_saved_password: true,
        }));
      }
      const [strat, risk, tr, lg, sa] = await Promise.all([
        api.getStrategyConfig(),
        api.getRiskConfig(),
        api.getTradeHistory(),
        api.getDiagnosticLogs('ALL'),
        api.evaluateSmallAccount({
          balance_usd: 5.0,
          leverage: 100,
          symbol: 'EURUSD',
          risk_per_trade_pct: 0.5,
          stop_loss_pips: 15.0,
        }),
      ]);
      setStrategyConfig(strat);
      setRiskConfig(risk);
      setTradesHistory(tr.trades || []);
      setLogs(lg.logs || []);
      setSmallAcctResult(sa);
      await loadSymbolAnalysis('EURUSD', 'M15');
    } catch (err) {
      console.error('Bootstrap error:', err);
    }
  }, [loadSymbolAnalysis]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // WebSocket live stream
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/live`;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'LIVE_OVERVIEW' && msg.data) {
            setOverview(msg.data);
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // fallback polling
    }
    const timer = setInterval(async () => {
      try {
        const ov = await api.getOverview();
        setOverview(ov);
      } catch {
        // ignore
      }
    }, 5000);
    return () => {
      if (ws) ws.close();
      clearInterval(timer);
    };
  }, []);

  const handleSelectSymbolAndTimeframe = async (sym: string, tf: string = selectedTimeframe) => {
    setSelectedSymbol(sym);
    setSelectedTimeframe(tf);
    await loadSymbolAnalysis(sym, tf);
  };

  const handleConnectMT5 = async (e: React.FormEvent) => {
    e.preventDefault();
    setConnMessage(null);
    try {
      const res = await api.connectMT5(connForm);
      const ov = await api.getOverview();
      setOverview(ov);
      setConnForm((p) => ({ ...p, password: '' }));
      if (res.connection?.is_connected) {
        setConnMessage({
          type: 'ok',
          text: `Connected to ${res.connection.broker} (${res.connection.server}).`,
        });
      } else {
        setConnMessage({
          type: 'err',
          text: `${res.connection?.last_error_code}: ${res.connection?.last_error_message}`,
        });
      }
    } catch (err: any) {
      setConnMessage({ type: 'err', text: err.message });
    }
  };

  const handleEnablePaperHarness = async (balance: number = 10000) => {
    setConnMessage(null);
    try {
      await api.enablePaperHarness({ initial_balance: balance, leverage: 100, currency: 'USD' });
      const ov = await api.getOverview();
      setOverview(ov);
      await loadSymbolAnalysis(selectedSymbol, selectedTimeframe);
      setConnMessage({
        type: 'ok',
        text:
          balance <= 10
            ? `Activated $${balance.toFixed(2)} Micro-Account Harness! Notice how the Un-Bypassable Risk Engine automatically blocks unsafe 0.01 lot entries.`
            : `Activated Interactive Demo Test Harness ($${balance.toLocaleString()} balance, 1:100 leverage).`,
      });
    } catch (err: any) {
      setConnMessage({ type: 'err', text: err.message });
    }
  };

  const handleDisconnect = async (forget: boolean) => {
    try {
      await api.disconnectMT5(forget);
      const ov = await api.getOverview();
      setOverview(ov);
      setConnMessage({
        type: 'ok',
        text: forget
          ? 'Disconnected and wiped encrypted credentials from vault.'
          : 'Disconnected from session.',
      });
    } catch (err: any) {
      setConnMessage({ type: 'err', text: err.message });
    }
  };

  const handleBotControl = async (action: 'START' | 'PAUSE' | 'STOP', mode: string = 'DEMO_AUTO') => {
    setExecutionFeedback(null);
    try {
      await api.controlBot(action, mode);
      const ov = await api.getOverview();
      setOverview(ov);
      setExecutionFeedback(`Bot status updated: ${action} (${mode})`);
    } catch (err: any) {
      setExecutionFeedback(`Bot Control Error: ${err.message}`);
    }
  };

  const handleEvaluateAndExecute = async (autoExecute: boolean) => {
    setExecutionFeedback(null);
    try {
      const res = await api.evaluateAndExecute(selectedSymbol, autoExecute);
      await loadSymbolAnalysis(selectedSymbol, selectedTimeframe);
      const [ov, tr, lg] = await Promise.all([
        api.getOverview(),
        api.getTradeHistory(),
        api.getDiagnosticLogs(logFilter),
      ]);
      setOverview(ov);
      setTradesHistory(tr.trades || []);
      setLogs(lg.logs || []);
      if (autoExecute) {
        if (res.execution?.executed) {
          setExecutionFeedback(
            `Order Executed: ${res.signal.action} ${res.signal.lot_size} lots ${selectedSymbol} @ ${res.signal.entry_price} (Ticket #${res.execution.ticket})`,
          );
        } else {
          setExecutionFeedback(
            `Execution Blocked/Skipped: ${res.execution?.message || res.signal?.rejections?.join(', ') || 'Signal is WAIT'}`,
          );
        }
      } else {
        setExecutionFeedback(
          `8-Module Signal Evaluated for ${selectedSymbol} (${selectedTimeframe}): ${res.signal.action} (Score ${res.signal.score}/100)`,
        );
      }
    } catch (err: any) {
      setExecutionFeedback(`Error: ${err.message}`);
    }
  };

  const handleEmergencyStop = async (active: boolean, closeAll: boolean) => {
    try {
      await api.setEmergencyStop({
        active,
        close_existing_positions: closeAll,
        confirmed: true,
      });
      const ov = await api.getOverview();
      setOverview(ov);
      await loadSymbolAnalysis(selectedSymbol, selectedTimeframe);
      setExecutionFeedback(
        active
          ? 'EMERGENCY KILL-SWITCH ENGAGED: All new entries blocked.'
          : 'Emergency Stop disengaged.',
      );
    } catch (err: any) {
      setExecutionFeedback(`Emergency Stop Error: ${err.message}`);
    }
  };

  const handleClosePosition = async (ticket?: number) => {
    try {
      await api.closePositions({ confirmed: true, ticket });
      setConfirmCloseAll(false);
      const [ov, tr] = await Promise.all([api.getOverview(), api.getTradeHistory()]);
      setOverview(ov);
      setTradesHistory(tr.trades || []);
      setExecutionFeedback(ticket ? `Closed position #${ticket}.` : 'Closed all open positions.');
    } catch (err: any) {
      setExecutionFeedback(`Close Position Error: ${err.message}`);
    }
  };

  const handleRunBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setBtLoading(true);
    try {
      const res = await api.runBacktest(btForm);
      setBtResult(res);
    } catch (err: any) {
      alert(`Backtest error: ${err.message}`);
    } finally {
      setBtLoading(false);
    }
  };

  const handleSmallAccountCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.evaluateSmallAccount(smallAcctForm);
    setSmallAcctResult(res);
  };

  const conn = overview?.connection;
  const acct = overview?.account;
  const sig = symbolAnalysis?.signal;
  const activeKnowledge =
    TRADING_KNOWLEDGE_ENCYCLOPEDIA.find((k) => k.id === selectedKnowledgeId) ||
    TRADING_KNOWLEDGE_ENCYCLOPEDIA[0];

  return (
    <div className="min-h-screen flex flex-col text-slate-100">
      {/* Top Institutional Command Header */}
      <header className="sticky top-0 z-30 bg-[#050914]/90 backdrop-blur-xl border-b border-slate-800/80 px-5 py-3">
        <div className="max-w-[1640px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-cyan-500/25 border border-cyan-400/30">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-wider text-white">
                  2REAL AI TRADER
                </h1>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold">
                  v2.5 QUANT PRO
                </span>
                <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  <Sparkles className="w-3 h-3" /> 8-Module Confluence Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                ICT • SMC • FVG • True Price-Bin POC • Breakout • Candlesticks • Fib OTE • Un-Bypassable Risk Guard
              </p>
            </div>
          </div>

          {/* Live Status Indicators & Emergency Kill Switch */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Connection Badge */}
            <div
              onClick={() => setActiveTab('setup')}
              className={`cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                conn?.is_real_mt5_terminal
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : conn?.is_paper_harness
                  ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                  : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
              }`}
            >
              {conn?.is_connected ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              <span>
                {conn?.is_real_mt5_terminal
                  ? `MT5 Live IPC: ${conn.server}`
                  : conn?.is_paper_harness
                  ? 'Demo Quant Harness Active'
                  : 'MT5 Disconnected (Click to Setup)'}
              </span>
            </div>

            {/* Session Badge */}
            <div className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-900/90 border border-slate-800 text-slate-300">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              <span>{overview?.market_session || 'LONDON / NY SESSION'}</span>
            </div>

            {/* Live Trading Lock Status */}
            <button
              onClick={() => setShowLiveModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                overview?.live_trading_authorized
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              {overview?.live_trading_authorized ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-rose-400" />
                  <span>LIVE UNLOCKED</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>LIVE LOCKED (SAFE)</span>
                </>
              )}
            </button>

            {/* Emergency Kill Switch */}
            {overview?.emergency_stop_active ? (
              <button
                onClick={() => handleEmergencyStop(false, false)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition cursor-pointer"
              >
                <AlertOctagon className="w-4 h-4" />
                RESET EMERGENCY STOP
              </button>
            ) : (
              <button
                onClick={() => handleEmergencyStop(true, true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition cursor-pointer"
              >
                <AlertOctagon className="w-4 h-4" />
                EMERGENCY STOP
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Multi-Asset Institutional Live Quote Ticker Strip */}
      <div className="bg-[#070c18] border-b border-slate-800/80 px-5 py-2 overflow-x-auto">
        <div className="max-w-[1640px] mx-auto flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mr-1 shrink-0">
            INSTITUTIONAL WATCHLIST:
          </span>
          {ALL_SYMBOLS.map((sym) => {
            const q = overview?.quotes?.[sym];
            const spec = SYMBOL_SPECS[sym];
            const isSelected = selectedSymbol === sym;
            return (
              <button
                key={sym}
                onClick={() => handleSelectSymbolAndTimeframe(sym, selectedTimeframe)}
                className={`flex items-center gap-2.5 px-3 py-1 rounded-lg text-xs font-mono border transition shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-white shadow-sm shadow-cyan-500/10'
                    : 'bg-slate-900/70 border-slate-800/90 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span className="font-bold text-cyan-400">{sym}</span>
                <span className="text-slate-200">
                  {q ? q.bid.toFixed(spec.digits) : spec.base_price.toFixed(spec.digits)}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                  {q ? q.spread_pips : spec.typical_spread_pips}p
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation Bar */}
      <nav className="bg-[#080d1a]/90 border-b border-slate-800/80 px-5">
        <div className="max-w-[1640px] mx-auto flex items-center gap-1 overflow-x-auto">
          {[
            { id: 'overview', label: 'Trading Terminal & Chart', icon: Activity },
            { id: 'knowledge', label: 'Trading Knowledge & Blueprints (All 8)', icon: BookOpen },
            { id: 'setup', label: 'MT5 Connection Wizard', icon: Wifi },
            { id: 'strategy', label: '8-Module Strategy Center', icon: Layers },
            { id: 'risk', label: 'Risk Engine & $5 Guard', icon: ShieldCheck },
            { id: 'backtest', label: 'Zero-Lookahead Backtester', icon: BarChart3 },
            { id: 'trades', label: 'Positions & Ledger', icon: History },
            { id: 'diagnostics', label: 'Diagnostics & Error Harness', icon: Terminal },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as TabKey)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Feedback Banner */}
      {executionFeedback && (
        <div className="bg-cyan-950/80 border-b border-cyan-500/40 px-5 py-2 text-xs text-cyan-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            <span>{executionFeedback}</span>
          </div>
          <button
            onClick={() => setExecutionFeedback(null)}
            className="text-cyan-400 hover:text-white font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1640px] w-full mx-auto p-5 space-y-5">
        {/* ================= TAB 1: OVERVIEW & LIVE TERMINAL ================= */}
        {activeTab === 'overview' && (
          <>
            {/* Honest Disconnected Banner with Instant Demo Harness Action */}
            {!conn?.is_connected && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                    <ShieldAlert className="w-4 h-4" />
                    <span>
                      MetaTrader 5 Desktop Terminal Not Attached ({conn?.last_error_code || 'DISCONNECTED'})
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 max-w-4xl">
                    2REAL AI TRADER never fabricates fake broker connections. Connect your local MT5 terminal in the Setup Wizard, or activate the{' '}
                    <strong className="text-cyan-300">Interactive Quant Harness ($10,000 or $5 Micro-Account)</strong>{' '}
                    to test all 8 strategy modules, confluence scoring, and risk protection right now.
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => handleEnablePaperHarness(10000)}
                    className="px-3.5 py-2 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition cursor-pointer shadow-lg shadow-cyan-500/20"
                  >
                    Activate $10,000 Demo Harness
                  </button>
                  <button
                    onClick={() => handleEnablePaperHarness(5)}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition cursor-pointer"
                  >
                    Test $5.00 Micro Account Guard
                  </button>
                </div>
              </div>
            )}

            {/* Account Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                {
                  label: 'Account Balance',
                  value: acct ? `$${acct.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—',
                  sub: acct ? `${acct.currency} • 1:${acct.leverage}` : 'Disconnected',
                },
                {
                  label: 'Live Equity',
                  value: acct ? `$${acct.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—',
                  sub: acct ? `Mode: ${conn?.trading_mode}` : 'No Feed',
                },
                {
                  label: 'Floating P&L',
                  value: acct ? `${acct.floating_pnl >= 0 ? '+' : ''}$${acct.floating_pnl.toFixed(2)}` : '—',
                  color: acct
                    ? acct.floating_pnl >= 0
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                    : 'text-slate-300',
                  sub: `${overview?.open_positions?.length || 0} Open Positions`,
                },
                {
                  label: 'Used / Free Margin',
                  value: acct ? `$${acct.margin.toFixed(2)}` : '—',
                  sub: acct ? `Free: $${acct.free_margin.toFixed(2)}` : '—',
                },
                {
                  label: 'Today Realized P&L',
                  value:
                    overview?.today_realized_pnl !== undefined
                      ? `${overview.today_realized_pnl >= 0 ? '+' : ''}$${overview.today_realized_pnl.toFixed(2)}`
                      : '$0.00',
                  color:
                    (overview?.today_realized_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400',
                  sub: `Max Daily Cap: ${riskConfig?.max_daily_loss_pct || 2.0}%`,
                },
                {
                  label: 'Current Drawdown',
                  value: `${overview?.current_drawdown_pct || 0}%`,
                  sub: `Hard Cap: ${riskConfig?.max_overall_drawdown_pct || 5.0}%`,
                },
                {
                  label: 'Selected Timeframe',
                  value: `${selectedSymbol} (${selectedTimeframe})`,
                  sub: `HTF Bias: ${sig?.htf_bias || 'NEUTRAL'} (${sig?.htf_timeframe || 'H4'})`,
                },
                {
                  label: 'Bot Execution Engine',
                  value: overview?.bot_state?.status || 'STOPPED',
                  color: overview?.bot_state?.status?.startsWith('RUNNING')
                    ? 'text-emerald-400'
                    : 'text-amber-300',
                  sub: `Mode: ${overview?.bot_state?.execution_mode || 'SIGNAL_ONLY'}`,
                },
              ].map((m, idx) => (
                <div key={idx} className="quant-card quant-card-interactive rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">{m.label}</div>
                  <div className={`text-base font-bold font-mono mt-1 ${m.color || 'text-white'}`}>
                    {m.value}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 truncate">{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Bot Execution Control Bar + Symbol & Timeframe Selector */}
            <div className="quant-card rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 mr-1">Bot Controls:</span>
                <button
                  onClick={() => handleBotControl('START', 'SIGNAL_ONLY')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" /> Start Signal-Only
                </button>
                <button
                  onClick={() => handleBotControl('START', 'DEMO_AUTO')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" /> Start Demo Auto-Trader
                </button>
                <button
                  onClick={() => handleBotControl('PAUSE', overview?.bot_state?.execution_mode || 'DEMO_AUTO')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause Bot
                </button>
                <button
                  onClick={() => handleBotControl('STOP', 'SIGNAL_ONLY')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" /> Stop Bot
                </button>
              </div>

              {/* Timeframe & Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-slate-950/90 p-1 rounded-lg border border-slate-800">
                  {ALL_TIMEFRAMES.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => handleSelectSymbolAndTimeframe(selectedSymbol, tf)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-bold transition cursor-pointer ${
                        selectedTimeframe === tf
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => handleEvaluateAndExecute(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Scan Confluence
                </button>
                <button
                  onClick={() => handleEvaluateAndExecute(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white transition cursor-pointer shadow-lg shadow-cyan-500/20"
                >
                  <TrendingUp className="w-3.5 h-3.5" /> Execute If Approved
                </button>
              </div>
            </div>

            {/* Chart + 8-Module Confluence Breakdown Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left 8 cols: Price Chart + Open Positions */}
              <div className="lg:col-span-8 space-y-4">
                <PriceChart
                  symbol={selectedSymbol}
                  timeframe={symbolAnalysis?.timeframe || selectedTimeframe}
                  candles={symbolAnalysis?.candles || []}
                  overlays={sig?.chart_overlays}
                  volumeBins={sig?.module_details?.volume_profile?.bins}
                  entryPrice={sig?.entry_price}
                  stopLoss={sig?.stop_loss}
                  takeProfit={sig?.take_profit}
                />

                {/* Active Open Positions Table */}
                <div className="quant-card rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-400" />
                      Active Open Positions ({overview?.open_positions?.length || 0})
                    </h3>
                    {(overview?.open_positions?.length || 0) > 0 && (
                      <div>
                        {confirmCloseAll ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-rose-300">Confirm close all?</span>
                            <button
                              onClick={() => handleClosePosition(undefined)}
                              className="px-2.5 py-1 rounded text-xs font-bold bg-rose-600 text-white cursor-pointer"
                            >
                              Yes, Close All
                            </button>
                            <button
                              onClick={() => setConfirmCloseAll(false)}
                              className="px-2.5 py-1 rounded text-xs bg-slate-800 text-slate-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmCloseAll(true)}
                            className="px-3 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 cursor-pointer"
                          >
                            Close All Positions
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {(overview?.open_positions?.length || 0) === 0 ? (
                    <div className="text-xs text-slate-500 py-6 text-center border border-dashed border-slate-800 rounded-lg">
                      No open positions. Select a symbol above and click{' '}
                      <strong className="text-cyan-300">"Execute If Approved"</strong> to place a confluence-verified order.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="text-slate-400 border-b border-slate-800 font-mono">
                          <tr>
                            <th className="py-2">Ticket</th>
                            <th className="py-2">Symbol</th>
                            <th className="py-2">Side</th>
                            <th className="py-2">Lots</th>
                            <th className="py-2">Entry</th>
                            <th className="py-2">SL / TP</th>
                            <th className="py-2">Floating P&L</th>
                            <th className="py-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {overview.open_positions.map((pos: any) => (
                            <tr key={pos.ticket} className="hover:bg-slate-800/30">
                              <td className="py-2.5 text-slate-300">#{pos.ticket}</td>
                              <td className="py-2.5 font-bold text-white">{pos.symbol}</td>
                              <td className="py-2.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    pos.direction === 'BUY'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-rose-500/20 text-rose-300'
                                  }`}
                                >
                                  {pos.direction}
                                </span>
                              </td>
                              <td className="py-2.5">{pos.volume}</td>
                              <td className="py-2.5">{pos.entry_price}</td>
                              <td className="py-2.5 text-slate-400">
                                {pos.stop_loss} / {pos.take_profit}
                              </td>
                              <td
                                className={`py-2.5 font-bold ${
                                  (pos.floating_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {(pos.floating_pnl || 0) >= 0 ? '+' : ''}$
                                {Number(pos.floating_pnl || 0).toFixed(2)}
                              </td>
                              <td className="py-2.5 text-right">
                                <button
                                  onClick={() => handleClosePosition(pos.ticket)}
                                  className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[11px] cursor-pointer"
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

              {/* Right 4 cols: Live Multi-Strategy Confluence Decision Card */}
              <div className="lg:col-span-4 space-y-4">
                <div className="quant-card rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-cyan-400 font-mono font-semibold">
                        10-Step Confluence Verdict
                      </span>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        {selectedSymbol} • {symbolAnalysis?.timeframe || selectedTimeframe}
                      </h3>
                    </div>
                    <div
                      className={`px-3.5 py-1.5 rounded-xl text-sm font-extrabold font-mono border ${
                        sig?.action === 'BUY'
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 glow-emerald'
                          : sig?.action === 'SELL'
                          ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 glow-rose'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {sig?.action || 'WAIT'}
                    </div>
                  </div>

                  {/* Confluence Score Bar */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">
                        Confluence Score (Threshold: {sig?.min_required_score || 65})
                      </span>
                      <span className="font-mono font-bold text-cyan-300">
                        {sig?.score || 0} / 100
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full transition-all duration-300 ${
                          (sig?.score || 0) >= (sig?.min_required_score || 65)
                            ? 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                            : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(sig?.score || 0, 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      *Internal rule-alignment metric (0–100), never a guaranteed win probability.
                    </p>
                  </div>

                  {/* Calculated Order & Risk Parameters */}
                  <div className="grid grid-cols-2 gap-2.5 bg-slate-950/80 p-3 rounded-lg border border-slate-800/80 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">Entry Price</span>
                      <span className="text-white font-bold">{sig?.entry_price || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Calculated Lot Size</span>
                      <span className="text-cyan-300 font-bold">{sig?.lot_size ?? 0} lots</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Stop Loss (Structural)</span>
                      <span className="text-rose-400">{sig?.stop_loss || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Take Profit</span>
                      <span className="text-emerald-400">{sig?.take_profit || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">Reward : Risk Ratio</span>
                      <span className="text-white">{sig?.risk_reward_ratio || 0} R</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">HTF Bias ({sig?.htf_timeframe || 'H4'})</span>
                      <span className="text-amber-300">{sig?.htf_bias || 'NEUTRAL'}</span>
                    </div>
                  </div>

                  {/* Per-Module Points Breakdown */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-slate-300">
                        8-Module Score Contributions
                      </h4>
                      <button
                        onClick={() => setActiveTab('knowledge')}
                        className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <BookOpen className="w-3 h-3" /> View Module Rules
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono">
                      {sig?.score_breakdown &&
                        Object.entries(sig.score_breakdown).map(([k, v]: [string, any]) => (
                          <div
                            key={k}
                            className="flex items-center justify-between bg-slate-950/60 px-2.5 py-1.5 rounded border border-slate-800/70"
                          >
                            <span className="text-slate-400 truncate">{k.replace(/_/g, ' ')}</span>
                            <span className={v > 0 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                              +{v}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Confluence Reasons */}
                  <div>
                    <h4 className="text-xs font-semibold text-emerald-400 mb-1.5 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Active Confluence Factors ({sig?.reasons?.length || 0})
                    </h4>
                    <ul className="space-y-1 max-h-36 overflow-y-auto text-[11px] text-slate-300 pr-1">
                      {(sig?.reasons || []).map((r: string, i: number) => (
                        <li
                          key={i}
                          className="bg-emerald-500/5 border border-emerald-500/20 rounded px-2.5 py-1"
                        >
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Risk / Filter Rejections */}
                  {(sig?.rejections?.length || 0) > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-rose-400 mb-1.5 flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5" /> Safety & Filter Vetoes
                      </h4>
                      <ul className="space-y-1 text-[11px] text-rose-200">
                        {sig.rejections.map((r: string, i: number) => (
                          <li
                            key={i}
                            className="bg-rose-500/15 border border-rose-500/30 rounded px-2.5 py-1.5 font-mono"
                          >
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ================= TAB 2: TRADING KNOWLEDGE & BLUEPRINTS (ALL 8 MODULES) ================= */}
        {activeTab === 'knowledge' && (
          <div className="space-y-5">
            {/* Top Banner */}
            <div className="quant-card rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono uppercase tracking-wider">
                  <BookOpen className="w-4 h-4" /> Institutional Quantitative Knowledge Base
                </div>
                <h2 className="text-lg font-extrabold text-white mt-1">
                  All 8 Strategy Modules, Mathematical Formulas & Live Rule Diagnostics
                </h2>
                <p className="text-xs text-slate-400 mt-1 max-w-4xl">
                  Inspect how every trading concept in 2REAL AI TRADER is mathematically defined, how look-ahead bias and naive shortcuts are prevented, and see live telemetry from{' '}
                  <strong className="text-cyan-300">{selectedSymbol} ({selectedTimeframe})</strong> right now.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={selectedSymbol}
                  onChange={(e) => handleSelectSymbolAndTimeframe(e.target.value, selectedTimeframe)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white"
                >
                  {ALL_SYMBOLS.map((s) => (
                    <option key={s} value={s}>
                      {s} ({SYMBOL_SPECS[s].description})
                    </option>
                  ))}
                </select>
                <select
                  value={selectedTimeframe}
                  onChange={(e) => handleSelectSymbolAndTimeframe(selectedSymbol, e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300"
                >
                  {ALL_TIMEFRAMES.map((tf) => (
                    <option key={tf} value={tf}>
                      {tf}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left 4 cols: Module Selector Cards */}
              <div className="lg:col-span-4 space-y-2.5">
                {TRADING_KNOWLEDGE_ENCYCLOPEDIA.map((mod) => {
                  const isSelected = mod.id === selectedKnowledgeId;
                  return (
                    <div
                      key={mod.id}
                      onClick={() => setSelectedKnowledgeId(mod.id)}
                      className={`p-3.5 rounded-xl border transition cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-400 shadow-lg shadow-cyan-500/10'
                          : 'quant-card hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-800">
                          {mod.code}
                        </span>
                        <span className="text-xs font-mono font-bold text-emerald-400">
                          {mod.badge}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-2">{mod.title}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">{mod.category}</p>
                    </div>
                  );
                })}
              </div>

              {/* Right 8 cols: Deep Blueprint + Live Symbol Telemetry */}
              <div className="lg:col-span-8 space-y-4">
                <div className="quant-card rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
                    <div>
                      <span className="text-xs font-mono text-cyan-400 font-semibold">
                        {activeKnowledge.code} • {activeKnowledge.badge}
                      </span>
                      <h3 className="text-xl font-extrabold text-white mt-1">
                        {activeKnowledge.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">{activeKnowledge.category}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      ACTIVE & VERIFIED
                    </span>
                  </div>

                  {/* Institutional Logic */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                      1. Institutional Theory & Core Logic
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/70 p-3.5 rounded-lg border border-slate-800">
                      {activeKnowledge.summary}
                    </p>
                  </div>

                  {/* Exact Mathematical Formula */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-300 mb-2">
                      2. Exact Quantitative Formula & Confluence Weight (Zero Look-Ahead)
                    </h4>
                    <div className="bg-[#040711] border border-cyan-500/30 rounded-lg p-3.5 font-mono text-xs text-cyan-200 space-y-1.5">
                      <div>{activeKnowledge.formulaOrGeometry}</div>
                      <div className="text-[11px] text-emerald-300">
                        Weight: {activeKnowledge.confluenceWeight}
                      </div>
                    </div>
                  </div>

                  {/* Anti-Cheat & Integrity Guard */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
                      3. Anti-Repaint & Common Retail Traps Avoided
                    </h4>
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3.5 text-xs text-amber-200 space-y-1.5">
                      {activeKnowledge.commonTrapsAvoided.map((trap: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-2">
                          <span className="text-amber-400 font-bold">✓</span>
                          <span>{trap}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Key Concepts Checklist */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                      4. Exact Algorithmic Rules Implemented
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                      {activeKnowledge.exactAlgorithmicRules.map((concept: string, i: number) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 text-xs text-slate-300"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{concept}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Live Telemetry from Selected Symbol */}
                  <div className="border-t border-slate-800 pt-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2 flex items-center gap-1.5">
                      <Activity className="w-4 h-4" />
                      5. Live Module Output on {selectedSymbol} ({selectedTimeframe})
                    </h4>
                    <pre className="bg-[#04070f] border border-slate-800 rounded-lg p-3.5 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-60">
                      {JSON.stringify(
                        selectedKnowledgeId === 'ict'
                          ? sig?.module_details?.ict
                          : selectedKnowledgeId === 'smc'
                          ? sig?.module_details?.smc
                          : selectedKnowledgeId === 'fvg'
                          ? sig?.module_details?.fvg
                          : selectedKnowledgeId === 'volume_profile'
                          ? {
                              poc_price: sig?.module_details?.volume_profile?.poc_price,
                              vah_price: sig?.module_details?.volume_profile?.vah_price,
                              val_price: sig?.module_details?.volume_profile?.val_price,
                              volume_type: sig?.module_details?.volume_profile?.volume_type,
                              high_volume_nodes:
                                sig?.module_details?.volume_profile?.high_volume_nodes,
                              low_volume_nodes:
                                sig?.module_details?.volume_profile?.low_volume_nodes,
                            }
                          : selectedKnowledgeId === 'breakout'
                          ? sig?.module_details?.breakout
                          : selectedKnowledgeId === 'candlesticks'
                          ? sig?.module_details?.candlesticks
                          : selectedKnowledgeId === 'fibonacci'
                          ? sig?.module_details?.fibonacci
                          : sig?.module_details?.filters,
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: MT5 CONNECTION & SETUP WIZARD ================= */}
        {activeTab === 'setup' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 quant-card rounded-xl p-6 space-y-5">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-lg font-bold text-white">
                  MetaTrader 5 Connection & Encrypted Vault Setup Wizard
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Credentials are encrypted using OS Keyring or AES-256-GCM (PBKDF2 600,000 iterations) and are never stored in browser localStorage, URLs, or plaintext logs.
                </p>
              </div>

              {connMessage && (
                <div
                  className={`p-3.5 rounded-lg text-xs border ${
                    connMessage.type === 'ok'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {connMessage.text}
                </div>
              )}

              <form onSubmit={handleConnectMT5} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 mb-1">Broker Name</label>
                    <input
                      type="text"
                      value={connForm.broker}
                      onChange={(e) => setConnForm({ ...connForm, broker: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">MT5 Server Name</label>
                    <input
                      type="text"
                      value={connForm.server}
                      onChange={(e) => setConnForm({ ...connForm, server: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Account Login Number</label>
                    <input
                      type="number"
                      value={connForm.login}
                      onChange={(e) => setConnForm({ ...connForm, login: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">
                      Trading Password (Masked & Never Logged)
                    </label>
                    <input
                      type="password"
                      placeholder={
                        overview?.vault_profile?.has_saved_credentials
                          ? '•••••••• (Stored in Encrypted Vault)'
                          : 'Enter MT5 Password'
                      }
                      value={connForm.password}
                      onChange={(e) =>
                        setConnForm({
                          ...connForm,
                          password: e.target.value,
                          use_saved_password: false,
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-slate-400 mb-1">
                      MT5 Terminal Path (Auto-Detected or Custom)
                    </label>
                    <input
                      type="text"
                      value={connForm.terminal_path}
                      onChange={(e) => setConnForm({ ...connForm, terminal_path: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Account Mode</label>
                    <select
                      value={connForm.trading_mode}
                      onChange={(e) => setConnForm({ ...connForm, trading_mode: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="DEMO">DEMO Account (Recommended Default)</option>
                      <option value="LIVE">LIVE Real-Money Account (Requires Unlock)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={connForm.save_in_vault}
                      onChange={(e) => setConnForm({ ...connForm, save_in_vault: e.target.checked })}
                    />
                    Save encrypted in local OS / AES-256-GCM Vault
                  </label>
                  <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={connForm.use_ea_bridge}
                      onChange={(e) => setConnForm({ ...connForm, use_ea_bridge: e.target.checked })}
                    />
                    Connect via MQL5 Expert Advisor Bridge (TwoRealBridgeEA.mq5)
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition cursor-pointer"
                  >
                    Connect to MT5 Terminal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEnablePaperHarness(10000)}
                    className="px-4 py-2 rounded-lg font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer"
                  >
                    Load $10,000 Demo Test Harness
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEnablePaperHarness(5)}
                    className="px-3.5 py-2 rounded-lg font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition cursor-pointer"
                  >
                    Load $5.00 Micro Account
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(false)}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                  >
                    Disconnect
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(true)}
                    className="px-3 py-2 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition cursor-pointer"
                  >
                    Disconnect & Forget Credentials
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Terminal Detection & Security Audit */}
            <div className="lg:col-span-5 space-y-4">
              <div className="quant-card rounded-xl p-5 space-y-3 text-xs">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Credential Vault & Environment Diagnostics
                </h3>
                <div className="space-y-2 bg-slate-950 p-3.5 rounded-lg border border-slate-800 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Vault Encryption:</span>
                    <span className="text-emerald-400">
                      {overview?.vault_profile?.vault_backend || 'AES256_GCM_FILE'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Saved Profile:</span>
                    <span className="text-white">
                      {overview?.vault_profile?.has_saved_credentials ? 'YES (Encrypted)' : 'NONE'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Host OS:</span>
                    <span className="text-cyan-300">
                      {conn?.terminal_detection?.os_platform || 'Linux'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Browser Storage Leak:</span>
                    <span className="text-emerald-400">0 Secrets in localStorage</span>
                  </div>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  {conn?.terminal_detection?.installation_guide}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: 8-MODULE STRATEGY CENTER ================= */}
        {activeTab === 'strategy' && strategyConfig && (
          <div className="quant-card rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  8-Module Institutional Strategy & Multi-Timeframe Center
                </h2>
                <p className="text-xs text-slate-400">
                  Configure Scalping (1H / 5M), Day Trading (4H / 15M), Optional Swing Mode (D1 / 4H), minimum confluence threshold, and individual strategy module parameters.
                </p>
              </div>
              <button
                onClick={async () => {
                  const updated = await api.updateStrategyConfig(strategyConfig);
                  setStrategyConfig(updated);
                  await loadSymbolAnalysis(selectedSymbol, selectedTimeframe);
                  setExecutionFeedback('Saved Strategy Center configuration.');
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition cursor-pointer"
              >
                Save & Apply Strategy Settings
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="block text-slate-400 mb-1.5">Primary Trading Style</label>
                <select
                  value={strategyConfig.trading_style}
                  onChange={(e) =>
                    setStrategyConfig({ ...strategyConfig, trading_style: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="SCALPING">Scalping (HTF: 1H → LTF: 5M)</option>
                  <option value="DAY_TRADING">Day Trading (HTF: 4H → LTF: 15M)</option>
                  <option value="SWING">Swing Trading (HTF: D1 → LTF: 4H)</option>
                </select>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="block text-slate-400 mb-1.5">
                  Minimum Confluence Score (0 - 100)
                </label>
                <input
                  type="number"
                  min={40}
                  max={95}
                  value={strategyConfig.min_confluence_score}
                  onChange={(e) =>
                    setStrategyConfig({
                      ...strategyConfig,
                      min_confluence_score: Number(e.target.value),
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center">
                <label className="flex items-center gap-2.5 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={strategyConfig.swing_mode_enabled}
                    onChange={(e) =>
                      setStrategyConfig({
                        ...strategyConfig,
                        swing_mode_enabled: e.target.checked,
                      })
                    }
                  />
                  <span>
                    Enable Optional Swing Mode (D1 Bias / 4H Entry)
                    <span className="block text-[11px] text-slate-500">
                      Disabled by default per institutional specification
                    </span>
                  </span>
                </label>
              </div>
            </div>

            {/* 8 Strategy Modules Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {[
                {
                  key: 'ict',
                  title: 'Module A: ICT Concepts',
                  desc: 'BSL/SSL Liquidity Pools, Sweeps, Dealing Range Premium/Discount, MSS & Displacement.',
                },
                {
                  key: 'smc',
                  title: 'Module B: Smart Money (SMC)',
                  desc: 'BOS, CHoCH, Validated Order Blocks (requires BOS + displacement), Mitigation tracking.',
                },
                {
                  key: 'fvg',
                  title: 'Module C: Fair Value Gaps',
                  desc: '3-candle bullish/bearish imbalances, 50% Consequent Encroachment (CE), fill invalidation.',
                },
                {
                  key: 'volume_profile',
                  title: 'Module D: Volume Profile & POC',
                  desc: '40-bin price volume histogram (never candle close), POC, VAH/VAL (70% Value Area), HVN/LVN.',
                },
                {
                  key: 'breakout',
                  title: 'Module E: Breakout & Fakeout',
                  desc: 'Consolidation range detection, ATR/volume confirmed breakouts, failed breakout traps.',
                },
                {
                  key: 'candlesticks',
                  title: 'Module F: Candlestick Action',
                  desc: 'Engulfing, Pin Bars, Hammer/Shooting Star, Inside Bars, Morning/Evening Star in zone context.',
                },
                {
                  key: 'fibonacci',
                  title: 'Module G: Fibonacci OTE',
                  desc: 'Confirmed swing anchor retracements (0.50, 0.618, 0.705 OTE, 0.786) as confluence.',
                },
              ].map((m) => (
                <div
                  key={m.key}
                  className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{m.title}</span>
                    <input
                      type="checkbox"
                      checked={strategyConfig[m.key]?.enabled ?? true}
                      onChange={(e) =>
                        setStrategyConfig({
                          ...strategyConfig,
                          [m.key]: { ...strategyConfig[m.key], enabled: e.target.checked },
                        })
                      }
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{m.desc}</p>
                </div>
              ))}

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">Module H: Regime & Filters</span>
                  <span className="text-[10px] font-mono text-emerald-400">ALWAYS ON</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  ADX Trend/Range filter, ATR volatility gate, Live Spread gate, UTC Session window, honest News Filter state.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 5: UN-BYPASSABLE RISK ENGINE & $5 CHECKER ================= */}
        {activeTab === 'risk' && riskConfig && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 quant-card rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Un-Bypassable Risk Management Engine
                  </h2>
                  <p className="text-xs text-slate-400">
                    Hard safety limits cannot be overridden by a high confluence score.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const updated = await api.updateRiskConfig(riskConfig);
                    setRiskConfig(updated);
                    await loadSymbolAnalysis(selectedSymbol, selectedTimeframe);
                    setExecutionFeedback('Updated Risk Engine parameters.');
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 cursor-pointer"
                >
                  Save Risk Limits
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {[
                  { key: 'risk_per_trade_pct', label: 'Risk Per Trade (%) — Conservative Default 0.5%' },
                  { key: 'max_daily_loss_pct', label: 'Max Daily Loss Limit (%)' },
                  { key: 'max_overall_drawdown_pct', label: 'Max Total Drawdown Limit (%)' },
                  { key: 'max_open_positions', label: 'Max Simultaneous Open Positions' },
                  { key: 'max_consecutive_losses', label: 'Max Consecutive Losses Before Cooldown' },
                  { key: 'min_risk_reward_ratio', label: 'Minimum Reward:Risk Ratio (R)' },
                  { key: 'max_margin_usage_pct', label: 'Max Margin Usage Cap (%)' },
                  { key: 'default_commission_per_lot_usd', label: 'Round-Turn Commission ($ / Lot)' },
                ].map((field) => (
                  <div key={field.key}>
                    <label className="block text-slate-400 mb-1">{field.label}</label>
                    <input
                      type="number"
                      step="0.1"
                      value={riskConfig[field.key]}
                      onChange={(e) =>
                        setRiskConfig({ ...riskConfig, [field.key]: Number(e.target.value) })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Small Account ($5) Safety Guard Simulator */}
            <div className="lg:col-span-5 quant-card rounded-xl p-6 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  Mandatory Small-Account Protection
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  $5.00 Micro-Account Feasibility Verifier
                </h3>
                <p className="text-xs text-slate-400">
                  Tests whether a small account can safely trade a broker's minimum lot (0.01) given stop-loss distance, tick value, and commission.
                </p>
              </div>

              <form onSubmit={handleSmallAccountCheck} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Account Balance ($)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={smallAcctForm.balance_usd}
                      onChange={(e) =>
                        setSmallAcctForm({ ...smallAcctForm, balance_usd: Number(e.target.value) })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Symbol</label>
                    <select
                      value={smallAcctForm.symbol}
                      onChange={(e) =>
                        setSmallAcctForm({ ...smallAcctForm, symbol: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white"
                    >
                      {ALL_SYMBOLS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Risk Per Trade (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={smallAcctForm.risk_per_trade_pct}
                      onChange={(e) =>
                        setSmallAcctForm({
                          ...smallAcctForm,
                          risk_per_trade_pct: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Stop Loss (Pips)</label>
                    <input
                      type="number"
                      step="1"
                      value={smallAcctForm.stop_loss_pips}
                      onChange={(e) =>
                        setSmallAcctForm({
                          ...smallAcctForm,
                          stop_loss_pips: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition cursor-pointer"
                >
                  Evaluate Micro-Account Risk Safety
                </button>
              </form>

              {smallAcctResult && (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-2 font-mono ${
                    smallAcctResult.approved
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                  }`}
                >
                  <div className="font-bold text-sm">
                    {smallAcctResult.approved ? '✓ TRADE APPROVED' : '✕ TRADE BLOCKED BY RISK GUARD'}
                  </div>
                  <div className="text-white bg-slate-950/90 p-2.5 rounded border border-slate-800">
                    {smallAcctResult.rejection_reason ||
                      `Approved Lot Size: ${smallAcctResult.calculated_lot_size} lots`}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1">
                    <div>Max Allowed Risk: ${smallAcctResult.allowed_risk_usd}</div>
                    <div>Min Lot (0.01) Risk: ${smallAcctResult.min_lot_risk_usd}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 6: BACKTESTER ================= */}
        {activeTab === 'backtest' && (
          <div className="space-y-5">
            <div className="quant-card rounded-xl p-5">
              <h2 className="text-lg font-bold text-white mb-1">
                Bar-by-Bar Zero-Lookahead Backtesting & Walk-Forward Engine
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Simulates candle-by-candle through the 8-module confluence engine and risk engine with realistic spread, commission, slippage, and 70/30 In-Sample / Out-of-Sample validation.
              </p>

              <form
                onSubmit={handleRunBacktest}
                className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs items-end"
              >
                <div>
                  <label className="block text-slate-400 mb-1">Symbol</label>
                  <select
                    value={btForm.symbol}
                    onChange={(e) => setBtForm({ ...btForm, symbol: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                  >
                    {ALL_SYMBOLS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Timeframe</label>
                  <select
                    value={btForm.timeframe}
                    onChange={(e) => setBtForm({ ...btForm, timeframe: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="M5">M5</option>
                    <option value="M15">M15</option>
                    <option value="H1">H1</option>
                    <option value="H4">H4</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Historical Bars</label>
                  <input
                    type="number"
                    min={80}
                    max={600}
                    value={btForm.bars}
                    onChange={(e) => setBtForm({ ...btForm, bars: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Initial Balance ($)</label>
                  <input
                    type="number"
                    value={btForm.initial_balance}
                    onChange={(e) =>
                      setBtForm({ ...btForm, initial_balance: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Spread (Pips)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={btForm.spread_pips}
                    onChange={(e) => setBtForm({ ...btForm, spread_pips: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Commission ($/Lot)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={btForm.commission_per_lot_usd}
                    onChange={(e) =>
                      setBtForm({ ...btForm, commission_per_lot_usd: Number(e.target.value) })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={btLoading}
                  className="py-2 px-4 rounded-lg font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition cursor-pointer"
                >
                  {btLoading ? 'Simulating...' : 'Run Backtest'}
                </button>
              </form>
            </div>

            {btResult && (
              <div className="space-y-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
                  <span>{btResult.execution_disclaimer}</span>
                  {btResult.warnings?.map((w: string, i: number) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono"
                    >
                      {w}
                    </span>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-xs font-mono">
                  {[
                    {
                      label: 'Net Profit',
                      val: `${btResult.net_profit >= 0 ? '+' : ''}$${btResult.net_profit}`,
                      color: btResult.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-400',
                    },
                    { label: 'Return (%)', val: `${btResult.net_return_pct}%` },
                    { label: 'Total Trades', val: btResult.total_trades },
                    { label: 'Win Rate', val: `${btResult.win_rate_pct}%` },
                    { label: 'Profit Factor', val: btResult.profit_factor },
                    { label: 'Max Drawdown', val: `${btResult.max_drawdown_pct}%` },
                    {
                      label: 'In-Sample P&L',
                      val: `$${btResult.in_sample?.net_profit ?? 0} (${btResult.in_sample?.trades ?? 0}t)`,
                    },
                    {
                      label: 'Out-of-Sample P&L',
                      val: `$${btResult.out_of_sample?.net_profit ?? 0} (${btResult.out_of_sample?.trades ?? 0}t)`,
                    },
                  ].map((s, idx) => (
                    <div key={idx} className="quant-card rounded-xl p-3">
                      <div className="text-[10px] text-slate-400">{s.label}</div>
                      <div className={`text-sm font-bold mt-1 ${s.color || 'text-white'}`}>
                        {s.val}
                      </div>
                    </div>
                  ))}
                </div>

                <EquityChart data={btResult.equity_curve || []} />
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 7: POSITIONS & TRADE HISTORY LEDGER ================= */}
        {activeTab === 'trades' && (
          <div className="quant-card rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                Complete Execution & Trade History Ledger
              </h2>
              <button
                onClick={async () => {
                  const tr = await api.getTradeHistory();
                  setTradesHistory(tr.trades || []);
                }}
                className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
              >
                Refresh Ledger
              </button>
            </div>

            {tradesHistory.length === 0 ? (
              <div className="text-xs text-slate-500 py-8 text-center">
                No historical trades recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left font-mono">
                  <thead className="text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2">Ticket</th>
                      <th className="py-2">Symbol</th>
                      <th className="py-2">Side</th>
                      <th className="py-2">Lots</th>
                      <th className="py-2">Entry</th>
                      <th className="py-2">Exit</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Realized P&L</th>
                      <th className="py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {tradesHistory.map((t: any, i: number) => (
                      <tr key={i} className="hover:bg-slate-800/30">
                        <td className="py-2.5">#{t.ticket}</td>
                        <td className="py-2.5 font-bold text-white">{t.symbol}</td>
                        <td className="py-2.5">{t.direction}</td>
                        <td className="py-2.5">{t.volume}</td>
                        <td className="py-2.5">{t.entry_price}</td>
                        <td className="py-2.5">{t.exit_price || '—'}</td>
                        <td className="py-2.5">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px]">
                            {t.status}
                          </span>
                        </td>
                        <td
                          className={`py-2.5 font-bold ${
                            (t.realized_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.status === 'CLOSED'
                            ? `${(t.realized_pnl || 0) >= 0 ? '+' : ''}$${Number(
                                t.realized_pnl || 0,
                              ).toFixed(2)}`
                            : 'OPEN'}
                        </td>
                        <td className="py-2.5 text-slate-400">{t.execution_source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 8: LOGS, DIAGNOSTICS & ERROR HARNESS ================= */}
        {activeTab === 'diagnostics' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-4 quant-card rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">
                Mandatory Error-Handling Verification Harness
              </h3>
              <p className="text-xs text-slate-400">
                Trigger any of the mandatory edge cases to verify that the engine logs and rejects unsafe states cleanly without crashing.
              </p>
              <div className="grid grid-cols-1 gap-2 text-xs">
                {[
                  { id: 'SMALL_ACCOUNT_5_USD', label: 'Test $5 Account Minimum Volume Rejection' },
                  { id: 'STALE_PRICES', label: 'Test Stale Market Data Feed Suspension' },
                  { id: 'DUPLICATE_ORDER', label: 'Test Duplicate Order Idempotency Guard' },
                  { id: 'MARKET_CLOSED', label: 'Test Broker Market Closed (Retcode 10018)' },
                  { id: 'SYMBOL_UNAVAILABLE', label: 'Test Symbol Unavailable / Missing Spec' },
                  { id: 'INVALID_VOLUME', label: 'Test Invalid Lot Volume (Retcode 10014)' },
                  { id: 'INVALID_STOPS', label: 'Test Invalid Stop Distance (Retcode 10016)' },
                  { id: 'INSUFFICIENT_MARGIN', label: 'Test Insufficient Free Margin (Retcode 10019)' },
                  { id: 'ORDER_REJECTED', label: 'Test Broker Dealer Rejection (Retcode 10006)' },
                  { id: 'ORDER_TIMEOUT', label: 'Test Network / Order Dispatch Timeout' },
                ].map((sc) => (
                  <button
                    key={sc.id}
                    onClick={async () => {
                      const res = await api.testErrorScenario(sc.id);
                      const lg = await api.getDiagnosticLogs(logFilter);
                      setLogs(lg.logs || []);
                      setExecutionFeedback(
                        `Verified Scenario [${sc.id}]: ${JSON.stringify(res.result)}`,
                      );
                    }}
                    className="text-left px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 transition cursor-pointer font-mono text-[11px]"
                  >
                    ▶ {sc.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-8 quant-card rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white">
                  Structured System & Risk Diagnostic Logs
                </h3>
                <div className="flex items-center gap-2">
                  {['ALL', 'MT5_CONNECTION', 'STRATEGY_DECISION', 'RISK_REJECTION', 'SYSTEM_STATUS'].map(
                    (cat) => (
                      <button
                        key={cat}
                        onClick={async () => {
                          setLogFilter(cat);
                          const lg = await api.getDiagnosticLogs(cat);
                          setLogs(lg.logs || []);
                        }}
                        className={`px-2.5 py-1 rounded text-[11px] font-mono cursor-pointer ${
                          logFilter === cat
                            ? 'bg-cyan-500 text-slate-950 font-bold'
                            : 'bg-slate-950 text-slate-400'
                        }`}
                      >
                        {cat}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="space-y-2 max-h-[540px] overflow-y-auto font-mono text-xs pr-1">
                {logs.map((l: any) => (
                  <div
                    key={l.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-start justify-between gap-3"
                  >
                    <div>
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] mr-2 ${
                          l.level === 'ERROR'
                            ? 'bg-rose-500/20 text-rose-300'
                            : l.level === 'WARNING'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-cyan-500/20 text-cyan-300'
                        }`}
                      >
                        {l.level}
                      </span>
                      <span className="text-slate-400 text-[11px] mr-2">[{l.category}]</span>
                      <span className="text-slate-200">{l.message}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      {l.timestamp?.slice(11, 19)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Live Trading Explicit Unlock Modal */}
      {showLiveModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="quant-card rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              Live Real-Money Trading Safety Lock
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Live trading is disabled by default. To authorize real-money execution, confirm both safety checks and type{' '}
              <code className="text-rose-300 font-bold">ENABLE LIVE TRADING</code> below.
            </p>
            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={liveAckDemo}
                  onChange={(e) => setLiveAckDemo(e.target.checked)}
                />
                I have tested this strategy on a Demo account first.
              </label>
              <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={liveAckRisk}
                  onChange={(e) => setLiveAckRisk(e.target.checked)}
                />
                I understand leveraged trading carries risk of capital loss.
              </label>
              <input
                type="text"
                placeholder="Type ENABLE LIVE TRADING"
                value={livePhrase}
                onChange={(e) => setLivePhrase(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono mt-2"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              {overview?.live_trading_authorized && (
                <button
                  onClick={async () => {
                    await api.revokeLive();
                    const ov = await api.getOverview();
                    setOverview(ov);
                    setShowLiveModal(false);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs bg-emerald-600 text-white cursor-pointer"
                >
                  Re-Lock Live Trading
                </button>
              )}
              <button
                onClick={() => setShowLiveModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.authorizeLive({
                      confirmation_phrase: livePhrase,
                      acknowledged_risk: liveAckRisk,
                      demo_tested: liveAckDemo,
                    });
                    const ov = await api.getOverview();
                    setOverview(ov);
                    setShowLiveModal(false);
                    setExecutionFeedback('Live Trading Unlocked.');
                  } catch (e: any) {
                    alert(e.message);
                  }
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
              >
                Authorize Live Mode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

