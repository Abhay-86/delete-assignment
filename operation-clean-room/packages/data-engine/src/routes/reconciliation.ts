import { Router } from 'express';
import { join } from 'node:path';
import { loadChargebeeSubscriptions } from '../ingestion/chargebee.js';
import { loadStripePayments } from '../ingestion/stripe.js';
import { loadSalesforceData } from '../ingestion/salesforce.js';
import { reconcileRevenue } from '../reconciliation/revenue.js';
import { analyzePipelineQuality } from '../reconciliation/pipeline.js';
import { findAccountMatches } from '../reconciliation/matcher.js';
import { loadFXRates } from '../utils/load-fx-rates.js';
import { convertToUSD } from '../utils/fx.js';
import type { SalesforceAccount, ChargebeeSubscription } from '../ingestion/types.js';

export const reconciliationRouter = Router();

/**
 * Helper function to get the data directory path
 */
function getDataDir(): string {
  return join(process.cwd(), '../../data');
}

/**
 * Reconciliation API
 *
 * These endpoints expose the reconciliation engine to the dashboard.
 * The candidate should implement the following routes:
 *
 * POST /api/reconciliation/run
 *   - Trigger a full reconciliation pass across all data sources.
 *   - Body may include options such as date range, tolerance thresholds, etc.
 *   - Returns a ReconciliationResult with discrepancies and summary stats.
 *
 * GET /api/reconciliation/discrepancies
 *   - List all detected discrepancies.
 *   - Supports query params: severity, type, page, limit, sort.
 *
 * GET /api/reconciliation/discrepancies/:id
 *   - Get a single discrepancy by ID with full detail (source records, etc.).
 *
 * POST /api/reconciliation/discrepancies/:id/resolve
 *   - Mark a discrepancy as resolved with a resolution note.
 *
 * GET /api/reconciliation/duplicates
 *   - List detected cross-system duplicates.
 *   - Supports filtering by classification (true_duplicate, migration, uncertain).
 *
 * GET /api/reconciliation/pipeline
 *   - Return pipeline quality analysis results.
 */

// POST /api/reconciliation/run - Trigger full reconciliation
reconciliationRouter.post('/run', async (req, res) => {
  const { threshold, nameWeight } = req.body;
  try {
    const startTime = Date.now();
    const dataDir = getDataDir();
    
    const [subscriptions, payments, fxRates] = await Promise.all([
      loadChargebeeSubscriptions(dataDir),
      loadStripePayments(dataDir),
      loadFXRates(dataDir),
    ]);
    
    const [opportunities, accounts] = await loadSalesforceData(dataDir);


    // Data Reconciliation: list of object of match results(A,B, confidence)
    const accountMatches = findAccountMatches(accounts, subscriptions);
    console.log(accountMatches.length);
    
    // Revenue Reconciliation: Compare expected vs actual revenue
    // Reporting window is fixed to the board reporting period: 2024 Q1–Q4.
    // This ensures Stripe payment data for the full year is included, rather
    // than the narrow Feb–Mar 2025 active subscription term window which only
    // captures ~113 payments. The active subscription snapshot is still used
    // to determine which subscriptions are "active" for MRR/ARR purposes.
    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const startDate = new Date('2024-01-01');
    const endDate   = new Date('2024-12-31');
    
    const revenueReconciliation = reconcileRevenue(
      subscriptions, 
      payments, 
      fxRates, 
      {
        startDate, 
        endDate,
      }
    );
    console.log(`Revenue reconciliation complete. Difference: $${revenueReconciliation.difference.toFixed(2)} (${revenueReconciliation.differencePercent.toFixed(1)}%)`);

    // Coverage gap: how much of the total expected MRR does Stripe actually cover?
    //
    // differencePercent above is the *within-window proration accuracy* — it compares
    // prorated expected revenue (small denominator) against Stripe payments in the same
    // window. Because overlapDays are fractional the denominator shrinks, making the gap
    // look artificially small (e.g. -1%).
    //
    // coverageGapPercent uses the **full monthly MRR** of every active subscription as the
    // denominator. This answers the more useful CFO question: "What share of the MRR we
    // expect from active subscriptions is actually showing up as Stripe payments?"
    // A value of -99% means Stripe has recorded only ~1% of what Chargebee says is owed —
    // indicating Stripe data is partial / historical, not a complete billing record.
    //
    // MRR is in local-currency cents — convert each sub to USD cents via FX before summing,
    // so that EUR/GBP/AUD subscriptions are on the same scale as USD subscriptions.
    const totalActiveMRR = activeSubscriptions.reduce((sum, s) => {
      // const usdCents = convertToUSD(s.mrr, s.plan.currency, new Date(s.current_term_start), fxRates);
      const usdAmount = convertToUSD(
        s.mrr / 100, 
        s.plan.currency,
        new Date(s.current_term_start),
        fxRates
      );

      const usdCents = Math.round(usdAmount * 100);
      return sum + usdCents;
    }, 0); 
    const paymentsInWindow = payments.filter(p => {
      if (p.status !== 'succeeded') return false;
      const d = new Date(p.payment_date);
      return d >= startDate && d <= endDate;
    });
    const totalStripeInWindow = paymentsInWindow.reduce((sum, p) => sum + p.amount, 0); // USD cents

    // Customer coverage: how many active CB customers have ANY Stripe payment ever?
    // This is the root cause of the -99% gap — most CB customers simply don't appear
    // in Stripe at all (they pay via invoice/ACH/wire, not through Stripe).
    const allSucceededPayments = payments.filter(p => p.status === 'succeeded');
    const stripeCustomerNames = new Set(
      allSucceededPayments.map(p => p.customer_name.toLowerCase().trim())
    );
    const cbCustomersWithStripe = activeSubscriptions.filter(
      s => stripeCustomerNames.has(s.customer.company.toLowerCase().trim())
    ).length;
    const cbCustomersNoStripe = activeSubscriptions.length - cbCustomersWithStripe;

    const coverageGapPercent = totalActiveMRR > 0
      ? ((totalStripeInWindow - totalActiveMRR) / totalActiveMRR) * 100
      : 0;

    // 3. Pipeline Quality Analysis: Identify CRM data issues
    console.log('Analyzing pipeline quality...');
    const pipelineAnalysis = analyzePipelineQuality(opportunities, accounts, subscriptions, payments, {
      asOf: endDate,
    });
    console.log(`Pipeline analysis complete. Health score: ${pipelineAnalysis.summary.pipelineHealthScore}, Zombie deals: ${pipelineAnalysis.summary.totalZombieDeals}, Unbooked MRR: $${(pipelineAnalysis.summary.totalUnbookedMRR / 100).toFixed(2)}`);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Return comprehensive reconciliation results
    res.json({
      success: true,
      reconciliation: {
        entityResolution: {
          accountMatches: accountMatches.length,
          // Which SF accounts were NOT matched to any CB subscription?
          unmatchedSfAccounts: accounts.length - accountMatches.length,
          // Which CB subscriptions were NOT matched to any SF account?
          // (accountMatches is 1 CB sub per SF account, so unmatched CB = total active - matched)
          unmatchedCbSubscriptions: activeSubscriptions.length - accountMatches.length,
          matchedAccounts: accountMatches.slice(0, 10).map(match => {
            const sfAccount = match.entityA.data as SalesforceAccount;
            const cbSub = match.entityB.data as ChargebeeSubscription;
            return {
              salesforceId: match.entityA.id,
              salesforceName: sfAccount.account_name ?? 'N/A',
              chargebeeId: match.entityB.id,
              chargebeeName: cbSub.customer?.company ?? 'N/A',
              confidence: match.confidence.score,
              matchedFields: match.confidence.matchedFields,
            };
          }),
        },
        revenueReconciliation: {
          expectedRevenue: revenueReconciliation.expectedRevenue,
          actualRevenue: revenueReconciliation.actualRevenue,
          difference: revenueReconciliation.difference,
          differencePercent: revenueReconciliation.differencePercent,
          // coverageGap: full-MRR denominator vs Stripe payments in window.
          // This is the meaningful gap for the CFO — not the narrow proration accuracy.
          coverageGap: {
            totalActiveMRR: totalActiveMRR / 100,                  
            totalStripeInWindow: (totalStripeInWindow / 100), 
            paymentsInWindow: paymentsInWindow.length,
            activeSubscriptions: activeSubscriptions.length,
            gapPercent: coverageGapPercent,
            windowStart: startDate.toISOString().slice(0, 10),
            windowEnd: endDate.toISOString().slice(0, 10),
            // Customer coverage breakdown — explains WHY the gap is large
            cbCustomersWithStripe,   // CB customers that appear in Stripe (any time)
            cbCustomersNoStripe,     // CB customers with zero Stripe payments ever
          },
          lineItemCount: revenueReconciliation.lineItems.length,
          topDiscrepancies: revenueReconciliation.lineItems
            .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
            .slice(0, 5)
            .map(item => ({
              customer: item.customerName,
              expected: item.expected,
              actual: item.actual,
              difference: item.difference,
              reason: item.reason,
            })),
          breakdown: revenueReconciliation.breakdown,
        },
        pipelineAnalysis: {
          healthScore: pipelineAnalysis.summary.pipelineHealthScore,
          zombieDeals: {
            count: pipelineAnalysis.summary.totalZombieDeals,
            totalValue: pipelineAnalysis.summary.totalZombieValue,
            details: pipelineAnalysis.zombieDeals.slice(0, 5), // Top 5 by amount
          },
          mismatches: {
            count: pipelineAnalysis.summary.totalMismatches,
            missingSubscriptionCount: pipelineAnalysis.summary.missingSubscriptionCount,
            details: pipelineAnalysis.mismatches.slice(0, 5), // Top 5 mismatches
          },
          unbookedRevenue: {
            totalMRR: pipelineAnalysis.summary.totalUnbookedMRR / 100, // cents → dollars
            count: pipelineAnalysis.unbookedRevenue.length,
            details: pipelineAnalysis.unbookedRevenue.slice(0, 5), // Top 5 by MRR
          },
        },
      },
      metadata: {
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(endTime).toISOString(),
        durationMs: duration,
        recordsProcessed: {
          subscriptions: subscriptions.length,
          payments: payments.length,
          opportunities: opportunities.length,
          accounts: accounts.length,
        },
      },
    });
  } catch (error) {
    console.error('Reconciliation run failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/reconciliation/pipeline - Return pipeline quality analysis results
reconciliationRouter.get('/pipeline', async (req, res) => {
  try {
    const dataDir = getDataDir();
    
    // Load CRM and billing data
    const [subscriptions, payments] = await Promise.all([
      loadChargebeeSubscriptions(dataDir),
      loadStripePayments(dataDir),
    ]);
    
    const [opportunities, accounts] = await loadSalesforceData(dataDir);

    // Derive the snapshot reference date from the active subscription terms —
    // same logic as POST /run — so zombie staleness is measured against the
    // dataset's own timeline, not wall-clock now().
    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const allTermDates = activeSubscriptions.flatMap(s => [
      new Date(s.current_term_start),
      new Date(s.current_term_end),
    ]);
    const endDate = allTermDates.length > 0
      ? new Date(Math.max(...allTermDates.map(d => d.getTime())))
      : new Date();

    const analysis = analyzePipelineQuality(opportunities, accounts, subscriptions, payments, {
      asOf: endDate,
    });
    
    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Pipeline analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/reconciliation/discrepancies - List all detected discrepancies
reconciliationRouter.get('/discrepancies', async (req, res) => {
  try {
    // For now, return empty array as we'll implement discrepancy tracking in a future iteration
    res.json({
      success: true,
      discrepancies: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
      },
    });
  } catch (error) {
    console.error('Discrepancy listing failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// GET /api/reconciliation/duplicates - List detected cross-system duplicates
reconciliationRouter.get('/duplicates', async (req, res) => {
  try {
    const dataDir = getDataDir();
    
    // Load account data
    const [subscriptions] = await Promise.all([
      loadChargebeeSubscriptions(dataDir),
    ]);
    
    const [opportunities, accounts] = await loadSalesforceData(dataDir);
    
    const matches = findAccountMatches(accounts, subscriptions);
    
    res.json({
      success: true,
      matches: matches.map(match => {
        const sfAccount = match.entityA.data as SalesforceAccount;
        const cbSub = match.entityB.data as ChargebeeSubscription;
        return {
          salesforceId:   match.entityA.id,
          salesforceName: sfAccount.account_name,
          chargebeeId:    match.entityB.id,
          chargebeeName:  cbSub.customer.company,
          mrrUSD:         cbSub.mrr / 100,          // cents → dollars
          arrUSD:         (cbSub.mrr / 100) * 12,   // annualized
          confidence:     match.confidence.score,
          matchedFields:  match.confidence.matchedFields,
          classification: match.confidence.score > 0.8 ? 'high_confidence'
                        : match.confidence.score > 0.6 ? 'medium_confidence'
                        : 'low_confidence',
        };
      }),
      summary: {
        totalMatches: matches.length,
        highConfidenceMatches:   matches.filter(m => m.confidence.score > 0.8).length,
        mediumConfidenceMatches: matches.filter(m => m.confidence.score > 0.6 && m.confidence.score <= 0.8).length,
        lowConfidenceMatches:    matches.filter(m => m.confidence.score <= 0.6).length,
        totalDuplicateMRR:  matches.reduce((s, m) => s + (m.entityB.data as ChargebeeSubscription).mrr, 0) / 100,
        totalDuplicateARR:  matches.reduce((s, m) => s + (m.entityB.data as ChargebeeSubscription).mrr, 0) / 100 * 12,
      },
    });
  } catch (error) {
    console.error('Entity matching failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// TODO: Implement GET /api/reconciliation/discrepancies/:id
// reconciliationRouter.get('/discrepancies/:id', async (req, res) => { ... });

// TODO: Implement POST /api/reconciliation/discrepancies/:id/resolve
// reconciliationRouter.post('/discrepancies/:id/resolve', async (req, res) => { ... });
