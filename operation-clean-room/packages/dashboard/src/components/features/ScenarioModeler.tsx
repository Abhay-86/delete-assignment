import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Chart } from '@/components/ui/Chart';
import { Slider } from '@/components/ui/Slider';
import { runScenario } from '@/api/client';

interface MonthlyProjection {
  month: string;
  arr: number;
  churn: number;
  expansion: number;
  newBusiness: number;
}

interface ScenarioData {
  label: string;
  baselineARR: number;
  projectedARR: number;
  projections: MonthlyProjection[];
  impactBreakdown: { totalImpact: number; churnImpact: number; expansionImpact: number };
}

function fmt(n: number) {
  return n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : `$${(n / 1_000).toFixed(1)}K`;
}

export function ScenarioModeler() {
  const [churnDelta,     setChurnDelta]     = useState(0);
  const [expansionDelta, setExpansionDelta] = useState(0);
  const [pricingChange,  setPricingChange]  = useState(100); // shown as %, sent as multiplier
  const [result, setResult]   = useState<ScenarioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const res = await runScenario({
        churnRateDelta:     churnDelta / 100,
        expansionRateDelta: expansionDelta / 100,
        newBusinessDelta:   0,
        priceDelta:         (pricingChange - 100) / 100,
        costDelta:          0,
      } as Parameters<typeof runScenario>[0]);
      // backend wraps: { success, data }
      const data = (res as unknown as { success: boolean; data: ScenarioData }).data ?? res;
      setResult(data as ScenarioData);
    } catch {
      setError('Failed to run scenario. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  const chartData = result?.projections.map(p => ({
    month: p.month,
    arr:   Math.round(p.arr / 1000),
  })) ?? [];

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-semibold text-slate-200">Scenario Modeler</h2>

      {/* Controls */}
      <Card title="Adjust Levers">
        <div className="mt-4 space-y-5">
          <Slider
            label="Churn Rate Delta"
            min={-50} max={50} step={1}
            value={churnDelta}
            onChange={setChurnDelta}
            unit="%"
          />
          <Slider
            label="Expansion Rate Delta"
            min={-50} max={50} step={1}
            value={expansionDelta}
            onChange={setExpansionDelta}
            unit="%"
          />
          <Slider
            label="Pricing Change"
            min={50} max={150} step={1}
            value={pricingChange}
            onChange={setPricingChange}
            unit="%"
          />
        </div>
        <button
          onClick={handleRun}
          disabled={loading}
          className="mt-6 w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {loading ? 'Running...' : 'Run Scenario'}
        </button>
      </Card>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Card
              title="Baseline ARR"
              value={fmt(result.baselineARR)}
            />
            <Card
              title="Projected ARR (12m)"
              value={fmt(result.projectedARR)}
              change={((result.projectedARR - result.baselineARR) / result.baselineARR) * 100}
              changeLabel="vs baseline"
            />
            <Card
              title="Total Impact"
              value={fmt(Math.abs(result.impactBreakdown.totalImpact))}
              change={result.impactBreakdown.totalImpact >= 0 ? Math.abs(result.impactBreakdown.totalImpact / result.baselineARR * 100) : -(Math.abs(result.impactBreakdown.totalImpact / result.baselineARR * 100))}
              changeLabel="of baseline"
            />
          </div>

          <Card title="12-Month ARR Projection ($K)">
            <div className="mt-4">
              <Chart
                type="area"
                data={chartData as Record<string, unknown>[]}
                series={[{ key: 'arr', label: 'ARR ($K)', color: '#6366F1' }]}
                xAxisKey="month"
                height={260}
                showLegend={false}
              />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

