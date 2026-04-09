# What I Need for the Board Meeting

*Last updated: Tuesday night. I'm writing this from my kitchen table because I can't sleep.*

---

## Background — What Happened

I'll keep this short because I'm still angry about it.

Marcus (our now-former VP of RevOps) had been presenting revenue numbers to the board that didn't match what was actually in our billing systems. We don't know if it was intentional or just incompetence — legal is sorting that out. What I know is that at the last QBR, Peterson asked a simple question about our net retention rate and Marcus gave a number that was off by almost 8 points. Eight. Points.

The board hired an outside analyst to spot-check, and it fell apart from there. Turns out Marcus had been pulling numbers from a spreadsheet he maintained manually — not from the actual systems. He was "adjusting" for things he said were "timing differences" and "data lag" but when we dug in, some of those adjustments were just... wrong. Revenue from churned accounts still counted. Duplicate subscriptions from the Chargebee migration counted twice. Multi-year deals booked at total contract value instead of annualized.

The board is furious. Patterson called it "a material misstatement" and I had to talk him out of calling an emergency session right then. We have 48 hours until the regular board meeting. I need clean numbers. Real numbers. Numbers I can defend to a room of people who no longer trust anything we tell them.

## What I Actually Need

Look, I'm going to write this out as clearly as I can but I know some of this might be contradictory or unclear. I'm not an engineer. If something doesn't make sense, use your judgment and just tell me what you assumed and why.

### 1. The Real ARR

I need to see our real ARR. Not what Marcus had in his deck — the actual number from our billing systems. Break it down by month so I can show the trend. I want to see:

- ARR by month, going back to January 2024
- Broken down by: new business, expansion, contraction, and churn
- Segmented by plan tier (we have Enterprise, Growth, and Starter — plus whatever they called their plans at Meridian before the acquisition)

Show me the waterfall. Board loves a waterfall chart.

Oh and show me recognized revenue by month — the auditors care about when we can actually book it. I know ARR and recognized revenue are different things but I need both and they should be on the same page so I can explain the delta.

### 2. Reconciliation — Show Me the Discrepancies

This is the big one. I need you to pull data from all three billing systems (Stripe, Chargebee, and the old Meridian/legacy system) and reconcile them against each other AND against the CRM.

Flag anything where the billing system and the CRM disagree by more than 2%. I don't care if it's a rounding error — if it's more than 2%, I want to see it. I need to know:

- Which accounts have mismatched amounts
- Which direction the mismatch goes (are we over-reporting or under-reporting?)
- The total dollar impact

Marcus kept saying the discrepancies were "immaterial." I want to see every single one and decide for myself what's material.

### 3. Retention Metrics

The board always asks about retention. Net Revenue Retention, calculated quarterly. Also gross churn. And can you segment it by plan tier and region? They'll want to drill into Enterprise vs Growth.

I also need to see trailing retention by cohort. Like, customers who signed up in Q1 2024 — what does their retention curve look like versus Q2 2024 signups? I think our product improvements last year should show up in the cohort data.

If gross churn is above 3% monthly for any segment I want that flagged in red or something. That's our internal threshold.

### 4. The Duplicate Account Problem

We think there are about 12 accounts that exist in both Stripe and Chargebee — leftovers from when we migrated self-serve customers last year. Marcus said he'd clean it up but obviously that never happened. Find them. Tell me how much double-counted revenue we're looking at.

The tricky part is the account names might not match exactly between systems. Some accounts registered with slightly different names or email domains. You'll need to do some fuzzy matching or something. I don't know how that works but I've been told it's possible.

### 5. Unit Economics

I need a revenue-per-employee metric. I know, it's a vanity metric, but Peterson always asks. Use 847 as headcount — wait, no, we had the layoff in January. Use 823 for Q1 2025, 847 for anything before that.

For CAC: take total marketing and sales spend divided by new customers acquired in the period. But here's the thing — our marketing attribution is apparently a mess (see my note at the bottom). So the CAC number might look weird for certain channels. Just flag it if something looks off.

LTV should be straightforward: take average revenue per account divided by churn rate. But make sure you're using the RIGHT churn rate — logo churn for logo-based LTV, revenue churn for revenue-based LTV.

Payback period = CAC / monthly gross margin per customer. Use 78% as our gross margin — actually, for Starter plans it's closer to 65% because of the support costs. Use 78% for Growth and Enterprise, 65% for Starter.

### 6. Audit Trail

Everything needs an audit trail. When Deloitte comes in Q2 I need to point at any number and show them exactly which source records it came from. Every metric on the dashboard should be drillable — click on a number and see the underlying records.

I can't stress this enough. The reason we're in this mess is because nobody could trace Marcus's numbers back to source data. Never again.

---

## Things You Should Know

### The Legacy System Dates

The legacy system from the Meridian acquisition uses a different date format. I think it's DD/MM/YYYY but honestly Marcus might have changed it at some point. Just be careful with the dates — there was an incident last quarter where someone read 03/04/2024 as March 4th when it was actually April 3rd and it threw off a whole month's revenue.

### Multi-Year Deals

Some of our deals are multi-year. The CRM shows the total contract value but I need the annual number. Except... some of those multi-year deals have price escalators, so you can't just divide by the number of years. Check the opportunity notes in Salesforce — the escalation terms are usually in there. If you can't find the escalation details, just divide evenly and flag it as an assumption. That's fine for now.

### Channel Partner Deals

We have about 25 channel partner deals. The CRM shows the gross amount but we only recognize net of the partner's margin. Check partner_deals.csv for the margins. Some partners get 20%, some get 30%, and I think there's one with a custom 15% arrangement. The CRM doesn't account for this at all — it just shows the gross number.

### Currency

Currency is mostly USD but we've got some EUR and GBP customers. Use the rate on the transaction date, not today's rate. This matters especially around year-end — the euro moved a lot in Q4 2024. There should be an FX rate table in the data somewhere.

### The Pipeline

While you're in the CRM data, can you also flag any deals that look suspicious? Like deals that have been sitting in "Negotiation" for 6+ months, or deals that the CRM says closed-won but we never got a payment for. Marcus used to include "verbal commits" in the pipeline — deals where a customer said yes on a call but hadn't actually signed anything. I want those flagged separately.

---

## P.S.

One more thing. Peterson (the board chair) always asks "which customers are we about to lose?" and I never have a good answer. If you can build some kind of health score using the product usage data and support tickets, that would be huge. Not saying it has to be perfect, but something defensible that I can point to. Even a simple model that combines 3-4 signals would be better than what we have now, which is nothing.

I was thinking something like:
- Product usage trending down = bad sign
- Multiple support tickets recently = bad sign
- NPS score below 7 = bad sign
- Late or failed payments = bad sign

Weight those however makes sense. If a customer hits 3 out of 4, flag them as at-risk. Or do something more sophisticated if you have time. I just need SOMETHING.

## P.P.S.

I've been told our marketing attribution is a mess. Apparently multiple channels are taking credit for the same deals — like a customer who came in through a Google ad, then attended a webinar, then got called by an SDR, and somehow all three channels are claiming the full deal value. I don't need you to solve this entirely, but if the CAC numbers look weird, that's probably why. Just flag it and use your best judgment. Maybe do first-touch attribution? Or split it evenly? I honestly don't know what the right answer is. Just pick something defensible and document it.

## P.P.P.S.

Sorry, one more. I realized I said "recognized revenue" up in section 1 but what I really need is just a clean ARR view. We're not doing full revenue recognition (ASC 606) right now — that's a project for next quarter with the new controller. For the board meeting, ARR is the number that matters. But I DO want to flag any revenue that might have recognition timing issues — like payments received for services not yet delivered, or annual prepayments that Marcus was booking as monthly revenue. Just flag them. Don't try to do full rev rec.
