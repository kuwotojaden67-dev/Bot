import React from 'react';

interface EquityPoint {
  bar_index: number;
  time: string;
  balance: number;
  equity: number;
  drawdown_pct: number;
  segment: string;
}

interface EquityCurveChartProps {
  curve: EquityPoint[];
  initialBalance: number;
}

export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({ curve, initialBalance }) => {
  if (!curve || curve.length < 2) {
    return (
      <div className="h-64 flex items-center justify-center bg-[#0b0e17] border border-[#1f263b] rounded-xl text-slate-400 text-sm">
        Run a historical backtest above to generate the modeled equity & drawdown curve.
      </div>
    );
  }

  const width = 880;
  const height = 270;
  const padL = 62;
  const padR = 24;
  const padT = 20;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const equities = curve.map((p) => p.equity);
  const minEq = Math.min(initialBalance * 0.96, ...equities);
  const maxEq = Math.max(initialBalance * 1.04, ...equities);
  const spanEq = Math.max(maxEq - minEq, 1e-6);

  const xOf = (idx: number) => padL + (idx / Math.max(curve.length - 1, 1)) * plotW;
  const yOf = (val: number) => padT + ((maxEq - val) / spanEq) * plotH;

  const pointsStr = curve.map((p, i) => `${xOf(i).toFixed(1)},${yOf(p.equity).toFixed(1)}`).join(' ');
  const areaStr = `${xOf(0).toFixed(1)},${(padT + plotH).toFixed(1)} ${pointsStr} ${xOf(curve.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)}`;

  const oosIndex = curve.findIndex((p) => p.segment === 'OUT_OF_SAMPLE');
  const yInit = yOf(initialBalance);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => maxEq - t * spanEq);

  return (
    <div className="bg-[#0b0e17] border border-[#1f263b] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2 text-xs">
        <span className="font-semibold text-slate-200">
          Modeled Historical Equity Curve (Net of Spread, Commission, Slippage & Swap)
        </span>
        <div className="flex items-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-blue-400 inline-block" /> Equity ($)
          </span>
          {oosIndex > 0 && (
            <span className="flex items-center gap-1.5 text-purple-300">
              <span className="w-3 h-0.5 bg-purple-400 inline-block" /> Out-of-Sample Split
            </span>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64 bg-[#080a10] rounded-lg">
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {ticks.map((tv, i) => {
          const y = yOf(tv);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="#161c2e" strokeDasharray="3 3" />
              <text x={padL - 8} y={y + 4} textAnchor="end" className="fill-slate-400 text-[10px] font-mono-num">
                ${tv.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Initial Balance Reference Line */}
        <line
          x1={padL}
          y1={yInit}
          x2={padL + plotW}
          y2={yInit}
          stroke="#475569"
          strokeDasharray="4 4"
          strokeWidth="1"
        />

        {/* Out-of-Sample Vertical Divider */}
        {oosIndex > 0 && (
          <g>
            <rect
              x={xOf(oosIndex)}
              y={padT}
              width={padL + plotW - xOf(oosIndex)}
              height={plotH}
              fill="rgba(139, 92, 246, 0.06)"
            />
            <line
              x1={xOf(oosIndex)}
              y1={padT}
              x2={xOf(oosIndex)}
              y2={padT + plotH}
              stroke="#a855f7"
              strokeDasharray="4 3"
              strokeWidth="1.3"
            />
            <text
              x={xOf(oosIndex) + 6}
              y={padT + 12}
              className="fill-purple-300 text-[10px] font-medium"
            >
              Out-of-Sample Validation Window (30%)
            </text>
          </g>
        )}

        <polygon points={areaStr} fill="url(#eqGrad)" />
        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={pointsStr} />
      </svg>
    </div>
  );
};
