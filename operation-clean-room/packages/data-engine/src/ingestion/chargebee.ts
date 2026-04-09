import { ChargebeeSubscription } from './types.js';

/**
 * Load and normalize Chargebee subscription data.
 *
 * Chargebee subscriptions have a deeply nested JSON structure that requires
 * careful handling:
 *
 * - **Nested customer object**: Customer details are embedded inside each
 *   subscription.  The same customer may appear across multiple subscriptions
 *   and must be de-duplicated.
 *
 * - **Coupons**: Subscriptions may have one or more coupons with percentage
 *   or fixed-amount discounts.  Coupons can have expiry dates, so MRR
 *   calculations must check whether coupons are still active.
 *
 * - **Plan changes**: A subscription's `plan_changes` array records every
 *   upgrade, downgrade, or lateral move.  Proration amounts on plan changes
 *   affect revenue recognition for the period in which they occur.
 *
 * - **Trial handling**: Subscriptions in `in_trial` status have a `trial_end`
 *   date on their plan object.  These should generally be excluded from ARR
 *   unless specifically requested.  When a trial converts, the first payment
 *   date may differ from the subscription creation date.
 *
 * - **Addons**: Additional line items that contribute to MRR but are tracked
 *   separately from the base plan price.
 *
 * @param dataDir - Path to the data directory
 * @returns Normalized Chargebee subscription records
 */
export async function loadChargebeeSubscriptions(
  dataDir: string,
): Promise<ChargebeeSubscription[]> {
  // TODO: Implement - load from chargebee_subscriptions.json, normalize, and return
  throw new Error('Not implemented');
}
