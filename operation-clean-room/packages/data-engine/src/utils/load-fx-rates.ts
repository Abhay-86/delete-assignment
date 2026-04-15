import { join } from 'node:path';
import { loadCSV } from '../ingestion/csv-loader.js';
import type { FXRate } from '../ingestion/types.js';

/**
 * Load FX rates from the data directory.
 * @param dataDir - Path to the data directory
 * @returns Array of FX rates
 */
export async function loadFXRates(dataDir: string): Promise<FXRate[]> {
  const filePath = join(dataDir, 'fx_rates.csv');
  
  return await loadCSV<FXRate>(filePath, {
    transform: (row: Record<string, string>) => ({
      date: row.date,
      eur_usd: Number(row.eur_usd),
      gbp_usd: Number(row.gbp_usd),
      jpy_usd: Number(row.jpy_usd),
      aud_usd: Number(row.aud_usd),
    }),
  });
}
