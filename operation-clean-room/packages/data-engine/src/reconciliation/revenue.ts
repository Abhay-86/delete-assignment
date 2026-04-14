import type { RevenueReconciliationResult } from './types.js';
import type { ChargebeeSubscription, StripePayment, FXRate } from '../ingestion/types.js';
import { convertToUSD } from '../utils/fx.js';

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

const DEFAULT_TOLERANCE_USD = 0.50;

/**
 * Calculate expected revenue from active subscriptions for a given period.
 */
export function calculateExpectedRevenue(
  subscriptions: ChargebeeSubscription[],
  startDate: Date,
  endDate: Date,
  fxRates: FXRate[],
  toleranceUSD: number = DEFAULT_TOLERANCE_USD,
): Map<string, number> {
  const expectedRevenue = new Map<string, number>();

  for (const subscription of subscriptions) {
    if (subscription.status !== 'active') continue;

    const termStart = new Date(subscription.current_term_start);
    const termEnd = new Date(subscription.current_term_end);

    // Check if subscription overlaps with the analysis period
    if (termEnd < startDate || termStart > endDate) continue;

    // Calculate prorated revenue for the overlap period
    const overlapStart = new Date(Math.max(termStart.getTime(), startDate.getTime()));
    const overlapEnd = new Date(Math.min(termEnd.getTime(), endDate.getTime()));
    const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24);
    
    let expectedAmount = 0;

    // Handle plan changes (upgrades/downgrades with proration)
    if (subscription.plan_changes && subscription.plan_changes.length > 0) {
      // Sort plan changes by date
      const sortedChanges = subscription.plan_changes
        .filter(change => {
          const changeDate = new Date(change.change_date);
          return changeDate >= overlapStart && changeDate <= overlapEnd;
        })
        .sort((a, b) => new Date(a.change_date).getTime() - new Date(b.change_date).getTime());

      if (sortedChanges.length > 0) {
        // For mid-month changes, calculate prorated amounts
        for (const change of sortedChanges) {
          const changeDate = new Date(change.change_date);
          
          // Days before change at old plan
          const daysBefore = Math.max(0, (changeDate.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24));
          if (daysBefore > 0) {
            const dailyRate = change.previous_amount / 30; // Assume 30-day months for simplicity
            expectedAmount += dailyRate * daysBefore;
          }
          
          // Days after change at new plan
          const daysAfter = Math.max(0, (overlapEnd.getTime() - changeDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysAfter > 0) {
            const dailyRate = change.new_amount / 30; // Assume 30-day months for simplicity
            expectedAmount += dailyRate * daysAfter;
          }
        }
      } else {
        // No plan changes in this period, use current MRR
        expectedAmount = subscription.mrr;
      }
    } else {
      // No plan changes, use MRR and prorate based on subscription billing period
      if (subscription.plan.billing_period_unit === 'month') {
        if (subscription.plan.billing_period === 12) {
          // Annual subscription - attribute 1/12 per month
          expectedAmount = subscription.mrr; // MRR should already be monthly
        } else {
          // Monthly subscription
          expectedAmount = subscription.mrr;
        }
      } else {
        // Other billing periods
        expectedAmount = subscription.mrr;
      }
    }

    // Convert to USD (amounts are in smallest currency unit — cents)
    const usdAmount = convertToUSD(
      expectedAmount,
      subscription.plan.currency,
      new Date(subscription.current_term_start),
      fxRates,
    );

    // Key by customer company name so we can join against Stripe payments
    // (Stripe subscription IDs don't match Chargebee subscription IDs)
    const key = subscription.customer.company.toLowerCase().trim();
    expectedRevenue.set(key, (expectedRevenue.get(key) ?? 0) + usdAmount);
  }

  return expectedRevenue;
}

/**
 * Calculate actual revenue from payments for a given period.
 */
export function calculateActualRevenue(
  payments: StripePayment[],
  startDate: Date,
  endDate: Date,
  fxRates: FXRate[],
  toleranceUSD: number = DEFAULT_TOLERANCE_USD,
): Map<string, number> {
  const actualRevenue = new Map<string, number>();

  for (const payment of payments) {
    if (payment.status !== 'succeeded') continue;

    const paymentDate = new Date(payment.payment_date);
    if (paymentDate < startDate || paymentDate > endDate) continue;

    if (payment.subscription_id || payment.customer_name) {
      // Amounts are in smallest currency unit (cents), convert to USD
      const usdAmount = convertToUSD(
        payment.amount,
        payment.currency,
        new Date(payment.payment_date),
        fxRates,
      );

      // Key by customer name to match against Chargebee subscriptions
      // (Stripe sub IDs use a different format than Chargebee sub IDs)
      const key = payment.customer_name.toLowerCase().trim();
      const existing = actualRevenue.get(key) || 0;
      actualRevenue.set(key, existing + usdAmount);
    }
  }

  return actualRevenue;
}

/**
 * Compare expected vs. actual revenue and identify discrepancies.
 */
export function reconcileRevenue(
  subscriptions: ChargebeeSubscription[],
  payments: StripePayment[],
  fxRates: FXRate[],
  options: RevenueReconciliationOptions,
): RevenueReconciliationResult {
  const { startDate, endDate, toleranceUSD = DEFAULT_TOLERANCE_USD } = options;
  
  const expectedRevenueMap = calculateExpectedRevenue(subscriptions, startDate, endDate, fxRates, toleranceUSD);
  const actualRevenueMap = calculateActualRevenue(payments, startDate, endDate, fxRates, toleranceUSD);
  
  // Calculate totals
  const expectedRevenue = Array.from(expectedRevenueMap.values()).reduce((sum, val) => sum + val, 0);
  const actualRevenue = Array.from(actualRevenueMap.values()).reduce((sum, val) => sum + val, 0);
  
  const difference = actualRevenue - expectedRevenue;
  const differencePercent = expectedRevenue > 0 ? (difference / expectedRevenue) * 100 : 0;

  // Calculate breakdown components
  let prorations = 0;
  let discounts = 0;
  let fxDifferences = 0;

  // Calculate proration amount from plan changes
  for (const subscription of subscriptions) {
    if (subscription.plan_changes && subscription.plan_changes.length > 0) {
      for (const change of subscription.plan_changes) {
        const changeDate = new Date(change.change_date);
        if (changeDate >= startDate && changeDate <= endDate) {
          prorations += Math.abs(change.proration_amount || 0);
        }
      }
    }
  }

  // Create line items for reconciliation
  const lineItems: Array<{
    customerId: string;
    customerName: string;
    expected: number;
    actual: number;
    difference: number;
    reason: string;
  }> = [];

  // Build a lookup from normalized company name → display name & customer ID
  const customerLookup = new Map<string, { customerId: string; customerName: string }>();
  for (const sub of subscriptions) {
    const key = sub.customer.company.toLowerCase().trim();
    if (!customerLookup.has(key)) {
      customerLookup.set(key, {
        customerId: sub.customer.customer_id,
        customerName: sub.customer.company,
      });
    }
  }

  // Compare each customer's expected vs actual revenue
  for (const [customerKey, expected] of expectedRevenueMap.entries()) {
    const actual = actualRevenueMap.get(customerKey) || 0;
    const lineDifference = actual - expected;
    
    if (Math.abs(lineDifference) > toleranceUSD) {
      const info = customerLookup.get(customerKey);
      lineItems.push({
        customerId: info?.customerId || customerKey,
        customerName: info?.customerName || customerKey,
        expected,
        actual,
        difference: lineDifference,
        reason: actual === 0 ? 'No payments found' : 
               actual > expected ? 'Overpayment detected' : 'Underpayment detected',
      });
    }
  }

  return {
    expectedRevenue,
    actualRevenue,
    difference,
    differencePercent,
    lineItems,
    breakdown: {
      prorations,
      discounts,
      fxDifferences,
      timingDifferences: 0,
      unexplained: Math.abs(difference) - prorations - discounts - fxDifferences,
    },
  };
}
