import { Router } from 'express';
import { calculateARR } from '../metrics/arr.js';
import { calculateNRR } from '../metrics/nrr.js';
import { calculateChurn } from '../metrics/churn.js';

export const metricsRouter = Router();

/**
 * Metrics API
 *
 * These endpoints serve computed SaaS metrics to the dashboard.
 * The candidate should implement the following routes:
 *
 * GET /api/metrics/arr
 *   - Calculate and return current ARR with breakdowns.
 *   - Supports query params: date, segmentBy, excludeTrials.
 *
 * GET /api/metrics/nrr
 *   - Calculate net revenue retention for a given period.
 *   - Requires query params: startDate, endDate.
 *   - Optional: segmentBy.
 *
 * GET /api/metrics/churn
 *   - Calculate churn metrics (gross, net, logo, revenue).
 *   - Requires query params: startDate, endDate.
 *
 * GET /api/metrics/unit-economics
 *   - Calculate CAC, LTV, LTV/CAC ratio, payback period.
 *   - Requires query params: period (e.g. "2024-Q1").
 *
 * GET /api/metrics/cohorts
 *   - Build cohort retention analysis.
 *   - Optional query params: startMonth, endMonth, granularity.
 *
 * GET /api/metrics/overview
 *   - Aggregate summary of all key metrics for the dashboard home page.
 */

// TODO: Implement GET /api/metrics/unit-economics
// metricsRouter.get('/unit-economics', async (req, res) => { ... });

// TODO: Implement GET /api/metrics/cohorts
// metricsRouter.get('/cohorts', async (req, res) => { ... });

// GET /api/metrics/arr
metricsRouter.get('/arr', async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const excludeTrials = req.query.excludeTrials !== 'false';
    const result = await calculateARR(date, { excludeTrials });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/metrics/nrr
metricsRouter.get('/nrr', async (req, res) => {
  try {
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(endDate.getFullYear(), endDate.getMonth() - 12, 1);
    const result = await calculateNRR(startDate, endDate);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/metrics/churn
metricsRouter.get('/churn', async (req, res) => {
  try {
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1);
    const result = await calculateChurn(startDate, endDate);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/metrics/arr-trend
// Returns ARR broken down by signup cohort month, sorted chronologically.
// Uses calculateARR().byCohort — no snapshot store needed.
metricsRouter.get('/arr-trend', async (req, res) => {
  try {
    const result = await calculateARR(new Date(), { excludeTrials: true });
    const trend = result.byCohort
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(c => ({
        month:     c.label,
        arr:       c.arr,
        customers: c.customerCount,
      }));
    res.json({
      success: true,
      data: { trend, total: result.total, asOfDate: result.asOfDate },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// GET /api/metrics/overview
metricsRouter.get('/overview', async (req, res) => {
  try {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [arr, nrr, churn] = await Promise.all([
      calculateARR(now, { excludeTrials: true }),
      calculateNRR(periodStart, now),
      calculateChurn(monthStart, now),
    ]);

    res.json({
      success: true,
      data: {
        arr: { total: arr.total, totalCustomers: arr.totalCustomers, asOfDate: arr.asOfDate },
        nrr: { percentage: nrr.percentage, expansion: nrr.expansion, churn: nrr.churn },
        churn: { grossChurn: churn.grossChurn, logoChurnRate: churn.logoChurnRate, revenueChurned: churn.revenueChurned },
        topSegments: arr.bySegment.slice(0, 4),
        topPlans: arr.byPlan.slice(0, 5),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

