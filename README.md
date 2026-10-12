# LoanLens India — Personal Loan Eligibility Rules & Rule-Based Model

> **"Will I get a personal loan, and from whom?"**
> A public-source dataset of personal-loan eligibility rules for 20 Indian lenders, plus a transparent, rule-based (no machine learning) model that screens one salaried applicant's profile against all of them and explains exactly why.

**Live app:** open `webui/index.html` (no install) or run `python app.py`. **Results:** [`tests/test_results.md`](tests/test_results.md) · **Insights:** [`docs/insights.md`](docs/insights.md)

**Important:** this project gives an **indicative screening against publicly published rules**. It is **not** a bank approval, a loan offer, an approval probability or a personalised interest rate. Banks apply internal underwriting that is not public.

---

## Contents

1. [The problem](#1-the-problem)
2. [Scope](#2-scope)
3. [How the 20 lenders were chosen](#3-how-the-20-lenders-were-chosen)
4. [Approach](#4-approach)
5. [How rules that aren't listed were found](#5-how-rules-that-arent-listed-were-found)
6. [Input variables (datapoint set)](#6-input-variables-datapoint-set)
7. [Lender rule table](#7-lender-rule-table)
8. [The model](#8-the-model)
9. [Test profiles and outputs](#9-test-profiles-and-outputs)
10. [Assumptions](#10-assumptions)
11. [Insights](#11-insights)
12. [Limits and what's next](#12-limits-and-whats-next)
13. [Repository structure](#13-repository-structure)
14. [How to run](#14-how-to-run)

---

## 1. The problem

Banks don't publish their full personal-loan eligibility rules. They publish some (minimum age, a salary floor, maybe a CIBIL cut-off). The rest hides in eligibility calculators, FAQs, product terms, rate pages and comparison sites.

The job here was to find the rules that actually decide eligibility, turn them into clean datapoints, and build a model that takes **one person's profile and returns a decision** — eligible or not, who would approve, how much, at what rate, and why.

## 2. Scope

| Requirement | What was done |
|---|---|
| Personal loans only | Only personal-loan products are modelled; other loan types are excluded. |
| Top 20 lenders, with an explained choice | 20 lenders across public banks, private banks, NBFCs and fintechs. See [section 3](#3-how-the-20-lenders-were-chosen). |
| Public sources only | Only public web pages — bank sites, rate pages, FAQs, calculators. No customer data, no logins. |
| Current rules, with the date read | Every rule carries the date it was read (**11–12 Oct 2026**); fees and rate tables were added on 12 Oct. |
| Salaried applicants | This version covers salaried applicants; self-employed income and documentation rules are different and are flagged as a next step rather than guessed at. |

## 3. How the 20 lenders were chosen

The goal was a lender set that **represents how India actually borrows personal loans** — not just the biggest or the easiest-to-research names. Personal loan supply in India splits across four kinds of lender, each behaving differently on price, speed and strictness, so the 20 are built as a **deliberate cross-section**, weighted toward where the market is deepest:

| Segment | Count | Why this weighting |
|---|---:|---|
| Private banks | 8 | The largest and most competitive segment of the branded personal-loan market — HDFC, ICICI, Axis, Kotak and peers, who between them drive most branded personal-loan volume. |
| Public-sector banks | 5 | Lower headline rates and the deepest salaried-customer base in the country (SBI, PNB and peers), representing the government/PSU-heavy segment of the salaried workforce. |
| NBFCs | 5 | Faster, more flexible underwriting and a bigger appetite for thinner-file or non-metro applicants — a segment that has grown fast in India's personal loan market. |
| Fintech platforms | 2 | Digital-first, app-based lending for smaller tickets and younger/thin-file borrowers — a segment barely a few years old but growing quickly. |

Within each segment, lenders were shortlisted by:
1. A personal loan product clearly open to salaried applicants.
2. Real public eligibility material — a product page, rate page, FAQ or calculator — so every rule used can be sourced and dated.
3. Recognisability, so the set reads as a believable slice of where a salaried Indian applicant would actually apply.

This is a **judgement-based shortlist representing the market's structure, not a verified ranking by RBI loan-book size** — that ranking data isn't public at lender level, and building it properly is listed under [next steps](#12-limits-and-whats-next).

| Lender | Segment | Product modelled |
|---|---|---|
| HDFC Bank | Private bank | Personal Loan |
| ICICI Bank | Private bank | Personal Loan |
| Axis Bank | Private bank | Personal Loan |
| Kotak Mahindra Bank | Private bank | Personal Loan |
| IDFC FIRST Bank | Private bank | FIRSTmoney Personal Loan |
| IndusInd Bank | Private bank | Personal Loan |
| YES BANK | Private bank | Personal Loan |
| Federal Bank | Private bank | FedPremia Personal Loan |
| State Bank of India | Public bank | Xpress Credit / Real-Time Xpress Credit |
| Punjab National Bank | Public bank | PNB Personal Loan (salaried) |
| Indian Bank | Public bank | IB Clean Loan (Salaried) |
| Union Bank of India | Public bank | Union Personal (Salaried) |
| L&T Finance | NBFC | Personal Loan |
| Bajaj Finance | NBFC | Personal Loan (Term / Flexi) |
| Tata Capital | NBFC | Personal Loan |
| Poonawalla Fincorp | NBFC | Personal Loan |
| Aditya Birla Capital | NBFC | Personal Loan |
| Moneyview | Fintech platform | Personal Loan |
| KreditBee | Fintech platform | Personal Loan |
| Fibe (EarlySalary) | Fintech platform | Personal Loan |

Moneyview, KreditBee and Fibe are platforms that route to partner lenders, so their numbers describe the platform's published range rather than one balance sheet.

## 4. Approach

```
Lender websites,      lender_rules_long.csv        lender_rules_matrix.csv      src/eligibility.py               result per applicant
calculators,    ──►   368 rules, each with    ──►  one row per lender      ──►  gates → price → size → cost  ──►  who approves, how much,
fee schedules,        source type, URL, date       + estimate_bounds.csv        → confidence → rank              true cost, best option + why,
rate PDFs             and how it was derived       + rate_tiers.csv             → path to yes → uncertainty      path to yes, uncertainty range
                                                   + assumptions.csv
```

1. **Research** each lender on its own product pages, fee schedules, rate PDFs, FAQs and calculators. A value found only on a comparison site is kept but labelled a peer estimate.
2. **Record every rule as a row** with its value, unit, **source type**, **source URL**, **date read** and how it was derived.
3. **Never fill a gap silently.** Every rule is one of three types:

   | Source type | Rules | Meaning |
   |---|---:|---|
   | `official_published` | 265 | On the lender's own page, PDF, fee schedule or FAQ |
   | `calculator_derived` | 9 | Reverse-engineered from the lender's own public calculator |
   | `peer_estimate` | 94 | Not published by the lender: from comparable lenders or a third-party page, flagged everywhere it affects a result |

   On 12 Oct, 33 rules that had been labelled "official" while their own notes said "copied from a classmate's repo, not verified" were relabelled as peer estimates. A test now fails if that ever happens again.
4. **Build a deterministic rule engine.** There is no ML because there is no approval data to train on.
5. **Measure the uncertainty** that the estimates create, rather than hiding it (section 8.7).
6. **Test it:** 19 profiles with expected outcomes, 54 unit tests, and a parity test that runs the Python and browser engines on 415 profiles.
7. **Simulate 10,000 applicants** to turn insights into numbers (section 11).

## 5. How rules that aren't listed were found

| Where it was found | What it revealed |
|---|---|
| **Eligibility calculators** | FOIR and salary-multiple logic that no lender states. The calculator was run at many inputs: loan ÷ income gives the multiple, and the point where the loan drops to zero gives the cut-off. Axis's tiered rule (15× income while EMIs are under 60% of income, 10× at 60–70%, nothing above 70%) came out exactly this way. |
| **Rate PDFs** | Union Bank's retail rate PDF (w.e.f. 08.10.2026) publishes its full CIBIL pricing table: 6 bands, plus a separate table for government employees (SRLGE) that depends on whether the salary account is with Union. PNB publishes the same kind of table. |
| **Fee schedules** | Processing fees with minimums, maximums, GST treatment and waivers: HDFC's flat ₹6,500 cap, SBI's 50% waiver for government staff and CIBIL ≥ 800, Indian Bank's nil fee for government/PSU, PNB's documentation fee, Union's nil fee for SRLGE. |
| **Realised-pricing disclosures** | HDFC publishes the rates it actually charged in Apr–Jun 2026 (avg 10.89%), which is used to validate the pricing model. |
| **Lender articles** | Aditya Birla's own FOIR article ("ideal FOIR is usually below 40%") is used as the strict bound for its estimated FOIR. |
| **Comparable lenders** (last resort) | A value no lender page states, filled from comparable lenders, flagged `peer_estimate` and given a strict and lenient bound. |

Claims from AI summaries were checked against the bank's own page before being used. One was wrong: a summary gave Aditya Birla's fee as 4%, but its own page says up to 2.5%. See `docs/research_log.md`.

## 6. Input variables (datapoint set)

`data/variables.csv` lists every input with **name, unit, type, description, where the value comes from (applicant, bureau or document), whether it is required, and which rules use it.**

| Variable | Unit | Description | Source |
|---|---|---|---|
| `age` | years | Completed age; age at maturity = age + tenure/12 | applicant / document |
| `citizenship` | enum | Indian resident or not | applicant |
| `employment_type` | enum | `salaried` (scope); anything else returns "out of scope" | applicant |
| `employer_category` | enum | govt / psu / defence / mnc / listed / public_ltd / pvt_ltd / small_unlisted | document |
| `net_monthly_income` | INR/month | Take-home salary | document |
| `gross_monthly_income` | INR/month | Optional; else net ÷ 0.8 (A01) where a lender's multiple uses gross | document |
| `work_experience_total` | months | Total experience | document |
| `months_in_current_job` | months | With the current employer | document |
| `cibil_score` | 300–900 | Blank or −1 = no credit history | bureau |
| `existing_emi_total` | INR/month | Existing EMIs | bureau |
| `credit_card_outstanding` | INR | Card balances; 5% counts as a monthly obligation (A03) | bureau |
| `salary_account_banks` | list | Lenders where the salary account is held | document |
| `salary_credited_via_bank` | boolean | Cash salary is rejected everywhere | document |
| `requested_amount` | INR | Amount wanted | applicant |
| `requested_tenure` | months | Preferred tenure | applicant |

## 7. Lender rule table

| File | What it holds |
|---|---|
| `data/lender_rules_long.csv` | **Source of truth.** 368 rows, one per lender × rule: value, unit, operator, source type, source URL, date read, confidence, estimate flag, evidence |
| `data/lender_rules_matrix.csv` | Model-ready view, one row per lender (built by `scripts/long_to_matrix.py`) |
| `data/rate_tiers.csv` | Published CIBIL rate tables: PNB and Union (private, plus government with and without a Union salary account) |
| `data/estimate_bounds.csv` | A strict and lenient value for each of the 69 estimated numeric cells (built by `scripts/build_estimate_bounds.py`) |
| `data/assumptions.csv` | Every number the model uses that is not a lender rule (A01–A11), each with its reason |

## 8. The model

**Type:** deterministic and rule-based, with **no ML**. The code is in `src/eligibility.py`. It is ported line for line to `webui/eligibility.js`, and `tests/test_parity.py` proves the two agree.

For each applicant × lender:

1. **Gates.** Residency, salary credited to a bank, employer type, age (minimum, maximum, and enough months before the age limit), income floor (lower for account holders at Axis/Kotak), CIBIL, experience, job tenure, and the salary-account rule (mandatory at SBI).
2. **Price.**
   - A lender with a published CIBIL table (PNB, Union) uses it directly.
   - Every other lender uses a **band template** (A04): the shape of Union's published table, normalised, laid between that lender's published minimum and maximum rate. For example, 750–799 sits 9% of the way up and 700–749 sits 24%.
   - *Validation:* for CIBIL 750+ the model's median HDFC rate is **11.25%**, and HDFC's published actual average for Apr–Jun 2026 is **10.89%**. The old straight-line method put a 760 score at about 17%.
3. **Size.** Loan = min(FOIR capacity, salary multiple, lender cap). FOIR capacity is the loan whose EMI fits under the cap after existing EMIs and 5% of card balances. Axis uses its calculator's tiered rule, scaled to the tenure when age forces a short loan (A11).
4. **Cost.** Processing fee as a percentage with its minimum and maximum, or HDFC's flat cap. Then waivers (government/PSU/defence, CIBIL 800+), PNB's documentation fee, and 18% GST unless the lender says GST is included. The model reports the **fee, total interest, total cost and APR**: the rate at which the EMIs repay what actually reaches you.
5. **Confidence.** How much room the applicant has on each rule (A05–A08): CIBIL within 20 points of the cut-off, EMIs within 5% of the FOIR cap, income within 10% of the floor, or job tenure within 3 months of the minimum.
   - **strong:** no tight rules
   - **borderline:** one tight rule
   - **risky:** two or more tight rules
6. **Rank.** The best option has the **lowest APR** among lenders that can fund the request, plus 0.25 points per estimated deciding rule (A09). That way a cheap answer built on guesswork doesn't automatically beat a verified one. The explanation names the runner-up and why it lost, either "lower headline rate but higher true cost" or "rests on estimated data".
7. **Uncertainty.** The whole run is repeated with every peer-estimated value at its **strict** and its **lenient** bound. The output gives a range (e.g. "5–19 lenders approve") and marks each approval **robust** (survives the strict case) or **data-sensitive**.
8. **Path to yes.** For every rejection the model works out the smallest change that would fix it: CIBIL target, EMI cut (rounded up to ₹500), months to wait, income needed, or a salary account. It then **re-runs the model with each change** to count the lenders it actually unlocks. A test checks every suggestion really flips its lenders.

**Traffic light (🔴🟡🟢).** This is a summary of the result, not an approval probability.

| Colour | Condition |
|---|---|
| 🔴 Not eligible | No lender approves (the output still gives the closest misses and a path to yes) |
| 🟡 Eligible, with caveats | Any of: the best lender can't fund the full amount, the best option is borderline or risky, the best option is data-sensitive, or fewer than 30% of lenders approve |
| 🟢 Strong match | None of the above |

## 9. Test profiles and outputs

`tests/test_profiles.json` has **19 profiles**, each with an **expected outcome** (eligible, number of approvals, colour, best lender) that `tests/test_model.py` asserts. Full outputs are in [`tests/test_results.md`](tests/test_results.md), regenerated by `python src/eligibility.py`; a test fails if the committed file is out of date.

| Profile | | Approve | Range* | Best option | Top path to yes |
|---|---|---|---|---|---|
| P01 Typical private-sector employee | 🟢 | 18/20 | 17–18 | Indian Bank (APR 10.21%, strong, ₹5L, 60m) | SBI salary account (+1) |
| P02 Same, holds an SBI salary account | 🟢 | 19/20 | 18–19 | Indian Bank (APR 10.21%, strong) | Wait 6 months in job (+1) |
| P03 EDGE low CIBIL (610) | 🔴 | 0/20 | 0–0 | – | Raise CIBIL to 750 (+19) |
| P04 EDGE high existing EMI (68% of income) | 🟡 | 6/20 | 5–19 | Indian Bank (APR 10.08%, borderline) | Cut EMIs by ₹15,500 (+13) |
| P05 EDGE new job (3 months) | 🟡 | 12/20 | 10–13 | Indian Bank (APR 10.15%, strong) | Wait 33 months (+5) |
| P06 EDGE age near limit (57, govt) | 🟡 | 16/20 | 13–16 | Union (APR 9.55%, borderline, 24m) | – |
| P07 EDGE age 59, wants ₹20L | 🟡 | 9/20 | 9–13 | Bajaj (APR 11.11%; lends to age 80 at maturity) | SBI salary account (+1) |
| P08 EDGE too young (20, fresher) | 🟡 | 2/20 | 1–3 | Union (APR 10.11%, borderline) | Wait 12 months (+1) |
| P09 EDGE no credit history | 🟡 | 3/20 | 3–3 | Union (APR 10.11%, borderline) | Build history to CIBIL 750 (+15) |
| P10 EDGE income ₹18k | 🟡 | 4/20 | 1–4 | Indian Bank (APR 10.15%) | Salary ₹30k (+11) |
| P11 Axis account holder, ₹20k | 🟡 | 9/20 | 4–10 | Indian Bank (APR 10.15%) | Salary ₹30k (+7) |
| P12 Same ₹20k, no Axis account | 🟡 | 8/20 | 4–9 | Indian Bank (APR 10.15%) | Salary ₹30k (+8) |
| P13 High earner, ₹3L/month, wants ₹40L | 🟢 | 19/20 | 19–19 | Axis (APR 9.51%, strong, ₹40L) | SBI salary account (+1) |
| P14 EDGE CIBIL 700, EMIs 62% | 🟡 | 8/20 | 1–12 | Indian Bank (APR 10.15%, borderline) | Cut EMIs by ₹9,500 (+4) |
| P15 EDGE small unlisted employer | 🟢 | 9/20 | 9–9 | Union (APR 10.61%, strong) | Raise CIBIL to 750 (+2) |
| P16 EDGE self-employed | 🔴 | – | – | Out of scope (salaried only) | – |
| P17 EDGE no EMIs but ₹4L card balance | 🟡 | 17/20 | 13–17 | Indian Bank (APR 10.28%) | Raise CIBIL to 750 (+2) |
| P18 EDGE borderline CIBIL 705 | 🟡 | 12/20 | 9–12 | Indian Bank (APR 10.40%, borderline) | Raise CIBIL to 750 (+6) |
| P19 Government employee, CIBIL 810 | 🟢 | 19/20 | 19–19 | Axis (APR 9.77%, strong) | – |

\* Lenders approving with every peer estimate at its strict … lenient bound.

Pairs that isolate one effect: P01 vs P02 (SBI account), P11 vs P12 (Axis account lowers the income floor), P17 (card balance vs clean profile).

## 10. Assumptions

Every number that is not a lender rule lives in `data/assumptions.csv` and is shown in the app's Method page.

| ID | Assumption | Value |
|---|---|---|
| A01 | Gross income when not given | net ÷ 0.8 |
| A02 | GST on fees, unless the lender says it's included | 18% |
| A03 | Monthly obligation from card balances | 5% of outstanding |
| A04 | Rate band template for lenders without a CIBIL table | Union's published band shape |
| A05–A08 | Borderline margins | 20 CIBIL points · 5% of income under the FOIR cap · 10% above the income floor · 3 months above a tenure minimum |
| A09 | Ranking penalty per estimated deciding rule | 0.25 APR points |
| A10 | Synthetic population for insights | see `scripts/simulate.py` |
| A11 | Tenure behind Axis's calculator multiple | 60 months |

Also assumed:
- No credit history is accepted only where the lender says so (PNB, Union, Fibe).
- Union's minimum CIBIL is set at 650 because its table prices down to the 650–679 band; it also lists a "below 650" band.
- The date read is not the date a rule took effect, and rules may have changed since.

## 11. Insights

From `python scripts/simulate.py`, which runs **10,000 synthetic salaried applicants** (full tables in [`docs/insights.md`](docs/insights.md)). The population is assumed, not real, so read these as how the rules behave, not as real approval rates.

1. **Credit score is the rule that rejects the most applicants.** It fails **34%** of all applicant × lender checks and is the main blocker for **70%** of applicants nobody approves. Income comes next (22% of checks, main blocker for 29%).
2. **A better score is the most valuable change.** +50 CIBIL points unlock **3.95 more lenders** on average for applicants scoring 650–749.
3. **Lender types differ sharply.** Fintechs approve **65%** of applicants on average, NBFCs **44%**, public banks **40%** and private banks **31%**. Fintechs are also the most expensive (median APR around 18–23% against 10–12% at the cheapest banks).
4. **Fees change the answer.** For **6%** of applicants the lender with the lowest headline rate is not the cheapest once fees are counted, and choosing by rate would cost a median **₹1,187** more. HDFC's flat ₹6,500 cap makes it relatively cheaper on large loans, while 5% fees (Kotak, Tata) make them dearer.
5. **Where your salary is credited matters.**
   - SBI lends only to its salary-account holders: opening one turns SBI from no to yes for **47%** of applicants who don't have one.
   - Axis and Kotak lower their income floor for account holders (P11 vs P12).
   - Union charges government employees slightly less when their salary account is with Union.
6. **Unpublished FOIR caps and salary multiples are the biggest unknown.** Moving every estimate from strict to lenient takes the average applicant from **6.6 to 9.6** approvals, and the answer changes for **76%** of applicants. This is the single most valuable thing to research next.
7. **The band template matches real pricing.** It predicts 11.25% for HDFC at CIBIL 750+ against HDFC's published actual average of 10.89%. Linear interpolation would have said about 17%.
8. **Age limits are wider than they look.** Bajaj lends until age 80 at maturity, so it is the best option for a 59-year-old (P07), while most banks stop at 58–60.
9. **Most approvals are not comfortable.** Only **56%** are graded strong; 37% are borderline and 7% risky, usually through a CIBIL score just above a cut-off or EMIs close to the FOIR cap.

## 12. Limits and what's next

**Limits**
- The 20 lenders are a **representative shortlist by market segment**, not a verified top 20 by loan book, which isn't public at lender level.
- **94 rules are peer estimates**, mostly FOIR caps and salary multiples that no lender publishes. Their effect is measured (section 8.7) but not removed.
- Pricing for 18 lenders comes from a template (A04); only PNB and Union publish real tables. Rates also depend on income, employer and loan size, which the template ignores.
- Moneyview publishes only a minimum fee ("starts at 2%"), so its true cost may be understated.
- Not modelled: self-employed applicants, city-specific income floors, pre-approved offers, foreclosure costs, enquiry counts and repayment history beyond the score.
- The simulated population is assumed, so the insights describe the rules, not the market.

**What's next**
1. Replace the estimated FOIR caps and multiples by running more lender calculators (HDFC, ICICI and IDFC have the biggest effect).
2. Add published CIBIL tables as more banks release them; each one replaces template pricing.
3. Add self-employed rules (ITR-based income and business vintage).
4. Calibrate the simulated population to bureau statistics.
5. Back-test against real decisions if anonymised outcome data becomes available.

## 13. Repository structure

```
.
├── README.md
├── app.py                         ← serves the web app + POST /api/evaluate (Python model)
├── data/
│   ├── variables.csv              ← input datapoint dictionary
│   ├── lender_rules_long.csv      ← SOURCE OF TRUTH: 368 rules with source type, URL, date, evidence
│   ├── lender_rules_matrix.csv    ← model-ready, one row per lender (generated)
│   ├── rate_tiers.csv             ← published CIBIL rate tables (PNB, Union)
│   ├── estimate_bounds.csv        ← strict/lenient value for every estimate (generated)
│   └── assumptions.csv            ← A01–A11
├── src/eligibility.py             ← the model
├── scripts/
│   ├── build_all.py               ← rebuilds everything below in order
│   ├── long_to_matrix.py
│   ├── build_estimate_bounds.py
│   ├── simulate.py                ← 10,000-applicant insights → docs/insights.{md,json}
│   └── export_ui_data.py          ← data → webui/data.js
├── webui/                         ← the app: index.html, style.css, app.js, eligibility.js (JS port), data.js (generated)
├── tests/
│   ├── test_profiles.json         ← 19 profiles with expected outcomes
│   ├── test_results.md            ← full outputs (generated)
│   ├── test_model.py              ← 54 unit tests
│   ├── test_parity.py             ← Python vs browser engine on 415 profiles
│   └── parity_runner.js
└── docs/
    ├── research_log.md            ← research notes, calculator runs, every data decision
    ├── insights.md / insights.json
```

## 14. How to run

**No install:** open `webui/index.html` in a browser. The model, data, sample profiles and insights are all bundled.

**With Python 3.9+ (standard library only),** from the repo folder:

```bash
python src/eligibility.py              # run the 19 test profiles → tests/test_results.md
python -m unittest discover -s tests   # 55 tests (the parity test needs Node.js; it is skipped without it)
python scripts/simulate.py             # 10,000-applicant insights
python app.py                          # web app at http://localhost:8000 (python app.py 8080 if busy)
python scripts/build_all.py            # after editing data/lender_rules_long.csv: rebuild everything
```

Use the model from code:

```python
import sys; sys.path.insert(0, "src")
import eligibility as E
r = E.run({"age": 30, "employer_category": "pvt_ltd", "net_monthly_income": 60000, "existing_emi_total": 5000,
           "credit_card_outstanding": 0, "cibil_score": 760, "work_experience_total": 60, "months_in_current_job": 24,
           "salary_account_banks": ["sbi"], "requested_amount": 500000, "requested_tenure": 60})
print(r["reason"]); print(r["best_explanation"])
print(r["uncertainty"]["approvals"]); print([p["text"] for p in r["path_to_yes"]])
```

| Problem | Fix |
|---|---|
| `python` not recognised | Use `python3`, or `py` on Windows |
| Page looks unstyled | Keep all files in `webui/` together; fonts load from Google Fonts and fall back to system fonts offline |
| Data changes don't appear | `python scripts/build_all.py` |
