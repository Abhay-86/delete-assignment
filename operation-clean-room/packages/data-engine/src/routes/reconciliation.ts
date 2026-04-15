import { Router } from 'express';
import { join } from 'node:path';
import { loadChargebeeSubscriptions } from '../ingestion/chargebee.js';
import { loadStripePayments } from '../ingestion/stripe.js';
import { loadSalesforceData } from '../ingestion/salesforce.js';
import { reconcileRevenue } from '../reconciliation/revenue.js';
import { analyzePipelineQuality } from '../reconciliation/pipeline.js';
import { findAccountMatches } from '../reconciliation/matcher.js';
import { loadFXRates } from '../utils/load-fx-rates.js';
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
  try {
    console.log('Starting Phase 2 reconciliation run...');
    const startTime = Date.now();
    const dataDir = getDataDir();
    
    // Load all data sources
    console.log('Loading data from all sources...');
    const [subscriptions, payments, fxRates] = await Promise.all([
      loadChargebeeSubscriptions(dataDir),
      loadStripePayments(dataDir),
      loadFXRates(dataDir),
    ]);
    
    const [opportunities, accounts] = await loadSalesforceData(dataDir);
    
    console.log(`Loaded: ${subscriptions.length} subscriptions, ${payments.length} payments, ${opportunities.length} opportunities, ${accounts.length} accounts, ${fxRates.length} fx rates`);
    
    // 1. Entity Resolution: Match customers across systems
    console.log('Performing entity resolution...');
    const accountMatches = findAccountMatches(accounts, subscriptions);
    console.log(`Found ${accountMatches.length} account matches between Salesforce and Chargebee`);
    
    // 2. Revenue Reconciliation: Compare expected vs actual revenue
    console.log('Performing revenue reconciliation...');
    // Use the current subscription term window for both expected and actual revenue.
    // This ensures an apples-to-apples comparison: expected MRR for the current
    // billing period vs payments that arrived during that same period.
    const activeSubscriptions = subscriptions.filter(s => s.status === 'active');
    const allTermDates = activeSubscriptions.flatMap(s => [
      new Date(s.current_term_start),
      new Date(s.current_term_end),
    ]);
    const startDate = allTermDates.length > 0
      ? new Date(Math.min(...allTermDates.map(d => d.getTime())))
      : new Date(new Date().getFullYear(), 0, 1);
    const endDate = allTermDates.length > 0
      ? new Date(Math.max(...allTermDates.map(d => d.getTime())))
      : new Date();
    
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
    
    // 3. Pipeline Quality Analysis: Identify CRM data issues
    console.log('Analyzing pipeline quality...');
    const pipelineAnalysis = analyzePipelineQuality(opportunities, accounts, subscriptions, payments);
    console.log(`Pipeline analysis complete. Health score: ${pipelineAnalysis.summary.pipelineHealthScore}, Zombie deals: ${pipelineAnalysis.summary.totalZombieDeals}, Unbooked MRR: $${(pipelineAnalysis.summary.totalUnbookedMRR / 100).toFixed(2)}`);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Return comprehensive reconciliation results
    res.json({
      success: true,
      reconciliation: {
        entityResolution: {
          accountMatches: accountMatches.length,
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
          lineItemCount: revenueReconciliation.lineItems.length,
          topDiscrepancies: revenueReconciliation.lineItems
            .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))
            .slice(0, 5)
            .map(item => ({
              customer: item.customerName,
              expected: item.expected / 100,   // cents → dollars
              actual: item.actual / 100,        // cents → dollars
              difference: item.difference / 100, // cents → dollars
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
    
    const analysis = analyzePipelineQuality(opportunities, accounts, subscriptions, payments);
    
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
