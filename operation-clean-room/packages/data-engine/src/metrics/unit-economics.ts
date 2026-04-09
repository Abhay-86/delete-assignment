import type { UnitEconomics, MetricOptions } from './types.js';

/**
 * Unit economics calculation (CAC, LTV, LTV/CAC ratio, payback period).
 *
 * Unit economics determine whether the business model is sustainable.
 * Key metrics:
 *
 * - **CAC (Customer Acquisition Cost)**: Total sales and marketing spend
 *   divided by the number of new customers acquired in the period.
 *   Attribution model choices:
 *   - **Blended**: Total S&M spend / total new customers (simplest).
 *   - **Channel-attributed**: Spend per channel / conversions per channel.
 *   - **Fully-loaded**: Includes sales team salaries, tools, events, etc.
 *   The appropriate model depends on the available data and business needs.
 *
 * - **LTV (Lifetime Value)**: The expected total revenue from a customer
 *   over their entire relationship.  Common formulas:
 *   - Simple: ARPA / Monthly Churn Rate
 *   - With gross margin: (ARPA * Gross Margin) / Monthly Churn Rate
 *   - With expansion: (ARPA * Gross Margin * (1 + monthly expansion rate)) / Monthly Churn Rate
 *   The "correct" formula depends on business stage and data availability.
 *
 * - **LTV/CAC Ratio**: Target is > 3.0x for a healthy SaaS business.
 *   Below 1.0x means the company loses money on every customer.
 *
 * - **Payback Period**: Months to recover the CAC from a customer's revenue.
 *   Formula: CAC / (ARPA * Gross Margin).  Target is < 18 months.
 *
 * @param period - The period for calculation (e.g. "2024-Q1", "2024-03")
 * @param options - Calculation options
 * @returns Unit economics with blended and per-channel breakdown
 */
export async function calculateUnitEconomics(
  period: string,
  options?: MetricOptions,
): Promise<UnitEconomics> {
  // TODO: Implement unit economics calculation
  throw new Error('Not implemented');
}
