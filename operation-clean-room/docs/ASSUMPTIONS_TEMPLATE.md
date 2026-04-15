

# 📄 Assumptions Document — Revenue Reconciliation Assignment

## 📌 Overview

This document outlines the **key assumptions made during the implementation** of revenue reconciliation, ARR, churn, and pipeline analysis across Salesforce, Chargebee, Stripe, and legacy systems.

The objective was to ensure **data consistency, auditability, and CFO-level explainability** despite inconsistencies in source systems.

---

# 🧠 Core Assumptions

## 1. Currency & Unit Normalization

* Chargebee `mrr` is stored in **cents** — `computeMRR()` works entirely in cents; all downstream code divides by 100 to get dollars
* Stripe CSV amounts are in **source-currency major units (dollars)** — `stripe.ts` reads them as dollars, applies FX conversion, then stores as USD cents (`× 100`)
* Salesforce opportunity `amount` is in **USD (major units / dollars)** — no conversion applied

👉 Assumption:

> All monetary values are normalized to **USD dollars** before final comparison.
> Internally, Stripe and Chargebee amounts are stored as **USD cents** after normalization.

---

## 2. FX Conversion

* FX rates are applied using **transaction/payment date**
* If exact date rate is missing → fallback scans up to **5 prior calendar days** (covers weekends + holidays)
* Supported currencies: **EUR, GBP, JPY, AUD** only
* Unsupported currencies: `convertToUSD()` throws — caught in `stripe.ts` and the **raw dollar amount is used as-is (no FX applied)**

👉 Assumption:

> FX conversion reflects **historical transaction value**, not current rates.
> Payments in unsupported currencies fall back to raw values without FX conversion.

---

## 3. Stripe Coverage Limitation

* Stripe contains payments for only a **subset of customers (~26%)**
* Remaining customers pay via:

  * Invoice
  * ACH
  * Wire

👉 Assumption:

> Stripe is a **partial payment source**, not the full revenue system

---

## 4. Revenue Reconciliation Scope

* Reconciliation compares:

  * **Expected revenue (Chargebee active subscriptions)**
  * **Actual revenue (Stripe succeeded payments)**

👉 Assumption:

> Differences may arise due to **payment channel gaps**, not necessarily calculation errors

---

## 5. Time Window Selection

* Reconciliation window is fixed to the board reporting period:

  ```
  2024-01-01 → 2024-12-31
  ```

* Rationale: active subscription snapshot (Feb–Mar 2025) alone only captures ~113 Stripe payments; the full 2024 window includes the complete payment dataset

👉 Assumption:

> A full-year 2024 window provides **meaningful comparison** and avoids snapshot bias from the narrow active-term window

---

## 6. Expected Revenue Calculation

* Based on:

  * **Active subscriptions only** (`status === 'active'`; `in_trial`, `cancelled`, etc. are excluded)
  * Prorated overlap with time window: `(mrr_cents / 100 / 30) × overlap_days`
  * Plan changes handled via **timeline segmentation** (each segment uses the price active during that window)
  * Coupons already applied inside `computeMRR()` — only active coupons count (`valid_till === null OR valid_till >= term_end`)

👉 Assumption:

> Chargebee MRR (post-coupon, post-addon) accurately reflects **net recurring revenue per subscription**

---

## 7. Actual Revenue Calculation

* Only **`succeeded`** Stripe payments within the date window are included
* Amount pipeline per payment:

  ```
  CSV amount (source-currency major units / dollars)
    → convertToUSD (FX using payment_date)
    → stored as USD cents (× 100)
    → divided back to USD dollars (÷ 100) during reconciliation
  ```

👉 Assumption:

> Stripe amounts originate in **major units (dollars)**, are converted to USD via FX, then stored as cents. During reconciliation, amounts are divided back to dollars for comparison.

---

## 8. Entity Matching (Cross-System)

* Matching uses a **composite confidence score**:

  ```
  confidence = (idWeight × exact_id_match)
             + (domainWeight × domain_match)
             + (nameWeight × levenshtein_similarity)
  ```

* Weights: `idWeight=1.0`, `domainWeight=0.9`, `nameWeight=0.8`
* Match threshold: **0.36** (permissive, to handle highly variant names)
* Domain matching uses **substring containment** (handles subdomain variants)
* Name normalization strips legal suffixes (Inc, Corp, Ltd, GmbH, etc.) before comparison

👉 Assumption:

> A combination of exact ID, domain, and **edit-distance similarity (Levenshtein)** is sufficient to link most cross-system entities

---

## 9. CRM Data (Salesforce)

* Opportunity `amount` field is set as **both TCV and ACV base**:

  ```
  tcv = amount
  acv = amount / (contract_term_months / 12)   // defaults to ÷1 if term is 0
  ```

* For single-year deals (`contract_term_months = 12`): `ACV = TCV = amount`
* For multi-year deals: ACV is annualized by dividing by contract length in years

👉 Assumption:

> Multi-year deal revenue is **evenly distributed** across years (linear annualization)

---

## 10. Pipeline Quality (Zombie Deals)

* A deal is considered **zombie** if:

  ```
  max(close_date, created_date) < (now − 90 days)
  ```

* "Last activity" is approximated as the **more recent of `close_date` or `created_date`** — no CRM activity event log is available

👉 Assumption:

> Zombie deals are approximated using last known timestamps (`created_date` or `close_date`), not true CRM activity logs.

---

## 11. Missing Links Interpretation

* Chargebee subscriptions without matching Salesforce accounts:
  → treated as **untracked CRM revenue**

* Salesforce Closed Won without active subscription:
  → treated as **missing billing linkage**

👉 Assumption:

> System mismatch indicates **data quality issues**, not revenue errors

---

## 12. Amount Discrepancy Tolerance

* A line item is only flagged as a mismatch if:

  ```
  |actual − expected| > $0.50  (DEFAULT_TOLERANCE_USD)
  ```

* The tolerance absorbs minor FX rounding and proration day-count differences

👉 Assumption:

> A tolerance threshold of **$0.50** is applied to avoid false mismatches from rounding.
> Larger gaps are attributed to Stripe coverage gaps, not calculation errors.

---

# ⚠️ Known Limitations / Assumptions Made Due to Missing Data

* **Legacy date parsing**: fallback format assumed when date string is ambiguous
* **Partner margin**: not applied to CRM revenue (partner_id is captured but unused)
* **Multi-year escalations**: assumed linear where ramp details are missing
* **No direct ID mapping**: `chargebee_customer_id` on Salesforce accounts is often null; system falls back to fuzzy name matching
* **Stripe FX double-conversion**: non-USD payments have FX applied in ingestion and again in reconciliation — amounts are consistent for USD (no-op second call) but may differ slightly for foreign-currency payments
* **Zombie activity proxy**: no CRM activity event log available; staleness uses `max(close_date, created_date)` as approximation
* **Unsupported-currency fallback**: payments in currencies other than EUR/GBP/JPY/AUD are included at raw face value without conversion

---

# 🎯 Final Assumption Summary

> The primary assumption is that discrepancies are driven by **data fragmentation across systems** — not incorrect revenue — and that normalization + reconciliation produces a reliable, audit-ready picture of the gaps.

Key design choices:
- Chargebee is the **source of truth for expected revenue**
- Stripe is treated as **partial cash collection evidence**
- Salesforce is used for **pipeline quality and segment enrichment**
- All monetary comparisons happen in **USD dollars** after normalization

---

