import { Router } from 'express';

export const reconciliationRouter = Router();

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

// TODO: Implement POST /api/reconciliation/run
// reconciliationRouter.post('/run', async (req, res) => { ... });

// TODO: Implement GET /api/reconciliation/discrepancies
// reconciliationRouter.get('/discrepancies', async (req, res) => { ... });

// TODO: Implement GET /api/reconciliation/discrepancies/:id
// reconciliationRouter.get('/discrepancies/:id', async (req, res) => { ... });

// TODO: Implement POST /api/reconciliation/discrepancies/:id/resolve
// reconciliationRouter.post('/discrepancies/:id/resolve', async (req, res) => { ... });

// TODO: Implement GET /api/reconciliation/duplicates
// reconciliationRouter.get('/duplicates', async (req, res) => { ... });

// TODO: Implement GET /api/reconciliation/pipeline
// reconciliationRouter.get('/pipeline', async (req, res) => { ... });
