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
/**
 * Calculate the true MRR for a subscription, accounting for:
 *  1. Base plan price (in cents)
 *  2. Addons: each addon contributes quantity × unit_price cents
 *  3. Active coupons only (valid_till is null OR > termEnd):
 *       - percentage: deduct (discountValue / 100) × gross
 *       - fixed_amount: deduct discountValue cents (floor at 0)
 *
 * @param planPrice  - Base plan price in cents
 * @param addons     - Raw addon array from JSON
 * @param coupons    - Raw coupon array from JSON
 * @param termEnd    - ISO-8601 string of the subscription's current_term_end
 */
function computeMRR(
  planPrice: number,
  addons: any[],
  coupons: any[],
  termEnd: string,
): number {
  // Base + addons
  const addonTotal = (addons ?? []).reduce((sum: number, a: any) => sum + (Number(a.quantity) || 0) * (Number(a.unit_price) || 0), 0);
  let gross = planPrice + addonTotal;

  // active coupons
  for (const coupon of coupons ?? []) {
    const validTill: string | null = coupon.valid_till ?? null;
    const isActive = validTill === null || validTill >= termEnd;
    if (!isActive) continue;

    if (coupon.discount_type === 'percentage') {
      gross = gross * (1 - Number(coupon.discount_value) / 100);
    } else if (coupon.discount_type === 'fixed_amount') {
      gross = gross - Number(coupon.discount_value);
    }
  }

  return Math.max(0, Math.round(gross));
}

export async function loadChargebeeSubscriptions(
  dataDir: string,
): Promise<ChargebeeSubscription[]> {
  const filePath = join(dataDir, 'chargebee_subscriptions.json');

  const raw = await loadJSON<{
    subscriptions: any[];
  }>(filePath);

  return raw.subscriptions.map((sub) => {
    const normalizedAddons = (sub.addons ?? []).map((addon: any) => ({
      addon_id: addon.addon_id ?? addon.id ?? '',
      addon_name: addon.addon_name ?? addon.name ?? '',
      quantity: Number(addon.quantity) || 0,
      unit_price: Number(addon.unit_price) || Number(addon.price) || 0,
    }));

    const normalizedCoupons = (sub.coupons ?? []).map((c: any) => ({
      coupon_id: c.coupon_id,
      coupon_name: c.coupon_name,
      discount_type: c.discount_type as 'percentage' | 'fixed_amount',
      discount_value: Number(c.discount_value),
      apply_on: c.apply_on as 'invoice_amount' | 'each_specified_item',
      valid_from: c.valid_from,
      valid_till: c.valid_till ?? null,
    }));

    const mrr = computeMRR(
      Number(sub.plan.price),
      sub.addons,
      sub.coupons,
      sub.current_term_end,
    );

    return {
      subscription_id: sub.id,
      customer: {
        customer_id: sub.customer.id,
        // Not available in source data
        first_name: '',  
        last_name: '',  
        email: sub.customer.email,
        company: sub.customer.company,
        // Not available in source data
        billing_address: {
          line1: '',
          city: '',
          state: '',
          country: '',
          zip: '',
        },
      },
      plan: {
        plan_id: sub.plan.id,
        plan_name: sub.plan.name,
        price: Number(sub.plan.price),
        currency: sub.plan.currency,
        billing_period: sub.plan.interval === 'month' ? 1 : 12,
        billing_period_unit: sub.plan.interval as 'month' | 'year',
        trial_end: sub.trial_end ?? null,
      },
      status: sub.status as 'active' | 'in_trial' | 'cancelled' | 'non_renewing' | 'paused' | 'future',
      current_term_start: sub.current_term_start,
      current_term_end: sub.current_term_end,
      created_at: sub.created_at,
      cancelled_at: sub.cancelled_at ?? null,
      // Not available in source data
      cancel_reason: null,
      // plan + addons − active coupon discounts (all in cents)
      mrr,                 
      coupons: normalizedCoupons,
      plan_changes: sub.plan_changes ?? [],
      addons: normalizedAddons,
      metadata: sub.metadata ?? {},
    };
  });
}
