import type { RevenueReconciliationResult } from './types.js';
import type { ChargebeeSubscription, StripePayment, FXRate } from '../ingestion/types.js';

/**
 * Revenue reconciliation across billing systems.
 *
 * Compares expected revenue (from active subscriptions) against actual
 * revenue (from payments) accounting for:
 *
 * - **Prorations**: Mid-cycle upgrades/downgrades create prorated charges
 *   that don't match the subscription's stated MRR.  The reconciler must
 *   detect proration periods and adjust expected revenue accordingly.
 *
 * - **Discounts / coupons**: Active coupons reduce the invoiced amount
 *   below the plan's list price.  Both percentage and fixed-amount
 *   coupons must be accounted for, including coupon expiry dates.
 *
 * - **FX conversion**: Subscriptions may be priced in EUR, GBP, etc.
 *   but payments are recorded in the original currency.  Reconciliation
 *   must use the FX rate from the payment date (not today's rate) to
 *   convert both sides to a common currency (USD).
 *
 * - **Timing differences**: A subscription billed on the 1st of the month
 *   may have its payment processed on the 2nd or 3rd.  End-of-month
 *   boundary effects can cause payments to fall in a different calendar
 *   month than expected.
 *
 * - **Failed and retried payments**: A failed payment that is retried
 *   successfully should count as a single expected payment, not two.
 *
 * - **Refunds and disputes**: Refunded or disputed payments reduce actual
 *   revenue but do not necessarily reduce expected revenue.
 *
 * @module reconciliation/revenue
 */

/** Options for revenue reconciliation. */
export interface RevenueReconciliationOptions {
  /** Start of the reconciliation period (inclusive). */
  startDate: Date;
  /** End of the reconciliation period (exclusive). */
  endDate: Date;
  /** Tolerance for amount mismatches in USD. Defaults to 0.50. */
  toleranceUSD?: number;
  /** Whether to include trial subscriptions. Defaults to false. */
  includeTrials?: boolean;
}

/**
 * Reconcile expected subscription revenue against actual payment revenue.
 *
 * @param subscriptions - Active subscriptions from Chargebee (and/or Stripe)
 * @param payments - Payment records from Stripe
 * @param fxRates - Historical FX rates for currency conversion
 * @param options - Reconciliation options (date range, tolerance, etc.)
 * @returns Detailed reconciliation result with line items and breakdown
 */
export async function reconcileRevenue(
  subscriptions: ChargebeeSubscription[],
  payments: StripePayment[],
  fxRates: FXRate[],
  options: RevenueReconciliationOptions,
): Promise<RevenueReconciliationResult> {
  // TODO: Implement revenue reconciliation logic
  throw new Error('Not implemented');
}
