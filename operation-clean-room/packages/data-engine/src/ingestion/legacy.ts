import { LegacyInvoice } from './types.js';

/**
 * Load and normalize legacy billing system invoices.
 *
 * The legacy system was decommissioned but its historical data is critical
 * for accurate LTV calculations and reconciliation.  Key challenges:
 *
 * - **Ambiguous date formats**: The legacy system inconsistently used both
 *   DD/MM/YYYY and MM/DD/YYYY formats depending on the operator's locale.
 *   Dates like "03/04/2023" are genuinely ambiguous (March 4 vs April 3).
 *   Use contextual clues (surrounding dates, invoice sequences) to resolve.
 *   See `utils/date-parser.ts` for the disambiguation strategy.
 *
 * - **payment_ref cross-referencing**: Some invoices have a `payment_ref`
 *   field that contains a Stripe charge ID (e.g. "ch_3Ox...").  This allows
 *   linking legacy invoices to Stripe payments for reconciliation.  However,
 *   the field is often null or contains internal reference numbers that look
 *   similar but are NOT Stripe IDs.
 *
 * - **Currency inconsistencies**: Some invoices store amounts in cents while
 *   others store in whole units.  The `currency` field is sometimes missing
 *   or contains non-standard codes.
 *
 * - **Partial payments**: The legacy system supported partial payments,
 *   resulting in "partially_paid" statuses.  The `amount` field reflects
 *   the total invoice value, not the amount collected.
 *
 * @param dataDir - Path to the data directory
 * @returns Normalized legacy invoice records
 */
export async function loadLegacyInvoices(dataDir: string): Promise<LegacyInvoice[]> {
  // TODO: Implement - load from legacy_invoices.xml, normalize, and return
  throw new Error('Not implemented');
}
