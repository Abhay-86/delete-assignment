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
| 1 | _Example: Legacy invoice dates are DD/MM/YYYY unless cross-referencing with Stripe proves otherwise_ | _The majority of unambiguous dates in legacy_invoices.xml follow DD/MM pattern_ | _Revenue attribution by month could shift by up to 5% for affected invoices_ | _-_ |
| 2 | | | | |

## Metric Definitions

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | _Example: NRR is calculated on a trailing 12-month basis_ | _Industry standard; CFO brief says "quarterly" but doesn't specify method_ | _Quarterly NRR would show more volatility, potentially alarming the board_ | _-_ |
| 2 | | | | |

## Business Logic

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | _Example: Accounts in both Stripe and Chargebee with overlapping active periods are duplicates_ | _Migration should have deactivated one system before activating the other_ | _Could misclassify intentional multi-system customers (none found in data)_ | _-_ |
| 2 | | | | |

## Exclusions & Edge Cases

| # | Assumption | Rationale | Impact if Wrong | Date |
|---|-----------|-----------|----------------|------|
| 1 | _Example: Trial accounts with $0 revenue are excluded from ARR calculation_ | _Trials haven't converted yet and including them inflates metrics_ | _Understates pipeline if some trials are near conversion_ | _-_ |
| 2 | | | | |
