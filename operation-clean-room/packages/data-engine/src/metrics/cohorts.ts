import type { CohortData, MetricOptions } from './types.js';

/**
 * Cohort retention analysis.
 *
 * Groups customers by their signup month and tracks how their revenue
 * and engagement change over time.  This is one of the most important
 * analyses for understanding long-term business health.
 *
 * How it works:
 * 1. **Define cohorts**: Group all customers by the month they first became
 *    paying customers (i.e., their trial-to-paid conversion date or first
 *    payment date, NOT the trial start date).
 *
 * 2. **Track revenue retention**: For each cohort, calculate what percentage
 *    of their Month 0 revenue is retained in Month 1, Month 2, etc.
 *    - Values above 100% indicate net expansion (the cohort is growing).
 *    - A "smile" curve (dips then recovers) is a positive signal.
 *
 * 3. **Track logo retention**: Same as revenue retention but counting
 *    customers instead of dollars.  Logo retention is always <= 100%.
 *
 * Key considerations:
 * - **Incomplete cohorts**: The most recent cohort will have fewer data
 *   points.  Don't show Month 12 retention for a cohort that's only
 *   3 months old.
 *
 * - **Reactivations**: A customer who churns and returns should appear in
 *   their original cohort, with the churned months showing as 0% retention
 *   and the return month showing the revival.
 *
 * - **FX normalization**: Use a consistent FX rate (e.g., the rate at cohort
 *   creation) to avoid FX-driven retention fluctuations.
 *
 * - **Segmented cohorts**: Optionally break down cohorts by plan, segment,
 *   or acquisition channel for more granular insights.
 *
 * @param options - Calculation options including date range and segmentation
 * @returns Array of cohort data, one entry per cohort month
 */
export async function buildCohortAnalysis(
  options?: MetricOptions,
): Promise<CohortData[]> {
  // TODO: Implement cohort analysis
  throw new Error('Not implemented');
}
