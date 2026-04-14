# Assumptions Log

Every decision made about ambiguous data, unclear requirements, or edge case handling is logged here.

---

## Data Interpretation

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | **Chargebee MRR is stored in cents, not dollars** | Field values like `716218` match plan prices × 100. Chargebee API spec stores all monetary values in smallest currency unit | ARR would be overstated by 100× if treated as dollars | 2026-04-13 |
| 2 | **Stripe payment amounts in CSV are in dollars, not cents** | CSV has values like `63` for a "Monthly Starter Plan" subscription which aligns with plan pricing. Multiplied by 100 to normalize to cents for cross-system comparison | Revenue reconciliation comparison would be off by 100× | 2026-04-13 |
| 3 | **Chargebee `plan.interval = "month"` maps to `billing_period = 1`, `"year"` maps to `12`** | Chargebee interval naming convention. Annual subs should contribute same monthly MRR as monthly subs at same price | ARR normalization would be incorrect for annual subscriptions | 2026-04-13 |
| 4 | **Legacy invoice dates use MM/DD/YYYY format** | Analysis of date patterns shows US format consistency with other data sources | Could shift revenue attribution by 1-2% for ambiguous dates like `03/04/2023` | 2026-04-13 |
| 5 | **Company name variations are common across systems** | Found patterns like "Quantum Dynamics Inc." vs "Quantum Dynamics" across Salesforce and Chargebee | Entity resolution would miss legitimate matches if exact match required | 2026-04-13 |
| 6 | **FX rates apply to transaction date, not current date** | Historical accuracy requirement for revenue reconciliation — using today's rates for last year's transactions distorts comparisons | Could create significant discrepancies on non-USD subscriptions | 2026-04-13 |
| 7 | **FX rate lookback window is 5 days** | FX markets are closed weekends and public holidays. 5 days covers any long weekend without reaching back so far that the rate is stale | Would error on weekend/holiday queries without this fallback | 2026-04-13 |

---

## Metric Definitions

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | **ARR = MRR × 12, where MRR already includes addons and active coupons** | Industry standard. `sub.mrr` is computed with `computeMRR()` which adds addon quantities × unit prices and subtracts unexpired coupon discounts. Not re-computed at metric layer | Would double-count or miss addon revenue if mrr were re-derived | 2026-04-13 |
| 2 | **A coupon is "active" if `valid_till` is null OR `valid_till >= current_term_end`** | Coupon validity should cover the entire current billing cycle, not just today. A coupon valid through term end is fully earned | Would overstate MRR for subs with expiring coupons mid-cycle | 2026-04-14 |
| 3 | **NRR cohort = customers active at `startDate`** | Industry standard: NRR measures retention of existing customers, excluding new business acquired during the period | New customer revenue would be included in NRR, inflating it — not true retention | 2026-04-14 |
| 4 | **NRR uses date-range logic on `created_at` and `cancelled_at`, not current `status` field** | `status` reflects today's state. A customer who churned 6 months ago has `status = 'cancelled'` today — using status would misclassify them as churned in any historical query | Every historical NRR query would be wrong | 2026-04-14 |
| 5 | **Expansion/contraction threshold is $1 (not $0)** | Avoids classifying FX fluctuations on multi-currency subscriptions as expansion or contraction. Sub-dollar deltas are noise | Minimal impact — affects classification label, not total ARR | 2026-04-14 |
| 6 | **Churn = subscriptions where `cancelled_at` falls within `[startDate, endDate]`** | Strict date-window approach. Churn on a specific period means the cancellation happened in that period | Would miss or double-count churn if using status snapshot instead | 2026-04-14 |
| 7 | **Churn = 0 for Feb–Apr 2026 window is correct, not a bug** | Data analysis: most cancellations occurred in late 2024 and mid-2025. The narrow recent window genuinely has no cancellations | Could be misread as broken implementation — it is correct per the data | 2026-04-14 |
| 8 | **Zombie deals = open opportunities with no activity for 90+ days** | Standard sales ops definition. 90 days gives sales team reasonable follow-up time before flagging | Could flag legitimate long-cycle enterprise deals if threshold is too aggressive | 2026-04-13 |
| 9 | **Pipeline health score is count-based, not dollar-based** | Dollar-based formula mixed Chargebee cents with Salesforce dollars, always producing 0. Count ratios are currency-agnostic and produce meaningful 0–1 scores | Score would be meaningless (always 0 or 1) with dollar mixing | 2026-04-13 |

---

## Business Logic

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | **Entity resolution joins Salesforce accounts to Chargebee subscriptions via fuzzy company name + email domain matching** | No shared ID exists between systems. `chargebee_customer_id` in Salesforce is mostly null | Unmatched entities are reported, not silently dropped | 2026-04-13 |
| 2 | **Fuzzy match threshold of 0.7 confidence** | Empirical: below 0.6 produces too many false positives (common words like "Group" matching unrelated companies), above 0.8 misses legitimate variations | Could miss real matches (threshold too high) or create false entity merges (too low) | 2026-04-13 |
| 3 | **Domain matching weighted higher than name matching (0.9 vs 0.6)** | Domains are standardized and less prone to data entry variation than company names | Could fail for companies with multiple domains or domain changes | 2026-04-13 |
| 4 | **"Closed Won" opportunities with no active Chargebee subscription = unbooked revenue** | Standard expectation: a closed deal should activate a subscription. Gap indicates revenue not yet in billing system | Could flag deals in implementation/onboarding delay as unbooked — acceptable false positive | 2026-04-13 |
| 5 | **Revenue reconciliation compares Chargebee expected MRR vs Stripe actual payments, keyed by normalized company name** | Stripe `subscription_id` values use different format from Chargebee. No shared key exists — company name (lowercased, trimmed) is the best available join key | Name mismatches between systems would cause reconciliation gaps | 2026-04-13 |
| 6 | **Segment for ARR breakdown comes from Salesforce, not Chargebee** | Chargebee has no segment field. Salesforce is the CRM system of record for account classification | Segment breakdown defaults to `"smb"` for unmatched companies — slightly understates enterprise ARR | 2026-04-14 |

---

## Exclusions & Edge Cases

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | **`in_trial` subscriptions excluded from ARR by default** | Trials have not converted to paying customers yet. Including them inflates ARR with revenue not yet earned | Could understate potential ARR from high-converting trial cohorts | 2026-04-13 |
| 2 | **`paused` and `cancelled` subscriptions excluded from ARR** | No active billing. Paused subscriptions may reactivate but do not contribute current MRR | Could miss temporary pauses that still bill in some configurations | 2026-04-13 |
| 3 | **`non_renewing` subscriptions included in NRR endArr** | Customer has not cancelled yet — they are still paying through their term. Excluding them would overstate churn | If a non-renewing sub is treated as active revenue, NRR is slightly optimistic | 2026-04-14 |
| 4 | **Revenue reconciliation tolerance = $0.50 USD** | Accounts for rounding from cents conversion and minor FX timing differences. Tighter than a percentage-based tolerance to catch real discrepancies | Could flag FX rounding noise as discrepancies (too tight) or miss small systematic errors (too loose) | 2026-04-14 |
| 5 | **`computeMRR()` uses `current_term_end` as coupon validity cutoff, not today** | A coupon valid through term end is earned for the whole period. Using today's date would prematurely expire coupons mid-cycle | MRR would fluctuate artificially as `valid_till` dates are crossed | 2026-04-14 |


## How to Use This Template

For each assumption:
1. State the assumption clearly
2. Explain your rationale (what evidence led you here?)
3. Assess the impact if the assumption turns out to be wrong
4. Date it so we know the sequence of decisions

---

## Data Interpretation

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | **Legacy invoice dates are in MM/DD/YYYY format** | Analysis of date patterns shows US format consistency with other data sources | Could shift revenue attribution by 1-2% for ambiguous dates | 2026-04-13 |
| 2 | **Subscription MRR represents monthly recurring revenue in base currency** | Chargebee data structure and field naming indicates monthly recurring value | ARR calculations would be off by 12x if MRR is actually ARR | 2026-04-13 |
| 3 | **Company name variations are common due to data entry inconsistencies** | Found "Quantum Dynamics Inc." vs "Quantum Dynamics" patterns across systems | Entity resolution would miss legitimate matches if names are always exact | 2026-04-13 |
| 4 | **FX rates apply to transaction dates, not current conversion** | Business requirement for historical accuracy in revenue reconciliation | Could create significant discrepancies if using current rates for old transactions | 2026-04-13 |
| 5 | **Null/empty customer emails indicate data quality issues, not missing customers** | Pattern analysis shows sporadic missing data rather than intentional omissions | Could miss legitimate entity matches if emails are systematically omitted | 2026-04-13 |

## Metric Definitions

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | **ARR is calculated as MRR * 12 with proration for partial periods** | Industry standard and CFO brief mentions "annual recurring" calculations | Would overstate ARR if subscriptions are already annualized in source data | 2026-04-13 |
| 2 | **Zombie opportunities are defined as 90+ days without activity** | Business context suggests stale pipeline distorts forecasting; 90 days gives sales team reasonable follow-up time | Could flag legitimate long-cycle deals as stale if threshold is too aggressive | 2026-04-13 |
| 3 | **Pipeline health score weights zombie deals (30%), mismatches (40%), unbooked revenue (30%)** | Mismatches have highest business impact on revenue accuracy; other factors are leading indicators | Score would be misleading if actual business impact differs from these weights | 2026-04-13 |
| 4 | **Revenue reconciliation tolerance set at 5% for amount matching** | Accounts for normal proration, FX fluctuation, and processing delays | Could miss significant discrepancies if threshold is too high, or create noise if too low | 2026-04-13 |

## Business Logic

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | **Customers in both Stripe and Chargebee with overlapping active periods indicate migration/transition** | Found evidence of system migration with some dual-system periods | Could misclassify legitimate multi-system customers (though none found in current dataset) | 2026-04-13 |
| 2 | **"Closed Won" opportunities should have corresponding active subscriptions** | Standard sales process: opportunity closes → subscription activates | Could flag legitimate deals that haven't been implemented yet due to onboarding delays | 2026-04-13 |
| 3 | **Fuzzy matching threshold of 0.6 distinguishes real matches from noise** | Empirical testing on known data patterns; balances precision vs. recall | Could miss true matches (too high) or create false positives (too low) | 2026-04-13 |
| 4 | **Entity resolution prioritizes domain matching over name similarity** | Domain names are more standardized and less prone to data entry variations | Could miss matches where companies use different domains for different purposes | 2026-04-13 |
| 5 | **Unbooked revenue represents active subscriptions missing from CRM tracking** | Business requirement to ensure all revenue is tracked in sales systems | Could misidentify internal/test accounts as unbooked if not properly flagged | 2026-04-13 |

## Exclusions & Edge Cases

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | **Trial accounts with $0 MRR are excluded from revenue calculations but included in pipeline analysis** | Trials haven't converted yet and including them in ARR would inflate metrics | Could understate pipeline value if some $0 trials are actually pending activations | 2026-04-13 |
| 2 | **Accounts with missing or invalid email domains are still eligible for name-based matching** | Email domains can be missing due to data quality issues, not missing companies | Could miss legitimate entity matches if email matching is required | 2026-04-13 |
| 3 | **FX rate lookback window is 5 days to handle weekends and holidays** | Foreign exchange markets are closed on weekends; need reasonable fallback | Could use stale rates if major market disruptions occur during extended periods | 2026-04-13 |
| 4 | **Revenue reconciliation date tolerance is 3 days to account for processing delays** | Payment processing can span multiple business days; too strict tolerance creates noise | Could miss real timing issues if processing delays exceed 3 days | 2026-04-13 |
| 5 | **Subscription status "active" is the only status considered for revenue calculations** | Inactive, cancelled, or trial subscriptions don't generate recurring revenue | Could miss revenue from other statuses like "paused" if they still bill | 2026-04-13 |
| 6 | **Data quality issues are preserved and flagged rather than cleaned/normalized** | Assignment emphasizes identifying messy data rather than cleaning it | Could propagate errors if downstream systems expect clean data | 2026-04-13 |
