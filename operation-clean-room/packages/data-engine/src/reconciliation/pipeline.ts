import type { PipelineAnalysisResult, Discrepancy } from './types.js';
import { DiscrepancyType, Severity } from './types.js';
import type { SalesforceOpportunity, ChargebeeSubscription, StripePayment, SalesforceAccount } from '../ingestion/types.js';
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
  /** Reference date for staleness calculations. Defaults to the latest date in the dataset. */
  asOf?: Date;
}

const DEFAULT_OPTIONS: Omit<Required<PipelineAnalysisOptions>, 'asOf'> = {
  zombieThresholdDays: 90,
  amountToleranceFraction: 0.1,
  includeClosedLost: false,
};

/**
 * Analyze CRM pipeline quality against billing data.
 *
 * @param opportunities - Salesforce opportunity records
 * @param accounts - Salesforce account records
 * @param subscriptions - Active subscriptions from Chargebee
 * @param payments - Payment records from Stripe
 * @param options - Analysis options
 * @returns Pipeline quality analysis with zombie deals, mismatches, and unbooked revenue
 */
export function analyzePipelineQuality(
  opportunities: SalesforceOpportunity[],
  accounts: SalesforceAccount[],
  subscriptions: ChargebeeSubscription[],
  payments: StripePayment[],
  options?: PipelineAnalysisOptions,
): PipelineAnalysisResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const discrepancies: Discrepancy[] = [];

  // Avoids using wall-clock now() against a historical snapshot.
  const now = opts.asOf ?? (() => {
    const allDates = [
      ...opportunities.map(o => new Date(o.close_date).getTime()),
      ...opportunities.map(o => new Date(o.created_date).getTime()),
      ...subscriptions.map(s => new Date(s.current_term_end).getTime()),
    ].filter(t => !isNaN(t));
    return allDates.length > 0 ? new Date(Math.max(...allDates)) : new Date();
  })();

  // Build a set of ALL Salesforce-known company names (accounts + opp account names)
  // for fast O(1) lookup in both the mismatch check and the unbooked revenue check.
  const allSalesforceAccountNames = new Set<string>(
    accounts.map(a => a.account_name.toLowerCase().trim())
  );
  for (const opp of opportunities) {
    allSalesforceAccountNames.add(opp.account_name.toLowerCase().trim());
  }

  // Find zombie deals (stale )
  const staleDate = new Date(now.getTime() - (opts.zombieThresholdDays * 24 * 60 * 60 * 1000));
  const openOpportunities = opportunities.filter(opp => 
    opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost'
  );

  const zombieDeals = [];
  for (const opp of openOpportunities) {
    const closeDate = new Date(opp.close_date);
    const createdDate = new Date(opp.created_date);
    // Take the more recent of close_date and created_date as last meaningful activity
    const lastActivity = closeDate > createdDate ? closeDate : createdDate;
    
    if (lastActivity < staleDate) {
      const daysStale = Math.floor((now.getTime() - lastActivity.getTime()) / (24 * 60 * 60 * 1000));
      
      zombieDeals.push({
        opportunityId: opp.opportunity_id,
        accountName: opp.account_name,
        amount: opp.amount,
        stage: opp.stage,
        daysSinceActivity: daysStale,
      });

      discrepancies.push({
        id: `stale_opportunity_${opp.opportunity_id}`,
        type: DiscrepancyType.MISSING_ACCOUNT,
        severity: opp.amount > 50000 ? Severity.HIGH : Severity.MEDIUM,
        sourceA: {
          system: 'salesforce',
          recordId: opp.opportunity_id,
          value: opp.amount,
        },
        sourceB: {
          system: 'none',
          recordId: 'N/A',
          value: null,
        },
        customerName: opp.account_name,
        amount: opp.amount,
        description: `Opportunity has been open for ${daysStale} days without updates`,
        detectedAt: now.toISOString(),
        resolved: false,
        resolutionNote: null,
      });
    }
  }

  // Find stage mismatches (Closed Won without subscription)
  const closedWonOpportunities = opportunities.filter(opp => opp.stage === 'Closed Won');
  const mismatches = [];
  
  for (const opp of closedWonOpportunities) {
    const oppAccountNameNorm = opp.account_name.toLowerCase().trim();
    // the subscription by exact match (normalised) name match.
    const relatedSub = subscriptions.find(s =>
      s.status === 'active' &&
      s.customer.company.toLowerCase().trim() === oppAccountNameNorm
    );

    if (!relatedSub) {
      // No active subscription found for this company at all
      mismatches.push({
        opportunityId: opp.opportunity_id,
        accountName: opp.account_name,
        issue: 'Closed Won opportunity with no active subscription',
        crmValue: opp.amount,
        billingValue: 0,
      });

      discrepancies.push({
        id: `missing_subscription_${opp.opportunity_id}`,
        type: DiscrepancyType.MISSING_ACCOUNT,
        severity: Severity.HIGH,
        sourceA: {
          system: 'salesforce',
          recordId: opp.opportunity_id,
          value: opp.amount,
        },
        sourceB: {
          system: 'chargebee',
          recordId: 'N/A',
          value: null,
        },
        customerName: opp.account_name,
        amount: opp.amount,
        description: `Closed Won opportunity has no corresponding active subscription`,
        detectedAt: now.toISOString(),
        resolved: false,
        resolutionNote: null,
      });
    } else {
      // Subscription found — check for ACV/MRR amount discrepancy
      {
        // mrr is in cents → divide by 100 for dollars, then annualize.
        // Compare against ACV (annual contract value), not raw amount which is TCV
        // and varies by contract term (e.g. $348k for 24mo = $174k/yr ACV).
        const annualizedMRR = (relatedSub.mrr / 100) * 12;
        const acv = opp.acv; // annual contract value (ingestion computes: amount / (term_months/12))
        const percentDifference = Math.abs(annualizedMRR - acv) / Math.max(acv, 1);
        
        if (percentDifference > opts.amountToleranceFraction) {
          mismatches.push({
            opportunityId: opp.opportunity_id,
            accountName: opp.account_name,
            issue: 'ACV/MRR mismatch',
            crmValue: acv,
            billingValue: annualizedMRR,
          });

          discrepancies.push({
            id: `amount_mismatch_${opp.opportunity_id}_${relatedSub.subscription_id}`,
            type: DiscrepancyType.AMOUNT_MISMATCH,
            severity: percentDifference > 0.5 ? Severity.HIGH : Severity.MEDIUM,
            sourceA: {
              system: 'salesforce',
              recordId: opp.opportunity_id,
              value: acv,
            },
            sourceB: {
              system: 'chargebee',
              recordId: relatedSub.subscription_id,
              value: annualizedMRR,
            },
            customerName: opp.account_name,
            amount: Math.abs(annualizedMRR - acv),
            description: `ACV mismatch: Salesforce ${acv.toFixed(2)} vs Chargebee ${annualizedMRR.toFixed(2)} (${(percentDifference * 100).toFixed(1)}% difference)`,
            detectedAt: now.toISOString(),
            resolved: false,
            resolutionNote: null,
          });
        }
      }
    }
  }

  // Find unbooked revenue (active subscriptions without CRM presence at all)
  const unbookedRevenue = [];
  for (const subscription of subscriptions) {
    if (subscription.status !== 'active') continue;
    
    const customerNameNorm = subscription.customer.company.toLowerCase().trim();
    // Customer is "tracked" if their name appears anywhere in Salesforce
    const isKnownToSalesforce = allSalesforceAccountNames.has(customerNameNorm);
    
    if (!isKnownToSalesforce) {
      unbookedRevenue.push({
        subscriptionId: subscription.subscription_id,
        customerName: subscription.customer.company,
        mrr: (subscription.mrr / 100),
        system: 'chargebee',
      });

      discrepancies.push({
        id: `unbooked_revenue_${subscription.subscription_id}`,
        type: DiscrepancyType.MISSING_ACCOUNT,
        severity: subscription.mrr > 5000 ? Severity.HIGH : Severity.MEDIUM,
        sourceA: {
          system: 'chargebee',
          recordId: subscription.subscription_id,
          value: (subscription.mrr / 100) * 12,
        },
        sourceB: {
          system: 'salesforce',
          recordId: 'N/A',
          value: null,
        },
        customerName: subscription.customer.company,
        amount: (subscription.mrr / 100) * 12,
        description: `Active subscription has no corresponding opportunity in Salesforce`,
        detectedAt: now.toISOString(),
        resolved: false,
        resolutionNote: null,
      });
    }
  }

  // Calculate summary stats
  const totalZombieDeals = zombieDeals.length;
  const totalZombieValue = zombieDeals.reduce((sum, deal) => sum + deal.amount, 0);
  const totalMismatches = mismatches.length;
  // Split mismatches into "no subscription at all" vs "ACV/MRR amount off"
  const missingSubscriptionCount = mismatches.filter(m => m.issue === 'Closed Won opportunity with no active subscription').length;
  const totalUnbookedMRR = unbookedRevenue.reduce((sum, sub) => sum + sub.mrr, 0);

  // Calculate pipeline health score (0–1, where 1 is perfect).
  //
  // Count-based penalty formula — avoids mixing dollar units across systems
  // (Salesforce amounts are in dollars; Chargebee MRR is in cents).
  //
  //   zombiePenalty   = (zombieCount   / totalOpps)    × 0.5
  //   mismatchPenalty = (mismatchCount / totalOpps)    × 1.0
  //   unbookedPenalty = (unbookedCount / activeSubCount) × 0.3
  //
  const totalOpps    = opportunities.length;
  const activeSubCount = subscriptions.filter(s => s.status === 'active').length;
  const zombiePenalty   = totalOpps    > 0 ? (totalZombieDeals / totalOpps)    * 0.5 : 0;
  const mismatchPenalty = totalOpps    > 0 ? (totalMismatches  / totalOpps)    * 1.0 : 0;
  const unbookedPenalty = activeSubCount > 0 ? (unbookedRevenue.length / activeSubCount) * 0.3 : 0;
  const pipelineHealthScore = Math.max(0, Math.min(1, 1 - zombiePenalty - mismatchPenalty - unbookedPenalty));

  return {
    zombieDeals,
    mismatches,
    unbookedRevenue,
    summary: {
      totalZombieDeals,
      totalZombieValue,
      totalMismatches,
      missingSubscriptionCount,  // Closed Won with zero active sub (excludes ACV-only mismatches)
      totalUnbookedMRR,
      pipelineHealthScore,
    },
  };
}
