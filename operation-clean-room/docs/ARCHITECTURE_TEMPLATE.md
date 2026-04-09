# Architecture Document

## System Overview

_Provide a high-level description of your system architecture. How do the data-engine and dashboard interact? What is the data flow from raw files to displayed metrics?_

<!-- Consider including a diagram (ASCII art is fine) -->

## Data Model

### Unified Customer Model

_How do you represent a customer that exists across multiple systems? What is the canonical identifier?_

### Source Data Mapping

_For each data source, describe:_
_- What it provides_
_- How it connects to the unified model_
_- Known data quality issues you discovered_

| Source | Key Fields | Links To | Issues Found |
|--------|-----------|----------|-------------|
| Stripe Payments | | | |
| Chargebee Subscriptions | | | |
| Legacy Invoices | | | |
| Salesforce Opportunities | | | |
| Salesforce Accounts | | | |
| Product Events | | | |
| Support Tickets | | | |
| NPS Surveys | | | |
| Marketing Spend | | | |
| Plan Pricing | | | |
| FX Rates | | | |
| Partner Deals | | | |

## Matching Strategy

_How do you link entities across systems? What matching algorithm(s) did you use? What confidence thresholds did you set and why?_

### Entity Resolution Approach

_Describe your approach to matching customers across systems with different IDs and name variants._

### Confidence Scoring

_How do you score match confidence? What fields contribute? What threshold separates a "match" from "needs review"?_

## Metric Definitions

_For each metric, provide:_
_1. Precise definition_
_2. Formula_
_3. Edge cases and how you handle them_
_4. Why you chose this definition over alternatives_

### ARR (Annual Recurring Revenue)

_Definition:_
_Formula:_
_Edge cases:_

### NRR (Net Revenue Retention)

_Definition:_
_Formula:_
_Edge cases:_

### Gross Churn / Net Churn

_Definition:_
_Formula:_
_Edge cases:_

### Unit Economics (CAC, LTV, Payback)

_Definition:_
_Formula:_
_Edge cases:_

## Assumptions

See [ASSUMPTIONS_TEMPLATE.md](./ASSUMPTIONS_TEMPLATE.md) for the full log.

## Known Limitations

_What doesn't work? What would you fix with more time? What edge cases did you intentionally skip?_

## Future Extensibility

_How would someone:_
_- Add a new billing source (e.g., Paddle)?_
_- Add a new metric?_
_- Change the reconciliation schedule from monthly to weekly?_
_- Add a new segmentation dimension?_
