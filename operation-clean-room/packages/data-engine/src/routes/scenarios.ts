import { Router } from 'express';

export const scenariosRouter = Router();

/**
 * Scenarios API
 *
 * These endpoints power the what-if scenario modeling in the dashboard.
 * The candidate should implement the following routes:
 *
 * POST /api/scenarios/run
 *   - Run a what-if scenario projection.
 *   - Body: ScenarioInput (churnRateDelta, expansionRateDelta, etc.).
 *   - Returns: ScenarioResult with 12-month projected ARR and impact breakdown.
 *
 * GET /api/scenarios/presets
 *   - Return a list of predefined scenario presets (e.g. "optimistic", "pessimistic",
 *     "price increase 10%", "churn reduction 20%").
 *
 * POST /api/scenarios/compare
 *   - Run multiple scenarios and return a comparison table.
 *   - Body: Array of ScenarioInput objects.
 *   - Returns: Array of ScenarioResult with labels for side-by-side comparison.
 */

// TODO: Implement POST /api/scenarios/run
// scenariosRouter.post('/run', async (req, res) => { ... });

// TODO: Implement GET /api/scenarios/presets
// scenariosRouter.get('/presets', async (req, res) => { ... });

// TODO: Implement POST /api/scenarios/compare
// scenariosRouter.post('/compare', async (req, res) => { ... });
