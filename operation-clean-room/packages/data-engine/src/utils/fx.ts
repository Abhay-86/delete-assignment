import { FXRate } from '../ingestion/types.js';

/**
 * Convert an amount from one currency to USD using historical FX rates.
 *
 * Looks up the FX rate for the given date. If the exact date is not available
 * (e.g., weekends or holidays), falls back to the most recent prior trading
 * day's rate. The lookup order is:
 *   1. Exact date match
 *   2. Previous day, up to 5 days back (covers weekends + holidays)
 *   3. Throws an error if no rate is found within the window
 *
 * Supported currencies: EUR, GBP, JPY, AUD.
 * USD amounts are returned as-is (no conversion needed).
 *
 * @param amount - The amount to convert
 * @param currency - Source currency code (EUR, GBP, JPY, AUD, USD)
 * @param date - The date to use for the FX rate lookup
 * @param rates - Historical FX rate data
 * @returns Amount converted to USD
 *
 * @throws Error if the currency is not supported
 * @throws Error if no FX rate is available within the lookback window
 */
export function convertToUSD(
  amount: number,
  currency: string,
  date: Date,
  rates: FXRate[],
): number {
  // TODO: Implement - handle missing dates (weekends/holidays), currency lookup
  throw new Error('Not implemented');
}
