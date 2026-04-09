import { describe, it, expect } from 'vitest';
import { detectDuplicates, classifyDuplicate } from '../src/reconciliation/deduplication.js';
import type { StripePayment, ChargebeeSubscription } from '../src/ingestion/types.js';

/**
 * Helper to create a minimal Chargebee subscription for testing.
 */
function makeChargebeeSub(
  overrides: Partial<ChargebeeSubscription> & {
    company: string;
    customerId: string;
    subscriptionId: string;
  },
): ChargebeeSubscription {
  return {
    subscription_id: overrides.subscriptionId,
    customer: {
      customer_id: overrides.customerId,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      company: overrides.company,
      billing_address: {
        line1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        country: 'US',
        zip: '00000',
      },
    },
    plan: {
      plan_id: 'pro',
      plan_name: 'Pro',
      price: 100_00,
      currency: 'usd',
      billing_period: 1,
      billing_period_unit: 'month',
      trial_end: null,
    },
    status: overrides.status ?? 'active',
    current_term_start: overrides.current_term_start ?? '2024-01-01',
    current_term_end: overrides.current_term_end ?? '2024-12-31',
    created_at: overrides.created_at ?? '2024-01-01',
    cancelled_at: overrides.cancelled_at ?? null,
    cancel_reason: overrides.cancel_reason ?? null,
    mrr: 100_00,
    coupons: [],
    plan_changes: [],
    addons: [],
    metadata: {},
    ...overrides,
  };
}

/**
 * Helper to create a minimal Stripe payment for testing.
 */
function makeStripePayment(
  overrides: Partial<StripePayment> & {
    customerId: string;
    customerName: string;
    subscriptionId: string;
  },
): StripePayment {
  return {
    payment_id: overrides.payment_id ?? `pi_${Math.random().toString(36).slice(2)}`,
    customer_id: overrides.customerId,
    customer_name: overrides.customerName,
    amount: overrides.amount ?? 100_00,
    currency: overrides.currency ?? 'usd',
    status: overrides.status ?? 'succeeded',
    payment_date: overrides.payment_date ?? '2024-03-01',
    subscription_id: overrides.subscriptionId,
    description: overrides.description ?? 'Monthly subscription',
    failure_code: null,
    refund_id: null,
    dispute_id: null,
    ...overrides,
  };
}

describe('Duplicate Detection', () => {
  it('should flag overlapping subscriptions in Stripe + Chargebee as duplicate', async () => {
    // Same customer has ACTIVE subscriptions in both systems with overlapping dates
    const stripePayments: StripePayment[] = [
      makeStripePayment({
        customerId: 'cus_stripe_001',
        customerName: 'Acme Corp',
        subscriptionId: 'sub_stripe_001',
        payment_date: '2024-03-01',
      }),
      makeStripePayment({
        customerId: 'cus_stripe_001',
        customerName: 'Acme Corp',
        subscriptionId: 'sub_stripe_001',
        payment_date: '2024-02-01',
      }),
    ];

    const chargebeeSubs: ChargebeeSubscription[] = [
      makeChargebeeSub({
        customerId: 'cus_cb_001',
        company: 'Acme Corporation',
        subscriptionId: 'sub_cb_001',
        status: 'active',
        current_term_start: '2024-01-01',
        current_term_end: '2024-12-31',
      }),
    ];

    const duplicates = await detectDuplicates(stripePayments, chargebeeSubs);

    expect(duplicates.length).toBeGreaterThan(0);

    const acmeDuplicate = duplicates[0];
    expect(acmeDuplicate).toBeDefined();
    expect(acmeDuplicate!.hasOverlap).toBe(true);
    expect(acmeDuplicate!.classification).toBe('true_duplicate');
  });

  it('should NOT flag sequential subscriptions with gap as duplicate (migration)', async () => {
    // Customer migrated from Stripe to Chargebee -- Stripe ended, Chargebee started after a gap
    const stripePayments: StripePayment[] = [
      makeStripePayment({
        customerId: 'cus_stripe_002',
        customerName: 'Migrated Inc',
        subscriptionId: 'sub_stripe_002',
        payment_date: '2023-11-01',
        status: 'succeeded',
      }),
      makeStripePayment({
        customerId: 'cus_stripe_002',
        customerName: 'Migrated Inc',
        subscriptionId: 'sub_stripe_002',
        payment_date: '2023-12-01',
        status: 'succeeded',
      }),
      // No payments after December -- subscription ended
    ];

    const chargebeeSubs: ChargebeeSubscription[] = [
      makeChargebeeSub({
        customerId: 'cus_cb_002',
        company: 'Migrated Inc.',
        subscriptionId: 'sub_cb_002',
        status: 'active',
        // Started 2 weeks after the Stripe subscription ended
        current_term_start: '2024-01-15',
        current_term_end: '2024-12-31',
        created_at: '2024-01-15',
      }),
    ];

    const duplicates = await detectDuplicates(stripePayments, chargebeeSubs);

    // Should either not flag this, or if flagged, classify as 'migration' not 'true_duplicate'
    const migratedDuplicate = duplicates.find(
      (d) =>
        d.stripeRecord.customerName === 'Migrated Inc' ||
        d.chargebeeRecord.customerName === 'Migrated Inc.',
    );

    if (migratedDuplicate) {
      // If the engine flags it, it should be classified as a migration
      expect(migratedDuplicate.classification).toBe('migration');
      expect(migratedDuplicate.hasOverlap).toBe(false);
    } else {
      // Alternatively, the engine correctly did not flag it at all
      expect(duplicates.length).toBe(0);
    }
  });
});
