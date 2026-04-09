import { SalesforceOpportunity, SalesforceAccount } from './types.js';

/**
 * Load and normalize Salesforce CRM data (Opportunities and Accounts).
 *
 * Salesforce data introduces several reconciliation challenges:
 *
 * - **TCV vs ACV**: Opportunities have both `tcv` (Total Contract Value) and
 *   `acv` (Annual Contract Value) fields.  For multi-year deals the TCV is
 *   a multiple of ACV, but discounts and ramp deals may cause mismatches.
 *   ARR calculations should use ACV, not TCV.
 *
 * - **Opportunity stages**: The pipeline includes stages from "Prospecting"
 *   through "Closed Won" and "Closed Lost".  Only "Closed Won" opportunities
 *   should map to actual revenue, but "Commit" and "Best Case" stages are
 *   used for forecasting.  Zombie deals (open opportunities with no activity
 *   for 90+ days) are a common data quality issue.
 *
 * - **Account hierarchy**: Some accounts have a `parent_account_id` linking
 *   them in a corporate hierarchy.  Revenue roll-ups for enterprise customers
 *   must aggregate across child accounts.
 *
 * - **External ID mapping**: Accounts may have `stripe_customer_id` and/or
 *   `chargebee_customer_id` fields that map to billing systems.  These are
 *   manually entered and may be missing, outdated, or incorrect.
 *
 * - **Duplicate accounts**: The same company may appear as multiple Salesforce
 *   accounts with slightly different names (e.g., "Acme Corp" vs "ACME Inc.").
 *
 * @param dataDir - Path to the data directory
 * @returns Tuple of [opportunities, accounts]
 */
export async function loadSalesforceData(
  dataDir: string,
): Promise<[SalesforceOpportunity[], SalesforceAccount[]]> {
  // TODO: Implement - load from sf_opportunities.csv and sf_accounts.csv
  throw new Error('Not implemented');
}
