import type { RevenueReconciliationResult } from './types.js';
import type { ChargebeeSubscription, StripePayment, FXRate } from '../ingestion/types.js';
import { convertToUSD } from '../utils/fx.js';

/**
 * Revenue reconciliation across billing systems.
 *
 * Compares expected revenue (subscriptions) vs actual revenue (payments),
 * handling prorations, FX conversion, and timing differences.
 *
 * @module reconciliation/revenue
 */

/** Options for revenue reconciliation. */
export interface RevenueReconciliationOptions {
  /** Start of the reconciliation period (inclusive). */
  startDate: Date;
  /** End of the reconciliation period (exclusive). */
  endDate: Date;
  /** Tolerance for mismatches in USD. Defaults to 0.50. */
  toleranceUSD?: number;
  /** Whether to include trial subscriptions. */
  includeTrials?: boolean;
}

const DEFAULT_TOLERANCE_USD = 0.50;

/**
 * Calculate expected revenue from active subscriptions.
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

    // Determine overlap between subscription term and analysis window
    if (termEnd < startDate || termStart > endDate) continue;

    const overlapStart = new Date(Math.max(termStart.getTime(), startDate.getTime()));
    const overlapEnd = new Date(Math.min(termEnd.getTime(), endDate.getTime()));
    const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24);
    
    let expectedAmount = 0;

    // Handle plan changes (prorated segments)
    if (subscription.plan_changes && subscription.plan_changes.length > 0) {
      // Filter and sort changes within overlap window
      const sortedChanges = subscription.plan_changes
        .filter(change => {
          const changeDate = new Date(change.change_date);
          return changeDate > overlapStart && changeDate < overlapEnd;
        })
        .sort((a, b) => new Date(a.change_date).getTime() - new Date(b.change_date).getTime());

      if (sortedChanges.length > 0) {
        // Build segments: overlapStart → change → ... → overlapEnd
        let segmentStart = overlapStart;

        for (const change of sortedChanges) {
          const segmentEnd = new Date(change.change_date);
          const segDays = (segmentEnd.getTime() - segmentStart.getTime()) / (1000 * 60 * 60 * 24);

          if (segDays > 0) {
            // Apply previous plan price (cents → dollars → daily rate)
            expectedAmount += (change.previous_amount / 100 / 30) * segDays;
          }

          segmentStart = segmentEnd;
        }

        // Final segment uses latest plan price
        const lastChange = sortedChanges[sortedChanges.length - 1]!;
        const finalDays = (overlapEnd.getTime() - segmentStart.getTime()) / (1000 * 60 * 60 * 24);

        if (finalDays > 0) {
          expectedAmount += (lastChange.new_amount / 100 / 30) * finalDays;
        }
      } else {
        // No changes → use current MRR (cents → dollars)
        expectedAmount = (subscription.mrr / 100 / 30) * overlapDays;
      }
    } else {
      // No plan changes — prorate MRR over overlap period
      const isAnnual = subscription.plan.billing_period_unit === 'year' ||
                       subscription.plan.billing_period >= 12;

      if (isAnnual) {
        // Annual plans: approximate using calendar months
        const monthsDiff =
          (overlapEnd.getFullYear() - overlapStart.getFullYear()) * 12 +
          (overlapEnd.getMonth() - overlapStart.getMonth());

        const dayFraction = overlapEnd.getDate() > overlapStart.getDate()
          ? (overlapEnd.getDate() - overlapStart.getDate()) / 30
          : 0;

        const overlapMonths = monthsDiff + dayFraction;
        expectedAmount = (subscription.mrr / 100) * overlapMonths;
      } else {
        // Monthly plans: daily prorated MRR
        expectedAmount = (subscription.mrr / 100 / 30) * overlapDays;
      }
    }

    // Convert local currency → USD → store as cents
    const usdDollars = convertToUSD(
      expectedAmount,
      subscription.plan.currency,
      overlapStart,
      fxRates,
    );

    const usdCents = Math.round(usdDollars * 100);

    const key = subscription.customer.company.toLowerCase().trim();
    expectedRevenue.set(key, (expectedRevenue.get(key) ?? 0) + usdCents);
  }

  return expectedRevenue;
}

/**
 * Calculate actual revenue from Stripe payments.
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
      // Convert cents → dollars → FX → back to cents
      const usdDollars = convertToUSD(
        payment.amount / 100,
        payment.currency,
        new Date(payment.payment_date),
        fxRates,
      );

      const usdCents = Math.round(usdDollars * 100);

      const key = payment.customer_name.toLowerCase().trim();
      const existing = actualRevenue.get(key) || 0;
      actualRevenue.set(key, existing + usdCents);
    }
  }

  return actualRevenue;
}

/**
 * Compare expected vs actual revenue and identify discrepancies.
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
  
  // Aggregate totals
  const expectedRevenue = Array.from(expectedRevenueMap.values()).reduce((sum, val) => sum + val, 0);
  const actualRevenue = Array.from(actualRevenueMap.values()).reduce((sum, val) => sum + val, 0);
  
  const difference = actualRevenue - expectedRevenue;
  const differencePercent = expectedRevenue > 0 ? (difference / expectedRevenue) * 100 : 0;

  // Breakdown components
  let prorations = 0;
  let discounts = 0;
  let fxDifferences = 0;

  // Sum proration amounts from plan changes
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

  // Line-level discrepancies
  const lineItems: Array<{
    customerId: string;
    customerName: string;
    expected: number;
    actual: number;
    difference: number;
    reason: string;
  }> = [];

  // Map normalized company → display info
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

  // Compare expected vs actual per customer
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
        reason:
          actual === 0
            ? 'No payments found'
            : actual > expected
            ? 'Overpayment detected'
            : 'Underpayment detected',
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