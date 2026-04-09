import { ProductEvent } from './types.js';

/**
 * Load and process product usage events.
 *
 * Product events are stored as newline-delimited JSON (JSONL) which can be
 * very large (hundreds of thousands of events).  Key considerations:
 *
 * - **JSONL streaming**: The file should be read line-by-line using the
 *   streaming JSONL loader to avoid excessive memory usage.  Do NOT read
 *   the entire file into memory at once.
 *
 * - **Event aggregation**: Raw events are too granular for most analytics.
 *   Common aggregations needed:
 *   - Daily/weekly/monthly active users (DAU/WAU/MAU) per account
 *   - Feature adoption rates (unique accounts using each feature)
 *   - Usage intensity (events per user per day)
 *   - Login frequency and recency
 *
 * - **Usage metrics for health scoring**: The health scoring model needs
 *   aggregated usage signals per account:
 *   - Days active in the last 30 days
 *   - Number of unique features used
 *   - Trend direction (increasing, stable, decreasing)
 *   - Key feature engagement (API usage, integrations, exports)
 *
 * - **Timestamp handling**: All timestamps are ISO-8601 in UTC but some
 *   older events may have millisecond precision while newer ones have
 *   microsecond precision.
 *
 * @param dataDir - Path to the data directory
 * @returns Array of product events
 */
export async function loadProductEvents(dataDir: string): Promise<ProductEvent[]> {
  // TODO: Implement - load from product_events.jsonl using streaming loader
  throw new Error('Not implemented');
}

/**
 * Aggregate raw product events into per-account usage summaries.
 *
 * @param events - Raw product events
 * @param periodStart - Start of the aggregation period
 * @param periodEnd - End of the aggregation period
 * @returns Map of account_id to usage summary
 */
export async function aggregateUsageByAccount(
  events: ProductEvent[],
  periodStart: Date,
  periodEnd: Date,
): Promise<
  Map<
    string,
    {
      accountId: string;
      daysActive: number;
      uniqueUsers: number;
      uniqueFeatures: number;
      totalEvents: number;
      topFeatures: { feature: string; count: number }[];
      trend: 'increasing' | 'stable' | 'decreasing';
    }
  >
> {
  // TODO: Implement - aggregate events into per-account summaries
  throw new Error('Not implemented');
}
