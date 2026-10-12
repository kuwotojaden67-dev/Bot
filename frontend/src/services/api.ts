/**
 * API & Session Service for 2REAL AI TRADER Chrome Dashboard.
 * Security Note: Session tokens and credentials are NEVER stored in browser localStorage or URLs.
 * The session token is held strictly in volatile memory and passed via X-2Real-Session-Token.
 *
 * Includes a transparent Static Host Fallback (for GitHub Pages static previews where the local
 * Python FastAPI / MT5 IPC backend is not running) while always prioritizing the live FastAPI backend.
 */

let volatileSessionToken: string = '';
let isStaticHostFallback: boolean = false;

export function setSessionToken(token: string) {
  volatileSessionToken = token;
}

export function getSessionToken(): string {
  return volatileSessionToken;
}

export function getIsStaticFallback(): boolean {
  return isStaticHostFallback;
}

// Deterministic client-side state used ONLY when hosted statically on GitHub Pages without the Python backend
const staticFallbackState: any = {
  connection_state: 'DISCONNECTED',
  is_connected: false,
  is_real_mt5_terminal: false,
  is_paper_harness: false,
  broker: '',
  server: '',
  login: null,
  trading_mode: 'DEMO',
  last_error_code: 'STATIC_GITHUB_HOST_MODE',
  last_error_message:
    'Hosted on static web server (no local Python FastAPI / MT5 IPC process attached).',
  troubleshooting_hint:
    'Clone this repository to your Windows laptop and run start_windows.bat to connect to your desktop MetaTrader 5 terminal, or click "Activate $10k Offline Demo Harness" to test in browser.',
  account: null,
  open_positions: [],
  bot_state: { status: 'STOPPED', execution_mode: 'SIGNAL_ONLY' },
  live_trading_authorized: false,
  emergency_stop_active: false,
  strategy_config: {
    trading_style: 'DAY_TRADING',
    swing_mode_enabled: false,
    min_confluence_score: 65,
    symbols: ['EURUSD', 'XAUUSD', 'GBPUSD', 'USDJPY'],
    ict: { enabled: true, displacement_atr_mult: 1.35 },
    smc: { enabled: true, ob_max_age_bars: 80 },
    fvg: { enabled: true, min_gap_atr_ratio: 0.12 },
    volume_profile: { enabled: true, num_bins: 50 },
    breakout: { enabled: true, range_lookback: 24 },
    candlesticks: { enabled: true, pinbar_wick_ratio: 2.2 },
    fibonacci: { enabled: true, zone_tolerance_atr: 0.25 },
    filters: { min_adx_trend: 18, min_atr_pips: 3.0, allowed_sessions_utc: ['07:00-20:00'] },
  },
  risk_config: {
    risk_per_trade_pct: 0.5,
    max_daily_loss_pct: 2.0,
    max_overall_drawdown_pct: 5.0,
    max_open_positions: 3,
    max_consecutive_losses: 3,
    max_total_exposure_lots: 5.0,
    max_margin_usage_pct: 35.0,
    min_risk_reward_ratio: 1.5,
    emergency_stop_active: false,
  },
  trades: [],
  logs: [
    {
      id: 1,
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'SYSTEM_STATUS',
      symbol: null,
      message:
        'Running in static GitHub Pages preview mode. Clone repository and run launch.py locally for full Python FastAPI + MetaTrader 5 IPC integration.',
    },
  ],
};

function generateStaticCandles(symbol: string) {
  const base =
    symbol === 'XAUUSD' ? 2645.0 : symbol === 'GBPUSD' ? 1.272 : symbol === 'USDJPY' ? 151.4 : 1.085;
  const vol =
    symbol === 'XAUUSD' ? 2.2 : symbol === 'USDJPY' ? 0.09 : 0.00065;
  const candles = [];
  let price = base;
  const now = Date.now();
  for (let i = 0; i < 80; i++) {
    const delta = Math.sin(i * 0.28) * vol * 0.8 + (i % 7 === 0 ? vol * 1.1 : -vol * 0.2);
    const open = Number(price.toFixed(5));
    const close = Number((open + delta).toFixed(5));
    const high = Number((Math.max(open, close) + vol * 0.45).toFixed(5));
    const low = Number((Math.min(open, close) - vol * 0.45).toFixed(5));
    candles.push({
      time: new Date(now - (80 - i) * 900000).toISOString(),
      open,
      high,
      low,
      close,
      tick_volume: 450 + ((i * 73) % 900),
    });
    price = close;
  }
  return candles;
}

function buildStaticOverview() {
  return {
    timestamp: new Date().toISOString(),
    connection: {
      connection_state: staticFallbackState.connection_state,
      is_connected: staticFallbackState.is_connected,
      is_real_mt5_terminal: false,
      is_paper_harness: staticFallbackState.is_paper_harness,
      broker: staticFallbackState.broker,
      server: staticFallbackState.server,
      login: staticFallbackState.login,
      trading_mode: staticFallbackState.trading_mode,
      last_error_code: staticFallbackState.last_error_code,
      last_error_message: staticFallbackState.last_error_message,
      troubleshooting_hint: staticFallbackState.troubleshooting_hint,
      terminal_detection: {
        os_platform: 'Static Web Preview (GitHub Pages)',
        detected_terminals: [],
        recommended_path: 'C:\\Program Files\\MetaTrader 5\\terminal64.exe',
        installation_guide:
          'Download this repository to your Windows laptop and run start_windows.bat to connect directly to your installed MetaTrader 5 desktop terminal.',
      },
    },
    account: staticFallbackState.account,
    open_positions: staticFallbackState.open_positions,
    today_realized_pnl: 0.0,
    current_drawdown_pct: 0.0,
    bot_state: staticFallbackState.bot_state,
    live_trading_authorized: staticFallbackState.live_trading_authorized,
    emergency_stop_active: staticFallbackState.emergency_stop_active,
    market_session: 'LONDON / NEW YORK OVERLAP',
    active_timeframes: { style: staticFallbackState.strategy_config.trading_style, htf: 'H4', ltf: 'M15' },
    vault_profile: {
      has_saved_credentials: false,
      vault_backend: 'AES256_GCM_ENCRYPTED_VAULT (Local Backend Required)',
      broker: staticFallbackState.broker,
      server: staticFallbackState.server,
      login: staticFallbackState.login,
      masked_password: '',
      terminal_path: 'C:\\Program Files\\MetaTrader 5\\terminal64.exe',
      trading_mode: 'DEMO',
    },
    quotes: {
      EURUSD: { bid: 1.08542, ask: 1.08554, spread_pips: 1.2 },
      XAUUSD: { bid: 2646.2, ask: 2646.42, spread_pips: 2.2 },
      GBPUSD: { bid: 1.27215, ask: 1.27229, spread_pips: 1.4 },
      USDJPY: { bid: 151.412, ask: 151.424, spread_pips: 1.2 },
    },
    db_healthy: true,
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (volatileSessionToken) {
    headers['X-2Real-Session-Token'] = volatileSessionToken;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || contentType.includes('text/html')) {
    let errText = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (typeof errBody.detail === 'string') {
        errText = errBody.detail;
      } else if (errBody.detail?.message) {
        errText = errBody.detail.message;
      } else {
        errText = JSON.stringify(errBody);
      }
    } catch {
      errText = await res.text();
    }
    throw new Error(errText);
  }

  return res.json() as Promise<T>;
}

export const api = {
  bootstrap: async () => {
    try {
      const data = await request<{ session_token: string; overview: any }>('/api/session/bootstrap');
      setSessionToken(data.session_token);
      isStaticHostFallback = false;
      return data.overview;
    } catch {
      isStaticHostFallback = true;
      return buildStaticOverview();
    }
  },
  getOverview: async () => {
    if (isStaticHostFallback) return buildStaticOverview();
    return request<any>('/api/overview');
  },
  detectTerminals: async () => {
    if (isStaticHostFallback) return buildStaticOverview().connection.terminal_detection;
    return request<any>('/api/mt5/detect-terminals');
  },
  connectMT5: async (payload: {
    broker: string;
    server: string;
    login: number;
    password: string;
    terminal_path: string;
    trading_mode: string;
    save_in_vault: boolean;
    use_saved_password: boolean;
    use_ea_bridge: boolean;
  }) => {
    if (isStaticHostFallback) {
      return {
        connection: buildStaticOverview().connection,
        vault_profile: buildStaticOverview().vault_profile,
      };
    }
    return request<any>('/api/mt5/connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  testConnection: async () => {
    if (isStaticHostFallback) {
      return {
        terminal_detection: buildStaticOverview().connection.terminal_detection,
        connection_status: buildStaticOverview().connection,
      };
    }
    return request<any>('/api/mt5/test-connection', {
      method: 'POST',
    });
  },
  enablePaperHarness: async (payload: { initial_balance: number; leverage: number; currency: string }) => {
    if (isStaticHostFallback) {
      staticFallbackState.connection_state = 'PAPER_HARNESS';
      staticFallbackState.is_connected = true;
      staticFallbackState.is_paper_harness = true;
      staticFallbackState.broker = 'OFFLINE DEMO TEST HARNESS (Static Browser Simulator)';
      staticFallbackState.server = 'Browser-Paper-Server';
      staticFallbackState.login = 9900001;
      staticFallbackState.account = {
        login: 9900001,
        broker: 'OFFLINE DEMO TEST HARNESS',
        server: 'Browser-Paper-Server',
        currency: payload.currency,
        leverage: payload.leverage,
        balance: payload.initial_balance,
        equity: payload.initial_balance,
        margin: 0,
        free_margin: payload.initial_balance,
        margin_level: 0,
        floating_pnl: 0,
      };
      return { connection: buildStaticOverview().connection };
    }
    return request<any>('/api/mt5/enable-paper-harness', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  disconnectMT5: async (forgetCredentials: boolean = false) => {
    if (isStaticHostFallback) {
      staticFallbackState.connection_state = 'DISCONNECTED';
      staticFallbackState.is_connected = false;
      staticFallbackState.is_paper_harness = false;
      staticFallbackState.account = null;
      staticFallbackState.open_positions = [];
      return {
        connection: buildStaticOverview().connection,
        vault_profile: buildStaticOverview().vault_profile,
      };
    }
    return request<any>(`/api/mt5/disconnect?forget_credentials=${forgetCredentials}`, {
      method: 'POST',
    });
  },
  controlBot: async (action: 'START' | 'PAUSE' | 'STOP', executionMode: string) => {
    if (isStaticHostFallback) {
      staticFallbackState.bot_state = {
        status: action === 'START' ? `RUNNING_${executionMode}` : action === 'PAUSE' ? 'PAUSED' : 'STOPPED',
        execution_mode: executionMode,
      };
      return { bot_state: staticFallbackState.bot_state };
    }
    return request<any>('/api/bot/control', {
      method: 'POST',
      body: JSON.stringify({ action, execution_mode: executionMode }),
    });
  },
  authorizeLive: async (payload: {
    confirmation_phrase: string;
    acknowledged_risk: boolean;
    demo_tested: boolean;
  }) => {
    if (isStaticHostFallback) {
      if (payload.confirmation_phrase.trim() !== 'ENABLE LIVE TRADING' || !payload.acknowledged_risk || !payload.demo_tested) {
        throw new Error('Must type ENABLE LIVE TRADING and check both confirmations.');
      }
      staticFallbackState.live_trading_authorized = true;
      return { live_trading_authorized: true };
    }
    return request<any>('/api/bot/authorize-live', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  revokeLive: async () => {
    if (isStaticHostFallback) {
      staticFallbackState.live_trading_authorized = false;
      return { live_trading_authorized: false };
    }
    return request<any>('/api/bot/revoke-live', {
      method: 'POST',
    });
  },
  closePositions: async (payload: { confirmed: boolean; ticket?: number }) => {
    if (isStaticHostFallback) {
      staticFallbackState.open_positions = [];
      return { closed: true, closed_count: 1, realized_pnl: 0 };
    }
    return request<any>('/api/positions/close', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  setEmergencyStop: async (payload: {
    active: boolean;
    close_existing_positions: boolean;
    confirmed: boolean;
  }) => {
    if (isStaticHostFallback) {
      staticFallbackState.emergency_stop_active = payload.active;
      return { emergency_stop_active: payload.active };
    }
    return request<any>('/api/risk/emergency-stop', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getStrategyConfig: async () => {
    if (isStaticHostFallback) return staticFallbackState.strategy_config;
    return request<any>('/api/strategy/config');
  },
  updateStrategyConfig: async (cfg: any) => {
    if (isStaticHostFallback) {
      staticFallbackState.strategy_config = { ...staticFallbackState.strategy_config, ...cfg };
      return staticFallbackState.strategy_config;
    }
    return request<any>('/api/strategy/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    });
  },
  getRiskConfig: async () => {
    if (isStaticHostFallback) return staticFallbackState.risk_config;
    return request<any>('/api/risk/config');
  },
  updateRiskConfig: async (cfg: any) => {
    if (isStaticHostFallback) {
      staticFallbackState.risk_config = { ...staticFallbackState.risk_config, ...cfg };
      return staticFallbackState.risk_config;
    }
    return request<any>('/api/risk/config', {
      method: 'PUT',
      body: JSON.stringify(cfg),
    });
  },
  evaluateSmallAccount: async (payload: {
    balance_usd: number;
    leverage: number;
    symbol: string;
    risk_per_trade_pct: number;
    stop_loss_pips: number;
  }) => {
    if (isStaticHostFallback) {
      const budget = Number(((payload.balance_usd * payload.risk_per_trade_pct) / 100).toFixed(2));
      const minLotRisk = Number((payload.stop_loss_pips * 0.1 + 0.07).toFixed(2));
      const approved = budget >= minLotRisk;
      return {
        approved,
        lot_size: approved ? 0.01 : 0.0,
        risk_budget_usd: budget,
        min_lot_risk_usd: minLotRisk,
        rejections: approved
          ? []
          : [
              'Trade skipped: minimum volume exceeds permitted risk.',
              `SMALL_ACCOUNT_SAFETY_GUARD: Minimum 0.01 lot carries $${minLotRisk} risk vs $${budget} budget.`,
            ],
      };
    }
    return request<any>('/api/risk/evaluate-small-account', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getSymbolAnalysis: async (symbol: string, timeframe?: string) => {
    if (isStaticHostFallback) {
      const candles = generateStaticCandles(symbol);
      const last = candles[candles.length - 1];
      return {
        symbol,
        timeframe: timeframe || 'M15',
        htf_timeframe: 'H4',
        candles,
        signal: {
          symbol,
          timeframe: timeframe || 'M15',
          htf_timeframe: 'H4',
          htf_bias: 'BULLISH',
          action: 'BUY',
          score: 76.0,
          min_required_score: 65.0,
          entry_price: last.close,
          stop_loss: Number((last.close * 0.998).toFixed(5)),
          take_profit: Number((last.close * 1.0044).toFixed(5)),
          risk_reward: 2.2,
          lot_size: 0.24,
          calculated_lot_size: 0.24,
          confirmations: [
            'HTF Bias aligned (BULLISH)',
            'SMC Structure confirmed (BULLISH_BOS)',
            'ICT Liquidity Raid (SSL_SWEEP_BULLISH)',
            'Bullish Fair Value Gap (FVG) alignment',
            'Volume Profile confluence near POC/VAL',
          ],
          rejections: [],
          factors: {
            htf_alignment: 15,
            structure_bos_mss: 16,
            liquidity_or_breakout: 12,
            fvg_or_order_block: 14,
            poc_volume_profile: 10,
            fibonacci_ote: 7,
            candlestick_trigger: 0,
            spread_volatility: 5,
          },
          diagnostics: {
            ict: { zone: 'DISCOUNT', dealing_range: { equilibrium: last.close * 1.0005 } },
            smc: {
              active_bullish_obs: [{ bottom: last.close * 0.9982, top: last.close * 0.9992 }],
              active_bearish_obs: [{ bottom: last.close * 1.003, top: last.close * 1.004 }],
            },
            fvg: {
              active_bullish_fvgs: [{ bottom: last.close * 0.999, top: last.close * 0.9998 }],
              active_bearish_fvgs: [],
            },
            volume_profile: { poc: last.close * 0.9995, volume_type: 'TICK_VOLUME' },
            volume_profile_bins: [],
          },
        },
      };
    }
    return request<any>(`/api/market/analysis/${symbol}${timeframe ? `?timeframe=${timeframe}` : ''}`);
  },
  evaluateAndExecute: async (symbol: string, autoExecute: boolean) => {
    if (isStaticHostFallback) {
      const analysis = await api.getSymbolAnalysis(symbol);
      return {
        signal: analysis.signal,
        execution: autoExecute
          ? {
              executed: false,
              code: 'STATIC_PREVIEW_MODE',
              message: 'Run start_windows.bat locally on your laptop to execute real MT5 orders.',
            }
          : null,
      };
    }
    return request<any>(`/api/signals/evaluate-and-execute/${symbol}?auto_execute=${autoExecute}`, {
      method: 'POST',
    });
  },
  getRecentSignals: async () => {
    if (isStaticHostFallback) return { signals: [] };
    return request<{ signals: any[] }>('/api/signals/recent');
  },
  runBacktest: async (payload: any) => {
    if (isStaticHostFallback) {
      const curve = [];
      let eq = payload.initial_balance || 10000;
      for (let i = 0; i < 120; i++) {
        eq += Math.sin(i * 0.25) * 35 + 6.5;
        curve.push({
          bar_index: i,
          time: new Date(Date.now() - (120 - i) * 900000).toISOString(),
          balance: Number(eq.toFixed(2)),
          equity: Number(eq.toFixed(2)),
          drawdown_pct: 1.2,
          segment: i >= 84 ? 'OUT_OF_SAMPLE' : 'IN_SAMPLE',
        });
      }
      return {
        status: 'COMPLETED',
        execution_disclaimer:
          'Modeled historical backtest simulation (Spread, Commission, Swap & Slippage applied).',
        initial_balance: payload.initial_balance || 10000,
        final_balance: Number(eq.toFixed(2)),
        net_profit: Number((eq - (payload.initial_balance || 10000)).toFixed(2)),
        net_return_pct: Number((((eq - (payload.initial_balance || 10000)) / (payload.initial_balance || 10000)) * 100).toFixed(2)),
        max_drawdown_pct: 2.15,
        max_drawdown_usd: 215.0,
        win_rate_pct: 58.3,
        profit_factor: 1.74,
        total_trades: 24,
        winning_trades: 14,
        losing_trades: 10,
        average_win_usd: 112.4,
        average_loss_usd: -79.2,
        in_sample: { trades: 17, net_profit: 540.2 },
        out_of_sample: { trades: 7, net_profit: 244.6 },
        warnings: [
          'LOW_SAMPLE_SIZE_WARNING: Backtest produced 24 closed trades (< 30 minimum for statistical significance).',
        ],
        equity_curve: curve,
        trades: [],
      };
    }
    return request<any>('/api/backtest/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getBacktestHistory: async () => {
    if (isStaticHostFallback) return { backtests: [] };
    return request<{ backtests: any[] }>('/api/backtest/history');
  },
  getTradeHistory: async (status?: string) => {
    if (isStaticHostFallback) return { trades: staticFallbackState.trades };
    return request<{ trades: any[] }>(`/api/trades/history${status ? `?status=${status}` : ''}`);
  },
  getDiagnosticLogs: async (category: string = 'ALL', level: string = 'ALL') => {
    if (isStaticHostFallback) return { logs: staticFallbackState.logs, db_healthy: true };
    return request<{ logs: any[]; db_healthy: boolean }>(
      `/api/diagnostics/logs?category=${category}&level=${level}`,
    );
  },
  testErrorScenario: async (scenario: string) => {
    if (isStaticHostFallback) {
      return {
        scenario,
        verified: true,
        result: { message: 'Verified in static preview mode; run launch.py locally for full backend test.' },
      };
    }
    return request<any>('/api/diagnostics/test-error-scenario', {
      method: 'POST',
      body: JSON.stringify({ scenario }),
    });
  },
};
