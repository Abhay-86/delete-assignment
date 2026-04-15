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
  const upper = currency.toUpperCase();
  if (upper === 'USD') return amount;

  const supported = ['EUR', 'GBP', 'JPY', 'AUD'];
  if (!supported.includes(upper)) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  // Try exact date, then up to 5 prior days (weekends / holidays)
  const dateStr = date.toISOString().slice(0, 10);
  for (let offset = 0; offset <= 5; offset++) {
    const d = new Date(date);
    d.setDate(d.getDate() - offset);
    const key = d.toISOString().slice(0, 10);
    const rate = rates.find(r => r.date === key);
    if (rate) {
      const multiplier =
        upper === 'EUR' ? rate.eur_usd :
        upper === 'GBP' ? rate.gbp_usd :
        upper === 'JPY' ? rate.jpy_usd :
        rate.aud_usd;
      return amount * multiplier;
    }
  }

  throw new Error(`No FX rate found for ${currency} near ${dateStr}`);
}
