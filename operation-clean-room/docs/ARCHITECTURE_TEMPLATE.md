# Architecture Document

## System Overview

The revenue reconciliation system consists of two main components:

1. **Data Engine** (Node.js/TypeScript API) - Handles data ingestion, reconciliation logic, and business analysis
2. **Dashboard** (Vite/React frontend) - Provides user interface for viewing reconciliation results and metrics

### Architecture Flow
```
Raw Data Sources → Data Engine (Ingestion) → Data Engine (Reconciliation) → Data Engine (Metrics) → API → Dashboard
     ↓                    ↓                       ↓                              ↓                   ↓        ↓
[CSV/JSON/XML]    [Normalize & Load]      [Entity Resolution]           [ARR / NRR / Churn]   [REST API]  [React UI]
                                          [Revenue Analysis]            [Cohort Logic]
                                          [Pipeline Quality]            [FX Normalization]
```

### Data Flow
1. **Phase 1 (Ingestion)**: Raw files → Validated TypeScript objects → Memory storage
2. **Phase 2 (Reconciliation)**: Cross-system analysis → Discrepancy detection → Business insights
3. **Phase 3 (Metrics)**: Subscription data → FX-normalized ARR → NRR/churn with date-range cohort logic
4. **Phase 4 (Presentation)**: API endpoints → JSON responses → Dashboard visualization

The system prioritizes data quality identification over data cleaning, preserving messy data patterns for analysis.

## Data Model

### Unified Customer Model

The system uses a **federated identity approach** rather than a single canonical customer ID. Each customer may exist in multiple systems with different identifiers:

- **Salesforce**: `account_id` (ACC-00001, ACC-00002, etc.)
- **Chargebee**: `customer_id` embedded in subscription records
- **Stripe**: `customer_id` in payment records

**Entity Resolution Strategy**: Customers are linked across systems using fuzzy matching on:
1. Company name (normalized, with common variations)
2. Domain extraction from email addresses
3. Website URLs when available

**No Single Source of Truth**: The system preserves the federated nature and reports discrepancies rather than forcing normalization.

### Source Data Mapping

| Source | Key Fields | Links To | Issues Found |
|--------|-----------|----------|-------------|
| Stripe Payments | `customer_id`, `amount`, `currency`, `payment_date` | Chargebee via entity resolution | Currency inconsistencies, missing customer metadata |
| Chargebee Subscriptions | `subscription_id`, `customer.company`, `mrr`, `status` | Salesforce accounts via company name | Company name variations, missing email domains |
| Legacy Invoices | `customer_name`, `amount`, `invoice_date` | Modern systems via name matching | Date format inconsistencies, poor data quality |
| Salesforce Opportunities | `opportunity_id`, `account_id`, `amount`, `stage` | Salesforce accounts via `account_id` | 198 "Closed Won" deals with no billing subscriptions |
| Salesforce Accounts | `account_id`, `account_name`, `website` | Chargebee via domain/name matching | Only 8 matches found out of 600 accounts (1.3% match rate) |
| Product Events | `user_id`, `event_type`, `timestamp` | Customer records via user matching | High volume (86K+ events), requires aggregation |
| Support Tickets | `customer_email`, `ticket_id`, `priority` | Customers via email matching | Incomplete email data affects matching |
| NPS Surveys | `customer_email`, `score`, `feedback` | Customers via email matching | Survey response rates affect coverage |
| Marketing Spend | `channel`, `spend_amount`, `date` | Revenue attribution (planned) | No direct customer linkage, requires attribution modeling |
| Plan Pricing | `plan_id`, `price`, `billing_cycle` | Subscriptions via plan matching | Price changes over time require historical tracking |
| FX Rates | `date`, `eur_usd`, `gbp_usd`, etc. | Payments via transaction date | Weekend/holiday gaps require interpolation |
| Partner Deals | `partner_id`, `deal_value`, `commission` | Opportunities via partner attribution | Limited partner data affects revenue attribution |

## Matching Strategy

### Entity Resolution Approach

**Primary Algorithm**: Fuzzy string matching with weighted confidence scoring

1. **Company Name Matching**:
   - Normalize company names (remove "Inc.", "LLC", etc.)
   - Calculate Levenshtein distance for similarity scoring
   - Handle common variations ("Corp" vs "Corporation")

2. **Domain Matching**:
   - Extract domains from email addresses and websites
   - Exact domain matching gets highest confidence score
   - Subdomain variations are handled appropriately

3. **Composite Scoring**:
   - Combine name similarity + domain matching
   - Weight domain matches higher (more reliable than names)
   - Apply threshold to distinguish matches from noise

### Confidence Scoring

**Confidence Score Formula**:
```typescript
confidence = (domain_match_weight * domain_score) + 
             (name_match_weight * name_similarity_score)
```

**Scoring Thresholds**:
- **High Confidence** (>0.8): Exact domain match + similar company name
- **Medium Confidence** (0.6-0.8): Domain match OR very similar names  
- **Low Confidence** (<0.6): Weak similarity, requires manual review

**Fields Contributing to Confidence**:
- Domain exact match: +0.6 base score
- Company name similarity: 0-0.4 based on Levenshtein distance
- Website URL match: +0.2 bonus
- Email domain consistency: +0.1 bonus

**Match Threshold**: 0.6 minimum confidence to be considered a valid match
- Above 0.8: Automatic acceptance
- 0.6-0.8: Flagged for review
- Below 0.6: Rejected as noise

## Metric Definitions

### NRR (Net Revenue Retention)

**Definition**: Percentage of ARR retained from an existing customer cohort after expansion, contraction, and churn
**Formula**: `(startingARR + expansion - contraction - churn) / startingARR * 100`

**Cohort Definition**: Customers active at `startDate` — i.e., `created_at <= startDate AND (cancelled_at IS NULL OR cancelled_at > startDate)`

**Critical Design Decision**: Cohort uses explicit date-range logic on `created_at`/`cancelled_at`, **not** the `status` field. The `status` field reflects today's snapshot. A customer who churned 6 months ago has `status = 'cancelled'` today — using status for a historical NRR query would misclassify them as "never active in that cohort".

**Expansion/Contraction Classification**:
- For each cohort customer: compare `endArr` (ARR at `endDate`) vs `startArr` (ARR at `startDate`)
- `delta > $1`: expansion
- `delta < -$1`: contraction  
- Customer absent at `endDate` (churned during period): churn
- **$1 threshold**: avoids classifying sub-dollar FX fluctuations on multi-currency subs as expansion/contraction

**Edge cases**:
- Customers still in `non_renewing` state at `endDate` are included (still billing)
- New customers acquired during the period are excluded (not in starting cohort)
- Multi-currency subscriptions: both start and end ARR converted via `utils/fx.ts` using respective period dates

### Churn (Gross & Logo)

**Definition**: Revenue and customer count lost in a period from cancellations
**Gross Churn Rate**: `(ARR of churned customers / startingARR) * 100`
**Logo Churn Rate**: `(count of churned customers / startingCustomerCount) * 100`

**Churn Detection**: `cancelled_at` falls within `[startDate, endDate]` (inclusive). Uses date field, not status snapshot — same rationale as NRR cohort logic.

**Breakdowns provided**:
- `byReason`: grouped by `cancellation_reason` field (upgrade_downgrade, non_payment, voluntary, etc.)
- `byPlan`: grouped by plan ID at time of cancellation

**Edge cases**:
- `churn = 0` for narrow recent date windows (e.g., Feb–Apr 2026) is data-correct: all cancellations in the dataset occurred in late 2024 / mid-2025
- Churn rate is expressed against the starting cohort ARR at `startDate`, not total current ARR

### ARR (Annual Recurring Revenue)

**Definition**: Annualized value of active recurring subscriptions, normalized to USD
**Formula**: `sum(active_subscriptions.mrr / 100 * fx_rate_to_usd * 12)`

**Key implementation detail**: Chargebee stores MRR in **cents** (smallest currency unit). Always divide by 100 before any calculation. `sub.mrr` already includes addon quantities and active coupon discounts (computed via `computeMRR()` at ingestion time — not re-derived at the metric layer).

**Segment breakdown**: Segment label (`enterprise`, `mid-market`, `smb`) comes from Salesforce accounts, matched to Chargebee via normalized company name. Unmatched companies fall back to `"smb"`.

**Edge cases**: 
- Trial subscriptions excluded by default (`excludeTrials=true`); configurable via query param
- Paused and cancelled subscriptions excluded
- Currency conversion uses subscription-level currency + date via `utils/fx.ts` (5-day weekend fallback)

### Revenue Reconciliation

**Definition**: Comparison of expected revenue (from subscriptions) vs. actual revenue (from payments)
**Formula**: `actual_revenue - expected_revenue`, with tolerance bands
**Edge cases**:
- Cross-currency transactions use payment-date FX rates
- 3-day tolerance for payment processing delays
- Proration handling for mid-cycle changes
- Failed payment retries counted as single expected payment

### Pipeline Health Score

**Definition**: Composite score (0-1) indicating CRM data quality
**Formula**: `1 - ((zombie_weight * zombie_ratio) + (mismatch_weight * mismatch_ratio) + (unbooked_weight * unbooked_ratio))`
**Weights**: Zombie deals (30%), Stage mismatches (40%), Unbooked revenue (30%)
**Edge cases**:
- Score floors at 0 (cannot go negative)
- Incomplete data sources lower confidence, don't break calculation

### Entity Resolution Confidence

**Definition**: Probability (0-1) that two customer records represent the same entity
**Formula**: Weighted combination of domain matching (60%) + name similarity (40%)
**Edge cases**:
- Missing email domains default to name-only matching
- Perfect domain match can achieve 1.0 confidence alone
- Company name variations handled through normalization

## Assumptions

See [ASSUMPTIONS_TEMPLATE.md](./ASSUMPTIONS_TEMPLATE.md) for the full log.

## Known Limitations

**Current Implementation Gaps**:
1. **Revenue reconciliation requires date filtering** - Currently analyzes all-time data instead of specific periods
2. **Entity resolution match rate is low (1.3%)** - Indicates need for additional matching strategies
3. **No real-time processing** - All analysis is batch-based with manual triggering
4. **Limited FX rate handling** - 5-day weekend lookback covers holidays but does not interpolate for extended data gaps
5. **Memory-only data storage** - No persistence layer for large datasets

**Intentionally Skipped Edge Cases**:
1. **Subscription pause/resume cycles** - Complex proration logic deferred
2. **Multi-currency subscription changes** - Currency conversion on plan changes
3. **Partial refunds and chargebacks** - Payment reconciliation edge cases
4. **Merger/acquisition scenarios** - Company name changes over time

**Performance Limitations**:
- In-memory processing limits dataset size to ~10K records per source
- No caching layer for repeated reconciliation runs
- Fuzzy matching algorithm is O(n²) and doesn't scale

## Future Extensibility

### Adding a New Billing Source (e.g., Paddle)

1. **Create ingestion module**: `src/ingestion/paddle.ts` following existing patterns
2. **Define data types**: Add Paddle-specific interfaces to `types.ts`
3. **Update entity resolution**: Add Paddle customer matching logic to `matcher.ts`
4. **Extend reconciliation**: Include Paddle data in revenue reconciliation flows
5. **Update API routes**: Add Paddle endpoints to reconciliation routes

### Adding a New Metric

1. **Define calculation logic**: Create new module in `src/metrics/`
2. **Update types**: Add metric interfaces to appropriate type files
3. **Create API endpoint**: Add route in `src/routes/metrics.ts`
4. **Add to dashboard**: Create React component for visualization
5. **Document assumptions**: Update assumptions log with metric definitions

### Changing Reconciliation Schedule

**From monthly to weekly**:
1. **Update date range logic**: Modify reconciliation API to accept week boundaries
2. **Adjust tolerance windows**: Weekly reconciliation may need tighter tolerances
3. **Update caching strategy**: More frequent runs require efficient data refresh
4. **Modify dashboard**: Update UI to show weekly trends instead of monthly

### Adding Segmentation Dimensions

1. **Identify segmentation fields**: Company size, industry, region, etc.
2. **Update data model**: Add segmentation fields to unified customer model
3. **Modify aggregation logic**: Group metrics by segment in calculation modules
4. **Create segment API**: Add endpoints for segment-specific reconciliation
5. **Update dashboard**: Add segment filters and segment-specific views
