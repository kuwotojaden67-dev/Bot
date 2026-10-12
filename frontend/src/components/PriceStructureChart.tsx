import React from 'react';

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
}

interface PriceStructureChartProps {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  signal: any;
}

export const PriceStructureChart: React.FC<PriceStructureChartProps> = ({
  symbol,
  timeframe,
  candles,
  signal,
}) => {
  if (!candles || candles.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center bg-[#0c0f17] border border-[#1e2538] rounded-lg text-slate-400 text-sm">
        Loading {symbol} ({timeframe}) market structure data...
      </div>
    );
  }

  const width = 920;
  const height = 380;
  const padLeft = 14;
  const padRight = 135; // space for Volume Profile & price axis
  const padTop = 20;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  let minP = Math.min(...lows);
  let maxP = Math.max(...highs);

  if (signal?.stop_loss && signal?.take_profit) {
    minP = Math.min(minP, signal.stop_loss, signal.take_profit);
    maxP = Math.max(maxP, signal.stop_loss, signal.take_profit);
  }
  const marginP = (maxP - minP) * 0.06 || 0.001;
  minP -= marginP;
  maxP += marginP;
  const rangeP = Math.max(maxP - minP, 1e-9);

  const yOf = (price: number) => padTop + ((maxP - price) / rangeP) * plotH;
  const xStep = plotW / Math.max(candles.length, 1);
  const candleW = Math.max(2.5, Math.min(9, xStep * 0.68));

  const diag = signal?.diagnostics || {};
  const bullFvgs = diag.fvg?.active_bullish_fvgs || [];
  const bearFvgs = diag.fvg?.active_bearish_fvgs || [];
  const bullObs = diag.smc?.active_bullish_obs || [];
  const bearObs = diag.smc?.active_bearish_obs || [];
  const vp = diag.volume_profile || {};
  const vpBins = diag.volume_profile_bins || [];
  const eqPrice = diag.ict?.dealing_range?.equilibrium;

  const digits = symbol === 'XAUUSD' ? 2 : symbol === 'USDJPY' ? 3 : 5;
  const priceTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((t) => maxP - t * rangeP);

  return (
    <div className="bg-[#0b0e17] border border-[#1f263b] rounded-xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200">
            {symbol} · {timeframe} Institutional Structure & Volume Profile
          </span>
          <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            HTF Bias ({signal?.htf_timeframe || 'H4'}): {signal?.htf_bias || 'NEUTRAL'}
          </span>
          <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
            Zone: {diag.ict?.zone || 'EQUILIBRIUM'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 inline-block rounded-sm bg-emerald-500/30 border border-emerald-400" />
            Bull OB / FVG
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 inline-block rounded-sm bg-rose-500/30 border border-rose-400" />
            Bear OB / FVG
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 inline-block bg-amber-400" />
            POC ({vp.poc ? Number(vp.poc).toFixed(digits) : '—'})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 inline-block bg-purple-400" />
            50% EQ
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-[350px] select-none overflow-hidden rounded bg-[#080a10]"
      >
        {/* Horizontal Price Grid */}
        {priceTicks.map((pt, idx) => {
          const y = yOf(pt);
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={y}
                x2={padLeft + plotW}
                y2={y}
                stroke="#161c2e"
                strokeDasharray="3 3"
              />
              <text
                x={width - 6}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[10px] font-mono-num"
              >
                {pt.toFixed(digits)}
              </text>
            </g>
          );
        })}

        {/* Active Bullish Order Blocks (Demand) */}
        {bullObs.slice(-2).map((ob: any, idx: number) => {
          const yTop = yOf(ob.top);
          const yBot = yOf(ob.bottom);
          return (
            <g key={`bob-${idx}`}>
              <rect
                x={padLeft}
                y={Math.min(yTop, yBot)}
                width={plotW}
                height={Math.max(Math.abs(yBot - yTop), 3)}
                fill="rgba(16, 185, 129, 0.10)"
                stroke="rgba(16, 185, 129, 0.35)"
                strokeWidth="0.8"
              />
              <text
                x={padLeft + 6}
                y={Math.min(yTop, yBot) + 10}
                className="fill-emerald-400/80 text-[9px]"
              >
                SMC Bullish OB ({Number(ob.bottom).toFixed(digits)} - {Number(ob.top).toFixed(digits)})
              </text>
            </g>
          );
        })}

        {/* Active Bearish Order Blocks (Supply) */}
        {bearObs.slice(-2).map((ob: any, idx: number) => {
          const yTop = yOf(ob.top);
          const yBot = yOf(ob.bottom);
          return (
            <g key={`sob-${idx}`}>
              <rect
                x={padLeft}
                y={Math.min(yTop, yBot)}
                width={plotW}
                height={Math.max(Math.abs(yBot - yTop), 3)}
                fill="rgba(244, 63, 94, 0.10)"
                stroke="rgba(244, 63, 94, 0.35)"
                strokeWidth="0.8"
              />
              <text
                x={padLeft + 6}
                y={Math.min(yTop, yBot) + 10}
                className="fill-rose-400/80 text-[9px]"
              >
                SMC Bearish OB ({Number(ob.bottom).toFixed(digits)} - {Number(ob.top).toFixed(digits)})
              </text>
            </g>
          );
        })}

        {/* Active Bullish & Bearish FVGs */}
        {bullFvgs.slice(-2).map((fvg: any, idx: number) => {
          const yTop = yOf(fvg.top);
          const yBot = yOf(fvg.bottom);
          return (
            <rect
              key={`bfvg-${idx}`}
              x={padLeft + plotW * 0.35}
              y={Math.min(yTop, yBot)}
              width={plotW * 0.65}
              height={Math.max(Math.abs(yBot - yTop), 2)}
              fill="rgba(59, 130, 246, 0.14)"
              stroke="rgba(59, 130, 246, 0.45)"
              strokeDasharray="2 2"
            />
          );
        })}
        {bearFvgs.slice(-2).map((fvg: any, idx: number) => {
          const yTop = yOf(fvg.top);
          const yBot = yOf(fvg.bottom);
          return (
            <rect
              key={`sfvg-${idx}`}
              x={padLeft + plotW * 0.35}
              y={Math.min(yTop, yBot)}
              width={plotW * 0.65}
              height={Math.max(Math.abs(yBot - yTop), 2)}
              fill="rgba(168, 85, 247, 0.14)"
              stroke="rgba(168, 85, 247, 0.45)"
              strokeDasharray="2 2"
            />
          );
        })}

        {/* ICT 50% Dealing Range Equilibrium */}
        {eqPrice && (
          <g>
            <line
              x1={padLeft}
              y1={yOf(eqPrice)}
              x2={padLeft + plotW}
              y2={yOf(eqPrice)}
              stroke="#a855f7"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text
              x={padLeft + plotW - 6}
              y={yOf(eqPrice) - 4}
              textAnchor="end"
              className="fill-purple-400 text-[9px]"
            >
              ICT 50% EQ ({Number(eqPrice).toFixed(digits)})
            </text>
          </g>
        )}

        {/* Volume Profile POC, VAH, VAL */}
        {vp.poc && (
          <g>
            <line
              x1={padLeft}
              y1={yOf(vp.poc)}
              x2={padLeft + plotW}
              y2={yOf(vp.poc)}
              stroke="#f59e0b"
              strokeWidth="1.4"
            />
            <text
              x={padLeft + plotW - 6}
              y={yOf(vp.poc) - 4}
              textAnchor="end"
              className="fill-amber-400 text-[9.5px] font-semibold"
            >
              POC ({Number(vp.poc).toFixed(digits)})
            </text>
          </g>
        )}

        {/* Volume-by-Price Horizontal Histogram on Right Margin */}
        {vpBins.map((b: any, idx: number) => {
          const y = yOf(b.price_center);
          const barLen = (b.pct_of_poc / 100.0) * 58;
          return (
            <rect
              key={`vp-${idx}`}
              x={padLeft + plotW + 4}
              y={y - 2}
              width={Math.max(barLen, 1)}
              height={3.5}
              fill={b.is_poc ? '#f59e0b' : b.in_value_area ? '#3b82f6' : '#334155'}
              opacity={b.is_poc ? 0.95 : 0.55}
            />
          );
        })}

        {/* Candlesticks */}
        {candles.map((c, idx) => {
          const xCenter = padLeft + idx * xStep + xStep / 2;
          const isBull = c.close >= c.open;
          const color = isBull ? '#10b981' : '#f43f5e';
          const yHigh = yOf(c.high);
          const yLow = yOf(c.low);
          const yOpen = yOf(c.open);
          const yClose = yOf(c.close);
          const bodyTop = Math.min(yOpen, yClose);
          const bodyH = Math.max(Math.abs(yClose - yOpen), 1.5);
          return (
            <g key={idx}>
              <line x1={xCenter} y1={yHigh} x2={xCenter} y2={yLow} stroke={color} strokeWidth="1.1" />
              <rect
                x={xCenter - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={color}
                rx="0.5"
              />
            </g>
          );
        })}

        {/* Signal Entry, SL, TP Overlays */}
        {signal?.entry_price && signal?.stop_loss && signal?.take_profit && (
          <g>
            <line
              x1={padLeft + plotW * 0.65}
              y1={yOf(signal.entry_price)}
              x2={padLeft + plotW}
              y2={yOf(signal.entry_price)}
              stroke="#38bdf8"
              strokeWidth="1.5"
            />
            <line
              x1={padLeft + plotW * 0.65}
              y1={yOf(signal.stop_loss)}
              x2={padLeft + plotW}
              y2={yOf(signal.stop_loss)}
              stroke="#fb7185"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
            <line
              x1={padLeft + plotW * 0.65}
              y1={yOf(signal.take_profit)}
              x2={padLeft + plotW}
              y2={yOf(signal.take_profit)}
              stroke="#34d399"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
          </g>
        )}
      </svg>
    </div>
  );
};
