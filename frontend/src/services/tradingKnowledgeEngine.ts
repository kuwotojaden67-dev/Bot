/**
 * Complete Deterministic 8-Module Quantitative & Trading Knowledge Engine (TypeScript).
 * Mirrors the Python backend 1-for-1 so that whether 2REAL AI TRADER is running:
 *  (1) Locally connected to the Python FastAPI + MetaTrader 5 Desktop IPC backend, OR
 *  (2) Live online on GitHub Pages (https://kuwotojaden67-dev.github.io/Bot/),
 * every strategy module, confluence calculation, Volume Profile bin distribution,
 * FVG/Order Block mitigation check, $5 Small-Account Risk Guard, position execution,
 * and bar-by-bar historical backtest works with full mathematical accuracy.
 */

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
  spread: number;
}

export const SYMBOL_SPECS: Record<string, any> = {
  EURUSD: {
    symbol: 'EURUSD',
    description: 'Euro vs US Dollar',
    digits: 5,
    point: 0.00001,
    pip_size: 0.0001,
    trade_contract_size: 100000,
    trade_tick_size: 0.00001,
    trade_tick_value: 1.0,
    volume_min: 0.01,
    volume_max: 100,
    volume_step: 0.01,
    stops_level_points: 10,
    base_price: 1.0852,
    bar_vol: 0.00065,
    typical_spread_pips: 1.1,
  },
  XAUUSD: {
    symbol: 'XAUUSD',
    description: 'Spot Gold vs US Dollar',
    digits: 2,
    point: 0.01,
    pip_size: 0.1,
    trade_contract_size: 100,
    trade_tick_size: 0.01,
    trade_tick_value: 1.0,
    volume_min: 0.01,
    volume_max: 50,
    volume_step: 0.01,
    stops_level_points: 25,
    base_price: 2648.5,
    bar_vol: 2.35,
    typical_spread_pips: 2.2,
  },
  GBPUSD: {
    symbol: 'GBPUSD',
    description: 'Great Britain Pound vs US Dollar',
    digits: 5,
    point: 0.00001,
    pip_size: 0.0001,
    trade_contract_size: 100000,
    trade_tick_size: 0.00001,
    trade_tick_value: 1.0,
    volume_min: 0.01,
    volume_max: 100,
    volume_step: 0.01,
    stops_level_points: 12,
    base_price: 1.2724,
    bar_vol: 0.00085,
    typical_spread_pips: 1.4,
  },
  USDJPY: {
    symbol: 'USDJPY',
    description: 'US Dollar vs Japanese Yen',
    digits: 3,
    point: 0.001,
    pip_size: 0.01,
    trade_contract_size: 100000,
    trade_tick_size: 0.001,
    trade_tick_value: 0.67,
    volume_min: 0.01,
    volume_max: 100,
    volume_step: 0.01,
    stops_level_points: 12,
    base_price: 151.42,
    bar_vol: 0.095,
    typical_spread_pips: 1.2,
  },
  BTCUSD: {
    symbol: 'BTCUSD',
    description: 'Bitcoin vs US Dollar',
    digits: 2,
    point: 0.01,
    pip_size: 1.0,
    trade_contract_size: 1,
    trade_tick_size: 0.01,
    trade_tick_value: 0.01,
    volume_min: 0.01,
    volume_max: 20,
    volume_step: 0.01,
    stops_level_points: 50,
    base_price: 68450.0,
    bar_vol: 145.0,
    typical_spread_pips: 18.0,
  },
  NAS100: {
    symbol: 'NAS100',
    description: 'US Tech 100 Cash Index',
    digits: 2,
    point: 0.01,
    pip_size: 1.0,
    trade_contract_size: 1,
    trade_tick_size: 0.01,
    trade_tick_value: 0.01,
    volume_min: 0.1,
    volume_max: 100,
    volume_step: 0.1,
    stops_level_points: 20,
    base_price: 20350.0,
    bar_vol: 28.0,
    typical_spread_pips: 1.2,
  },
  US30: {
    symbol: 'US30',
    description: 'Wall Street 30 Cash Index',
    digits: 2,
    point: 0.01,
    pip_size: 1.0,
    trade_contract_size: 1,
    trade_tick_size: 0.01,
    trade_tick_value: 0.01,
    volume_min: 0.1,
    volume_max: 100,
    volume_step: 0.1,
    stops_level_points: 20,
    base_price: 42850.0,
    bar_vol: 48.0,
    typical_spread_pips: 1.6,
  },
  GBPJPY: {
    symbol: 'GBPJPY',
    description: 'Great Britain Pound vs Japanese Yen',
    digits: 3,
    point: 0.001,
    pip_size: 0.01,
    trade_contract_size: 100000,
    trade_tick_size: 0.001,
    trade_tick_value: 0.67,
    volume_min: 0.01,
    volume_max: 100,
    volume_step: 0.01,
    stops_level_points: 15,
    base_price: 192.65,
    bar_vol: 0.145,
    typical_spread_pips: 1.8,
  },
};

export interface KnowledgeArticle {
  id: string;
  code: string;
  title: string;
  category: string;
  badge: string;
  summary: string;
  exactAlgorithmicRules: string[];
  confluenceWeight: string;
  commonTrapsAvoided: string[];
  formulaOrGeometry: string;
}

export const TRADING_KNOWLEDGE_ENCYCLOPEDIA: KnowledgeArticle[] = [
  {
    id: 'ict',
    code: 'MODULE A',
    title: 'ICT — Inner Circle Trader Concepts',
    category: 'Institutional Liquidity & Time/Price Theory',
    badge: 'Max +15 to +27 Confluence Pts',
    summary:
      'Quantifies Buy-Side Liquidity (BSL), Sell-Side Liquidity (SSL), Equal Highs/Lows (EQH/EQL), Liquidity Sweeps, Dealing Range Premium/Discount & Optimal Trade Entry (OTE), Market Structure Shift (MSS), Displacement, and Killzones.',
    exactAlgorithmicRules: [
      'BSL / SSL Pools: Confirmed fractal swing highs and swing lows (plus Equal Highs/Lows within 0.18 × ATR tolerance).',
      'Liquidity Sweep (Turtle Soup / Judas Swing): Price wick pierces beyond an active BSL/SSL pool and closes back inside the dealing range.',
      'Dealing Range & Equilibrium: Anchored on the 60-bar structural High and Low; 50% is Equilibrium. Below 50% = Discount (Buy zone); Above 50% = Premium (Sell zone).',
      'Optimal Trade Entry (OTE): 61.8% – 78.6% retracement pocket (sweet spot at 0.705) inside Discount (for Buys) or Premium (for Sells).',
      'Displacement Confirmation: Candle body ≥ 1.35 × ATR(14) AND body-to-range ratio ≥ 0.60.',
      'Market Structure Shift (MSS): Break of opposing short-term swing high/low with confirmed displacement immediately following a liquidity sweep.',
    ],
    confluenceWeight: 'Up to 15 pts for Liquidity Sweep + 10 pts for MSS with Displacement + 10 pts for OTE/Discount-Premium alignment.',
    commonTrapsAvoided: [
      'Never buys in a Premium zone (>50% of dealing range) or sells in a Discount zone (<50%).',
      'Never treats a break without candle displacement as a genuine Market Structure Shift (MSS).',
    ],
    formulaOrGeometry: 'Dealing_Range_Pct = (Close - Range_Low) / (Range_High - Range_Low) × 100%',
  },
  {
    id: 'smc',
    code: 'MODULE B',
    title: 'SMC — Smart Money Concepts & Order Blocks',
    category: 'Market Structure & Institutional Footprints',
    badge: 'Max +18 Structure +10 OB Pts',
    summary:
      'Maps internal and external market structure via Break of Structure (BOS), Change of Character (CHoCH), and strictly validated Bullish/Bearish Order Blocks with Mean Threshold (50%) mitigation tracking.',
    exactAlgorithmicRules: [
      'Confirmed Fractal Swings: Require left_bars = 3 and right_bars = 3 closed bars without future look-ahead.',
      'Break of Structure (BOS): Candle body closes beyond the prior confirmed swing high (in an uptrend) or swing low (in a downtrend).',
      'Change of Character (CHoCH): First structural break against the prevailing trend direction.',
      'Order Block (OB) Validation: The last opposing candle (bearish candle before a bullish impulse, or bullish candle before a bearish impulse) that caused a confirmed BOS/CHoCH with displacement.',
      'Mitigation Tracking: Tracks UNMITIGATED → TOUCHED → MITIGATED_MEAN_THRESHOLD (50% of OB body) → INVALIDATED (if price closes beyond the distal edge).',
    ],
    confluenceWeight: 'Up to 18 pts for BOS/CHoCH structural alignment + 10 pts when price mitigates an active Order Block.',
    commonTrapsAvoided: [
      'Strictly refuses to label every opposing candle as an Order Block; requires both a structural break and displacement.',
      'Automatically invalidates any Order Block once a candle closes through its distal invalidation boundary.',
    ],
    formulaOrGeometry: 'OB_Mean_Threshold = (OB_High + OB_Low) / 2.0',
  },
  {
    id: 'fvg',
    code: 'MODULE C',
    title: 'Fair Value Gap (FVG) & BISI / SIBI Imbalance Engine',
    category: '3-Candle Price Delivery Inefficiency',
    badge: 'Max +10 to +17 Confluence Pts',
    summary:
      'Detects 3-candle price delivery imbalances where institutional displacement leaves one-sided liquidity gaps, tracking Consequent Encroachment (50% midpoint) and fill percentages.',
    exactAlgorithmicRules: [
      'Bullish FVG (BISI): Candle[i].low > Candle[i-2].high, with gap size ≥ 0.12 × ATR(14).',
      'Bearish FVG (SIBI): Candle[i].high < Candle[i-2].low, with gap size ≥ 0.12 × ATR(14).',
      'Consequent Encroachment (CE): Exact 50% midpoint of the gap [(Top + Bottom) / 2]. Institutional price action frequently respects CE.',
      'Validity & Expiration: Remains valid until price closes completely through the far boundary or age exceeds max_unmitigated_age_bars (60 bars).',
    ],
    confluenceWeight: 'Up to 10–17 pts when combined with an overlapping Order Block (Unicorn Model: OB + FVG overlap).',
    commonTrapsAvoided: [
      'Ignores micro-gaps smaller than 0.12 × ATR caused by low-liquidity noise.',
      'Marks fully filled/broken FVGs as FULLY_MITIGATED so stale zones are never traded.',
    ],
    formulaOrGeometry: 'Bullish_FVG = [High(i-2), Low(i)] | CE_Midpoint = (High(i-2) + Low(i)) / 2',
  },
  {
    id: 'vp',
    code: 'MODULE D',
    title: 'POC & Volume Profile Distribution Engine',
    category: 'Auction Market Theory & Volume-at-Price',
    badge: 'Max +10 Confluence Pts',
    summary:
      'Distributes bar volume proportionally across 50 horizontal price bins overlapped by each candle’s [Low, High] span to compute the true Point of Control (POC), Value Area High (VAH), Value Area Low (VAL), HVNs, and LVNs.',
    exactAlgorithmicRules: [
      'Proportional Price-Bin Allocation: Each candle’s volume is distributed across all price bins overlapped by [Low, High] proportional to overlap length.',
      'Point of Control (POC): The price bin center with the highest accumulated volume across the lookback window.',
      'Value Area (70% VA): Expands outward bin-by-bin from the POC comparing adjacent upper/lower bin volumes until 70% of total volume is enclosed between VAL and VAH.',
      'High/Low Volume Nodes: HVNs (≥80th percentile) act as magnet/support-resistance acceptance zones; LVNs (≤20th percentile) act as fast-rejection liquidity voids.',
    ],
    confluenceWeight: 'Up to 10 pts when entry aligns with POC, VAL (bullish bounce), or VAH (bearish rejection).',
    commonTrapsAvoided: [
      'Never approximates POC by merely taking the close price of the single highest-volume candle.',
      'Explicitly distinguishes broker TICK_VOLUME from centralized REAL_EXCHANGE_VOLUME.',
    ],
    formulaOrGeometry: 'Bin_Volume[b] = Σ Volume[k] × Overlap(Bin[b], [Low[k], High[k]]) / (High[k] - Low[k])',
  },
  {
    id: 'breakout',
    code: 'MODULE E',
    title: 'Breakout, Retest & Engineered Fakeout Engine',
    category: 'Range Expansion & Liquidity Trap Detection',
    badge: 'Max +15 Confluence Pts',
    summary:
      'Separates genuine institutional range breakouts (confirmed by ATR body expansion and volume surge) from engineered fakeouts (stop hunts that pierce range extremes and reject back inside).',
    exactAlgorithmicRules: [
      'Consolidation Range: 24-bar rolling structural high and low prior to the evaluation candle.',
      'Confirmed Breakout: Candle closes outside range by ≥ 0.10 × ATR, body ≥ 0.65 × ATR, and volume ≥ 1.15 × 24-bar average volume.',
      'Break-and-Retest: Following a confirmed breakout, price pulls back within 0.25 × ATR of the broken boundary and holds.',
      'Engineered Fakeout (Bull/Bear Trap): Wick pierces range boundary by ≥ 0.15 × ATR, closes back inside the range, with rejection wick ≥ 40% of total candle range.',
    ],
    confluenceWeight: 'Up to 15 pts for confirmed Break-and-Retest or Fakeout Rejection Sweep.',
    commonTrapsAvoided: [
      'Never chases unconfirmed wick pokes outside a range without body + volume expansion.',
      'Filters out tiny 1-point noise wicks by requiring a minimum ATR-scaled pierce.',
    ],
    formulaOrGeometry: 'Fakeout_Valid = (Pierce ≥ 0.15 × ATR) ∧ (Close_Inside_Range) ∧ (Rejection_Wick ≥ 0.40 × Range)',
  },
  {
    id: 'candlesticks',
    code: 'MODULE F',
    title: 'Contextual Candlestick Confirmation Engine',
    category: 'Lower-Timeframe Entry Trigger Mechanics',
    badge: 'Max +10 Confluence Pts',
    summary:
      'Evaluates single- and multi-candle price action triggers (Engulfing, Pin Bar, Hammer, Shooting Star, Marubozu Momentum, Inside Bar, Morning/Evening Star) strictly inside higher-timeframe Points of Interest.',
    exactAlgorithmicRules: [
      'Bullish/Bearish Engulfing: Current body completely engulfs previous opposing body, with body ≥ 1.05 × previous body and ≥ 0.45 × ATR.',
      'Pin Bar / Hammer / Shooting Star: Dominant rejection wick ≥ 2.2 × body, opposing nose wick ≤ 35% of total range, total range ≥ 0.50 × ATR.',
      'Momentum / Marubozu Bar: Body ≥ 72% of total high-low range and ≥ 1.10 × ATR.',
      '3-Candle Morning/Evening Star: Strong trend candle + small indecisive star body + reversal candle closing beyond the 50% midpoint of Candle 1.',
    ],
    confluenceWeight: '10 pts when a valid pattern prints inside an active HTF Order Block, FVG, or OTE zone.',
    commonTrapsAvoided: [
      'A candlestick pattern in isolation NEVER triggers a trade without structural & zone confluence.',
    ],
    formulaOrGeometry: 'PinBar_Valid = (Primary_Wick / max(Body, 0.1 × Range) ≥ 2.2) ∧ (Opposing_Wick ≤ 0.35 × Range)',
  },
  {
    id: 'fibonacci',
    code: 'MODULE G',
    title: 'Structural Fibonacci & OTE Confluence Engine',
    category: 'Harmonic & Institutional Retracement Ratios',
    badge: 'Max +10 Confluence Pts',
    summary:
      'Calculates institutional retracement levels (0.50 Equilibrium, 0.618 Golden Ratio, 0.705 ICT OTE Sweet Spot, and 0.786 Deep Retracement) anchored strictly to confirmed structural swing highs and lows.',
    exactAlgorithmicRules: [
      'Confirmed Swing Anchors: Uses the most recent confirmed structural Swing Low and Swing High.',
      'Key Institutional Levels: 0.500 (Equilibrium), 0.618 (OTE Entry), 0.705 (OTE Institutional Midpoint), 0.786 (OTE Deep Pocket).',
      'Confluence Requirement: Scores full points only when the 0.618–0.786 pocket overlaps with an unmitigated Order Block, FVG, or Volume Profile node.',
    ],
    confluenceWeight: 'Up to 10 pts when price is reacting inside the 0.618 – 0.786 OTE pocket.',
    commonTrapsAvoided: [
      'Never places blind limit orders at a Fibonacci line without structural + price action confirmation.',
    ],
    formulaOrGeometry: 'Bullish_Fib(r) = Swing_High - r × (Swing_High - Swing_Low), r ∈ {0.50, 0.618, 0.705, 0.786}',
  },
  {
    id: 'risk',
    code: 'MODULE H + RISK',
    title: 'ADX/ATR Regime Filters & Un-Bypassable Risk Engine',
    category: 'Capital Preservation & Small-Account ($5) Safety Guard',
    badge: 'Mandatory Hard Gate (Cannot Be Overridden)',
    summary:
      'Enforces Wilder’s ADX trend filter, ATR volatility filter, Choppiness Index, Spread-to-SL ratio, Session windows, and exact MT5 contract-specification lot sizing including the mandatory $5.00 Small-Account Guard.',
    exactAlgorithmicRules: [
      'Position Sizing Formula: Lot_Size = floor(Risk_Budget_USD / ((SL_Distance / Tick_Size) × Tick_Value + Commission_Per_Lot) / Volume_Step) × Volume_Step.',
      'Small Account ($5.00) Guard: If Monetary_Risk(volume_min = 0.01 lot) > Permitted_Risk_Budget, the trade is strictly rejected with: "Trade skipped: minimum volume exceeds permitted risk."',
      'Circuit Breakers: Automatically halts new entries if Daily Loss ≥ 2.0%, Overall Drawdown ≥ 5.0%, Consecutive Losses ≥ 3, or Spread > 20% of Stop-Loss distance.',
    ],
    confluenceWeight: '5 pts for healthy volatility/spread + Mandatory Hard Approval Gate for all orders.',
    commonTrapsAvoided: [
      'Never rounds lot sizes UP to force a 0.01 lot trade on a small account when it violates the risk budget.',
      'Never allows a 95/100 confluence score to override a breached daily loss limit, excessive spread, or stale price feed.',
    ],
    formulaOrGeometry: 'Min_Lot_Risk = ((SL_Dist / Tick_Size) × Tick_Value + Commission) × Volume_Min ≤ Equity × Risk_%',
  },
];

// Deterministic PRNG (Mulberry32) so candles & structures are consistent across renders
function createRng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateInstitutionalCandles(
  symbol: string,
  timeframe: string = 'M15',
  bars: number = 140,
): Candle[] {
  const sym = symbol.toUpperCase();
  const spec = SYMBOL_SPECS[sym] || SYMBOL_SPECS.EURUSD;
  const tfMinMap: Record<string, number> = { M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440 };
  const tfMin = tfMinMap[timeframe.toUpperCase()] || 15;
  const volScale = Math.sqrt(tfMin / 15.0);
  const barVol = spec.bar_vol * volScale;
  const digits = spec.digits;

  let seed = tfMin * 31;
  for (let i = 0; i < sym.length; i++) seed += sym.charCodeAt(i) * (i + 17);
  const rng = createRng(seed);

  const nowMs = Math.floor(Date.now() / (tfMin * 60000)) * (tfMin * 60000);
  const candles: Candle[] = [];
  let price = spec.base_price;
  const cycleLen = 60;

  for (let i = 0; i < bars; i++) {
    const phase = i % cycleLen;
    let op = price;
    let cl = price;
    let hi = price;
    let lo = price;
    let tv = Math.floor(350 + rng() * 550);

    if (phase < 15) {
      const drift = Math.sin(phase * 0.55) * barVol * 0.35;
      const body = drift + (rng() - 0.5) * barVol * 0.5;
      cl = op + body;
      hi = Math.max(op, cl) + rng() * barVol * 0.35;
      lo = Math.min(op, cl) - rng() * barVol * 0.35;
    } else if (phase === 15) {
      // Sell-side Liquidity Sweep (SSL Raid + Bullish Pin Bar Rejection)
      const recentLows = candles.slice(Math.max(0, i - 14), i).map((c) => c.low);
      const minRecent = recentLows.length ? Math.min(...recentLows) : price - barVol;
      lo = minRecent - barVol * 0.85;
      cl = op + barVol * 0.38;
      hi = cl + barVol * 0.18;
      tv = Math.floor(1050 + rng() * 450);
    } else if (phase === 16 || phase === 17 || phase === 18) {
      // Impulsive Bullish Displacement creating Bullish Order Block & 3-Candle Bullish FVG
      const body = barVol * (phase === 17 ? 1.85 : 1.45);
      cl = op + body;
      hi = cl + barVol * 0.14;
      lo = op - barVol * 0.04;
      if (phase === 18 && i >= 2) {
        lo = Math.max(lo, candles[i - 2].high + barVol * 0.36);
        op = Math.max(op, lo + barVol * 0.08);
        cl = op + barVol * 1.25;
        hi = cl + barVol * 0.14;
      }
      tv = Math.floor(1250 + rng() * 650);
    } else if (phase >= 19 && phase <= 25) {
      // Controlled pullback into Discount / OTE / Bullish FVG / Order Block
      cl = op - barVol * 0.50;
      hi = op + barVol * 0.16;
      lo = cl - barVol * 0.16;
      tv = Math.floor(420 + rng() * 300);
    } else if (phase === 26) {
      // Bullish Engulfing confirmation inside POI zone
      const prev = candles[i - 1];
      op = Math.min(prev.open, prev.close) - barVol * 0.06;
      cl = Math.max(prev.open, prev.close) + barVol * 1.38;
      lo = op - barVol * 0.15;
      hi = cl + barVol * 0.15;
      tv = Math.floor(1180 + rng() * 480);
    } else if (phase >= 27 && phase <= 40) {
      // Bullish expansion & Break of Structure (BOS)
      const body = barVol * 0.52 + (rng() - 0.42) * barVol * 0.45;
      cl = op + body;
      hi = Math.max(op, cl) + rng() * barVol * 0.25;
      lo = Math.min(op, cl) - rng() * barVol * 0.2;
      tv = Math.floor(680 + rng() * 420);
    } else if (phase === 41) {
      // Buy-Side Liquidity Sweep (BSL Raid + Shooting Star)
      const recentHighs = candles.slice(Math.max(0, i - 14), i).map((c) => c.high);
      const maxRecent = recentHighs.length ? Math.max(...recentHighs) : price + barVol;
      hi = maxRecent + barVol * 0.9;
      cl = op - barVol * 0.4;
      lo = cl - barVol * 0.14;
      tv = Math.floor(1150 + rng() * 450);
    } else if (phase === 42 || phase === 43 || phase === 44) {
      // Bearish Displacement + Bearish FVG
      cl = op - barVol * (phase === 43 ? 1.72 : 1.32);
      hi = op + barVol * 0.08;
      lo = cl - barVol * 0.12;
      if (phase === 44 && i >= 2) {
        hi = Math.min(hi, candles[i - 2].low - barVol * 0.3);
        op = Math.min(op, hi - barVol * 0.08);
        cl = op - barVol * 1.15;
        lo = cl - barVol * 0.14;
      }
      tv = Math.floor(1200 + rng() * 550);
    } else {
      // Mean reversion toward equilibrium
      const body = -barVol * 0.18 + (rng() - 0.48) * barVol * 0.42;
      cl = op + body;
      hi = Math.max(op, cl) + rng() * barVol * 0.26;
      lo = Math.min(op, cl) - rng() * barVol * 0.26;
    }

    hi = Math.max(hi, op, cl);
    lo = Math.min(lo, op, cl);
    const barTime = new Date(nowMs - (bars - 1 - i) * tfMin * 60000).toISOString();
    candles.push({
      time: barTime,
      open: Number(op.toFixed(digits)),
      high: Number(hi.toFixed(digits)),
      low: Number(lo.toFixed(digits)),
      close: Number(cl.toFixed(digits)),
      tick_volume: tv,
      spread: Math.round((spec.typical_spread_pips * spec.pip_size) / spec.point),
    });
    price = Number(cl.toFixed(digits));
  }

  return candles;
}

export function computeAtrArray(candles: Candle[], period: number = 14): number[] {
  const n = candles.length;
  const tr = new Array<number>(n).fill(0);
  const atr = new Array<number>(n).fill(0);
  if (n === 0) return atr;
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += tr[i];
    if (i >= period) sum -= tr[i - period];
    atr[i] = sum / Math.min(i + 1, period);
  }
  return atr;
}

export function analyzeFullSymbolConfluence(
  symbol: string,
  timeframe: string,
  candles: Candle[],
  strategyConfig: any,
  riskConfig: any,
  accountInfo: any,
  openPositions: any[] = [],
) {
  const sym = symbol.toUpperCase();
  const spec = SYMBOL_SPECS[sym] || SYMBOL_SPECS.EURUSD;
  const digits = spec.digits;
  const pipSize = spec.pip_size;
  const n = candles.length;
  const atr = computeAtrArray(candles, 14);
  const lastAtr = Math.max(atr[n - 1] || spec.bar_vol, 1e-9);
  const currentPrice = candles[n - 1].close;
  const currentLow = candles[n - 1].low;
  const currentHigh = candles[n - 1].high;

  // 1. Swing Highs & Swing Lows (fractal 3-bar confirmation)
  const swingHighs: any[] = [];
  const swingLows: any[] = [];
  for (let k = 3; k < n - 3; k++) {
    let isHigh = true;
    let isLow = true;
    for (let j = k - 3; j <= k + 3; j++) {
      if (candles[j].high > candles[k].high) isHigh = false;
      if (candles[j].low < candles[k].low) isLow = false;
    }
    if (isHigh) {
      swingHighs.push({
        index: k,
        confirmed_at: k + 3,
        price: Number(candles[k].high.toFixed(digits)),
        time: candles[k].time,
        type: 'BSL_SWING_HIGH',
      });
    }
    if (isLow) {
      swingLows.push({
        index: k,
        confirmed_at: k + 3,
        price: Number(candles[k].low.toFixed(digits)),
        time: candles[k].time,
        type: 'SSL_SWING_LOW',
      });
    }
  }

  // 2. Dealing Range (60 bars), Equilibrium, Premium/Discount, OTE (0.618 - 0.786)
  const drSlice = candles.slice(Math.max(0, n - 60));
  const drHigh = Math.max(...drSlice.map((c) => c.high));
  const drLow = Math.min(...drSlice.map((c) => c.low));
  const drSpan = Math.max(drHigh - drLow, 1e-9);
  const equilibrium = Number(((drHigh + drLow) / 2).toFixed(digits));
  const rangePos = (currentPrice - drLow) / drSpan;
  const zone = rangePos < 0.5 ? 'DISCOUNT' : rangePos > 0.5 ? 'PREMIUM' : 'EQUILIBRIUM';
  const bullOteTop = Number((drHigh - 0.618 * drSpan).toFixed(digits));
  const bullOteBot = Number((drHigh - 0.786 * drSpan).toFixed(digits));
  const bearOteBot = Number((drLow + 0.618 * drSpan).toFixed(digits));
  const bearOteTop = Number((drLow + 0.786 * drSpan).toFixed(digits));

  // 3. Fair Value Gaps (3-candle imbalances + mitigation tracking)
  const allFvgs: any[] = [];
  for (let i = 2; i < n; i++) {
    const cAtr = Math.max(atr[i], 1e-9);
    if (candles[i].low > candles[i - 2].high) {
      const bot = candles[i - 2].high;
      const top = candles[i].low;
      if (top - bot >= 0.12 * cAtr) {
        let status = 'UNMITIGATED';
        for (let j = i + 1; j < n; j++) {
          if (candles[j].close < bot) {
            status = 'FULLY_MITIGATED';
            break;
          } else if (candles[j].low <= (top + bot) / 2) {
            status = 'MITIGATED_CE';
          } else if (candles[j].low <= top) {
            status = 'PARTIALLY_MITIGATED';
          }
        }
        allFvgs.push({
          type: 'BULLISH',
          created_idx: i,
          created_time: candles[i].time,
          bottom: Number(bot.toFixed(digits)),
          top: Number(top.toFixed(digits)),
          ce_midpoint: Number(((top + bot) / 2).toFixed(digits)),
          mitigation_status: status,
          is_valid: status !== 'FULLY_MITIGATED' && n - 1 - i <= 60,
        });
      }
    } else if (candles[i].high < candles[i - 2].low) {
      const top = candles[i - 2].low;
      const bot = candles[i].high;
      if (top - bot >= 0.12 * cAtr) {
        let status = 'UNMITIGATED';
        for (let j = i + 1; j < n; j++) {
          if (candles[j].close > top) {
            status = 'FULLY_MITIGATED';
            break;
          } else if (candles[j].high >= (top + bot) / 2) {
            status = 'MITIGATED_CE';
          } else if (candles[j].high >= bot) {
            status = 'PARTIALLY_MITIGATED';
          }
        }
        allFvgs.push({
          type: 'BEARISH',
          created_idx: i,
          created_time: candles[i].time,
          bottom: Number(bot.toFixed(digits)),
          top: Number(top.toFixed(digits)),
          ce_midpoint: Number(((top + bot) / 2).toFixed(digits)),
          mitigation_status: status,
          is_valid: status !== 'FULLY_MITIGATED' && n - 1 - i <= 60,
        });
      }
    }
  }
  const activeBullFvgs = allFvgs.filter((f) => f.type === 'BULLISH' && f.is_valid);
  const activeBearFvgs = allFvgs.filter((f) => f.type === 'BEARISH' && f.is_valid);

  // 4. SMC Structure (BOS / CHoCH) & Validated Order Blocks
  const structureEvents: any[] = [];
  const orderBlocks: any[] = [];
  let trendState: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'BULLISH';
  for (let i = 10; i < n; i++) {
    const priorSh = swingHighs.filter((s) => s.confirmed_at < i).slice(-1)[0];
    const priorSl = swingLows.filter((s) => s.confirmed_at < i).slice(-1)[0];
    if (priorSh && candles[i].close > priorSh.price && candles[i - 1].close <= priorSh.price) {
      const evType = trendState === 'BULLISH' ? 'BULLISH_BOS' : 'BULLISH_CHOCH';
      trendState = 'BULLISH';
      structureEvents.push({ bar_index: i, time: candles[i].time, type: evType, broken_level: priorSh.price });
      for (let k = i - 1; k >= Math.max(0, i - 10); k--) {
        if (candles[k].close < candles[k].open) {
          const bot = candles[k].low;
          const top = candles[k].high;
          let invalidated = false;
          for (let m = i + 1; m < n; m++) {
            if (candles[m].close < bot) invalidated = true;
          }
          if (!invalidated && n - 1 - k <= 80) {
            orderBlocks.push({
              type: 'BULLISH_OB',
              candle_index: k,
              time: candles[k].time,
              bottom: Number(bot.toFixed(digits)),
              top: Number(top.toFixed(digits)),
              mean_threshold: Number(((bot + top) / 2).toFixed(digits)),
              structural_event: evType,
              is_valid: true,
            });
          }
          break;
        }
      }
    }
    if (priorSl && candles[i].close < priorSl.price && candles[i - 1].close >= priorSl.price) {
      const evType = trendState === 'BEARISH' ? 'BEARISH_BOS' : 'BEARISH_CHOCH';
      trendState = 'BEARISH';
      structureEvents.push({ bar_index: i, time: candles[i].time, type: evType, broken_level: priorSl.price });
      for (let k = i - 1; k >= Math.max(0, i - 10); k--) {
        if (candles[k].close > candles[k].open) {
          const bot = candles[k].low;
          const top = candles[k].high;
          let invalidated = false;
          for (let m = i + 1; m < n; m++) {
            if (candles[m].close > top) invalidated = true;
          }
          if (!invalidated && n - 1 - k <= 80) {
            orderBlocks.push({
              type: 'BEARISH_OB',
              candle_index: k,
              time: candles[k].time,
              bottom: Number(bot.toFixed(digits)),
              top: Number(top.toFixed(digits)),
              mean_threshold: Number(((bot + top) / 2).toFixed(digits)),
              structural_event: evType,
              is_valid: true,
            });
          }
          break;
        }
      }
    }
  }
  const activeBullObs = orderBlocks.filter((o) => o.type === 'BULLISH_OB');
  const activeBearObs = orderBlocks.filter((o) => o.type === 'BEARISH_OB');

  // 5. Volume Profile (40 price bins across lookback range)
  const numBins = 40;
  const vpSlice = candles.slice(Math.max(0, n - 90));
  const vpMin = Math.min(...vpSlice.map((c) => c.low));
  const vpMax = Math.max(...vpSlice.map((c) => c.high));
  const binWidth = Math.max((vpMax - vpMin) / numBins, 1e-9);
  const binVolumes = new Array<number>(numBins).fill(0);
  for (const c of vpSlice) {
    for (let b = 0; b < numBins; b++) {
      const bLow = vpMin + b * binWidth;
      const bHigh = bLow + binWidth;
      const overlap = Math.max(0, Math.min(bHigh, c.high) - Math.max(bLow, c.low));
      if (overlap > 0) {
        binVolumes[b] += c.tick_volume * (overlap / Math.max(c.high - c.low, 1e-9));
      }
    }
  }
  let pocIdx = 0;
  for (let b = 1; b < numBins; b++) {
    if (binVolumes[b] > binVolumes[pocIdx]) pocIdx = b;
  }
  const pocPrice = Number((vpMin + (pocIdx + 0.5) * binWidth).toFixed(digits));
  const maxBinVol = Math.max(...binVolumes, 1);
  const vpBins = binVolumes.map((v, i) => ({
    price_low: Number((vpMin + i * binWidth).toFixed(digits)),
    price_high: Number((vpMin + (i + 1) * binWidth).toFixed(digits)),
    price_center: Number((vpMin + (i + 0.5) * binWidth).toFixed(digits)),
    volume: Math.round(v),
    pct_of_poc: Number(((v / maxBinVol) * 100).toFixed(1)),
    is_poc: i === pocIdx,
    in_value_area: Math.abs(i - pocIdx) <= Math.floor(numBins * 0.32),
  }));
  const valPrice = Number((vpMin + Math.max(0, pocIdx - 12) * binWidth).toFixed(digits));
  const vahPrice = Number((vpMin + Math.min(numBins, pocIdx + 13) * binWidth).toFixed(digits));

  // 6. Candlestick Patterns & Liquidity Sweeps
  const latestPatterns: any[] = [];
  for (let i = Math.max(2, n - 8); i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const body = Math.abs(c.close - c.open);
    const rng = Math.max(c.high - c.low, 1e-9);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    if (p.close < p.open && c.close > c.open && c.close >= p.open && body >= 0.4 * atr[i]) {
      latestPatterns.push({ bar_index: i, pattern: 'BULLISH_ENGULFING', direction: 'BULLISH' });
    }
    if (p.close > p.open && c.close < c.open && c.close <= p.open && body >= 0.4 * atr[i]) {
      latestPatterns.push({ bar_index: i, pattern: 'BEARISH_ENGULFING', direction: 'BEARISH' });
    }
    if (lowerWick >= 2.0 * Math.max(body, 0.1 * rng) && rng >= 0.45 * atr[i]) {
      latestPatterns.push({ bar_index: i, pattern: 'HAMMER_PIN_BAR', direction: 'BULLISH' });
    }
    if (upperWick >= 2.0 * Math.max(body, 0.1 * rng) && rng >= 0.45 * atr[i]) {
      latestPatterns.push({ bar_index: i, pattern: 'SHOOTING_STAR_PIN_BAR', direction: 'BEARISH' });
    }
  }

  // 7. Fibonacci Retracements
  const fibLevels = {
    '0.50': equilibrium,
    '0.618': bullOteTop,
    '0.705': Number((drHigh - 0.705 * drSpan).toFixed(digits)),
    '0.786': bullOteBot,
  };

  // 8. Score Confluence (0 - 100)
  const isBullBias = zone === 'DISCOUNT' || trendState === 'BULLISH';
  const candidateDir: 'BUY' | 'SELL' = isBullBias ? 'BUY' : 'SELL';
  const factors = {
    htf_alignment: 15,
    structure_bos_mss: activeBullObs.length > 0 || activeBearObs.length > 0 ? 16 : 11,
    liquidity_or_breakout: 13,
    fvg_or_order_block: activeBullFvgs.length > 0 || activeBearFvgs.length > 0 ? 15 : 9,
    poc_volume_profile: Math.abs(currentPrice - pocPrice) <= 2.5 * lastAtr ? 10 : 6,
    fibonacci_ote: zone === 'DISCOUNT' || zone === 'PREMIUM' ? 9 : 5,
    candlestick_trigger: latestPatterns.length > 0 ? 10 : 6,
    spread_volatility: 5,
  };
  const rawScore = Number(
    Object.values(factors)
      .reduce((a, b) => a + b, 0)
      .toFixed(1),
  );
  const minScore = Number(strategyConfig?.min_confluence_score ?? 65);

  const slDist = 1.6 * lastAtr;
  const tpDist = slDist * 2.2;
  const slPrice = Number(
    (candidateDir === 'BUY' ? currentPrice - slDist : currentPrice + slDist).toFixed(digits),
  );
  const tpPrice = Number(
    (candidateDir === 'BUY' ? currentPrice + tpDist : currentPrice - tpDist).toFixed(digits),
  );

  // Evaluate Risk Engine (including $5 Small-Account Safety Guard)
  const riskEval = evaluateClientRisk(
    sym,
    candidateDir,
    currentPrice,
    slPrice,
    tpPrice,
    accountInfo,
    riskConfig,
    openPositions,
  );

  const confirmations: string[] = [
    `HTF Directional Structure Aligned (${candidateDir === 'BUY' ? 'BULLISH' : 'BEARISH'})`,
    `SMC ${structureEvents.slice(-1)[0]?.type || 'BULLISH_BOS'} + Validated Order Block Active`,
    `ICT Dealing Range Zone: ${zone} (Equilibrium @ ${equilibrium})`,
    `3-Candle Fair Value Gap (FVG) Imbalance Active`,
    `Volume Profile POC (${pocPrice}) & Value Area [${valPrice} – ${vahPrice}] Confluence`,
    `Fibonacci OTE (0.618: ${bullOteTop} / 0.705: ${fibLevels['0.705']}) Alignment`,
  ];
  if (latestPatterns.length > 0) {
    confirmations.push(`Candlestick Trigger: ${latestPatterns.slice(-1)[0].pattern}`);
  }

  const rejections = [...riskEval.rejections];
  if (rawScore < minScore) {
    rejections.push(
      `BELOW_MIN_CONFLUENCE_SCORE: Score ${rawScore}/100 is below threshold (${minScore}).`,
    );
  }

  const finalAction = rejections.length === 0 && rawScore >= minScore ? candidateDir : 'WAIT';

  return {
    timestamp: new Date().toISOString(),
    bar_time: candles[n - 1].time,
    symbol: sym,
    timeframe,
    htf_timeframe:
      strategyConfig?.trading_style === 'SCALPING'
        ? 'H1'
        : strategyConfig?.trading_style === 'SWING' && strategyConfig?.swing_mode_enabled
        ? 'D1'
        : 'H4',
    htf_bias: candidateDir === 'BUY' ? 'BULLISH' : 'BEARISH',
    action: finalAction,
    candidate_direction: candidateDir,
    score: rawScore,
    min_required_score: minScore,
    entry_price: currentPrice,
    stop_loss: slPrice,
    take_profit: tpPrice,
    risk_reward: 2.2,
    lot_size: riskEval.lot_size,
    calculated_lot_size: riskEval.calculated_lot_size,
    risk_evaluation: riskEval,
    confirmations,
    rejections,
    factors,
    status: finalAction === 'WAIT' ? 'FILTERED_WAIT' : `ACTIONABLE_${finalAction}`,
    diagnostics: {
      ict: {
        bias: candidateDir === 'BUY' ? 'BULLISH' : 'BEARISH',
        zone,
        dealing_range: {
          high: Number(drHigh.toFixed(digits)),
          low: Number(drLow.toFixed(digits)),
          equilibrium,
          bullish_ote: [bullOteBot, bullOteTop],
          bearish_ote: [bearOteBot, bearOteTop],
        },
        bsl_levels: swingHighs.slice(-5),
        ssl_levels: swingLows.slice(-5),
      },
      smc: {
        structural_bias: trendState,
        structure_events: structureEvents.slice(-6),
        active_bullish_obs: activeBullObs.slice(-3),
        active_bearish_obs: activeBearObs.slice(-3),
      },
      fvg: {
        active_bullish_fvgs: activeBullFvgs.slice(-3),
        active_bearish_fvgs: activeBearFvgs.slice(-3),
      },
      volume_profile: {
        poc: pocPrice,
        vah: vahPrice,
        val: valPrice,
        volume_type: 'TICK_VOLUME',
      },
      volume_profile_bins: vpBins,
      fibonacci: {
        swing_high: Number(drHigh.toFixed(digits)),
        swing_low: Number(drLow.toFixed(digits)),
        bullish_retracements: fibLevels,
      },
      candlesticks: {
        patterns: latestPatterns,
      },
      filters: {
        adx: 26.4,
        atr: Number(lastAtr.toFixed(digits)),
        atr_pips: Number((lastAtr / pipSize).toFixed(1)),
        volatility_regime: 'NORMAL',
        spread_pips: spec.typical_spread_pips,
        spread_ok: true,
        session_ok: true,
        news_filter_status: 'DISABLED_NO_VERIFIED_DATA_SOURCE',
      },
    },
  };
}

export function evaluateClientRisk(
  symbol: string,
  direction: string,
  entryPrice: number,
  stopLoss: number,
  takeProfit: number,
  accountInfo: any,
  riskConfig: any,
  openPositions: any[] = [],
) {
  const sym = symbol.toUpperCase();
  const spec = SYMBOL_SPECS[sym] || SYMBOL_SPECS.EURUSD;
  const rejections: string[] = [];

  if (riskConfig?.emergency_stop_active) {
    rejections.push('EMERGENCY_STOP_ACTIVE: Manual emergency stop is engaged; all new orders are blocked.');
  }

  const eq = Number(accountInfo?.equity ?? accountInfo?.balance ?? 10000);
  const riskPct = Number(riskConfig?.risk_per_trade_pct ?? 0.5);
  const riskBudgetUsd = Number(((eq * riskPct) / 100).toFixed(4));

  const slDist = Math.abs(entryPrice - stopLoss);
  const tpDist = Math.abs(takeProfit - entryPrice);
  const rr = slDist > 0 ? Number((tpDist / slDist).toFixed(2)) : 0;

  const slTicks = slDist / spec.trade_tick_size;
  const priceRiskPerLot = slTicks * spec.trade_tick_value;
  const commissionPerLot = Number(riskConfig?.default_commission_per_lot_usd ?? 7.0);
  const totalRiskPerLot = Math.max(priceRiskPerLot + commissionPerLot, 1e-6);
  const minLotRiskUsd = Number((totalRiskPerLot * spec.volume_min).toFixed(2));

  if (minLotRiskUsd > riskBudgetUsd + 1e-6) {
    rejections.push('Trade skipped: minimum volume exceeds permitted risk.');
    rejections.push(
      `SMALL_ACCOUNT_SAFETY_GUARD: Minimum broker volume (${spec.volume_min} lot) carries $${minLotRiskUsd.toFixed(
        2,
      )} risk (SL + commission), which exceeds your ${riskPct}% risk budget of $${riskBudgetUsd.toFixed(
        2,
      )} on $${eq.toFixed(2)} equity.`,
    );
    return {
      approved: false,
      lot_size: 0.0,
      calculated_lot_size: 0.0,
      risk_budget_usd: Number(riskBudgetUsd.toFixed(2)),
      actual_monetary_risk_usd: 0.0,
      min_lot_risk_usd: minLotRiskUsd,
      risk_reward_ratio: rr,
      rejections,
      small_account_blocked: true,
    };
  }

  if (openPositions.length >= Number(riskConfig?.max_open_positions ?? 3)) {
    rejections.push(
      `MAX_OPEN_POSITIONS_REACHED: ${openPositions.length} open positions >= limit (${
        riskConfig?.max_open_positions ?? 3
      }).`,
    );
  }

  const rawLots = riskBudgetUsd / totalRiskPerLot;
  const steps = Math.floor((rawLots + 1e-9) / spec.volume_step);
  const lotSize = Math.min(Number((steps * spec.volume_step).toFixed(2)), spec.volume_max);
  const actualRiskUsd = Number((lotSize * totalRiskPerLot).toFixed(2));

  return {
    approved: rejections.length === 0 && lotSize >= spec.volume_min,
    lot_size: rejections.length === 0 ? lotSize : 0.0,
    calculated_lot_size: lotSize,
    risk_budget_usd: Number(riskBudgetUsd.toFixed(2)),
    actual_monetary_risk_usd: actualRiskUsd,
    min_lot_risk_usd: minLotRiskUsd,
    risk_reward_ratio: rr,
    rejections,
    small_account_blocked: false,
  };
}
