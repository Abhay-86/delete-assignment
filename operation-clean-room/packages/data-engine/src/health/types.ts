/**
 * Types for the customer health scoring engine.
 *
 * Health scores provide a single numeric indicator (0-100) of each
 * customer's likelihood of renewal, expansion, or churn.  The score
 * is composed of multiple weighted signals from different data sources.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Risk level classification derived from the health score. */
export enum RiskLevel {
  /** Score 80-100: Customer is healthy, likely to expand. */
  LOW = 'low',
  /** Score 50-79: Some concerns; proactive engagement recommended. */
  MEDIUM = 'medium',
  /** Score 25-49: Significant risk; immediate attention needed. */
  HIGH = 'high',
  /** Score 0-24: Customer is likely to churn without intervention. */
  CRITICAL = 'critical',
}

// ---------------------------------------------------------------------------
// Health signals
// ---------------------------------------------------------------------------

/**
 * A single signal contributing to a customer's health score.
 *
 * Each signal represents a measurable dimension of customer health.
 * The final score is a weighted average of all signal values.
 */
export interface HealthSignal {
  /** Human-readable name of the signal (e.g. "Product Usage", "NPS Score"). */
  name: string;
  /** Relative weight of this signal in the composite score (0-1). */
  weight: number;
  /** Normalized value of this signal (0-100). */
  value: number;
  /** Which data source this signal is derived from. */
  source: string;
  /** Optional raw value before normalization (for debugging / display). */
  rawValue?: number | string;
  /** Optional trend direction over the last 30 days. */
  trend?: 'improving' | 'stable' | 'declining';
}

// ---------------------------------------------------------------------------
// Health score
// ---------------------------------------------------------------------------

/** Composite health score for a single customer account. */
export interface HealthScore {
  /** Account / customer ID (unified ID from the reconciliation engine). */
  accountId: string;
  /** Company name. */
  accountName: string;
  /** Composite health score from 0 (critical) to 100 (excellent). */
  score: number;
  /** Individual signals that contributed to the score. */
  signals: HealthSignal[];
  /** Derived risk classification. */
  riskLevel: RiskLevel;
  /** ISO-8601 timestamp when this score was last computed. */
  lastUpdated: string;
  /** Current MRR for context. */
  mrr: number;
  /** Current plan name. */
  plan: string;
  /** Customer segment. */
  segment: string;
  /** Days until renewal (if known). */
  daysUntilRenewal: number | null;
  /** Summary explanation of the risk level in plain English. */
  riskSummary: string;
}

// ---------------------------------------------------------------------------
// Scoring options
// ---------------------------------------------------------------------------

/** Options for customizing the health scoring model. */
export interface HealthScoringOptions {
  /** Override default signal weights. */
  weights?: Partial<{
    productUsage: number;
    supportSentiment: number;
    billingHealth: number;
    nps: number;
    engagement: number;
  }>;
  /** Only score accounts in these segments. */
  segments?: string[];
  /** Exclude accounts with MRR below this threshold. */
  minMRR?: number;
  /** Number of days of history to consider for trends. */
  trendWindowDays?: number;
}
