import { join } from 'node:path';
import type { NRRResult, MetricOptions } from './types.js';
import { loadChargebeeSubscriptions } from '../ingestion/chargebee.js';
import { loadFXRates } from '../utils/load-fx-rates.js';
import { convertToUSD } from '../utils/fx.js';

/**
 * Net Revenue Retention (NRR) calculation.
 *
 * NRR measures how much revenue is retained and expanded from an existing
 * customer cohort over a period, excluding new business.  The formula is:
 *
 *   NRR = (Starting ARR + Expansion - Contraction - Churn) / Starting ARR
 *
 * Key components:
 *
 * - **Expansion**: Revenue increases from existing customers via upgrades,
 *   additional seats, add-on purchases, or moving to higher-tier plans.
 *   Expansion is measured as the delta between the customer's ARR at the
 *   start and end of the period (only positive deltas).
 *
 * - **Contraction**: Revenue decreases from existing customers via downgrades,
 *   seat removals, or increased discounts.  Contraction is measured as the
 *   absolute value of negative ARR deltas for customers who are still active.
 *
 * - **Churn**: Complete revenue loss from customers who cancelled during the
 *   period.  The churned amount is the customer's ARR at the start of the
 *   period (not the partial period revenue).
 *
 * Important considerations:
 * - The cohort is defined as all customers who were active at `startDate`.
 * - New customers acquired during the period are excluded from NRR.
 * - Reactivated customers (churned and returned) are typically counted as
 *   new business, not expansion.
 * - FX fluctuations on non-USD subscriptions can cause "phantom" expansion
 *   or contraction; consider using a fixed exchange rate for consistency.
 *
 * @param startDate - Beginning of the measurement period
 * @param endDate - End of the measurement period
 * @param options - Calculation options
 * @returns NRR result with percentage and component breakdown
 */
export async function calculateNRR(
  startDate: Date,
  endDate: Date,
  options?: MetricOptions,
): Promise<NRRResult> {
  const dataDir = join(process.cwd(), '../../data');
  const [subscriptions, fxRates] = await Promise.all([
    loadChargebeeSubscriptions(dataDir),
    loadFXRates(dataDir),
  ]);

  const toAnnual = (sub: typeof subscriptions[0], asOf: Date): number => {
    try {
      return convertToUSD(sub.mrr / 100, sub.plan.currency, asOf, fxRates) * 12;
    } catch {
      return (sub.mrr / 100) * 12;
    }
  };

  // Cohort = customers who were active at startDate
  // i.e. created before startDate AND (not cancelled OR cancelled after startDate)
  const cohortIds = new Set(
    subscriptions
      .filter(s =>
        new Date(s.created_at) <= startDate &&
        (s.cancelled_at == null || new Date(s.cancelled_at) > startDate),
      )
      .map(s => s.customer.customer_id),
  );

  let startingARR = 0;
  let endingARR = 0;
  let expansion = 0;
  let contraction = 0;
  let churn = 0;

  const breakdown = [];

  // Group by customer_id
  const byCustomer = new Map<string, typeof subscriptions>();
  for (const sub of subscriptions) {
    if (!cohortIds.has(sub.customer.customer_id)) continue;
    const arr = byCustomer.get(sub.customer.customer_id) ?? [];
    arr.push(sub);
    byCustomer.set(sub.customer.customer_id, arr);
  }

  for (const [, subs] of byCustomer) {
    const name = subs[0]?.customer.company ?? 'Unknown';

    const startArr = subs
      .filter(s =>
        new Date(s.created_at) <= startDate &&
        (s.cancelled_at == null || new Date(s.cancelled_at) > startDate),
      )
      .reduce((sum, s) => sum + toAnnual(s, startDate), 0);

    // A sub was active at endDate if created before endDate AND (not cancelled OR cancelled after endDate)
    const endArr = subs
      .filter(s =>
        new Date(s.created_at) <= endDate &&
        (s.cancelled_at == null || new Date(s.cancelled_at) > endDate),
      )
      .reduce((sum, s) => sum + toAnnual(s, endDate), 0);

    startingARR += startArr;
    endingARR += endArr;

    const delta = endArr - startArr;
    let changeType: 'expansion' | 'contraction' | 'churn' | 'unchanged';

    if (endArr === 0 && startArr > 0) {
      churn += startArr;
      changeType = 'churn';
    } else if (delta > 1) {
      expansion += delta;
      changeType = 'expansion';
    } else if (delta < -1) {
      contraction += Math.abs(delta);
      changeType = 'contraction';
    } else {
      changeType = 'unchanged';
    }

    breakdown.push({
      customerName: name,
      startingARR: startArr,
      endingARR: endArr,
      change: delta,
      changeType,
      reason: null,
    });
  }

  const percentage = startingARR > 0
    ? ((startingARR + expansion - contraction - churn) / startingARR) * 100
    : 0;

  return {
    percentage,
    expansion,
    contraction,
    churn,
    startingARR,
    endingARR,
    breakdown,
    periodStart: startDate.toISOString().slice(0, 10),
    periodEnd: endDate.toISOString().slice(0, 10),
  };
}
