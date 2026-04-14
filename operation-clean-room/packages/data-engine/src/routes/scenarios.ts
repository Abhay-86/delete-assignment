import { Router } from 'express';
import { calculateARR } from '../metrics/arr.js';
import { runScenario } from '../scenarios/engine.js';
import type { ScenarioInput } from '../scenarios/types.js';

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

const PRESETS: ScenarioInput[] = [
  { label: 'Optimistic',       churnRateDelta: -0.2,  expansionRateDelta:  0.1,  newBusinessDelta: 0, pricingChange: 1.0, fxAssumption: 1.0 },
  { label: 'Pessimistic',      churnRateDelta:  0.2,  expansionRateDelta: -0.1,  newBusinessDelta: 0, pricingChange: 1.0, fxAssumption: 1.0 },
  { label: 'Reduce Churn 10%', churnRateDelta: -0.1,  expansionRateDelta:  0.0,  newBusinessDelta: 0, pricingChange: 1.0, fxAssumption: 1.0 },
];

async function getBaseMetrics() {
  const now = new Date();
  const arrResult = await calculateARR(now);
  return { arrResult };
}

scenariosRouter.post('/run', async (req, res) => {
  try {
    const inputs: ScenarioInput = {
      churnRateDelta:     req.body.churnRateDelta     ?? 0,
      expansionRateDelta: req.body.expansionRateDelta ?? 0,
      newBusinessDelta:   req.body.newBusinessDelta   ?? 0,
      pricingChange:      req.body.pricingChange      ?? 1.0,
      fxAssumption:       req.body.fxAssumption       ?? 1.0,
      label:              req.body.label,
    };

    const { arrResult } = await getBaseMetrics();
    const result = await runScenario(arrResult, inputs);

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

scenariosRouter.get('/presets', (_req, res) => {
  res.json({ success: true, data: PRESETS });
});

scenariosRouter.post('/compare', async (req, res) => {
  try {
    const scenarios = req.body as ScenarioInput[];

    const { arrResult } = await getBaseMetrics();

    const results = await Promise.all(
      scenarios.map((s, i) =>
        runScenario(arrResult, {
          churnRateDelta:     s.churnRateDelta     ?? 0,
          expansionRateDelta: s.expansionRateDelta ?? 0,
          newBusinessDelta:   s.newBusinessDelta   ?? 0,
          pricingChange:      s.pricingChange      ?? 1.0,
          fxAssumption:       s.fxAssumption       ?? 1.0,
          label:              s.label ?? `Scenario ${i + 1}`,
        }),
      ),
    );

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});


