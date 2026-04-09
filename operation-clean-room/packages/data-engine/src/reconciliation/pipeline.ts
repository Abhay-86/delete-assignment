import type { PipelineAnalysisResult } from './types.js';
import type { SalesforceOpportunity, ChargebeeSubscription, StripePayment } from '../ingestion/types.js';

/**
 * CRM pipeline quality analysis.
 *
 * Identifies data quality issues in the Salesforce pipeline by cross-
 * referencing CRM data against billing system data.  Key analyses:
 *
 * - **Zombie deals**: Open opportunities that have had no stage change,
 *   amount update, or close-date change in 90+ days.  These inflate
 *   pipeline value and distort forecasts.
 *
 * - **Stage mismatches**: Opportunities marked as "Closed Won" in
 *   Salesforce but with no corresponding active subscription in the
 *   billing system (or vice versa -- active subscriptions with no
 *   "Closed Won" opportunity).
 *
 * - **Amount discrepancies**: The opportunity ACV in Salesforce differs
 *   significantly from the subscription MRR * 12 in the billing system.
 *
 * - **Unbooked revenue**: Subscriptions in Stripe or Chargebee that
 *   have no matching opportunity in Salesforce, meaning revenue is
 *   being collected but not tracked in the CRM.
 *
 * - **Pipeline-to-billing lag**: Opportunities that were closed recently
 *   but subscription activation is delayed, or subscriptions that were
 *   activated before the opportunity was marked as closed.
 *
 * @module reconciliation/pipeline
 */

/** Options for pipeline quality analysis. */
export interface PipelineAnalysisOptions {
  /** Number of days with no activity to flag as zombie. Defaults to 90. */
  zombieThresholdDays?: number;
  /** Tolerance for ACV vs billing amount comparison (as a fraction). Defaults to 0.10 (10%). */
  amountToleranceFraction?: number;
  /** Whether to include closed-lost opportunities in the analysis. Defaults to false. */
  includeClosedLost?: boolean;
}

/**
 * Analyze CRM pipeline quality against billing data.
 *
 * @param opportunities - Salesforce opportunity records
 * @param subscriptions - Active subscriptions from billing systems
 * @param options - Analysis options
 * @returns Pipeline quality analysis with zombie deals, mismatches, and unbooked revenue
 */
export async function analyzePipelineQuality(
  opportunities: SalesforceOpportunity[],
  subscriptions: (ChargebeeSubscription | StripePayment)[],
  options?: PipelineAnalysisOptions,
): Promise<PipelineAnalysisResult> {
  // TODO: Implement pipeline quality analysis
  throw new Error('Not implemented');
}
