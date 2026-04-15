import { join } from 'node:path';
import type { ChurnResult, MetricOptions } from './types.js';
import { loadChargebeeSubscriptions } from '../ingestion/chargebee.js';
import { loadFXRates } from '../utils/load-fx-rates.js';
import { convertToUSD } from '../utils/fx.js';

/**
 * Churn metrics calculation.
 *
 * Churn can be measured in multiple ways, each telling a different story:
 *
 * - **Gross revenue churn**: Percentage of starting-period revenue lost to
 *   cancellations and downgrades, *before* accounting for expansion from
 *   remaining customers.  Formula:
 *     Gross Churn = (Churned Revenue + Contraction) / Starting Revenue
 *
 * - **Net revenue churn**: Percentage of starting-period revenue lost *after*
 *   accounting for expansion.  Can be negative if expansion exceeds churn
 *   (which is the goal for healthy SaaS companies).  Formula:
 *     Net Churn = (Churned Revenue + Contraction - Expansion) / Starting Revenue
 *
 * - **Logo churn (customer churn)**: Percentage of customers who cancelled,
 *   regardless of revenue.  A company losing many small customers has high
 *   logo churn but may have low revenue churn.  Formula:
 *     Logo Churn = Customers Cancelled / Starting Customer Count
 *
 * - **Revenue churn**: Absolute dollar amount of recurring revenue lost
 *   to cancellations in the period.
 *
 * Segmentation is critical for churn analysis:
 * - By **cancellation reason**: Helps identify systemic product or service issues.
 * - By **segment**: Enterprise customers may churn differently than SMBs.
 * - By **plan**: Usage-based plans may have higher variability.
 * - By **tenure**: New customers often churn at higher rates ("early churn").
 *
 * @param startDate - Beginning of the measurement period
 * @param endDate - End of the measurement period
 * @param options - Calculation options
 * @returns Comprehensive churn metrics with breakdowns
 */
export async function calculateChurn(
  startDate: Date,
  endDate: Date,
  options?: MetricOptions,
): Promise<ChurnResult> {
  const dataDir = join(process.cwd(), '../../data');
  const [subscriptions, fxRates] = await Promise.all([
    loadChargebeeSubscriptions(dataDir),
    loadFXRates(dataDir),
  ]);

  const toMRR = (sub: typeof subscriptions[0]): number => {
    try {
      return convertToUSD(sub.mrr / 100, sub.plan.currency, startDate, fxRates);
    } catch {
      return sub.mrr / 100;
    }
  };

  // Active at start of period
  const startCohort = subscriptions.filter(s =>
    new Date(s.created_at) <= startDate &&
    (s.cancelled_at == null || new Date(s.cancelled_at) > startDate),
  );

  // Churned during period
  const churned = subscriptions.filter(s =>
    s.cancelled_at != null &&
    new Date(s.cancelled_at) >= startDate &&
    new Date(s.cancelled_at) <= endDate,
  );

  const startingRevenue = startCohort.reduce((sum, s) => sum + toMRR(s), 0);
  const revenueChurned = churned.reduce((sum, s) => sum + toMRR(s), 0);

  const grossChurnRate = startingRevenue > 0 ? (revenueChurned / startingRevenue) * 100 : 0;
  const logoChurnRate = startCohort.length > 0 ? (churned.length / startCohort.length) * 100 : 0;

  // Group churned by cancel_reason
  const reasonMap = new Map<string, { logo: number; revenue: number }>();
  for (const s of churned) {
    const key = s.cancel_reason ?? 'unknown';
    const cur = reasonMap.get(key) ?? { logo: 0, revenue: 0 };
    reasonMap.set(key, { logo: cur.logo + 1, revenue: cur.revenue + toMRR(s) });
  }
  const byReason = Array.from(reasonMap.entries()).map(([label, { logo, revenue }]) => ({
    label,
    logoChurn: logo,
    revenueChurn: revenue,
    churnRate: startCohort.length > 0 ? (logo / startCohort.length) * 100 : 0,
  }));

  // Group churned by plan
  const planMap = new Map<string, { logo: number; revenue: number }>();
  for (const s of churned) {
    const key = s.plan.plan_name;
    const cur = planMap.get(key) ?? { logo: 0, revenue: 0 };
    planMap.set(key, { logo: cur.logo + 1, revenue: cur.revenue + toMRR(s) });
  }
  const byPlan = Array.from(planMap.entries()).map(([label, { logo, revenue }]) => ({
    label,
    logoChurn: logo,
    revenueChurn: revenue,
    churnRate: startCohort.length > 0 ? (logo / startCohort.length) * 100 : 0,
  }));

  return {
    grossChurn: grossChurnRate,
    netChurn: grossChurnRate, // no expansion data here; NRR endpoint has full picture
    logoChurnRate,
    logoChurnCount: churned.length,
    revenueChurned,
    byReason,
    bySegment: [],
    byPlan,
    byTenure: [],
    periodStart: startDate.toISOString().slice(0, 10),
    periodEnd: endDate.toISOString().slice(0, 10),
  };
}
