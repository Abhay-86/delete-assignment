import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { runReconciliation } from '@/api/client';

function fmt(n: number) {
  const abs = Math.abs(n);
  const s = abs >= 1_000_000
    ? `$${(abs / 1_000_000).toFixed(2)}M`
    : `$${(abs / 1_000).toFixed(1)}K`;
  return n < 0 ? `-${s}` : s;
}

// Real backend response shape from POST /api/reconciliation/run
interface RunResponse {
  success: boolean;
  reconciliation: {
    entityResolution: {
      accountMatches: number;
      matchedAccounts: { salesforceId: string; salesforceName: string; chargebeeId: string; chargebeeName: string; confidence: number }[];
    };
    revenueReconciliation: {
      expectedRevenue: number;
      actualRevenue: number;
      difference: number;
      differencePercent: number;
      lineItemCount: number;
      topDiscrepancies: { customer: string; expected: number; actual: number; difference: number; reason: string }[];
    };
    pipelineAnalysis: {
      healthScore: number;
      zombieDeals: { count: number; totalValue: number };
      mismatches: { count: number };
      unbookedRevenue: { totalMRR: number; count: number };
    };
  };
  metadata: {
    durationMs: number;
    recordsProcessed: { subscriptions: number; payments: number; opportunities: number; accounts: number };
  };
}

interface SummaryState {
  totalRecords: number;
  matched: number;
  discrepancies: number;
  critical: number;
}

interface RowItem {
  type: string;
  severity: string;
  description: string;
  systemA: string;
  systemB: string;
  delta: number;
  status: string;
}

const SEVERITY_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  critical: 'error',
  high:     'error',
  medium:   'warning',
  low:      'neutral',
};

const COLUMNS = [
  { key: 'type',        label: 'Type',       width: '160px' },
  { key: 'severity',    label: 'Severity',   width: '90px',
    render: (v: unknown) => (
      <Badge variant={SEVERITY_VARIANT[v as string] ?? 'neutral'}>
        {String(v)}
      </Badge>
    ),
  },
  { key: 'description', label: 'Description' },
  { key: 'systemA',     label: 'System A',   width: '100px' },
  { key: 'systemB',     label: 'System B',   width: '100px' },
  { key: 'delta',       label: 'Delta',      width: '100px',
    render: (v: unknown) => (
      <span className={Number(v) < 0 ? 'text-red-400' : 'text-emerald-400'}>
        {fmt(Number(v))}
      </span>
    ),
  },
  { key: 'status',      label: 'Status',     width: '110px',
    render: (v: unknown) => (
      <Badge variant={v === 'resolved' ? 'success' : v === 'investigating' ? 'warning' : 'neutral'}>
        {String(v)}
      </Badge>
    ),
  },
];

export function DiscrepancyTable() {
  const [summary,  setSummary]  = useState<SummaryState | null>(null);
  const [rows,     setRows]     = useState<RowItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const res = (await runReconciliation()) as unknown as RunResponse;
      const { entityResolution, revenueReconciliation, pipelineAnalysis } = res.reconciliation;

      // Build summary from real backend fields
      const totalRecords =
        entityResolution.accountMatches +
        revenueReconciliation.lineItemCount +
        pipelineAnalysis.zombieDeals.count +
        pipelineAnalysis.mismatches.count;
      const discrepancyCount =
        revenueReconciliation.topDiscrepancies.length +
        pipelineAnalysis.zombieDeals.count +
        pipelineAnalysis.mismatches.count;
      const critical = Math.abs(revenueReconciliation.differencePercent) > 10 ? 1 : 0;

      setSummary({
        totalRecords,
        matched: entityResolution.accountMatches,
        discrepancies: discrepancyCount,
        critical,
      });

      // Build rows from top discrepancies + pipeline issues
      const revenueRows: RowItem[] = revenueReconciliation.topDiscrepancies.map(d => ({
        type:        'amount_mismatch',
        severity:    Math.abs(d.difference) > 10_000 ? 'high' : 'medium',
        description: d.reason || `${d.customer}: expected ${fmt(d.expected)} vs actual ${fmt(d.actual)}`,
        systemA:     fmt(d.expected),
        systemB:     fmt(d.actual),
        delta:       d.difference,
        status:      'open',
      }));

      const pipelineRows: RowItem[] = pipelineAnalysis.zombieDeals.count > 0
        ? [{
            type:        'classification_error',
            severity:    'medium',
            description: `${pipelineAnalysis.zombieDeals.count} zombie deals worth ${fmt(pipelineAnalysis.zombieDeals.totalValue)} in pipeline`,
            systemA:     'Salesforce',
            systemB:     'Chargebee',
            delta:       -pipelineAnalysis.zombieDeals.totalValue,
            status:      'investigating',
          }]
        : [];

      const unbookedRow: RowItem[] = pipelineAnalysis.unbookedRevenue.totalMRR > 0
        ? [{
            type:        'missing_record',
            severity:    'high',
            description: `${pipelineAnalysis.unbookedRevenue.count} active subscriptions with no Salesforce record (unbooked MRR: ${fmt(pipelineAnalysis.unbookedRevenue.totalMRR)})`,
            systemA:     'Salesforce',
            systemB:     'Chargebee',
            delta:       -pipelineAnalysis.unbookedRevenue.totalMRR,
            status:      'open',
          }]
        : [];

      setRows([...revenueRows, ...pipelineRows, ...unbookedRow]);
    } catch {
      setError('Failed to run reconciliation. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-200">Reconciliation</h2>
        <button
          onClick={handleRun}
          disabled={loading}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Reconciliation'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <Card title="Total Records"  value={String(summary.totalRecords)} />
          <Card title="Matched"        value={String(summary.matched)} />
          <Card title="Discrepancies"  value={String(summary.discrepancies)} />
          <Card
            title="Critical"
            value={String(summary.critical)}
            change={summary.critical > 0 ? -1 : undefined}
          />
        </div>
      )}

      {rows.length > 0 && (
        <Card title={`${rows.length} Discrepancies Found`}>
          <div className="mt-4">
            <Table
              columns={COLUMNS as Parameters<typeof Table>[0]['columns']}
              data={rows as unknown as Record<string, unknown>[]}
              rowKey={(_, i) => String(i)}
              emptyMessage="No discrepancies found"
            />
          </div>
        </Card>
      )}

      {!summary && !loading && (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center text-slate-500 text-sm">
          Click "Run Reconciliation" to detect discrepancies across Chargebee, Stripe, and Salesforce.
        </div>
      )}
    </div>
  );
}

