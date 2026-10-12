import React, { useState } from 'react';
import {
  ShieldCheck,
  Terminal,
  RefreshCw,
  Plug,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Lock,
  FlaskConical,
  X,
} from 'lucide-react';
import { api } from '../services/api';

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  overview: any;
  strategyConfig: any;
  riskConfig: any;
  onRefresh: () => Promise<void>;
}

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({
  isOpen,
  onClose,
  overview,
  strategyConfig,
  riskConfig,
  onRefresh,
}) => {
  const vault = overview?.vault_profile || {};
  const conn = overview?.connection || {};
  const acct = overview?.account;

  const [broker, setBroker] = useState<string>(vault.broker || 'IC Markets / MetaQuotes');
  const [server, setServer] = useState<string>(vault.server || 'MetaQuotes-Demo');
  const [login, setLogin] = useState<string>(vault.login ? String(vault.login) : '10058921');
  const [password, setPassword] = useState<string>('');
  const [terminalPath, setTerminalPath] = useState<string>(
    vault.terminal_path || conn.terminal_detection?.recommended_path || 'C:\\Program Files\\MetaTrader 5\\terminal64.exe',
  );
  const [tradingMode, setTradingMode] = useState<string>(vault.trading_mode || 'DEMO');
  const [saveInVault, setSaveInVault] = useState<boolean>(true);
  const [useEaBridge, setUseEaBridge] = useState<boolean>(false);

  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(
    strategyConfig?.symbols || ['EURUSD', 'XAUUSD', 'GBPUSD', 'USDJPY'],
  );
  const [tradingStyle, setTradingStyle] = useState<string>(
    strategyConfig?.trading_style || 'DAY_TRADING',
  );
  const [riskPct, setRiskPct] = useState<number>(riskConfig?.risk_per_trade_pct ?? 0.5);
  const [sessionWindow, setSessionWindow] = useState<string>(
    strategyConfig?.filters?.allowed_sessions_utc?.[0] || '07:00-20:00',
  );

  const [busy, setBusy] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const toggleSymbol = (sym: string) => {
    if (selectedSymbols.includes(sym)) {
      if (selectedSymbols.length > 1) {
        setSelectedSymbols(selectedSymbols.filter((s) => s !== sym));
      }
    } else {
      setSelectedSymbols([...selectedSymbols, sym]);
    }
  };

  const handleDetectTerminal = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const det = await api.detectTerminals();
      if (det.recommended_path) {
        setTerminalPath(det.recommended_path);
        setFeedback({
          type: 'success',
          text: `Detected MT5 terminal at: ${det.recommended_path}`,
        });
      } else {
        setFeedback({
          type: 'info',
          text: det.installation_guide,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleConnectMT5 = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      // Save strategy & risk setup choices alongside connection
      await api.updateStrategyConfig({
        ...strategyConfig,
        symbols: selectedSymbols,
        trading_style: tradingStyle,
        filters: {
          ...(strategyConfig?.filters || {}),
          allowed_sessions_utc: [sessionWindow],
        },
      });
      await api.updateRiskConfig({
        ...riskConfig,
        risk_per_trade_pct: Number(riskPct),
      });

      const res = await api.connectMT5({
        broker,
        server,
        login: Number(login),
        password,
        terminal_path: terminalPath,
        trading_mode: tradingMode,
        save_in_vault: saveInVault,
        use_saved_password: !password && Boolean(vault.has_saved_credentials),
        use_ea_bridge: useEaBridge,
      });
      setPassword(''); // Clear password input from DOM state immediately
      await onRefresh();

      if (res.connection?.is_connected) {
        setFeedback({
          type: 'success',
          text: `Connected to MT5 (${res.connection.broker} / ${res.connection.server}).`,
        });
      } else {
        setFeedback({
          type: 'error',
          text: `${res.connection?.last_error_code}: ${res.connection?.last_error_message} — ${res.connection?.troubleshooting_hint || ''}`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleTestConnection = async () => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await api.testConnection();
      const st = res.connection_status;
      if (st.is_connected) {
        setFeedback({
          type: 'success',
          text: `Connection Verified: ${st.connection_state} | Server: ${st.server} | Login: ${st.login}`,
        });
      } else {
        setFeedback({
          type: 'info',
          text: `Status: DISCONNECTED (${res.terminal_detection?.os_platform}). ${res.terminal_detection?.installation_guide}`,
        });
      }
      await onRefresh();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleEnablePaperHarness = async (initialBalance: number) => {
    setBusy(true);
    setFeedback(null);
    try {
      await api.enablePaperHarness({
        initial_balance: initialBalance,
        leverage: 100,
        currency: 'USD',
      });
      await onRefresh();
      setFeedback({
        type: 'success',
        text: `Activated Offline Demo Test Harness (Non-Broker Local Simulator) with $${initialBalance.toFixed(2)} balance.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (forget: boolean) => {
    setBusy(true);
    setFeedback(null);
    try {
      await api.disconnectMT5(forget);
      setPassword('');
      await onRefresh();
      setFeedback({
        type: 'info',
        text: forget
          ? 'Disconnected and permanently wiped stored credentials from local encrypted vault.'
          : 'Disconnected from MT5 terminal.',
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#10141f] border border-[#242c44] rounded-2xl max-w-4xl w-full p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between border-b border-[#1e2538] pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <Plug className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                MT5 Connection & Autonomous Setup Wizard
              </h2>
              <p className="text-xs text-slate-400">
                Official MetaTrader 5 Desktop Terminal IPC & Encrypted Local Credential Vault
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#171d2e] hover:bg-[#222b42] text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedback && (
          <div
            className={`mb-5 p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : feedback.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-200'
            }`}
          >
            {feedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <div className="leading-relaxed">{feedback.text}</div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left Column: Broker & MT5 Terminal Credentials */}
          <div className="space-y-3.5 bg-[#0b0e17] p-4 rounded-xl border border-[#1d2438]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> 1. Broker & MT5 Account Details
              </h3>
              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Vault: {vault.vault_backend || 'AES-256-GCM'}
              </span>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Broker Name</label>
              <input
                type="text"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                placeholder="e.g., IC Markets, Pepperstone, Exness, FTMO"
                className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-white focus:border-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">MT5 Server Name</label>
                <input
                  type="text"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  placeholder="e.g., ICMarketsSC-Demo"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-white focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Account Login Number</label>
                <input
                  type="number"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="e.g., 50192834"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-white font-mono-num focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                MT5 Trading Password{' '}
                {vault.has_saved_credentials && (
                  <span className="text-emerald-400 ml-1">
                    (Saved in Vault: {vault.masked_password})
                  </span>
                )}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  vault.has_saved_credentials
                    ? 'Leave blank to use encrypted vault password'
                    : 'Enter MT5 password (never logged or stored in plaintext)'
                }
                className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-white focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-400">MT5 Terminal Installation Path</label>
                <button
                  type="button"
                  onClick={handleDetectTerminal}
                  disabled={busy}
                  className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                >
                  <Terminal className="w-3 h-3" /> Auto-Detect Terminal
                </button>
              </div>
              <input
                type="text"
                value={terminalPath}
                onChange={(e) => setTerminalPath(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-slate-200 font-mono-num focus:border-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Trading Mode</label>
                <select
                  value={tradingMode}
                  onChange={(e) => setTradingMode(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-white"
                >
                  <option value="DEMO">DEMO Account (Recommended)</option>
                  <option value="LIVE">LIVE Account (Requires Auth)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Account Readout (From MT5)</label>
                <div className="px-3 py-2 text-xs rounded-lg bg-[#121726]/60 border border-[#1f273d] text-slate-300 font-mono-num">
                  {acct ? `${acct.currency} · 1:${acct.leverage}` : 'Not Connected'}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveInVault}
                  onChange={(e) => setSaveInVault(e.target.checked)}
                  className="rounded border-slate-600"
                />
                Store encrypted in local OS/AES Vault
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useEaBridge}
                  onChange={(e) => setUseEaBridge(e.target.checked)}
                  className="rounded border-slate-600"
                />
                Use MQL5 EA Bridge (127.0.0.1:18555)
              </label>
            </div>
          </div>

          {/* Right Column: Symbols, Strategy Mode, Risk & Session */}
          <div className="space-y-3.5 bg-[#0b0e17] p-4 rounded-xl border border-[#1d2438]">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> 2. Trading Symbols, Strategy & Risk Preferences
            </h3>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Symbols to Trade</label>
              <div className="flex flex-wrap gap-2">
                {['EURUSD', 'XAUUSD', 'GBPUSD', 'USDJPY'].map((sym) => {
                  const active = selectedSymbols.includes(sym);
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => toggleSymbol(sym)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                        active
                          ? 'bg-blue-600/25 border-blue-500 text-blue-200'
                          : 'bg-[#121726] border-[#242c44] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {sym}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Multi-Timeframe Strategy Mode</label>
                <select
                  value={tradingStyle}
                  onChange={(e) => setTradingStyle(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-white"
                >
                  <option value="SCALPING">Scalping (HTF: 1H / Exec: 5M)</option>
                  <option value="DAY_TRADING">Day Trading (HTF: 4H / Exec: 15M)</option>
                  <option value="SWING">Swing Mode (HTF: D1 / Exec: 4H)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Planned Risk Per Trade (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5.0"
                  value={riskPct}
                  onChange={(e) => setRiskPct(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-white font-mono-num"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Preferred Trading Session (UTC)</label>
              <input
                type="text"
                value={sessionWindow}
                onChange={(e) => setSessionWindow(e.target.value)}
                placeholder="07:00-20:00"
                className="w-full px-3 py-2 text-xs rounded-lg bg-[#121726] border border-[#252e47] text-white font-mono-num"
              />
            </div>

            {/* Offline Demo Test Harness Box for non-MT5 environment validation */}
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/25 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5" /> Offline Demo Test Harness (Optional)
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-200">
                  Non-Broker Local Simulator
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                If MetaTrader 5 is not installed on this machine right now, you can explicitly activate the
                local test harness to validate order execution, reconciliation, or the $5.00 small-account guard:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleEnablePaperHarness(10000)}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 border border-purple-400/40 text-purple-100 text-xs font-medium"
                >
                  Load $10,000 Demo Test Harness
                </button>
                <button
                  type="button"
                  onClick={() => handleEnablePaperHarness(5)}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-600/25 hover:bg-amber-600/40 border border-amber-400/40 text-amber-200 text-xs font-medium"
                >
                  Load $5.00 Small-Account Test
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Bar required by Section 2 */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-6 pt-4 border-t border-[#1e2538]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleConnectMT5}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-blue-600/20"
            >
              <Plug className="w-3.5 h-3.5" /> Connect to MT5
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={busy}
              className="px-3.5 py-2 rounded-lg bg-[#171d2e] hover:bg-[#222b42] border border-[#2a3450] text-slate-200 text-xs font-medium"
            >
              Test Connection
            </button>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={busy}
              className="px-3.5 py-2 rounded-lg bg-[#171d2e] hover:bg-[#222b42] border border-[#2a3450] text-slate-200 text-xs font-medium"
            >
              Verify Account
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={busy}
              className="px-3.5 py-2 rounded-lg bg-[#171d2e] hover:bg-[#222b42] border border-[#2a3450] text-slate-200 text-xs font-medium flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Account Information
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDisconnect(false)}
              disabled={busy}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
            >
              Disconnect
            </button>
            <button
              type="button"
              onClick={() => handleDisconnect(true)}
              disabled={busy}
              className="px-3 py-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Disconnect & Forget Credentials
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
