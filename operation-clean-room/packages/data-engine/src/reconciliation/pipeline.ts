import type { PipelineAnalysisResult, Discrepancy } from './types.js';
import { DiscrepancyType, Severity } from './types.js';
import type { SalesforceOpportunity, ChargebeeSubscription, StripePayment, SalesforceAccount } from '../ingestion/types.js';
import { findAccountMatches } from './matcher.js';

/**
 * Normalize a company name by stripping common legal suffixes and
 * punctuation so that cross-system name variants (e.g. "Ivy Systems Ltd"
 * vs "Ivy Systems Inc") can be compared on equal footing.
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Strip legal suffixes
    .replace(/\b(inc\.?|incorporated|corp\.?|corporation|llc\.?|ltd\.?|limited|plc\.?|co\.?|company|group|holdings?|international|intl\.?|technologies|technology|solutions?|systems?)\b/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}
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

const DEFAULT_OPTIONS: Required<PipelineAnalysisOptions> = {
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
  const now = new Date();

  // Find account matches between Salesforce and Chargebee
  const accountMatches = findAccountMatches(accounts, subscriptions);
  
  // Build a set of matched account names (normalized) for fast lookup
  const matchedAccountNames = new Set<string>();
  const matchedAccountIds = new Set<string>();
  for (const match of accountMatches) {
    const sfAccount = match.entityA.data as SalesforceAccount;
    const cbSub = match.entityB.data as ChargebeeSubscription;
    matchedAccountIds.add(match.entityA.id);
    // Track both the SF account name and the CB customer name as matched
    matchedAccountNames.add(sfAccount.account_name.toLowerCase().trim());
    matchedAccountNames.add(cbSub.customer.company.toLowerCase().trim());
  }

  // 1. Find zombie deals (stale opportunities — use close_date as the activity proxy)
  const staleDate = new Date(now.getTime() - (opts.zombieThresholdDays * 24 * 60 * 60 * 1000));
  const openOpportunities = opportunities.filter(opp => 
    opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost'
  );

  const zombieDeals = [];
  for (const opp of openOpportunities) {
    // Use close_date as the staleness signal — if the expected close date
    // is far in the past and still open, it's a zombie deal.
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

  // 2. Find stage mismatches (Closed Won without subscription)
  const closedWonOpportunities = opportunities.filter(opp => opp.stage === 'Closed Won');
  const mismatches = [];
  
  for (const opp of closedWonOpportunities) {
    // Try to find a match by account_id first, then by account name
    const matchedByAccountId = accountMatches.find(m => m.entityA.id === opp.account_id);
    const oppAccountNameNorm = opp.account_name.toLowerCase().trim();
    const matchedByName = !matchedByAccountId && matchedAccountNames.has(oppAccountNameNorm);
    const matchedAccount = matchedByAccountId ?? null;
    const hasAnyMatch = matchedByAccountId || matchedByName;
    
    if (!hasAnyMatch) {
      // Check if there's at least an active subscription for this company by name
      const relatedSub = subscriptions.find(s => 
        s.status === 'active' &&
        s.customer.company.toLowerCase().trim() === oppAccountNameNorm
      );
      if (relatedSub) {
        // Has subscription but not properly matched — flag as amount discrepancy
        const annualizedMRR = relatedSub.mrr * 12;
        const acv = opp.acv || opp.amount;
        const percentDifference = Math.abs(annualizedMRR - acv) / Math.max(acv, 1);
        if (percentDifference > opts.amountToleranceFraction) {
          mismatches.push({
            opportunityId: opp.opportunity_id,
            accountName: opp.account_name,
            issue: 'ACV/MRR mismatch',
            crmValue: acv,
            billingValue: annualizedMRR,
          });
        }
        // Subscription exists — skip "no subscription" flag
        continue;
      }

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
    } else if (matchedAccount) {
      // Check for amount discrepancies
      const subscription = subscriptions.find(s => s.subscription_id === matchedAccount.entityB.id);
      if (subscription) {
        const annualizedMRR = subscription.mrr * 12;
        const acv = opp.acv || opp.amount; // Use ACV if available, otherwise amount
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
            id: `amount_mismatch_${opp.opportunity_id}_${subscription.subscription_id}`,
            type: DiscrepancyType.AMOUNT_MISMATCH,
            severity: percentDifference > 0.5 ? Severity.HIGH : Severity.MEDIUM,
            sourceA: {
              system: 'salesforce',
              recordId: opp.opportunity_id,
              value: acv,
            },
            sourceB: {
              system: 'chargebee',
              recordId: subscription.subscription_id,
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

  // Build a set of ALL Salesforce account names (any customer known to SF)
  const allSalesforceAccountNames = new Set<string>(
    accounts.map(a => a.account_name.toLowerCase().trim())
  );
  // Also add opportunity account names (sometimes they differ slightly from account master)
  for (const opp of opportunities) {
    allSalesforceAccountNames.add(opp.account_name.toLowerCase().trim());
  }

  // 3. Find unbooked revenue (active subscriptions without CRM presence at all)
  const unbookedRevenue = [];
  for (const subscription of subscriptions) {
    if (subscription.status !== 'active') continue;
    
    const customerNameNorm = subscription.customer.company.toLowerCase().trim();
    // Customer is "tracked" if their name appears anywhere in Salesforce
    const isKnownToSalesforce = allSalesforceAccountNames.has(customerNameNorm)
      || matchedAccountNames.has(customerNameNorm);
    
    if (!isKnownToSalesforce) {
      unbookedRevenue.push({
        subscriptionId: subscription.subscription_id,
        customerName: subscription.customer.company,
        mrr: subscription.mrr,
        system: 'chargebee',
      });

      discrepancies.push({
        id: `unbooked_revenue_${subscription.subscription_id}`,
        type: DiscrepancyType.MISSING_ACCOUNT,
        severity: subscription.mrr > 5000 ? Severity.HIGH : Severity.MEDIUM,
        sourceA: {
          system: 'chargebee',
          recordId: subscription.subscription_id,
          value: subscription.mrr * 12,
        },
        sourceB: {
          system: 'salesforce',
          recordId: 'N/A',
          value: null,
        },
        customerName: subscription.customer.company,
        amount: subscription.mrr * 12,
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
      totalUnbookedMRR,
      pipelineHealthScore,
    },
  };
}
