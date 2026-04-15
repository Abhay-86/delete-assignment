import { useApi } from '@/hooks/useApi';
import { getMetricsOverview, getARRTrend } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';

// Real shape from GET /api/metrics/overview
interface OverviewData {
  arr: { total: number; totalCustomers: number; asOfDate: string };
  nrr: { percentage: number; expansion: number; churn: number };
  churn: { grossChurn: number; logoChurnRate: number; revenueChurned: number };
  topPlans: { label: string; arr: number; customerCount: number; percentOfTotal: number }[];
}

// Real shape from GET /api/metrics/arr-trend
interface TrendPoint { month: string; arr: number; customers: number; }
interface TrendResponse { success: boolean; data: { trend: TrendPoint[]; total: number; asOfDate: string } }

function fmt(n: number) {
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : `$${(n / 1_000).toFixed(1)}K`;
}

export function RevenueSummary() {
  const { data: res, isLoading, isError } = useApi(
    ['metrics', 'overview'],
    getMetricsOverview,
  );
  const { data: trendRes } = useApi(['metrics', 'arr-trend'], getARRTrend);

  // backend wraps response: { success, data }
  const d = (res as unknown as { success: boolean; data: OverviewData })?.data;
  const trend = (trendRes as unknown as TrendResponse)?.data?.trend ?? [];

  // Normalise trend for the bar chart
  const maxArr = trend.length > 0 ? Math.max(...trend.map(t => t.arr)) : 1;

  if (isLoading) return (
    <div className="p-6 text-center text-slate-400">Loading...</div>
  );

  if (isError || !d) return (
    <div className="p-6 text-center text-red-400">Failed to load metrics. Is the server running?</div>
  );

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-semibold text-slate-200">Revenue Summary</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card
          title="ARR"
          value={fmt(d.arr.total)}
          icon={<DollarSign size={16} />}
          changeLabel={`${d.arr.totalCustomers} customers · as of ${d.arr.asOfDate}`}
        />

        <Card
          title="NRR"
          value={`${d.nrr.percentage.toFixed(1)}%`}
          icon={d.nrr.percentage >= 100 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          change={d.nrr.percentage - 100}
          changeLabel={`Expansion ${fmt(d.nrr.expansion)} · Churn ${fmt(d.nrr.churn)}`}
        />

        <Card
          title="Gross Churn"
          value={`${d.churn.grossChurn.toFixed(2)}%`}
          icon={<TrendingDown size={16} />}
          changeLabel={`Logo churn ${d.churn.logoChurnRate.toFixed(2)}% · ${fmt(d.churn.revenueChurned)} lost`}
        />
      </div>

      {/* ARR by Cohort Month — bar chart */}
      {trend.length > 0 && (
        <Card title="ARR by Cohort Month">
          <div className="mt-4 overflow-x-auto">
            <div className="flex items-end gap-1 h-32 min-w-max px-1">
              {trend.map(point => (
                <div
                  key={point.month}
                  className="flex flex-col items-center gap-1 group"
                >
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -translate-y-8 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 whitespace-nowrap pointer-events-none z-10">
                    {point.month}: {fmt(point.arr)} · {point.customers} customers
                  </div>
                  <div
                    className="w-6 rounded-t bg-indigo-500 hover:bg-indigo-400 transition-colors"
                    style={{ height: `${Math.max(4, (point.arr / maxArr) * 112)}px` }}
                  />
                  <span className="text-[9px] text-slate-500 rotate-45 origin-left translate-y-2 w-6 truncate">
                    {point.month.slice(2)} {/* show YY-MM to save space */}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-6 text-xs text-slate-500 text-right">
            ARR contribution by signup cohort · hover for details
          </p>
        </Card>
      )}

      {/* Top Plans */}
      {d.topPlans.length > 0 && (
        <Card title="ARR by Plan">
          <div className="mt-3 space-y-2">
            {d.topPlans.map(plan => (
              <div key={plan.label} className="flex items-center gap-3">
                <span className="w-28 text-sm text-slate-400 truncate">{plan.label}</span>
                <div className="flex-1 h-2 rounded bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded bg-indigo-500"
                    style={{ width: `${plan.percentOfTotal}%` }}
                  />
                </div>
                <span className="w-20 text-right text-sm text-slate-300">{fmt(plan.arr)}</span>
                <span className="w-14 text-right text-xs text-slate-500">{plan.percentOfTotal.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}


