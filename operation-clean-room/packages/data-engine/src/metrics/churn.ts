import type { ChurnResult, MetricOptions } from './types.js';

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
  // TODO: Implement churn calculation
  throw new Error('Not implemented');
}
