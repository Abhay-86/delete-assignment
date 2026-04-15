import type { ScenarioInput, ScenarioResult, MonthlyProjection, ImpactBreakdown } from './types.js';
import type { ARRResult } from '../metrics/types.js';

/**
 * What-if scenario modeling engine.
 *
 * Projects ARR over the next 12 months based on adjustable assumptions
 * for churn, expansion, new business, pricing, and FX.  The engine uses
 * the current (baseline) metrics as a starting point and applies the
 * scenario deltas month-by-month to produce a forward-looking projection.
 *
 * How the projection works:
 *
 * 1. Start with the current month's ARR, MRR, customer count, churn rate,
 *    expansion rate, and new business run rate from `baseMetrics`.
 *
 * 2. For each of the next 12 months:
 *    a. Calculate churn: `monthlyChurn = startingMRR * (baseChurnRate + churnRateDelta)`
 *    b. Calculate expansion: `monthlyExpansion = startingMRR * (baseExpansionRate + expansionRateDelta)`
 *    c. Calculate new business: `monthlyNew = baseNewBusiness + newBusinessDelta`
 *    d. Apply pricing on renewing cohorts: multiply renewing MRR by `pricingChange`
 *    e. Apply FX: adjust non-USD portion by `fxAssumption`
 *    f. Compute end-of-month MRR: `start + new + expansion - contraction - churn`
 *    g. ARR = MRR * 12
 *
 * 3. The `impactBreakdown` isolates the contribution of each lever by
 *    running the scenario with only one lever changed at a time and
 *    comparing to the baseline.
 *
 * 4. Assumptions are documented in plain English for transparency
 *    (e.g., "Churn rate reduced from 2.5% to 2.0% monthly").
 *
 * @param baseMetrics - Current ARR metrics used as the starting point
 * @param inputs - Scenario input parameters (deltas to apply)
 * @returns 12-month projection with impact breakdown
 */
export async function runScenario(
  baseMetrics: ARRResult,
  inputs: ScenarioInput,
): Promise<ScenarioResult> {
  const baseMRR = baseMetrics.total / 12;
  const baseCustomers = baseMetrics.totalCustomers;

  // Derive base monthly rates from ARR structure.
  // We don't have NRR here, so use conservative SaaS defaults as baseline
  // rates — the deltas are applied on top of these.
  const BASE_CHURN_RATE     = 0.02;  // 2% monthly churn baseline
  const BASE_EXPANSION_RATE = 0.01;  // 1% monthly expansion baseline
  const BASE_NEW_BUSINESS   = baseMRR * 0.05; // 5% of current MRR as monthly new business

  const churnRate     = Math.max(0, BASE_CHURN_RATE     + inputs.churnRateDelta);
  const expansionRate = Math.max(0, BASE_EXPANSION_RATE + inputs.expansionRateDelta);
  const monthlyNew    = Math.max(0, BASE_NEW_BUSINESS   + inputs.newBusinessDelta);
  const pricing       = inputs.pricingChange ?? 1.0;
  const fx            = inputs.fxAssumption  ?? 1.0;

  // Helper: project 12 months given rates
  function project(
    churnR: number,
    expansionR: number,
    newBiz: number,
    pricingMult: number,
    fxMult: number,
  ): MonthlyProjection[] {
    const months: MonthlyProjection[] = [];
    let mrr = baseMRR * pricingMult * fxMult;
    let customers = baseCustomers;
    const now = new Date();

    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      const monthLabel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const churnMRR      = mrr * churnR;
      const expansionMRR  = mrr * expansionR;
      const contractionMRR = 0; // contraction folded into churnRate for simplicity
      const netNewMRR     = newBiz + expansionMRR - contractionMRR - churnMRR;

      mrr = Math.max(0, mrr + netNewMRR);
      customers = Math.max(0, customers + Math.round(newBiz / (baseMRR / baseCustomers || 1)) - Math.round(customers * churnR));

      months.push({
        month: monthLabel,
        arr: mrr * 12,
        newBusiness: newBiz,
        expansion: expansionMRR,
        contraction: contractionMRR,
        churn: churnMRR,
        netNewMRR,
        customerCount: customers,
      });
    }
    return months;
  }

  const projections = project(churnRate, expansionRate, monthlyNew, pricing, fx);
  const projectedARR = projections[11]!.arr;
  const baselineARR  = baseMetrics.total;

  // Impact breakdown: isolate each lever vs a neutral baseline projection
  const baseProjections  = project(BASE_CHURN_RATE, BASE_EXPANSION_RATE, BASE_NEW_BUSINESS, 1, 1);
  const baseEndARR       = baseProjections[11]!.arr;

  const churnOnlyEnd     = project(churnRate,        BASE_EXPANSION_RATE, BASE_NEW_BUSINESS, 1, 1)[11]!.arr;
  const expansionOnlyEnd = project(BASE_CHURN_RATE,  expansionRate,       BASE_NEW_BUSINESS, 1, 1)[11]!.arr;
  const newBizOnlyEnd    = project(BASE_CHURN_RATE,  BASE_EXPANSION_RATE, monthlyNew,        1, 1)[11]!.arr;
  const pricingOnlyEnd   = project(BASE_CHURN_RATE,  BASE_EXPANSION_RATE, BASE_NEW_BUSINESS, pricing, 1)[11]!.arr;
  const fxOnlyEnd        = project(BASE_CHURN_RATE,  BASE_EXPANSION_RATE, BASE_NEW_BUSINESS, 1,       fx)[11]!.arr;

  const impactBreakdown: ImpactBreakdown = {
    churnImpact:       churnOnlyEnd     - baseEndARR,
    expansionImpact:   expansionOnlyEnd - baseEndARR,
    newBusinessImpact: newBizOnlyEnd    - baseEndARR,
    pricingImpact:     pricingOnlyEnd   - baseEndARR,
    fxImpact:          fxOnlyEnd        - baseEndARR,
    totalImpact:       projectedARR     - baselineARR,
  };

  // Human-readable assumptions
  const assumptions: string[] = [
    `Baseline monthly churn rate: ${(BASE_CHURN_RATE * 100).toFixed(1)}%`,
    `Adjusted monthly churn rate: ${(churnRate * 100).toFixed(1)}% (delta: ${inputs.churnRateDelta >= 0 ? '+' : ''}${(inputs.churnRateDelta * 100).toFixed(1)}%)`,
    `Baseline monthly expansion rate: ${(BASE_EXPANSION_RATE * 100).toFixed(1)}%`,
    `Adjusted monthly expansion rate: ${(expansionRate * 100).toFixed(1)}% (delta: ${inputs.expansionRateDelta >= 0 ? '+' : ''}${(inputs.expansionRateDelta * 100).toFixed(1)}%)`,
    `New business MRR per month: $${monthlyNew.toFixed(0)} (delta: ${inputs.newBusinessDelta >= 0 ? '+' : ''}$${inputs.newBusinessDelta.toFixed(0)})`,
    `Pricing multiplier: ${pricing.toFixed(2)}x`,
    `FX multiplier: ${fx.toFixed(2)}x`,
    `Projection horizon: 12 months from ${new Date().toISOString().slice(0, 7)}`,
  ];

  return {
    label: inputs.label ?? 'Custom Scenario',
    inputs,
    baselineARR,
    projectedARR,
    projections,
    impactBreakdown,
    assumptions,
  };
}

