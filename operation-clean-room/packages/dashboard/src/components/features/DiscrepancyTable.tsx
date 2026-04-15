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
      unmatchedSfAccounts: number;
      unmatchedCbSubscriptions: number;
      matchedAccounts: { salesforceId: string; salesforceName: string; chargebeeId: string; chargebeeName: string; confidence: number }[];
    };
    revenueReconciliation: {
      expectedRevenue: number;
      actualRevenue: number;
      difference: number;
      differencePercent: number;
      coverageGap: {
        totalActiveMRR: number;
        totalStripeInWindow: number;
        paymentsInWindow: number;
        activeSubscriptions: number;
        gapPercent: number;
        windowStart: string;
        windowEnd: string;
        cbCustomersWithStripe: number;
        cbCustomersNoStripe: number;
      };
      lineItemCount: number;
      topDiscrepancies: { customer: string; expected: number; actual: number; difference: number; reason: string }[];
    };
    pipelineAnalysis: {
      healthScore: number;
      zombieDeals: { count: number; totalValue: number };
      mismatches: { count: number; missingSubscriptionCount: number };
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
  // 1. Entity matching
  matched: number;
  unmatchedSf: number;
  unmatchedCb: number;
  // 2. Missing links
  missingSubscriptions: number;  // SF Closed Won → no CB subscription
  unbookedCount: number;         // CB active → no SF account
  zombieCount: number;           // SF open opp → stale, no billing activity
  // 3. Amount discrepancies
  amountMismatches: number;
  // Coverage gap
  coverageGap: {
    gapPercent: number;
    totalActiveMRR: number;
    totalStripeInWindow: number;
    paymentsInWindow: number;
    activeSubscriptions: number;
    windowStart: string;
    windowEnd: string;
    cbCustomersWithStripe: number;
    cbCustomersNoStripe: number;
  } | null;
}

interface RowItem {
  category: string;
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

const CATEGORY_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  'Entity Match':        'warning',
  'Missing Link':        'error',
  'Amount Discrepancy':  'neutral',
};

const COLUMNS = [
  { key: 'category',    label: 'Category',   width: '160px',
    render: (v: unknown) => (
      <Badge variant={CATEGORY_VARIANT[v as string] ?? 'neutral'}>
        {String(v)}
      </Badge>
    ),
  },
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
      <span className={Number(v) < 0 ? 'text-red-400' : Number(v) > 0 ? 'text-emerald-400' : 'text-slate-500'}>
        {Number(v) === 0 ? '—' : fmt(Number(v))}
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

      // Total records = all source records ingested this run
      const totalRecords =
        res.metadata.recordsProcessed.subscriptions +
        res.metadata.recordsProcessed.accounts;

      setSummary({
        totalRecords,
        // 1. Entity matching
        matched: entityResolution.accountMatches,
        unmatchedSf: entityResolution.unmatchedSfAccounts,
        unmatchedCb: entityResolution.unmatchedCbSubscriptions,
        // 2. Missing links
        missingSubscriptions: pipelineAnalysis.mismatches.missingSubscriptionCount ?? pipelineAnalysis.mismatches.count,
        unbookedCount: pipelineAnalysis.unbookedRevenue.count,
        zombieCount: pipelineAnalysis.zombieDeals.count,
        // 3. Amount discrepancies
        amountMismatches: revenueReconciliation.lineItemCount,
        // Coverage
        coverageGap: revenueReconciliation.coverageGap ?? null,
      });

      // Build rows from top discrepancies + pipeline issues
      const revenueRows: RowItem[] = revenueReconciliation.topDiscrepancies.map(d => ({
        category:    'Amount Discrepancy',
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
            category:    'Missing Link',
            type:        'zombie_deal',
            severity:    'medium',
            description: `${pipelineAnalysis.zombieDeals.count} zombie deals worth ${fmt(pipelineAnalysis.zombieDeals.totalValue)} — open SF opportunities with no billing activity`,
            systemA:     'Salesforce',
            systemB:     'Chargebee',
            delta:       -pipelineAnalysis.zombieDeals.totalValue,
            status:      'investigating',
          }]
        : [];

      const unbookedRow: RowItem[] = pipelineAnalysis.unbookedRevenue.totalMRR > 0
        ? [{
            category:    'Missing Link',
            type:        'missing_sf_record',
            severity:    'high',
            description: `${pipelineAnalysis.unbookedRevenue.count} active CB subscriptions with no Salesforce account (unbooked MRR: ${fmt(pipelineAnalysis.unbookedRevenue.totalMRR)})`,
            systemA:     'Chargebee',
            systemB:     'Salesforce',
            delta:       -pipelineAnalysis.unbookedRevenue.totalMRR,
            status:      'open',
          }]
        : [];

      const unmatchedRow: RowItem[] = entityResolution.unmatchedSfAccounts > 0
        ? [{
            category:    'Entity Match',
            type:        'unmatched_entity',
            severity:    'high',
            description: `${entityResolution.unmatchedSfAccounts} SF accounts could not be linked to any Chargebee subscription`,
            systemA:     'Salesforce',
            systemB:     'Chargebee',
            delta:       0,
            status:      'open',
          }]
        : [];

      setRows([...unmatchedRow, ...pipelineRows, ...unbookedRow, ...revenueRows]);
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
        <div className="space-y-4">
          {/* Top-line counts */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card title="Total Records" value={String(summary.totalRecords)} />
            <Card title="Matched (SF↔CB)" value={String(summary.matched)}
              changeLabel={`${summary.unmatchedSf} SF · ${summary.unmatchedCb} CB unmatched`} />
            <Card title="Missing Links"
              value={String(summary.zombieCount + summary.unbookedCount + summary.missingSubscriptions)} />
            <Card title="Amount Mismatches" value={String(summary.amountMismatches)} />
          </div>

          {/* ── 1. Entity Matching ── */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-300">
              🧩 1 · Entity Matching — same customer across systems?
            </h3>
            <p className="text-xs text-slate-500">
              Fuzzy name + domain matching between Salesforce accounts and Chargebee subscriptions.
            </p>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <div>
                <p className="text-xs text-slate-500 mb-1">Matched</p>
                <p className="text-2xl font-bold text-emerald-400">{summary.matched}</p>
                <p className="text-xs text-slate-500 mt-1">SF accounts linked to CB</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Unmatched SF Accounts</p>
                <p className="text-2xl font-bold text-red-400">{summary.unmatchedSf}</p>
                <p className="text-xs text-slate-500 mt-1">no Chargebee counterpart found</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Unmatched CB Subscriptions</p>
                <p className="text-2xl font-bold text-amber-400">{summary.unmatchedCb}</p>
                <p className="text-xs text-slate-500 mt-1">no Salesforce counterpart found</p>
              </div>
            </div>
          </div>

          {/* ── 2. Missing Links ── */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-300">
              ❌ 2 · Missing Links — entity exists in one system only
            </h3>
            <p className="text-xs text-slate-500">
              Chargebee subscriptions with no SF account · Closed Won deals with no subscription · Zombie SF deals
            </p>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <div>
                <p className="text-xs text-slate-500 mb-1">Unbooked in SF</p>
                <p className="text-2xl font-bold text-red-400">{summary.unbookedCount}</p>
                <p className="text-xs text-slate-500 mt-1">CB active → no SF account</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">No Subscription</p>
                <p className="text-2xl font-bold text-red-400">{summary.missingSubscriptions}</p>
                <p className="text-xs text-slate-500 mt-1">SF Closed Won → no CB sub</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Zombie Deals</p>
                <p className="text-2xl font-bold text-amber-400">{summary.zombieCount}</p>
                <p className="text-xs text-slate-500 mt-1">SF open opp, stale 90+ days</p>
              </div>
            </div>
          </div>

          {/* ── 3. Amount Discrepancies + Stripe Coverage Gap ── */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/40 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300">
              💰 3 · Amount Discrepancies — Stripe payment coverage
            </h3>
            <p className="text-xs text-slate-500">
              Stripe is <strong className="text-slate-400">not</strong> the payment processor for all customers.
              The gap below is a <strong className="text-slate-400">data completeness issue</strong>, not missing revenue —
              most customers pay via invoice/ACH/wire which do not appear in Stripe.
            </p>
            {summary.coverageGap && (
              <>
                {/* Row 1: customer coverage — the root cause */}
                <div className="grid grid-cols-3 gap-4 pt-1">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">CB customers in Stripe</p>
                    <p className="text-2xl font-bold text-emerald-400">
                      {summary.coverageGap.cbCustomersWithStripe}
                      <span className="text-sm font-normal text-slate-400 ml-1">
                        / {summary.coverageGap.activeSubscriptions}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {((summary.coverageGap.cbCustomersWithStripe / summary.coverageGap.activeSubscriptions) * 100).toFixed(0)}% of active subs have any Stripe record
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">CB customers NOT in Stripe</p>
                    <p className="text-2xl font-bold text-amber-400">
                      {summary.coverageGap.cbCustomersNoStripe}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">pay via invoice / ACH / wire</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Amount mismatches</p>
                    <p className="text-2xl font-bold text-slate-200">{summary.amountMismatches}</p>
                    <p className="text-xs text-slate-500 mt-1">CB subs with CB≠Stripe amount</p>
                  </div>
                </div>

                {/* Row 2: dollar amounts — secondary, clearly labelled */}
                <div className="grid grid-cols-3 gap-4 border-t border-slate-700 pt-3">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Stripe coverage gap</p>
                    <p className="text-lg font-bold text-red-400">
                      {summary.coverageGap.gapPercent.toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      window {summary.coverageGap.windowStart} → {summary.coverageGap.windowEnd}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">CB full MRR (expected)</p>
                    <p className="text-lg font-semibold text-slate-200">
                      {fmt(summary.coverageGap.totalActiveMRR)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">all {summary.coverageGap.activeSubscriptions} active subs</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Stripe in window (actual)</p>
                    <p className="text-lg font-semibold text-slate-200">
                      {fmt(summary.coverageGap.totalStripeInWindow)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {summary.coverageGap.paymentsInWindow} payments from {summary.coverageGap.cbCustomersWithStripe} customers only
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Detail table */}
      {rows.length > 0 && (
        <Card title={`${rows.length} Issues Found`}>
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

