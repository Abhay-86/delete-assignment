import { StripePayment } from './types.js';

/**
 * Load and normalize Stripe payment data.
 *
 * Raw Stripe payments need normalization:
 * - Currency amounts may need FX conversion
 * - Failed payments with retries should be linked
 * - Refunds may appear as negative amounts or separate rows
 * - Dispute payments need special handling
 *
 * @param dataDir - Path to the data directory
 * @returns Normalized Stripe payment records
 */
export async function loadStripePayments(dataDir: string): Promise<StripePayment[]> {
  // TODO: Implement - load from stripe_payments.csv, normalize, and return
  throw new Error('Not implemented');
}
