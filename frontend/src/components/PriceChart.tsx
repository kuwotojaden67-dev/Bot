import React, { useState } from 'react';

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
}

interface PriceChartProps {
  symbol: string;
  timeframe: string;
  candles: Candle[];
  overlays?: {
    fvgs?: any[];
    order_blocks?: any[];
    poc?: number;
    vah?: number;
    val?: number;
    fibonacci_levels?: Record<string, number>;
    bsl?: number | null;
    ssl?: number | null;
  };
  volumeBins?: { price_mid: number; pct_of_total: number; in_value_area?: boolean }[];
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  symbol,
  timeframe,
  candles,
  overlays,
  volumeBins,
  entryPrice,
  stopLoss,
  takeProfit,
}) => {
  const [showFvg, setShowFvg] = useState(true);
  const [showOb, setShowOb] = useState(true);
  const [showVp, setShowVp] = useState(true);
  const [showFib, setShowFib] = useState(true);
  const [showLiq, setShowLiq] = useState(true);
  const [showSignal, setShowSignal] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!candles || candles.length === 0) {
    return (
      <div className="h-96 flex items-center justify-center quant-card rounded-xl text-slate-400 text-sm">
        Loading institutional market structure...
      </div>
    );
  }

  const visibleCandles = candles.slice(-70);
  const allHighs = visibleCandles.map((c) => c.high);
  const allLows = visibleCandles.map((c) => c.low);

  if (showSignal) {
    if (entryPrice && entryPrice > 0) {
      allHighs.push(entryPrice);
      allLows.push(entryPrice);
    }
    if (stopLoss && stopLoss > 0) {
      allHighs.push(stopLoss);
      allLows.push(stopLoss);
    }
    if (takeProfit && takeProfit > 0) {
      allHighs.push(takeProfit);
      allLows.push(takeProfit);
    }
  }

  const rawMax = Math.max(...allHighs);
  const rawMin = Math.min(...allLows);
  const range = Math.max(rawMax - rawMin, 0.0001);
  const maxPrice = rawMax + range * 0.07;
  const minPrice = rawMin - range * 0.07;
  const totalRange = maxPrice - minPrice;

  const width = 960;
  const height = 400;
  const padLeft = 14;
  const padRight = 92;
  const padTop = 16;
  const padBottom = 26;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const priceToY = (p: number) => {
    const ratio = (maxPrice - p) / totalRange;
    return Math.max(padTop, Math.min(height - padBottom, padTop + ratio * plotHeight));
  };

  const decimals =
    symbol.includes('JPY') || symbol.includes('XAU') || symbol.includes('BTC') || symbol.includes('NAS') || symbol.includes('US30')
      ? 2
      : 5;
  const stepX = plotWidth / visibleCandles.length;
  const candleWidth = Math.max(stepX * 0.62, 3);

  const gridPrices = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((r) => maxPrice - r * totalRange);
  const activeCandle =
    hoverIdx !== null && visibleCandles[hoverIdx]
      ? visibleCandles[hoverIdx]
      : visibleCandles[visibleCandles.length - 1];

  const maxBinPct =
    volumeBins && volumeBins.length > 0
      ? Math.max(...volumeBins.map((b) => b.pct_of_total || 1), 1)
      : 10;

  return (
    <div className="quant-card rounded-xl p-4">
      {/* Header & Layer Toggles */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-sm font-bold text-white tracking-wide">{symbol}</span>
            <span className="text-xs font-mono text-cyan-300 font-semibold">{timeframe}</span>
          </div>
          {activeCandle && (
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg">
              <span className="text-slate-400">
                O:<strong className="text-slate-200 ml-0.5">{activeCandle.open.toFixed(decimals)}</strong>
              </span>
              <span className="text-slate-400">
                H:<strong className="text-emerald-400 ml-0.5">{activeCandle.high.toFixed(decimals)}</strong>
              </span>
              <span className="text-slate-400">
                L:<strong className="text-rose-400 ml-0.5">{activeCandle.low.toFixed(decimals)}</strong>
              </span>
              <span className="text-slate-400">
                C:<strong className="text-cyan-300 ml-0.5">{activeCandle.close.toFixed(decimals)}</strong>
              </span>
              <span className="text-slate-500">
                Vol:<strong className="text-slate-300 ml-0.5">{activeCandle.tick_volume}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Interactive Overlay Layer Toggles */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <button
            onClick={() => setShowOb(!showOb)}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${
              showOb
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-medium'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            Order Blocks
          </button>
          <button
            onClick={() => setShowFvg(!showFvg)}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${
              showFvg
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 font-medium'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            FVG Imbalance
          </button>
          <button
            onClick={() => setShowVp(!showVp)}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${
              showVp
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 font-medium'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            POC & Vol Profile
          </button>
          <button
            onClick={() => setShowFib(!showFib)}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${
              showFib
                ? 'bg-purple-500/15 border-purple-500/40 text-purple-300 font-medium'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            Fib OTE
          </button>
          <button
            onClick={() => setShowLiq(!showLiq)}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${
              showLiq
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 font-medium'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            BSL/SSL Pools
          </button>
          <button
            onClick={() => setShowSignal(!showSignal)}
            className={`px-2 py-0.5 rounded border transition cursor-pointer ${
              showSignal
                ? 'bg-blue-500/15 border-blue-500/40 text-blue-300 font-medium'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            Entry/SL/TP
          </button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-80 select-none bg-[#04070f] rounded-lg border border-slate-800/80"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Horizontal Grid Lines */}
        {gridPrices.map((gp, i) => {
          const y = priceToY(gp);
          return (
            <g key={i}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#111a2e"
                strokeDasharray="3 3"
              />
              <text
                x={width - padRight + 6}
                y={y + 4}
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
              >
                {gp.toFixed(decimals)}
              </text>
            </g>
          );
        })}

        {/* Right-Axis 40-Bin Volume Profile Histogram */}
        {showVp &&
          volumeBins &&
          volumeBins.map((bin, idx) => {
            const y = priceToY(bin.price_mid);
            const barW = Math.max(((bin.pct_of_total || 0.5) / maxBinPct) * 115, 2);
            const isPoc =
              overlays?.poc && Math.abs(bin.price_mid - overlays.poc) < totalRange * 0.018;
            return (
              <rect
                key={`vp-${idx}`}
                x={width - padRight - barW}
                y={y - 3}
                width={barW}
                height={5}
                fill={isPoc ? '#f59e0b' : bin.in_value_area ? '#38bdf8' : '#475569'}
                fillOpacity={isPoc ? 0.55 : bin.in_value_area ? 0.22 : 0.12}
              />
            );
          })}

        {/* Order Blocks */}
        {showOb &&
          overlays?.order_blocks?.map((ob, idx) => {
            const yTop = priceToY(ob.top);
            const yBottom = priceToY(ob.bottom);
            const boxH = Math.max(Math.abs(yBottom - yTop), 4);
            const isBull = ob.direction === 'BULLISH';
            return (
              <g key={`ob-${idx}`}>
                <rect
                  x={padLeft + plotWidth * 0.2}
                  y={Math.min(yTop, yBottom)}
                  width={plotWidth * 0.8}
                  height={boxH}
                  fill={isBull ? '#10b981' : '#f43f5e'}
                  fillOpacity={0.14}
                  stroke={isBull ? '#10b981' : '#f43f5e'}
                  strokeOpacity={0.45}
                  strokeWidth={0.8}
                />
                <text
                  x={padLeft + plotWidth * 0.21}
                  y={Math.min(yTop, yBottom) + 10}
                  fill={isBull ? '#34d399' : '#fb7185'}
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  {isBull ? 'BULL OB (BOS+Disp)' : 'BEAR OB (BOS+Disp)'}
                </text>
              </g>
            );
          })}

        {/* Fair Value Gaps */}
        {showFvg &&
          overlays?.fvgs?.map((fvg, idx) => {
            const yTop = priceToY(fvg.top);
            const yBottom = priceToY(fvg.bottom);
            const boxH = Math.max(Math.abs(yBottom - yTop), 3);
            const isBull = fvg.direction === 'BULLISH';
            return (
              <g key={`fvg-${idx}`}>
                <rect
                  x={padLeft + plotWidth * 0.42}
                  y={Math.min(yTop, yBottom)}
                  width={plotWidth * 0.58}
                  height={boxH}
                  fill={isBull ? '#06b6d4' : '#f59e0b'}
                  fillOpacity={0.15}
                  stroke={isBull ? '#06b6d4' : '#f59e0b'}
                  strokeDasharray="2 2"
                  strokeOpacity={0.6}
                />
                <text
                  x={padLeft + plotWidth * 0.43}
                  y={Math.min(yTop, yBottom) + 9}
                  fill={isBull ? '#22d3ee' : '#fbbf24'}
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {isBull ? 'Bull FVG' : 'Bear FVG'}
                </text>
              </g>
            );
          })}

        {/* Fibonacci OTE Levels (0.618 & 0.705) */}
        {showFib && overlays?.fibonacci_levels && (
          <>
            {overlays.fibonacci_levels['0.618'] && (
              <g>
                <line
                  x1={padLeft + plotWidth * 0.3}
                  y1={priceToY(overlays.fibonacci_levels['0.618'])}
                  x2={width - padRight}
                  y2={priceToY(overlays.fibonacci_levels['0.618'])}
                  stroke="#a855f7"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={padLeft + plotWidth * 0.31}
                  y={priceToY(overlays.fibonacci_levels['0.618']) - 3}
                  fill="#c084fc"
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  Fib 0.618 ({overlays.fibonacci_levels['0.618'].toFixed(decimals)})
                </text>
              </g>
            )}
            {overlays.fibonacci_levels['0.705'] && (
              <g>
                <line
                  x1={padLeft + plotWidth * 0.3}
                  y1={priceToY(overlays.fibonacci_levels['0.705'])}
                  x2={width - padRight}
                  y2={priceToY(overlays.fibonacci_levels['0.705'])}
                  stroke="#d946ef"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={padLeft + plotWidth * 0.31}
                  y={priceToY(overlays.fibonacci_levels['0.705']) - 3}
                  fill="#e879f9"
                  fontSize="8.5"
                  fontFamily="monospace"
                >
                  OTE 0.705 ({overlays.fibonacci_levels['0.705'].toFixed(decimals)})
                </text>
              </g>
            )}
          </>
        )}

        {/* BSL / SSL Liquidity Levels */}
        {showLiq && overlays?.bsl && (
          <g>
            <line
              x1={padLeft}
              y1={priceToY(overlays.bsl)}
              x2={width - padRight}
              y2={priceToY(overlays.bsl)}
              stroke="#818cf8"
              strokeWidth="1"
              strokeDasharray="6 3"
            />
            <text
              x={padLeft + 6}
              y={priceToY(overlays.bsl) - 4}
              fill="#818cf8"
              fontSize="8.5"
              fontFamily="monospace"
            >
              BSL Liquidity Pool: {overlays.bsl.toFixed(decimals)}
            </text>
          </g>
        )}
        {showLiq && overlays?.ssl && (
          <g>
            <line
              x1={padLeft}
              y1={priceToY(overlays.ssl)}
              x2={width - padRight}
              y2={priceToY(overlays.ssl)}
              stroke="#818cf8"
              strokeWidth="1"
              strokeDasharray="6 3"
            />
            <text
              x={padLeft + 6}
              y={priceToY(overlays.ssl) + 10}
              fill="#818cf8"
              fontSize="8.5"
              fontFamily="monospace"
            >
              SSL Liquidity Pool: {overlays.ssl.toFixed(decimals)}
            </text>
          </g>
        )}

        {/* Volume Profile POC / VAH / VAL Lines */}
        {showVp && overlays?.poc && (
          <g>
            <line
              x1={padLeft}
              y1={priceToY(overlays.poc)}
              x2={width - padRight}
              y2={priceToY(overlays.poc)}
              stroke="#eab308"
              strokeWidth="1.5"
              strokeDasharray="5 3"
            />
            <text
              x={padLeft + 6}
              y={priceToY(overlays.poc) - 4}
              fill="#eab308"
              fontSize="9.5"
              fontFamily="monospace"
              fontWeight="bold"
            >
              POC (True Price-Bin Mode): {overlays.poc.toFixed(decimals)}
            </text>
          </g>
        )}
        {showVp && overlays?.vah && (
          <line
            x1={padLeft}
            y1={priceToY(overlays.vah)}
            x2={width - padRight}
            y2={priceToY(overlays.vah)}
            stroke="#38bdf8"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        )}
        {showVp && overlays?.val && (
          <line
            x1={padLeft}
            y1={priceToY(overlays.val)}
            x2={width - padRight}
            y2={priceToY(overlays.val)}
            stroke="#38bdf8"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        )}

        {/* Candlesticks */}
        {visibleCandles.map((c, idx) => {
          const xCenter = padLeft + idx * stepX + stepX / 2;
          const yHigh = priceToY(c.high);
          const yLow = priceToY(c.low);
          const yOpen = priceToY(c.open);
          const yClose = priceToY(c.close);
          const isBull = c.close >= c.open;
          const color = isBull ? '#10b981' : '#f43f5e';
          const bodyTop = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(Math.abs(yClose - yOpen), 1.5);

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoverIdx(idx)}
              className="cursor-crosshair"
            >
              {hoverIdx === idx && (
                <line
                  x1={xCenter}
                  y1={padTop}
                  x2={xCenter}
                  y2={height - padBottom}
                  stroke="#334155"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
              )}
              <line
                x1={xCenter}
                y1={yHigh}
                x2={xCenter}
                y2={yLow}
                stroke={color}
                strokeWidth="1.2"
              />
              <rect
                x={xCenter - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={color}
                rx={0.5}
              />
            </g>
          );
        })}

        {/* Active Entry / Stop Loss / Take Profit Overlays */}
        {showSignal && entryPrice && entryPrice > 0 && (
          <g>
            <line
              x1={padLeft}
              y1={priceToY(entryPrice)}
              x2={width - padRight}
              y2={priceToY(entryPrice)}
              stroke="#3b82f6"
              strokeWidth="1.5"
            />
            <rect
              x={width - padRight + 2}
              y={priceToY(entryPrice) - 8}
              width={86}
              height={15}
              rx={3}
              fill="#1d4ed8"
            />
            <text
              x={width - padRight + 6}
              y={priceToY(entryPrice) + 3}
              fill="#ffffff"
              fontSize="9"
              fontFamily="monospace"
            >
              ENT {entryPrice.toFixed(decimals)}
            </text>
          </g>
        )}
        {showSignal && stopLoss && stopLoss > 0 && (
          <g>
            <line
              x1={padLeft}
              y1={priceToY(stopLoss)}
              x2={width - padRight}
              y2={priceToY(stopLoss)}
              stroke="#f43f5e"
              strokeWidth="1.3"
              strokeDasharray="4 2"
            />
            <rect
              x={width - padRight + 2}
              y={priceToY(stopLoss) - 8}
              width={86}
              height={15}
              rx={3}
              fill="#be123c"
            />
            <text
              x={width - padRight + 6}
              y={priceToY(stopLoss) + 3}
              fill="#ffffff"
              fontSize="9"
              fontFamily="monospace"
            >
              SL {stopLoss.toFixed(decimals)}
            </text>
          </g>
        )}
        {showSignal && takeProfit && takeProfit > 0 && (
          <g>
            <line
              x1={padLeft}
              y1={priceToY(takeProfit)}
              x2={width - padRight}
              y2={priceToY(takeProfit)}
              stroke="#10b981"
              strokeWidth="1.3"
              strokeDasharray="4 2"
            />
            <rect
              x={width - padRight + 2}
              y={priceToY(takeProfit) - 8}
              width={86}
              height={15}
              rx={3}
              fill="#047857"
            />
            <text
              x={width - padRight + 6}
              y={priceToY(takeProfit) + 3}
              fill="#ffffff"
              fontSize="9"
              fontFamily="monospace"
            >
              TP {takeProfit.toFixed(decimals)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
