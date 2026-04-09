import type { ARRResult, MetricOptions } from './types.js';

/**
 * Annual Recurring Revenue (ARR) calculation.
 *
 * ARR is the annualized value of all active recurring subscriptions.
 * Calculation must handle several edge cases:
 *
 * - **Trials**: Subscriptions in trial status should be excluded by default
 *   (configurable via options).  Trials that convert mid-month need careful
 *   handling -- the ARR should reflect only the post-conversion period.
 *
 * - **Multi-year deals**: Some subscriptions are billed annually or multi-
 *   annually.  The ARR for a 2-year deal at $24,000 is $12,000 (annualized),
 *   not $24,000.  Use the plan's billing period to normalize.
 *
 * - **Prorations**: Mid-month plan changes create prorated invoices.  ARR
 *   should reflect the *current* plan rate, not the prorated amount.
 *
 * - **FX conversion**: Non-USD subscriptions must be converted using the
 *   FX rate as of the calculation date.  This means ARR can fluctuate even
 *   with no subscription changes if exchange rates move.
 *
 * - **Addons**: Recurring addons contribute to ARR and should be included.
 *
 * - **Discounts**: Active coupons reduce the effective ARR.  Expired coupons
 *   mean the customer's ARR increases to the list price.
 *
 * - **Paused subscriptions**: Typically excluded from ARR but may be included
 *   if the pause is temporary and the customer is expected to resume.
 *
 * @param date - The as-of date for the ARR calculation
 * @param options - Calculation options (segmentation, exclusions, etc.)
 * @returns ARR result with total and breakdowns
 */
export async function calculateARR(
  date: Date,
  options?: MetricOptions,
): Promise<ARRResult> {
  // TODO: Implement ARR calculation
  throw new Error('Not implemented');
}
