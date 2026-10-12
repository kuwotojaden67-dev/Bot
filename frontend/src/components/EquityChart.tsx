import React from 'react';

interface EquityPoint {
  bar_index: number;
  time: string;
  balance: number;
  equity: number;
  drawdown_pct: number;
  segment: string;
}

export const EquityChart: React.FC<{ data: EquityPoint[] }> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center quant-card rounded-xl text-slate-400 text-xs">
        Run a historical backtest above to generate the In-Sample & Out-of-Sample equity curve.
      </div>
    );
  }

  const values = data.map((d) => d.equity);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = Math.max(maxVal - minVal, 10);

  const width = 920;
  const height = 230;
  const padX = 24;
  const padY = 22;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const toX = (i: number) => padX + (i / Math.max(data.length - 1, 1)) * plotW;
  const toY = (v: number) => padY + ((maxVal + span * 0.08 - v) / (span * 1.16)) * plotH;

  const points = data.map((d, i) => `${toX(i)},${toY(d.equity)}`).join(' ');
  const oosStartIdx = data.findIndex((d) => d.segment === 'OUT_OF_SAMPLE');
  const oosX = oosStartIdx > 0 ? toX(oosStartIdx) : null;

  return (
    <div className="quant-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-300">
          Equity Curve — In-Sample (70%) vs Out-of-Sample (30%) Walk-Forward Split
        </span>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="text-cyan-400">
            Start: ${data[0]?.balance?.toFixed(2)}
          </span>
          <span className="text-emerald-400 font-bold">
            Final: ${data[data.length - 1]?.equity?.toFixed(2)}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-52 bg-[#04070f] rounded-lg border border-slate-800/80"
      >
        {oosX && (
          <g>
            <rect
              x={oosX}
              y={padY}
              width={width - padX - oosX}
              height={plotH}
              fill="#6366f1"
              fillOpacity={0.07}
            />
            <line
              x1={oosX}
              y1={padY}
              x2={oosX}
              y2={height - padY}
              stroke="#818cf8"
              strokeDasharray="4 4"
              strokeWidth="1.2"
            />
            <text
              x={oosX + 8}
              y={padY + 14}
              fill="#a5b4fc"
              fontSize="10"
              fontFamily="monospace"
            >
              OUT-OF-SAMPLE (30% Validation Window) →
            </text>
          </g>
        )}

        <polyline
          fill="none"
          stroke="#06b6d4"
          strokeWidth="2.2"
          points={points}
        />
      </svg>
    </div>
  );
};
