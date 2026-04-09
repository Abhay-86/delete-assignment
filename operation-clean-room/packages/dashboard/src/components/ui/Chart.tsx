import { useMemo } from 'react';
import { clsx } from 'clsx';
import {
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  BarChart as RechartsBarChart,
  AreaChart as RechartsAreaChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ChartSeries } from '@/types';

/* ── Dark-theme palette ─────────────────────────────────────────────────── */

const PALETTE = [
  '#3B82F6', // electric blue
  '#22C55E', // emerald
  '#F59E0B', // amber
  '#A855F7', // violet
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
];

/* ── Shared tooltip ─────────────────────────────────────────────────────── */

const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 14px',
    fontFamily: '"JetBrains Mono", monospace',
    fontSize: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },
  labelStyle: {
    color: '#94a3b8',
    fontWeight: 600,
    marginBottom: '4px',
  },
  itemStyle: {
    color: '#e2e8f0',
    padding: '2px 0',
  },
};

/* ── Shared axis config ─────────────────────────────────────────────────── */

const axisDefaults = {
  tick: { fill: '#64748b', fontSize: 11, fontFamily: '"JetBrains Mono", monospace' },
  axisLine: { stroke: '#334155' },
  tickLine: false as const,
};

/* ── Chart component ────────────────────────────────────────────────────── */

type ChartType = 'line' | 'bar' | 'area';

interface ChartProps {
  type: ChartType;
  data: Record<string, unknown>[];
  series: ChartSeries[];
  xAxisKey: string;
  height?: number;
  className?: string;
  showGrid?: boolean;
  showLegend?: boolean;
}

export function Chart({
  type,
  data,
  series,
  xAxisKey,
  height = 300,
  className,
  showGrid = true,
  showLegend = true,
}: ChartProps) {
  const coloredSeries = useMemo(
    () =>
      series.map((s, i) => ({
        ...s,
        color: s.color || PALETTE[i % PALETTE.length]!,
      })),
    [series],
  );

  const renderContent = () => {
    const commonChildren = (
      <>
        {showGrid && (
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#1e293b"
            vertical={false}
          />
        )}
        <XAxis dataKey={xAxisKey} {...axisDefaults} />
        <YAxis {...axisDefaults} width={60} />
        <Tooltip {...tooltipStyle} />
        {showLegend && (
          <Legend
            wrapperStyle={{
              fontSize: '12px',
              fontFamily: '"JetBrains Mono", monospace',
              color: '#94a3b8',
              paddingTop: '8px',
            }}
          />
        )}
      </>
    );

    switch (type) {
      case 'line':
        return (
          <RechartsLineChart data={data}>
            {commonChildren}
            {coloredSeries.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </RechartsLineChart>
        );

      case 'bar':
        return (
          <RechartsBarChart data={data}>
            {commonChildren}
            {coloredSeries.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            ))}
          </RechartsBarChart>
        );

      case 'area':
        return (
          <RechartsAreaChart data={data}>
            {commonChildren}
            {coloredSeries.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                fill={s.color}
                fillOpacity={0.1}
                strokeWidth={2}
              />
            ))}
          </RechartsAreaChart>
        );
    }
  };

  return (
    <div className={clsx('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderContent()}
      </ResponsiveContainer>
    </div>
  );
}
