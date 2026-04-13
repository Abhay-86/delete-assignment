import { Router } from 'express';
import { join } from 'node:path';
import { loadStripePayments } from '../ingestion/stripe.js';
import { loadChargebeeSubscriptions } from '../ingestion/chargebee.js';
import { loadSalesforceData } from '../ingestion/salesforce.js';
import { loadLegacyInvoices } from '../ingestion/legacy.js';
import { loadProductEvents } from '../ingestion/product-events.js';

const router = Router();

/**
 * Test route to validate all ingestion functions work correctly
 */
router.get('/ingestion-test', async (req, res) => {
  try {
    const dataDir = join(process.cwd(), '../../data');
    
    // Test each ingestion function
    console.log('Testing Stripe payments...');
    const stripePayments = await loadStripePayments(dataDir);
    console.log(`✅ Loaded ${stripePayments.length} Stripe payments`);
    
    console.log('Testing Chargebee subscriptions...');
    const chargebeeSubscriptions = await loadChargebeeSubscriptions(dataDir);
    console.log(`✅ Loaded ${chargebeeSubscriptions.length} Chargebee subscriptions`);
    
    console.log('Testing Salesforce data...');
    const [opportunities, accounts] = await loadSalesforceData(dataDir);
    console.log(`✅ Loaded ${opportunities.length} opportunities and ${accounts.length} accounts`);
    
    console.log('Testing Legacy invoices...');
    const legacyInvoices = await loadLegacyInvoices(dataDir);
    console.log(`✅ Loaded ${legacyInvoices.length} legacy invoices`);
    
    console.log('Testing Product events...');
    const productEvents = await loadProductEvents(dataDir);
    console.log(`✅ Loaded ${productEvents.length} product events`);

    res.json({
      success: true,
      results: {
        stripePayments: {
          count: stripePayments.length,
          sample: stripePayments[0] || null
        },
        chargebeeSubscriptions: {
          count: chargebeeSubscriptions.length,
          sample: chargebeeSubscriptions[0] || null
        },
        salesforceOpportunities: {
          count: opportunities.length,
          sample: opportunities[0] || null
        },
        salesforceAccounts: {
          count: accounts.length,
          sample: accounts[0] || null
        },
        legacyInvoices: {
          count: legacyInvoices.length,
          sample: legacyInvoices[0] || null
        },
        productEvents: {
          count: productEvents.length,
          sample: productEvents[0] || null
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Ingestion test failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
