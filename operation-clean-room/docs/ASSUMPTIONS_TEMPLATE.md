# Assumptions Log

Every decision you make about ambiguous data, unclear requirements, or edge case handling should be logged here. This document is as important as your code.

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
