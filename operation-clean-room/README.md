# Operation Clean Room

## The Situation

Three weeks ago, your company's VP of Revenue Operations was terminated after the board discovered significant discrepancies in the numbers presented at the last quarterly review. The CRO has been on damage control, and the CFO has been manually spot-checking spreadsheets at 2am.

Here's what we know: the company runs on three billing systems (Stripe for direct sales, Chargebee for self-serve, and a legacy invoicing system from a 2023 acquisition), a Salesforce CRM that's been "customized" by four different admins over two years, and product analytics that nobody has looked at since the data team quit in Q3.

The board meets in 48 hours. The CFO needs a clean, defensible set of numbers — and a system that can produce them reliably every month going forward. You're the engineer who's going to make that happen.

## Your Mission

Build an emergency board-readiness dashboard that reconciles data across all company systems and presents clean, auditable metrics. Specifically:

1. **Revenue Reconciliation** — Ingest data from Stripe, Chargebee, and the legacy system. Match transactions across systems, identify discrepancies >2%, and produce a unified revenue view by month.

2. **Board Metrics** — Calculate ARR, Net Revenue Retention, Gross/Net Churn, and unit economics (CAC, LTV, payback period). All metrics must be segmentable by signup cohort, plan tier, and region.

3. **Customer Health Scoring** — Build a multi-signal health model combining product usage, support sentiment, billing health, and engagement trends. Flag accounts likely to churn within 90 days.

4. **Pipeline Quality Analysis** — Audit the CRM pipeline. Identify zombie deals, mismatched stages, and deals that closed in CRM but never converted to active subscriptions.

5. **Scenario Modeling** — Build a what-if engine that lets the CFO adjust assumptions (churn rate, expansion rate, new business pace) and see projected ARR impact over 12 months.

6. **Audit Trail** — Every number on the dashboard must be traceable back to source records. The auditors are coming in Q2.

## The Data

| File | Format | Description |
|------|--------|-------------|
| `stripe_payments.csv` | CSV | Payment transactions from Stripe (~2,500 rows) |
| `chargebee_subscriptions.json` | JSON | Subscription records from Chargebee (~900 subscriptions) |
| `legacy_invoices.xml` | XML | Invoices from the acquired company's old system (~600 invoices) |
| `salesforce_opportunities.csv` | CSV | CRM deal pipeline (~450 deals) |
| `salesforce_accounts.csv` | CSV | CRM account records (~600 accounts) |
| `product_events.jsonl` | JSONL | Product usage telemetry (~50,000 events) |
| `support_tickets.csv` | CSV | Customer support history (~3,000 tickets) |
| `nps_surveys.csv` | CSV | NPS survey responses (~800 responses) |
| `marketing_spend.csv` | CSV | Marketing spend by channel (~200 rows) |
| `plan_pricing_history.csv` | CSV | Historical plan pricing and changes (~40 rows) |
| `fx_rates.csv` | CSV | Daily foreign exchange rates (~500 rows) |
| `partner_deals.csv` | CSV | Channel partner deal records (~60 rows) |

## Requirements

- The CFO's full brief is in `docs/CFO_BRIEF.md` — read it carefully, contradictions and all
- Log every assumption you make in `docs/ASSUMPTIONS_TEMPLATE.md`
- Document your architecture in `docs/ARCHITECTURE_TEMPLATE.md`
- All failing tests in `packages/data-engine/__tests__/` must pass
- The dashboard must be functional and presentable (the CEO will see this at the board meeting)
- Your reconciliation engine should be reusable for monthly runs, not a one-off script

## Technical Constraints

- TypeScript only (strict mode, no `any` types except where genuinely needed — document why)
- The monorepo is already set up — work within the existing structure
- You may add dependencies but document why in your architecture doc
- Do not modify boilerplate components unless you have a strong reason (document it)

## What We're Looking For

This is NOT a speed test. We care about:

1. **How you think** — your assumptions doc matters as much as your code
2. **What you discover** — the data has issues. Finding and handling them IS the job
3. **Business judgment** — every metric has edge cases. Your definitions matter
4. **System design** — this runs monthly. Auditors will trace your numbers. Design accordingly
5. **Communication** — if a CFO can't understand your output, it doesn't exist

## Getting Started

See `SETUP.md` for installation instructions.

## Use of AI Tools

You are free to use any AI tools including Claude Code, GitHub Copilot, ChatGPT, etc. We expect and encourage this. What we evaluate is your judgment, problem-solving approach, and the decisions you make — not whether you typed every character yourself.

However: you will be asked to walk through your code and decisions in a live session. Understand everything you submit.

## Time Expectation

48 hours from receipt. This is intentionally more than can be completed perfectly. Prioritize ruthlessly. We'd rather see 3 dimensions done excellently than 5 done superficially.

## Submission

Push your work to this repo. Ensure `pnpm install && pnpm dev` starts both the backend and dashboard. Include your completed docs.
