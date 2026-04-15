import { join } from 'node:path';
import { loadCSV } from './csv-loader.js';
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
  const opportunitiesPath = join(dataDir, 'salesforce_opportunities.csv');
  const accountsPath = join(dataDir, 'salesforce_accounts.csv');

  const opportunities = await loadCSV<SalesforceOpportunity>(
    opportunitiesPath,
    {
      transform: (row: Record<string, string>) => ({
        opportunity_id: row.opportunity_id,
        account_id: row.account_id,
        account_name: row.account_name,
        opportunity_name: row.opportunity_name,
        stage: row.stage,
        amount: Number(row.amount),
        currency: row.currency,
        close_date: row.close_date,
        created_date: row.created_date,
        probability: Number(row.probability),
        forecast_category: row.stage === 'Closed Won' ? 'closed' : 'pipeline',
        type: (row.deal_type?.toLowerCase().replace(/\s+/g, '_') ||
          'new_business') as 'new_business' | 'expansion' | 'renewal',
        owner_name: row.owner_name,
        // Not available in source data
        owner_email: '', 
        next_step: row.next_step || null,
        tcv: Number(row.amount), 
        acv: Number(row.amount) / (Number(row.contract_term_months) / 12 || 1), 
        contract_term_months: Number(row.contract_term_months),
        // Not available in source data
        competitor: null,
        loss_reason: null,
        partner_id: row.partner_id || null,
      }),
    },
  );

  const accounts = await loadCSV<SalesforceAccount>(accountsPath, {
    transform: (row: Record<string, string>) => ({
      account_id: row.account_id,
      account_name: row.account_name,
      industry: row.industry,
      employee_count: Number(row.employee_count) || 0,
      annual_revenue: Number(row.annual_contract_value) || 0, // Using ACV as annual revenue
      billing_country: row.region || '', // Using region as billing country
      website: row.website,
      owner_name: row.account_owner || '', // Using account_owner
      created_date: row.created_date || null,
      segment: 'smb' as const, // Default segment, could derive from employee_count
      parent_account_id: row.parent_account_id || null,

      // Not available in source data
      billing_state: '',
      owner_email: '',
      stripe_customer_id: null, 
      chargebee_customer_id: null, 

    }),
  });

  return [opportunities, accounts];
}
