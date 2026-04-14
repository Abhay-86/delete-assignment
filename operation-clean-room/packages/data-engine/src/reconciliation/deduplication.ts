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
  const defaults: DeduplicationOptions = {
    nameThreshold: 0.7,
    migrationGapDays: 7,
    includeCancelled: true,
  };
  const opts = { ...defaults, ...options };
  
  const duplicates: DuplicateResult[] = [];
  
  // Group Stripe payments by customer
  const stripeCustomers = new Map<string, StripePayment[]>();
  for (const payment of stripeData) {
    const customerKey = payment.customer_name.toLowerCase().trim();
    if (!stripeCustomers.has(customerKey)) {
      stripeCustomers.set(customerKey, []);
    }
    stripeCustomers.get(customerKey)!.push(payment);
  }
  
  // Check each Chargebee subscription for matches with Stripe
  for (const sub of chargebeeData) {
    const cbCompany = sub.customer.company.toLowerCase().trim();
    
    // Look for similar company names in Stripe
    for (const [stripeKey, stripePayments] of stripeCustomers) {
      if (stripePayments.length === 0) continue;
      
      if (stripeKey === cbCompany || areSimilarCompanyNames(stripeKey, cbCompany)) {
        // Found potential duplicate - create result
        const latestStripePayment = stripePayments.sort((a, b) => 
          new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
        )[0];
        
        if (!latestStripePayment) continue; // Safety check
        
        // Calculate overlap and determine classification
        const subStart = new Date(sub.current_term_start);
        const subEnd = new Date(sub.current_term_end || Date.now());
        
        // For Stripe, we need to infer the subscription end based on payment patterns
        // If there are multiple payments, assume monthly and get last payment + 1 month
        const sortedStripePayments = stripePayments.sort((a, b) => 
          new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
        );
        const lastStripePayment = new Date(latestStripePayment.payment_date);
        
        // Estimate Stripe subscription end - assume monthly billing, so add 30 days to last payment
        const estimatedStripeEnd = new Date(lastStripePayment.getTime() + (30 * 24 * 60 * 60 * 1000));
        
        // Check for overlap between Chargebee subscription and estimated Stripe period  
        const overlapStart = new Date(Math.max(subStart.getTime(), lastStripePayment.getTime()));
        const overlapEnd = new Date(Math.min(subEnd.getTime(), estimatedStripeEnd.getTime()));
        const hasOverlap = overlapStart < overlapEnd;
        const overlapDays = hasOverlap ? 
          Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (24 * 60 * 60 * 1000)) : 0;
        
        // Determine classification based on date relationships
        let classification: 'true_duplicate' | 'migration' | 'uncertain';
        
        if (hasOverlap && overlapDays > 7) {
          classification = 'true_duplicate';
        } else {
          // Check if this is a migration (sequential with small gap)
          // Compare Chargebee start with estimated Stripe end
          const gapStart = Math.min(estimatedStripeEnd.getTime(), subStart.getTime());
          const gapEnd = Math.max(estimatedStripeEnd.getTime(), subStart.getTime());
          const gapDays = Math.floor((gapEnd - gapStart) / (24 * 60 * 60 * 1000));
          
          // If there's no overlap and subscriptions are within reasonable migration gap, it's a migration
          if (!hasOverlap && gapDays <= 45) {
            classification = 'migration';
          } else if (hasOverlap && overlapDays <= 7) {
            classification = 'uncertain';
          } else {
            classification = 'uncertain';
          }
        }
        
        const duplicate: DuplicateResult = {
          stripeRecord: {
            customerId: latestStripePayment.customer_id,
            customerName: latestStripePayment.customer_name,
            subscriptionId: latestStripePayment.subscription_id || 'unknown',
            status: 'active', // Assume active from payment
            startDate: latestStripePayment.payment_date,
            endDate: estimatedStripeEnd.toISOString().split('T')[0] || null,
            mrr: latestStripePayment.amount, // Approximate
          },
          chargebeeRecord: {
            customerId: sub.customer.customer_id,
            customerName: sub.customer.company,
            subscriptionId: sub.subscription_id,
            status: sub.status,
            startDate: sub.current_term_start,
            endDate: sub.current_term_end,
            mrr: sub.mrr,
          },
          confidence: {
            score: 0.9, // High confidence for name match
            matchedFields: ['company_name'],
            unmatchedFields: [],
          },
          hasOverlap,
          overlapDays,
          classification,
        };
        
        duplicates.push(duplicate);
      }
    }
  }
  
  return duplicates;
}

/**
 * Simple company name similarity check
 */
function areSimilarCompanyNames(name1: string, name2: string): boolean {
  // Normalize names
  const normalize = (name: string) => name
    .toLowerCase()
    .replace(/\b(inc|corp|ltd|llc|corporation|limited|company)\b/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();
  
  const norm1 = normalize(name1);
  const norm2 = normalize(name2);
  
  // Check if one name contains the other
  return norm1.includes(norm2) || norm2.includes(norm1);
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
