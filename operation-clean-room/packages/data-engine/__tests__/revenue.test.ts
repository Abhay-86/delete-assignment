import { describe, it, expect } from 'vitest';
import { reconcileRevenue } from '../src/reconciliation/revenue.js';
import type { ChargebeeSubscription, StripePayment, FXRate } from '../src/ingestion/types.js';

describe('Revenue Reconciliation', () => {
  const baseFXRates: FXRate[] = [
    { date: '2024-03-01', eur_usd: 1.08, gbp_usd: 1.26, jpy_usd: 0.0067, aud_usd: 0.65 },
    { date: '2024-03-15', eur_usd: 1.09, gbp_usd: 1.27, jpy_usd: 0.0066, aud_usd: 0.66 },
    { date: '2024-03-31', eur_usd: 1.07, gbp_usd: 1.25, jpy_usd: 0.0068, aud_usd: 0.64 },
  ];

  it('should handle prorated revenue from mid-month upgrade', async () => {
    // Customer upgrades from $100/mo to $200/mo on March 15
    // Expected: 14 days at $100 + 17 days at $200 (prorated)
    const subscriptions: ChargebeeSubscription[] = [
      {
        subscription_id: 'sub_001',
        customer: {
          customer_id: 'cus_001',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@acme.com',
          company: 'Acme Corp',
          billing_address: { line1: '123 Main St', city: 'SF', state: 'CA', country: 'US', zip: '94102' },
        },
        plan: {
          plan_id: 'pro',
          plan_name: 'Pro',
          price: 200_00, // current price in cents after upgrade
          currency: 'usd',
          billing_period: 1,
          billing_period_unit: 'month',
          trial_end: null,
        },
        status: 'active',
        current_term_start: '2024-03-01',
        current_term_end: '2024-03-31',
        created_at: '2024-01-01',
        cancelled_at: null,
        cancel_reason: null,
        mrr: 200_00,
        coupons: [],
        plan_changes: [
          {
            change_date: '2024-03-15',
            previous_plan: 'starter',
            new_plan: 'pro',
            previous_amount: 100_00,
            new_amount: 200_00,
            change_type: 'upgrade',
            proration_amount: 54_84, // ~(17/31) * $100 proration credit
          },
        ],
        addons: [],
        metadata: {},
      },
    ];

    const payments: StripePayment[] = [
      {
        payment_id: 'pi_001',
        customer_id: 'cus_001',
        customer_name: 'Acme Corp',
        amount: 145_16, // $200 - $54.84 proration = $145.16
        currency: 'usd',
        status: 'succeeded',
        payment_date: '2024-03-15',
        subscription_id: 'sub_001',
        description: 'Upgrade proration',
        failure_code: null,
        refund_id: null,
        dispute_id: null,
      },
    ];

    const result = await reconcileRevenue(subscriptions, payments, baseFXRates, {
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-04-01'),
    });

    // The actual collected amount should account for the proration
    expect(result.difference).toBeLessThan(1_00); // less than $1 discrepancy
    expect(result.breakdown.prorations).toBeGreaterThan(0);
  });

  it('should use payment-date FX rate, not current rate', async () => {
    // EUR payment made on March 1 should use the March 1 rate (1.08), not March 31 (1.07)
    const subscriptions: ChargebeeSubscription[] = [
      {
        subscription_id: 'sub_002',
        customer: {
          customer_id: 'cus_002',
          first_name: 'Hans',
          last_name: 'Mueller',
          email: 'hans@euro-co.de',
          company: 'Euro Co GmbH',
          billing_address: { line1: 'Berliner Str 1', city: 'Berlin', state: 'BE', country: 'DE', zip: '10115' },
        },
        plan: {
          plan_id: 'pro_eur',
          plan_name: 'Pro (EUR)',
          price: 100_00,
          currency: 'eur',
          billing_period: 1,
          billing_period_unit: 'month',
          trial_end: null,
        },
        status: 'active',
        current_term_start: '2024-03-01',
        current_term_end: '2024-03-31',
        created_at: '2024-01-01',
        cancelled_at: null,
        cancel_reason: null,
        mrr: 100_00,
        coupons: [],
        plan_changes: [],
        addons: [],
        metadata: {},
      },
    ];

    const payments: StripePayment[] = [
      {
        payment_id: 'pi_002',
        customer_id: 'cus_002',
        customer_name: 'Euro Co GmbH',
        amount: 100_00,
        currency: 'eur',
        status: 'succeeded',
        payment_date: '2024-03-01',
        subscription_id: 'sub_002',
        description: 'Monthly subscription',
        failure_code: null,
        refund_id: null,
        dispute_id: null,
      },
    ];

    const result = await reconcileRevenue(subscriptions, payments, baseFXRates, {
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-04-01'),
    });

    // Should use March 1 rate (1.08) -> 100 EUR = $108 USD
    // NOT March 31 rate (1.07) -> 100 EUR = $107 USD
    expect(result.actualRevenue).toBeCloseTo(108_00, -1); // ~$108 in cents
  });

  it('should attribute annual subscription as 1/12 per month', async () => {
    // $1,200/year subscription should contribute $100/month to the period
    const subscriptions: ChargebeeSubscription[] = [
      {
        subscription_id: 'sub_003',
        customer: {
          customer_id: 'cus_003',
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@bigcorp.com',
          company: 'BigCorp Inc',
          billing_address: { line1: '456 Oak Ave', city: 'NYC', state: 'NY', country: 'US', zip: '10001' },
        },
        plan: {
          plan_id: 'enterprise_annual',
          plan_name: 'Enterprise Annual',
          price: 1200_00,
          currency: 'usd',
          billing_period: 12,
          billing_period_unit: 'month',
          trial_end: null,
        },
        status: 'active',
        current_term_start: '2024-01-01',
        current_term_end: '2024-12-31',
        created_at: '2024-01-01',
        cancelled_at: null,
        cancel_reason: null,
        mrr: 100_00, // $1200 / 12 months
        coupons: [],
        plan_changes: [],
        addons: [],
        metadata: {},
      },
    ];

    const payments: StripePayment[] = [
      {
        payment_id: 'pi_003',
        customer_id: 'cus_003',
        customer_name: 'BigCorp Inc',
        amount: 1200_00,
        currency: 'usd',
        status: 'succeeded',
        payment_date: '2024-01-01',
        subscription_id: 'sub_003',
        description: 'Annual subscription',
        failure_code: null,
        refund_id: null,
        dispute_id: null,
      },
    ];

    const result = await reconcileRevenue(subscriptions, payments, baseFXRates, {
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-04-01'),
    });

    // For March, the expected revenue should be 1/12 of $1,200 = $100
    expect(result.expectedRevenue).toBeCloseTo(100_00, -1); // ~$100 in cents
  });
});
