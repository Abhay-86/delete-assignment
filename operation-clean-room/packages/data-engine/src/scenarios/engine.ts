import type { ScenarioInput, ScenarioResult } from './types.js';
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
  // TODO: Implement scenario projection engine
  throw new Error('Not implemented');
}
