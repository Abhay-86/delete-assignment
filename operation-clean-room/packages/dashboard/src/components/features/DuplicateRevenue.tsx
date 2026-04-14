import { useApi } from '@/hooks/useApi';
import { getDuplicates } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Copy, DollarSign, ShieldAlert, CheckCircle } from 'lucide-react';

interface DuplicateMatch {
  salesforceId: string;
  salesforceName: string;
  chargebeeId: string;
  chargebeeName: string;
  mrrUSD: number;
  arrUSD: number;
  confidence: number;
  matchedFields: string[];
  classification: 'high_confidence' | 'medium_confidence' | 'low_confidence';
}

interface DuplicatesSummary {
  totalMatches: number;
  highConfidenceMatches: number;
  mediumConfidenceMatches: number;
  lowConfidenceMatches: number;
  totalDuplicateMRR: number;
  totalDuplicateARR: number;
}

interface DuplicatesResponse {
  success: boolean;
  matches: DuplicateMatch[];
  summary: DuplicatesSummary;
}

function fmt(n: number) {
  const abs = Math.abs(n);
  return abs >= 1_000_000
    ? `$${(abs / 1_000_000).toFixed(2)}M`
    : abs >= 1_000
    ? `$${(abs / 1_000).toFixed(1)}K`
    : `$${abs.toFixed(0)}`;
}

const CLASS_VARIANT: Record<string, 'error' | 'warning' | 'neutral'> = {
  high_confidence:   'error',
  medium_confidence: 'warning',
  low_confidence:    'neutral',
};

const COLUMNS = [
  { key: 'salesforceName', label: 'Salesforce Account' },
  { key: 'chargebeeName',  label: 'Chargebee Account' },
  {
    key: 'confidence',
    label: 'Confidence',
    width: '110px',
    render: (v: unknown) => (
      <span className="font-mono text-sm text-slate-300">
        {(Number(v) * 100).toFixed(0)}%
      </span>
    ),
  },
  {
    key: 'classification',
    label: 'Risk',
    width: '140px',
    render: (v: unknown) => (
      <Badge variant={CLASS_VARIANT[v as string] ?? 'neutral'}>
        {String(v).replace('_', ' ')}
      </Badge>
    ),
  },
  {
    key: 'matchedFields',
    label: 'Matched On',
    width: '160px',
    render: (v: unknown) => (
      <span className="text-xs text-slate-400">{(v as string[]).join(', ')}</span>
    ),
  },
  {
    key: 'mrrUSD',
    label: 'MRR',
    width: '90px',
    render: (v: unknown) => (
      <span className="text-slate-300">{fmt(Number(v))}</span>
    ),
  },
  {
    key: 'arrUSD',
    label: 'ARR at Risk',
    width: '100px',
    render: (v: unknown) => (
      <span className="font-medium text-amber-400">{fmt(Number(v))}</span>
    ),
  },
];

export function DuplicateRevenue() {
  const { data: res, isLoading, isError } = useApi(
    ['reconciliation', 'duplicates'],
    getDuplicates,
  );

  const payload = (res as unknown as DuplicatesResponse);
  const matches = payload?.matches ?? [];
  const summary = payload?.summary;

  if (isLoading) return <div className="p-6 text-center text-slate-400">Loading...</div>;
  if (isError || !summary) return (
    <div className="p-6 text-center text-red-400">
      Failed to load duplicate data. Is the server running?
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-200">Duplicate Revenue Detection</h2>
        <span className="text-xs text-slate-500">
          Cross-system entity resolution · Salesforce ↔ Chargebee
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <Card
          title="Matched Accounts"
          value={summary.totalMatches}
          icon={<Copy size={16} />}
          changeLabel="across both systems"
        />
        <Card
          title="Duplicate ARR at Risk"
          value={fmt(summary.totalDuplicateARR)}
          icon={<DollarSign size={16} />}
          change={-1}
          changeLabel={`${fmt(summary.totalDuplicateMRR)}/mo double-counted`}
        />
        <Card
          title="High Confidence"
          value={summary.highConfidenceMatches}
          icon={<ShieldAlert size={16} />}
          changeLabel="score > 80% · review immediately"
        />
        <Card
          title="Low Risk"
          value={summary.lowConfidenceMatches}
          icon={<CheckCircle size={16} />}
          changeLabel="score ≤ 60% · likely migrations"
        />
      </div>

      {/* Breakdown bar */}
      {summary.totalMatches > 0 && (
        <div className="rounded-lg border border-slate-700/50 bg-slate-800/80 p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-3">
            Match confidence distribution
          </p>
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
            {summary.highConfidenceMatches > 0 && (
              <div
                className="bg-red-500"
                style={{ width: `${(summary.highConfidenceMatches / summary.totalMatches) * 100}%` }}
                title={`High: ${summary.highConfidenceMatches}`}
              />
            )}
            {summary.mediumConfidenceMatches > 0 && (
              <div
                className="bg-amber-400"
                style={{ width: `${(summary.mediumConfidenceMatches / summary.totalMatches) * 100}%` }}
                title={`Medium: ${summary.mediumConfidenceMatches}`}
              />
            )}
            {summary.lowConfidenceMatches > 0 && (
              <div
                className="bg-slate-500"
                style={{ width: `${(summary.lowConfidenceMatches / summary.totalMatches) * 100}%` }}
                title={`Low: ${summary.lowConfidenceMatches}`}
              />
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />High {summary.highConfidenceMatches}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Medium {summary.mediumConfidenceMatches}</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-slate-500 mr-1" />Low {summary.lowConfidenceMatches}</span>
          </div>
        </div>
      )}

      {/* Matches table */}
      <Card title={`${matches.length} Matched Account Pairs`}>
        <div className="mt-4">
          <Table
            columns={COLUMNS as Parameters<typeof Table>[0]['columns']}
            data={matches as unknown as Record<string, unknown>[]}
            rowKey={(_, i) => String(i)}
            emptyMessage="No duplicate accounts detected"
          />
        </div>
      </Card>
    </div>
  );
}
