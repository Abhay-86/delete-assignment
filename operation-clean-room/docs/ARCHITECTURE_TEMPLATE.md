Perfect — now I’ll give you a **clean, submission-ready Architecture Document (aligned with YOUR implementation + fixes + actual behavior)**, not generic.

---

# 📄 Architecture Document — Revenue Reconciliation System

## 📌 System Overview

The system is designed to provide **audit-ready SaaS revenue metrics** by integrating multiple fragmented data sources and reconciling inconsistencies.

It consists of two main components:

1. **Data Engine (Backend — Node.js/TypeScript)**

   * Handles ingestion, normalization, reconciliation, and metric computation
2. **Dashboard (Frontend — React/Vite)**

   * Displays reconciliation results and business insights

👉 Reference base architecture: 

---

# 🏗️ High-Level Architecture

```
Raw Data Sources
   ↓
Ingestion Layer (Normalization)
   ↓
Reconciliation Engine
   ↓
Metrics Engine (ARR, Churn, NRR)
   ↓
API Layer (Express)
   ↓
Dashboard (React UI)
```

---

# 🔄 Data Flow

## 1️⃣ Ingestion Layer

**Sources:**

* Chargebee (JSON)
* Stripe (CSV)
* Salesforce (CSV)
* Legacy invoices (XML)

### Responsibilities:

* Parse raw data
* Normalize structure
* Standardize:

  * Currency
  * Dates
  * Entity fields

---

## 2️⃣ Normalization Layer

### Key Transformations

#### ✅ Company Name Normalization

* Lowercase
* Remove suffixes (Inc, Ltd, etc.)
* Remove punctuation
* Collapse whitespace

#### ✅ Amount Normalization

* Chargebee → stored in cents internally → divided by 100 at computation time
* Stripe → read as source-currency dollars → FX converted → stored as USD cents (× 100)
* Salesforce → assumed USD dollars (no conversion needed)

---

## 3️⃣ Entity Resolution Layer

### Problem:

No shared customer ID across systems

### Solution:

**Federated identity model** 

Matching based on:

* Company name (normalized)
* Email domain
* Website

### Matching Strategy:

```
confidence = (id_weight * exact_id_match)
           + (domain_weight * domain_match)
           + (name_weight * levenshtein_similarity)
```

Threshold: 0.36 (permissive to handle variant names)

### Output:

* Matched entities
* Unmatched entities
* Confidence score

---

## 4️⃣ Reconciliation Engine

### Purpose:

Compare:

```
Expected Revenue (Chargebee)
vs
Actual Revenue (Stripe)
```

---

### Expected Revenue Logic

* Based on active subscriptions
* Handles:

  * Proration (overlap days)
  * Plan changes
  * Coupons (already in MRR)

```
expected = (MRR / 30) * overlap_days
```

---

### Actual Revenue Logic

* Based on Stripe payments
* Includes:

  * Only `succeeded` payments
  * FX conversion using payment date

---

### Output

* Revenue difference
* Coverage gap
* Amount mismatches

---

## 5️⃣ Metrics Engine

### Metrics Computed

#### ARR

```
ARR = MRR × 12
```

#### Churn

* Based on `cancelled_at`
* Not snapshot `status`

#### NRR

```
NRR = (Start + Expansion - Contraction - Churn) / Start
```

---

### Key Design Decision

> Use **event timestamps**, not snapshot fields

---

## 6️⃣ Pipeline Analysis

### Inputs:

* Salesforce opportunities

### Logic:

* Zombie deals:

```
max(close_date, created_date) < (now − 90 days) → stale
```

> No CRM activity log available — staleness is approximated from existing date fields

* ACV derived from:

```
TCV / (contract_term_months / 12)
```

---

## 7️⃣ API Layer

### Endpoints

* `/api/reconciliation/run`
* `/api/metrics/arr`
* `/api/metrics/nrr`
* `/api/metrics/churn`
* `/api/scenarios/run`
* `/api/scenarios/presets`
* `/api/scenarios/compare`

### Behavior:

* Stateless
* On-demand computation
* Returns JSON

---

## 8️⃣ Dashboard Layer

### Features:

* Run reconciliation manually
* Display:

  * Matching stats
  * Missing links
  * Coverage gap
  * Revenue comparison

---

# 🧠 Key Architectural Decisions

## 1. No Single Source of Truth

> System preserves inconsistencies instead of forcing merge

---

## 2. Cents as Internal Unit, Dollars for Comparison

* Chargebee MRR and Stripe payments are stored as **USD cents** internally
* Divided by 100 only at computation/comparison time
* Salesforce amounts remain in dollars throughout

👉 Fixed by:

> Standardizing the conversion boundary — cents internally, dollars at comparison

---

## 3. Stripe as Partial System

> Stripe is treated as **partial revenue source**, not complete billing

---

## 4. Time-Based Logic

> All metrics use:

* `created_at`
* `cancelled_at`

NOT:

* `status`

---

## 5. Batch Processing Model

* No real-time sync
* Reconciliation triggered manually

---

# ⚠️ Limitations

## Data Limitations

* No unified customer ID
* Missing CRM ↔ billing linkage
* Partial Stripe coverage (~26%)

---

## Technical Limitations

* In-memory processing
* No caching
* O(n²) fuzzy matching

---

## Functional Gaps

* Legacy date parsing incomplete
* Partner margin not applied
* Cohort analysis partial

---

# 🔮 Extensibility

## Add new billing source

* Add ingestion module
* Plug into reconciliation

## Add new metric

* Create new metric service
* Expose via API
* Render in UI

## Improve matching

* Add domain-based strict linking
* Introduce ML matching (future)

---

# 🎯 Final Summary

> The system is designed as a **federated reconciliation engine**, prioritizing:

* Accuracy over assumptions
* Auditability over convenience
* Insight over aggregation

It exposes real-world issues:

* Data fragmentation
* CRM inconsistencies
* Payment coverage gaps

---

