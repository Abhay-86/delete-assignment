import type { DuplicateResult, MatchConfidence } from './types.js';
import type { StripePayment, ChargebeeSubscription } from '../ingestion/types.js';

/**
 * Cross-system duplicate detection.
 *
 * Identifies accounts and subscriptions that exist in multiple billing
 * systems (Stripe and Chargebee) with overlapping active periods.  This
 * is a critical reconciliation step because:
 *
 * - **Double-counting revenue**: If the same customer has active
 *   subscriptions in both Stripe and Chargebee, ARR will be overstated
 *   unless duplicates are identified and de-duplicated.
 *
 * - **Migration artifacts**: When customers were migrated from one billing
 *   system to another, the old subscription may not have been properly
 *   cancelled, resulting in a "ghost" subscription that inflates metrics.
 *
 * - **Intentional dual subscriptions**: In rare cases a customer may
 *   legitimately have subscriptions in both systems (e.g., different
 *   products or business units).  The deduplication engine should flag
 *   these but allow classification.
 *
 * The classifier should distinguish between:
 * - `true_duplicate`: Same customer, overlapping active periods, same product.
 * - `migration`: Same customer, sequential subscriptions with a gap,
 *   indicating a system migration.
 * - `uncertain`: Cannot be definitively classified; needs human review.
 *
 * @module reconciliation/deduplication
 */

/** Options for duplicate detection. */
export interface DeduplicationOptions {
  /** Name match confidence threshold (0-1). Defaults to 0.7. */
  nameThreshold?: number;
  /** Maximum gap in days between subscriptions to consider a migration. Defaults to 30. */
  migrationGapDays?: number;
  /** Whether to include cancelled subscriptions. Defaults to true. */
  includeCancelled?: boolean;
}

/**
 * Detect potential duplicates across Stripe and Chargebee.
 *
 * @param stripeData - Stripe payment/subscription data
 * @param chargebeeData - Chargebee subscription data
 * @param options - Detection options
 * @returns Array of detected duplicates with classification
 */
export async function detectDuplicates(
  stripeData: StripePayment[],
  chargebeeData: ChargebeeSubscription[],
  options?: DeduplicationOptions,
): Promise<DuplicateResult[]> {
  // TODO: Implement cross-system duplicate detection
  throw new Error('Not implemented');
}

/**
 * Classify a detected duplicate as a true duplicate, migration, or uncertain.
 *
 * Classification rules:
 * - **true_duplicate**: Both subscriptions are active and overlap by more
 *   than 7 days with the same or similar plan.
 * - **migration**: Subscriptions are sequential (one ends, another begins)
 *   with a gap of less than `migrationGapDays`.
 * - **uncertain**: Neither rule applies clearly; requires human review.
 *
 * @param duplicate - A detected duplicate result
 * @returns Classification label
 */
export function classifyDuplicate(
  duplicate: DuplicateResult,
): 'true_duplicate' | 'migration' | 'uncertain' {
  // TODO: Implement duplicate classification logic
  throw new Error('Not implemented');
}
