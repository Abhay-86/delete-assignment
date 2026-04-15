import { useApi } from '@/hooks/useApi';
import { getPipelineQuality } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { GitBranch, AlertTriangle, DollarSign, Activity } from 'lucide-react';

interface ZombieDeal {
  opportunityId: string;
  accountName: string;
  amount: number;
  stage: string;
  daysSinceActivity: number;
}

interface Mismatch {
  opportunityId: string;
  accountName: string;
  issue: string;
  crmValue: number;
  billingValue: number;
}

interface UnbookedItem {
  subscriptionId: string;
  customerName: string;
  mrr: number;  // cents
  system: string;
}

interface PipelineSummary {
  totalZombieDeals: number;
  totalZombieValue: number;
  totalMismatches: number;
  totalUnbookedMRR: number;  // cents
  pipelineHealthScore: number;
}

interface PipelineResponse {
  success: boolean;
  analysis: {
    zombieDeals: ZombieDeal[];
    mismatches: Mismatch[];
    unbookedRevenue: UnbookedItem[];
    summary: PipelineSummary;
  };
}

function fmt(n: number) {
  const abs = Math.abs(n);
  const s = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(2)}M`
          : abs >= 1_000    ? `$${(abs / 1_000).toFixed(1)}K`
          : `$${abs.toFixed(0)}`;
  return n < 0 ? `-${s}` : s;
}

const ZOMBIE_COLUMNS = [
  { key: 'accountName',       label: 'Account',          },
  { key: 'stage',             label: 'Stage',            width: '140px' },
  { key: 'amount',            label: 'Amount',           width: '100px',
    render: (v: unknown) => <span className="text-slate-300">{fmt(Number(v))}</span> },
  { key: 'daysSinceActivity', label: 'Days Stale',       width: '100px',
    render: (v: unknown) => (
      <Badge variant={Number(v) > 180 ? 'error' : 'warning'}>{String(v)}d</Badge>
    ) },
];

const MISMATCH_COLUMNS = [
  { key: 'accountName',   label: 'Account'                    },
  { key: 'issue',         label: 'Issue'                      },
  { key: 'crmValue',      label: 'CRM (ACV)',  width: '110px',
    render: (v: unknown) => <span className="text-slate-300">{fmt(Number(v))}</span> },
  { key: 'billingValue',  label: 'Billing',    width: '110px',
    render: (v: unknown) => <span className="text-slate-300">{fmt(Number(v))}</span> },
];

export function PipelineQuality() {
  const { data: res, isLoading, isError } = useApi(
    ['reconciliation', 'pipeline'],
    getPipelineQuality,
  );

  const analysis = (res as unknown as PipelineResponse)?.analysis;
  const summary  = analysis?.summary;

  if (isLoading) return <div className="p-6 text-center text-slate-400">Loading...</div>;
  if (isError || !analysis) return (
    <div className="p-6 text-center text-red-400">Failed to load pipeline data. Is the server running?</div>
  );

  const healthPct = Math.round(summary.pipelineHealthScore * 100);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-semibold text-slate-200">Pipeline Quality</h2>

      {/* KPI summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card
          title="Health Score"
          value={`${healthPct}%`}
          icon={<Activity size={16} />}
          change={healthPct - 100}
          changeLabel="vs perfect pipeline"
        />
        <Card
          title="Zombie Deals"
          value={summary.totalZombieDeals}
          icon={<AlertTriangle size={16} />}
          changeLabel={`${fmt(summary.totalZombieValue)} at risk`}
        />
        <Card
          title="Stage Mismatches"
          value={summary.totalMismatches}
          icon={<GitBranch size={16} />}
          changeLabel="CRM vs billing gaps"
        />
        <Card
          title="Unbooked MRR"
          value={fmt(summary.totalUnbookedMRR / 100)}
          icon={<DollarSign size={16} />}
          changeLabel="no CRM record"
        />
      </div>

      {/* Zombie deals table */}
      {analysis.zombieDeals.length > 0 && (
        <Card title={`Zombie Deals — ${analysis.zombieDeals.length} stale opportunities`}>
          <div className="mt-4">
            <Table
              columns={ZOMBIE_COLUMNS as Parameters<typeof Table>[0]['columns']}
              data={analysis.zombieDeals as unknown as Record<string, unknown>[]}
              rowKey={(_, i) => String(i)}
              emptyMessage="No zombie deals"
            />
          </div>
        </Card>
      )}

      {/* Stage mismatches table */}
      {analysis.mismatches.length > 0 && (
        <Card title={`Stage Mismatches — ${analysis.mismatches.length} issues`}>
          <div className="mt-4">
            <Table
              columns={MISMATCH_COLUMNS as Parameters<typeof Table>[0]['columns']}
              data={analysis.mismatches as unknown as Record<string, unknown>[]}
              rowKey={(_, i) => String(i)}
              emptyMessage="No mismatches"
            />
          </div>
        </Card>
      )}

      {/* Unbooked revenue */}
      {analysis.unbookedRevenue.length > 0 && (
        <Card title={`Unbooked Revenue — ${analysis.unbookedRevenue.length} subscriptions without CRM record`}>
          <div className="mt-3 space-y-2">
            {analysis.unbookedRevenue.slice(0, 8).map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-slate-400 truncate">{item.customerName}</span>
                <Badge variant="neutral">{item.system}</Badge>
                <span className="w-20 text-right text-sm text-slate-300">{fmt(item.mrr / 100)}/mo</span>
              </div>
            ))}
            {analysis.unbookedRevenue.length > 8 && (
              <p className="text-xs text-slate-500 pt-1">
                +{analysis.unbookedRevenue.length - 8} more not shown
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
