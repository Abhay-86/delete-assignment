/**
 * Types for the what-if scenario modeling engine.
 *
 * Scenarios allow stakeholders to explore how changes in key business
 * drivers (churn, expansion, new business, pricing, FX) would affect
 * projected ARR over the next 12 months.
 */

// ---------------------------------------------------------------------------
// Scenario inputs
// ---------------------------------------------------------------------------

/** Input parameters for a what-if scenario. */
export interface ScenarioInput {
  /** Optional human-readable label for this scenario (e.g. "Optimistic"). */
  label?: string;

  /**
   * Change in monthly churn rate, expressed as a delta.
   * Positive values increase churn (bad), negative values decrease churn (good).
   * Example: -0.005 means "reduce monthly churn by 0.5 percentage points".
   */
  churnRateDelta: number;

  /**
   * Change in monthly expansion rate (upgrades + seat growth), as a delta.
   * Positive values increase expansion (good).
   * Example: 0.01 means "increase monthly expansion by 1 percentage point".
   */
  expansionRateDelta: number;

  /**
   * Change in new business MRR added per month, as a delta in USD.
   * Positive values mean more new business.
   * Example: 5000 means "add $5,000 more new MRR per month than baseline".
   */
  newBusinessDelta: number;

  /**
   * Pricing change as a multiplier applied to all new and renewing subscriptions.
   * 1.0 = no change, 1.10 = 10% price increase, 0.95 = 5% discount.
   * Existing subscriptions are affected only at renewal.
   */
  pricingChange: number;

  /**
   * FX rate assumption relative to current rates.
   * 1.0 = no change. Used to model the impact of currency fluctuations
   * on non-USD revenue when converted to USD for reporting.
   */
  fxAssumption: number;
}

// ---------------------------------------------------------------------------
// Scenario outputs
// ---------------------------------------------------------------------------

/** Monthly projection data point within a scenario result. */
export interface MonthlyProjection {
  /** Month label (e.g. "2024-04"). */
  month: string;
  /** Projected ARR at the end of this month. */
  arr: number;
  /** New business MRR added this month. */
  newBusiness: number;
  /** Expansion MRR from existing customers this month. */
  expansion: number;
  /** Contraction MRR from downgrades this month. */
  contraction: number;
  /** Churned MRR lost this month. */
  churn: number;
  /** Net new MRR this month (new + expansion - contraction - churn). */
  netNewMRR: number;
  /** Number of active customers at end of month. */
  customerCount: number;
}

/** Breakdown of how each input lever contributed to the projected change. */
export interface ImpactBreakdown {
  /** ARR impact from the churn rate change. */
  churnImpact: number;
  /** ARR impact from the expansion rate change. */
  expansionImpact: number;
  /** ARR impact from the new business change. */
  newBusinessImpact: number;
  /** ARR impact from the pricing change. */
  pricingImpact: number;
  /** ARR impact from the FX assumption. */
  fxImpact: number;
  /** Total combined impact. */
  totalImpact: number;
}

/** Result of a scenario projection. */
export interface ScenarioResult {
  /** The label for this scenario. */
  label: string;
  /** The input parameters used. */
  inputs: ScenarioInput;
  /** Current (baseline) ARR before any scenario adjustments. */
  baselineARR: number;
  /** Projected ARR at the end of 12 months. */
  projectedARR: number;
  /** Month-by-month projections (12 entries). */
  projections: MonthlyProjection[];
  /** Breakdown of how each input lever contributed to the change. */
  impactBreakdown: ImpactBreakdown;
  /** Key assumptions documented for transparency. */
  assumptions: string[];
}
