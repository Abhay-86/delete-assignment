import { join } from 'node:path';
import { loadJSON } from './json-loader.js';
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
  const filePath = join(dataDir, 'chargebee_subscriptions.json');

  const raw = await loadJSON<{
    subscriptions: any[];
  }>(filePath);

  return raw.subscriptions.map((sub) => ({
    subscription_id: sub.id,
    customer: {
      customer_id: sub.customer.id,
      first_name: '', // Not available in source data
      last_name: '', // Not available in source data
      email: sub.customer.email,
      company: sub.customer.company,
      billing_address: {
        line1: '', // Not available in source data
        city: '', // Not available in source data
        state: '', // Not available in source data
        country: '', // Not available in source data
        zip: '', // Not available in source data
      },
    },
    plan: {
      plan_id: sub.plan.id,
      plan_name: sub.plan.name,
      price: Number(sub.plan.price),
      currency: sub.plan.currency,
      billing_period: sub.plan.interval === 'month' ? 1 : 12,
      billing_period_unit: sub.plan.interval as 'month' | 'year',
      trial_end: sub.trial_end,
    },
    status: sub.status as 'active' | 'in_trial' | 'cancelled' | 'non_renewing' | 'paused' | 'future',
    current_term_start: sub.current_term_start,
    current_term_end: sub.current_term_end,
    created_at: sub.created_at,
    cancelled_at: sub.cancelled_at,
    cancel_reason: null, // Not available in source data
    mrr: Number(sub.plan.price), // Using plan price as MRR
    coupons: sub.coupons || [],
    plan_changes: sub.plan_changes || [],
    addons: (sub.addons || []).map((addon: any) => ({
      addon_id: addon.addon_id || addon.id || '',
      addon_name: addon.addon_name || addon.name || '',
      quantity: Number(addon.quantity) || 0,
      unit_price: Number(addon.unit_price) || Number(addon.price) || 0,
    })),
    metadata: sub.metadata || {},
  }));
}
