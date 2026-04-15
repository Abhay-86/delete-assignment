import { join } from 'node:path';
import { loadCSV } from './csv-loader.js';
import { loadFXRates } from '../utils/load-fx-rates.js';
import { convertToUSD } from '../utils/fx.js';
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
 * @returns Normalized Stripe payment records with amounts in USD cents
 */
export async function loadStripePayments(dataDir: string): Promise<StripePayment[]> {
  const filePath = join(dataDir, 'stripe_payments.csv');

  // Load FX rates once up-front so the per-row transform can use them.
  const fxRates = await loadFXRates(dataDir);

  const raw = await loadCSV<{
    payment_id: string;
    customer_id: string;
    customer_name: string;
    amount: number;
    currency: string;
    status: string;
    payment_date: string;
    subscription_id: string;
    description: string;
    failure_code: string;
    refund_id: string;
    dispute_id: string;
  }>(filePath, {
    transform: (row: Record<string, string>) => ({
      payment_id:      row.payment_id,
      customer_id:     row.customer_id,
      customer_name:   row.customer_name,
      amount:          Number(row.amount),   // source currency, major units (dollars)
      currency:        row.currency,
      status:          row.status,
      payment_date:    row.payment_date,
      subscription_id: row.subscription_id || null,
      description:     row.description || null,
      failure_code:    row.failure_code || null,
      refund_id:       row.refund_id || null,
      dispute_id:      row.dispute_id || null,
    }),
  });

  // Step 2 & 3: FX → USD, then dollars → cents
  return raw.map(row => {
    const paymentDate = new Date(row.payment_date);
    let amountUSD: number;
    try {
      amountUSD = convertToUSD(row.amount, row.currency, paymentDate, fxRates);
    } catch {
      amountUSD = row.amount;
    }
    return {
      ...row,
      status:  row.status as StripePayment['status'],
      amount:  Math.round(amountUSD * 100),
    };
  });
}
