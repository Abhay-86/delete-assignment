import type { NRRResult, MetricOptions } from './types.js';

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
  // TODO: Implement NRR calculation
  throw new Error('Not implemented');
}
