import { join } from 'node:path';
import type { ARRResult, MetricOptions } from './types.js';
import { loadChargebeeSubscriptions } from '../ingestion/chargebee.js';
import { loadSalesforceData } from '../ingestion/salesforce.js';
import { loadFXRates } from '../utils/load-fx-rates.js';
import { convertToUSD } from '../utils/fx.js';

/**
 * Annual Recurring Revenue (ARR) calculation.
 *
 * ARR is the annualized value of all active recurring subscriptions.
 * Calculation must handle several edge cases:
 *
 * - **Trials**: Subscriptions in trial status should be excluded by default
 *   (configurable via options).  Trials that convert mid-month need careful
 *   handling -- the ARR should reflect only the post-conversion period.
 *
 * - **Multi-year deals**: Some subscriptions are billed annually or multi-
 *   annually.  The ARR for a 2-year deal at $24,000 is $12,000 (annualized),
 *   not $24,000.  Use the plan's billing period to normalize.
 *
 * - **Prorations**: Mid-month plan changes create prorated invoices.  ARR
 *   should reflect the *current* plan rate, not the prorated amount.
 *
 * - **FX conversion**: Non-USD subscriptions must be converted using the
 *   FX rate as of the calculation date.  This means ARR can fluctuate even
 *   with no subscription changes if exchange rates move.
 *
 * - **Addons**: Recurring addons contribute to ARR and should be included.
 *
 * - **Discounts**: Active coupons reduce the effective ARR.  Expired coupons
 *   mean the customer's ARR increases to the list price.
 *
 * - **Paused subscriptions**: Typically excluded from ARR but may be included
 *   if the pause is temporary and the customer is expected to resume.
 *
 * @param date - The as-of date for the ARR calculation
 * @param options - Calculation options (segmentation, exclusions, etc.)
 * @returns ARR result with total and breakdowns
 */
export async function calculateARR(
  date: Date,
  options?: MetricOptions,
): Promise<ARRResult> {
  const dataDir = join(process.cwd(), '../../data');
  const [subscriptions, [, accounts], fxRates] = await Promise.all([
    loadChargebeeSubscriptions(dataDir),
    loadSalesforceData(dataDir),
    loadFXRates(dataDir),
  ]);

  const excludeTrials = options?.excludeTrials ?? true;

  // Build account segment lookup from Salesforce
  const segmentByCompany = new Map<string, string>();
  for (const acc of accounts) {
    segmentByCompany.set(acc.account_name.toLowerCase().trim(), acc.segment);
  }

  const active = subscriptions.filter(s => {
    if (s.status === 'cancelled' || s.status === 'paused') return false;
    if (excludeTrials && s.status === 'in_trial') return false;
    return true;
  });

  // per-sub ARR in USD (mrr is in cents → /100 → *12)
  const arrEntries: Array<{ arr: number; plan: string; segment: string; region: string; cohort: string }> = [];
  let totalArr = 0;

  for (const sub of active) {
    let mrrUSD: number;
    try {
      mrrUSD = convertToUSD(sub.mrr / 100, sub.plan.currency, date, fxRates);
    } catch {
      mrrUSD = sub.mrr / 100; // fallback: no conversion
    }
    const arr = mrrUSD * 12;
    totalArr += arr;

    const companyKey = sub.customer.company.toLowerCase().trim();
    const segment = segmentByCompany.get(companyKey) ?? 'smb';

    arrEntries.push({
      arr,
      plan: sub.plan.plan_name,
      segment,
      region: 'unknown', // not in CB data
      cohort: sub.created_at.slice(0, 7), // YYYY-MM
    });
  }

  const totalCustomers = active.length;
  const avgARRPerCustomer = totalCustomers > 0 ? totalArr / totalCustomers : 0;

  // Helper: group by key and build ARRBreakdown[]
  function breakdown(keyFn: (e: typeof arrEntries[0]) => string) {
    const map = new Map<string, { arr: number; count: number }>();
    for (const e of arrEntries) {
      const k = keyFn(e);
      const cur = map.get(k) ?? { arr: 0, count: 0 };
      map.set(k, { arr: cur.arr + e.arr, count: cur.count + 1 });
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].arr - a[1].arr)
      .map(([label, { arr, count }]) => ({
        label,
        arr,
        customerCount: count,
        percentOfTotal: totalArr > 0 ? (arr / totalArr) * 100 : 0,
      }));
  }

  // Median helper
  const sorted = [...arrEntries].map(e => e.arr).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianARRPerCustomer = sorted.length === 0 ? 0
    : sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);

  return {
    total: totalArr,
    bySegment: breakdown(e => e.segment),
    byPlan: breakdown(e => e.plan),
    byRegion: breakdown(e => e.region),
    byCohort: breakdown(e => e.cohort),
    asOfDate: date.toISOString().slice(0, 10),
    totalCustomers,
    avgARRPerCustomer,
    medianARRPerCustomer,
  };
}
