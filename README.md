# Rulebook India

**Which of 20 Indian lenders would give you a personal loan — and what would it actually cost?**

🔗 **[Live app](https://sheljasolanki.github.io/Loan-Eligibility-Model/)** — runs entirely in your browser, nothing is sent anywhere

[One applicant, start to finish](#one-applicant-start-to-finish) · [The problem](#the-problem) · [The dataset](#the-dataset) · [The engine](#the-engine) · [How it is tested](#how-it-is-tested) · [What 10,000 applicants reveal](#what-10000-applicants-reveal) · [Where this falls short](#where-this-falls-short) · [Reference](#reference)

Rulebook screens one salaried applicant against the published lending rules of 20 Indian banks, NBFCs and fintech platforms. It returns who would approve, how much, at what true cost, the reason behind every rejection, and the single change that would unlock the most lenders. Every rule it uses is traced to the lender's own page and carries the date it was read. There is no machine learning, and the reason for that is [set out below](#why-there-is-no-machine-learning).

> **This is a screening against published rules, not a lending decision.** It is not a bank approval, a loan offer, an approval probability, or a personalised interest rate. Banks apply internal underwriting that nobody publishes.

---

## One applicant, start to finish

Rather than describe the output, here is a real one. This is the live engine, not an illustration.

**In:** age 30 · private company · ₹60,000 take-home · ₹8,000 existing EMIs · no card balance · CIBIL 760 · 5 years' experience, 2 in current job · no special salary account · wants ₹5,00,000 over 60 months

**Out:** 🟢 **Strong match — 18 of 20 lenders approve.**

| | Best option: Indian Bank |
|---|---|
| Rate | 9.70% — band template over its published 9.65–10.15% range |
| **True cost (APR)** | **10.21%** |
| EMI | ₹10,550 × 60 months |
| Upfront fee | ₹5,900 — 1% of loan, capped at ₹10,000, plus 18% GST |
| Total cost | ₹1,38,892 |
| Could lend up to | ₹15,00,000 — **limited by its salary multiple**, not FOIR |
| Confidence | strong — no rule is close to its cut-off |
| If the estimates move | 17–18 lenders still approve; largest loan ₹16.7L–₹18.75L |

The engine also explains what it *didn't* pick, in words:

> *Union Bank of India looks cheaper (APR 10.11%) but rests on less-verified data (foir_cap, min_income, multiple).*

Union genuinely prices lower. It loses because three of the rules that got it there are values Union does not publish, and the ranking charges 0.25 APR points for each unpublished deciding rule. A cheap answer built on guesswork should not quietly beat a dearer one built on printed facts.

And for the two rejections, it says what would fix them: *hold a salary account with State Bank of India (+1 lender)*, or *wait 12 more months in your job (+1)*.

Full output for 19 profiles: [`tests/test_results.md`](tests/test_results.md).

## The problem

You cannot find out who would lend to you without applying, and applying leaves a footprint on your credit file. Several applications in quick succession make you look distressed, which makes the next lender likelier to refuse. So the one question worth answering before you apply — *who would say yes, and what would it cost?* — has no honest answer available anywhere.

Lenders publish a slice of their criteria. A product page gives you a minimum age and perhaps a salary floor. What it withholds is the part that decides the outcome:

- The **FOIR ceiling**, which sets how much you can borrow. Not one of the 20 publishes it.
- The **salary multiple** — how many times your monthly pay they will lend. Also unpublished.
- The **interest rate for your specific credit score**. Only two of the 20 publish a real table.

So the work split three ways: read what 20 lenders actually publish and turn it into comparable numbers; keep an auditable record of where every number came from and refuse to let an estimate pass as a fact; and build something that runs one profile against all 20 rule sets and shows its reasoning.

The engineering was the small part. The real question was what to do about rules that do not exist in public — and the answer shaped everything else.

**Scope.** Personal loans only. Salaried applicants only; self-employed assessment runs on income tax returns and business vintage, which is a different system rather than a variation on this one, so the model returns an explicit *out of scope* instead of a guess. Public sources only — no logins, no customer data. Rules were read on **11–12 October 2026**, and every rule carries that date.

## The dataset

One hand-maintained file, [`data/lender_rules_long.csv`](data/lender_rules_long.csv), holds **368 rules** — one row per lender per rule. Each row carries the value, its unit, the comparison operator, the source type, the source URL, the date read, and a note on how it was derived.

One fact per row rather than one lender per row is a deliberate choice: a row can then carry its own provenance. Flattened to one row per lender, there is nowhere to record that the age limit came off the product page while the fee came from a separate PDF read on a different day.

### Three labels, and only one of them means the bank said so

| Label | Meaning | Rules |
|---|---|---:|
| `official_published` | Printed on the lender's **own** page, PDF, fee schedule or FAQ | **273** |
| `calculator_derived` | Recovered by running the lender's **own** public calculator | **10** |
| `peer_estimate` | Not published by that lender — taken from comparable lenders or a third party | **85** |

The rule that gives this teeth: **only a lender's own website counts as official.** A figure on an aggregator is a peer estimate however precise it looks, because nobody at the bank stands behind it.

This was enforced the hard way. Part way through, 33 rules were found labelled official while their own evidence notes read *copied from a classmate's repo, not verified*. All 33 were relabelled, and **a test now fails the build if a rule ever claims to be official while its own note says otherwise.**

Those 33 still carried genuine lender URLs, so each page was then opened and read. Eight values turned out to be published after all and were promoted back. One came from the lender's own EMI calculator. One of the eight was simply wrong: Union Bank's page states a maximum tenure of **84 months**, not the 60 that had been inherited — and correcting it changed a real result, making Union the best option for the government-employee profile instead of Axis. For every rule still marked as an estimate, the note now records **which page was checked and that the value is not on it**, so a URL beside an unpublished number can never be mistaken for its source.

### Recovering the rules nobody prints

No lender publishes its FOIR cap. Three expose a public eligibility calculator — which *must* contain the hidden rule in order to return an answer. So the rule can be recovered by running the calculator across many inputs and watching where the output moves.

**Axis Bank.** Income held at ₹1,04,000, obligations varied:

| Existing EMIs | % of income | Offered |
|---:|---:|---:|
| ₹56,000 | 53.8% | ₹15,00,000 |
| ₹62,234 | **59.8%** | ₹15,00,000 |
| ₹62,943 | **60.5%** | ₹10,40,000 |
| ₹70,745 | 68.0% | ₹10,40,000 |
| ₹72,872 | **70.1%** | ₹0 |

Two cliffs, each pinned to within 0.7 of a percentage point. A second sweep at zero obligations gave the multiple exactly: ₹30,000 → ₹4,50,000 and ₹60,000 → ₹9,00,000, both 15×. **Recovered rule:** 15× income while obligations are at or below 60%, 10× between 60% and 70%, declined at 70% and above. Stored as `calculator_derived` because it was measured, not assumed. A conflict was recorded rather than resolved: the calculator ceiling is ₹15 lakh while the product page advertises ₹50 lakh.

**Kotak.** The pattern resolves cleanly to `20 × (income − obligations)`, and tenure makes no difference at all. But an applicant paying 99% of salary in EMIs still receives an offer, so the calculator applies **no FOIR cap whatsoever** — at short tenures it returned an EMI larger than the applicant's salary. The multiple is therefore stored as calculator-derived, while a FOIR cap of 0.55 is applied over it as a flagged estimate acting as a prudential check, with a note that the calculator is more generous than real underwriting.

**Bajaj.** Perfectly even steps, so a linear fit: `min(10 × income, 47.0653 × (0.75 × income − expenses))`. That coefficient is not arbitrary — 47.0653 is the present-value factor for 10% a year over 60 months, which means Bajaj assumes a 75% FOIR cap and annuitises the remainder at 10% over five years.

Other hiding places that yielded rules: **rate PDFs** (Union's full CIBIL table, with a separate schedule for government staff that depends on where the salary account sits; PNB publishes the same kind of table), **fee schedules** (HDFC's flat ₹6,500 cap, SBI's 50% waiver for government staff and for scores of 800+, Indian Bank's nil fee for government and PSU employees, PNB's documentation fee), **realised-pricing disclosures** (HDFC publishes the rates it actually charged in Apr–Jun 2026, averaging 10.89% — used to validate the pricing model), and **a lender's own article** (Aditya Birla's "the ideal FOIR is usually below 40%", used as the strict bound for its estimated FOIR).

Claims from AI summaries were checked against the bank's page before use. One was wrong — a summary gave Aditya Birla's fee as 4%, where its own page says up to 2.5%. The trail is in [`docs/research_log.md`](docs/research_log.md).

### The twenty, and why these twenty

Not the 20 largest — a deliberate cross-section of how India actually borrows, since a set drawn only from big private banks would describe one slice of the market and generalise badly.

| Segment | Count | Why it is represented | Lenders |
|---|---:|---|---|
| Private banks | 8 | The largest and most competitive segment of the branded market | HDFC, ICICI, Axis, Kotak, IDFC FIRST, IndusInd, YES, Federal |
| Public banks | 4 | Lowest headline rates and the deepest salaried customer base | SBI, PNB, Indian Bank, Union Bank |
| NBFCs | 5 | Faster, looser underwriting and appetite for thinner files | Bajaj Finance, Tata Capital, L&T Finance, Poonawalla, Aditya Birla |
| Fintech platforms | 3 | Digital-first lending for smaller tickets and younger borrowers | Moneyview, KreditBee, Fibe |

Within each segment the shortlist required a personal-loan product clearly open to salaried applicants, real public eligibility material so every rule could be sourced and dated, and enough recognisability that the set reads as where a salaried Indian applicant would plausibly apply.

**Stated plainly: this is a judgement-based shortlist representing the market's structure, not a verified ranking by loan-book size.** That ranking is not public at lender level in India. Building one properly is [listed as next work](#what-id-build-next). Moneyview, KreditBee and Fibe route to partner lenders, so their figures describe a platform's published range rather than one balance sheet.

### What it needs to know about you

[`data/variables.csv`](data/variables.csv) is the formal input dictionary — every field with its unit, type, description, whether it is required, which rules consume it, and **where the value legitimately comes from**: the applicant's own statement, a credit bureau report, or a document that would be verified.

| Field | Unit | Notes | From |
|---|---|---|---|
| `age` | years | Age at maturity = age + tenure ÷ 12 | applicant |
| `citizenship` | enum | Indian resident required by every lender in the set | applicant |
| `employment_type` | enum | `salaried`; anything else returns out of scope | applicant |
| `employer_category` | enum | govt / psu / defence / mnc / listed / public_ltd / pvt_ltd / small_unlisted | document |
| `net_monthly_income` | ₹/month | Take-home credited to a bank | document |
| `gross_monthly_income` | ₹/month | Optional; PNB and Indian Bank size off gross. Absent → net ÷ 0.8 (A01), and the output says so | document |
| `work_experience_total` | months | Across all employers | document |
| `months_in_current_job` | months | Continuous service with the current employer | document |
| `cibil_score` | 300–900 | Blank or −1 means no credit history, never treated as zero | bureau |
| `existing_emi_total` | ₹/month | Obligations on existing loans | bureau |
| `credit_card_outstanding` | ₹ | Revolving balance; 5% counts as a monthly obligation (A03) | bureau |
| `salary_account_banks` | list | Where the salary account is held | document |
| `salary_credited_via_bank` | bool | Cash salary is refused by every lender in the set | document |
| `requested_amount` | ₹ | Optional | applicant |
| `requested_tenure` | months | Optional; capped by lender maximum and age at maturity | applicant |

### The data files

| File | Hand-edited | Holds |
|---|---|---|
| `lender_rules_long.csv` | **yes — the only one** | Source of truth: 368 rules with value, unit, source type, URL, date, evidence |
| `lender_rules_matrix.csv` | generated | The same data as one row per lender, 41 columns — the shape the engine consumes |
| `rate_tiers.csv` | yes | 23 rows: PNB's and Union's published CIBIL rate tables |
| `estimate_bounds.csv` | generated | A strict and a lenient value for each of the 69 estimated numeric cells |
| `assumptions.csv` | yes | A01–A11, each with its reasoning |
| `variables.csv` | yes | The input dictionary above |

Everything downstream of the long file is generated from it by `python scripts/build_all.py`, which runs five steps in dependency order. There is no second place to remember to update, and a test checks the generated matrix still agrees with its source.

**Why keep both a long file and a matrix?** They serve incompatible needs. One row per fact is right for provenance; all of one lender's rules in one row is right for computation. Rather than compromise either, the project keeps both and generates one from the other.

## The engine

Deterministic and rule-based. [`src/eligibility.py`](src/eligibility.py) (459 lines, standard library only) is ported line for line to [`webui/eligibility.js`](webui/eligibility.js), and a test proves the two agree.

### Eight steps

Steps 1–5 run once per lender; steps 6–8 run once across all 20.

| | Step | What happens |
|---|---|---|
| 1 | **Gates** | Residency, salary paid into a bank, employer type, age (minimum, maximum, and months remaining before the age limit), income floor (lower for account holders at Axis and Kotak), CIBIL, total experience, time in current job, salary-account requirement (mandatory at SBI). **Every** failure is collected, not just the first — otherwise step 7 would be meaningless — and each carries a machine-readable fix where one exists. |
| 2 | **Price** | PNB and Union: read the published table directly. The other 18: lay the band template (A04) across that lender's own published rate range. |
| 3 | **Size** | `min(FOIR capacity, salary multiple, lender cap)`, and the output **names which of the three bound**, because that is what tells you what to change. Axis uses its recovered tiered rule, scaled to tenure when age forces a short loan (A11). Kotak multiplies free income rather than salary. |
| 4 | **Cost** | Fee percentage with its floor and ceiling, or a flat cap; then waivers, documentation fees, and 18% GST unless the lender states it is included. Yields fee, total interest, total cost, total repayable and APR. |
| 5 | **Confidence** | How much slack remains on each rule (A05–A08) → strong, borderline or risky. |
| 6 | **Rank** | Lowest APR among lenders that can fund the request, plus 0.25 points per estimated deciding rule (A09). |
| 7 | **Path to yes** | The smallest single change that unlocks the most lenders — verified by re-running the model, not assumed. |
| 8 | **Uncertainty** | The whole run repeated with every estimate at its strict bound and at its lenient bound. |

The full design, with diagrams, is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Pricing, and the check that it is right

Only PNB and Union publish rate-by-score tables. For the other 18 there is just a range, so the question is where a given score sits inside it.

The obvious answer — a straight line across the score range — is badly wrong, and the error is instructive. Linear interpolation put a 760 score at roughly **17%** for HDFC. HDFC publishes the rates it actually charged in Apr–Jun 2026: minimum 9.97%, **average 10.89%**, maximum 24.06%. Six percentage points out, because real pricing is not linear — good scores cluster near the floor of the range and only poor scores get pushed toward the ceiling.

So the model takes the **shape** of Union's published table, the one real table available, normalises it, and lays it across each lender's own published range (A04):

| Band | Position in the lender's range |
|---|---|
| 800+ | 0% — at the published minimum |
| 750–799 | 9% |
| 700–749 | 24% |
| 680–699 | 39% |
| 650–679 | 53% |
| below 650 | 100% — at the published maximum |

**The check:** with this method the model's median HDFC rate for scores above 750 is **11.25%**, against HDFC's published actual **10.89%**. Within half a point, from a method built on a different bank's table.

### Cheapest means cheapest after fees

Ranking is by **APR**, not headline rate. Across the simulation, the lowest-rate lender is not the cheapest lender for **6%** of applicants, and choosing by rate costs them a median **₹1,187**.

APR is computed properly rather than approximated. A borrower charged 9.70% who pays a ₹5,900 fee only *receives* ₹4,94,100 while repaying as though they received ₹5,00,000. The APR is the single rate that explains those payments against the money actually advanced. There is no closed form, so it is found by binary search over 100 iterations.

On top of that sits A09: **0.25 APR points per deciding rule that is a peer estimate.** The worked example above is exactly this — Union at 10.11% scoring 10.86 against Indian Bank at 10.21% scoring 10.71. The runner-up is always named along with the reason it lost, either *lower headline rate but higher true cost* or *rests on estimated data*.

### Not every yes is a comfortable yes

Returning a bare "eligible" would hide how close a call it was, so the model measures slack against every rule the lender checks (A05–A08): a score within **20 points** of the cut-off, a new EMI leaving under **5%** of income beneath the FOIR ceiling, income within **10%** of the floor, or service within **3 months** of a minimum.

No tight rules is **strong**, one is **borderline**, two or more is **risky**. In the simulation only **56%** of approvals are strong.

These margins change the *warning*, never the decision — a judgement call should not be able to flip a factual answer.

### Saying how much is unknown

85 rules are estimates. Instead of absorbing that silently, each estimated number is given a **strict** bound (the toughest value a comparable lender publishes) and a **lenient** bound (the easiest), built by `scripts/build_estimate_bounds.py` from published peers in the same segment. The entire 20-lender run then happens twice more at those bounds.

Every result therefore carries a range — *"5–19 lenders approve"* for the high-EMI profile, against a tight *"17–18"* for the example above — and each approval is tagged **robust** if it survives the strict case or **data-sensitive** if it depends on a favourable estimate. A wide range is the model telling you its answer rests on data that does not exist.

### Path to yes

Each rejection already carries a candidate fix from step 1. These are gathered, rounded to real-world amounts (an EMI cut rounds up to the next ₹500), filtered for impossibility (you cannot cut more EMI than you hold; a score cannot exceed 900), and then **each is applied and the full model re-run** to count the lenders it genuinely unlocks.

Nothing is assumed to work. A test asserts that every suggestion the model offers really does flip the lenders it claims. For the 610-score profile that nobody approves, the answer is not "rejected" — it is *raise your score to 750 and 19 lenders open up*.

### The traffic light

| | Condition |
|---|---|
| 🔴 **Not eligible** | No lender approves — the output still gives the closest misses and a path to yes |
| 🟡 **Eligible, with caveats** | Any of: the best lender cannot fund the full amount; the best option is borderline or risky; the best option is data-sensitive; fewer than 30% of lenders approve |
| 🟢 **Strong match** | None of the above |

When it is amber, the app names which of the four conditions fired. A colour without a reason would be the same black box this project exists to avoid.

### Why there is no machine learning

**There is no training data.** Approval decisions sit inside each bank; they are not public, purchasable or scrapable. "Adding ML" could only have meant generating synthetic outcomes with rules and then training a model to predict them — taking a system that is exactly right and making it approximately right.

Rules are also the correct instrument. Banks do not run a classifier over your age; they hold a minimum and check it. And a rejected applicant is owed a reason, not a probability — "your score is 40 points short of this lender's cut-off" is the useful output, and it is traceable to a CSV row with a URL and a date in a way learned weights never are.

The quantitative work went where it added information instead: recovering hidden rules by systematic sampling and curve-fitting, a 10,000-applicant Monte Carlo simulation to find which rules actually bind, formal sensitivity analysis via the strict and lenient scenarios, and validating the pricing method against a published real-world benchmark.

## How it is tested

**55 tests, all passing.** `python -m unittest discover -s tests`. Four layers, each catching a different kind of wrong.

**Arithmetic and rules** — that `emi()` and `capacity()` are true inverses; that ₹5L at 9.80% over 60 months gives the bank-standard ₹10,574; that APR equals the rate without fees and exceeds it with them; that the recovered Axis tiers fire at exactly 60% and 70%; that Kotak never exceeds 20× free income; that every published fee structure computes correctly, including GST-inclusive lenders not being taxed twice. Two invariants are asserted across many profiles at once, and they are the most valuable tests in the file: **the approved amount never exceeds the lender's own cap**, and **the resulting EMI never breaches the FOIR ceiling.**

**Data integrity** — tests over the dataset rather than the code. Every rule has a source type, URL and date. Only the three valid labels exist. **No rule claims to be official while its own note says unverified.** Every estimated numeric cell has bounds, and those bounds bracket the base value in the right order. The generated matrix still matches the long file.

**Behaviour** — [`tests/test_profiles.json`](tests/test_profiles.json) holds 19 complete applicants, each with its expected outcome committed: eligibility, approval count, colour and winning lender. Most are deliberate edge cases, and some come in pairs that isolate a single variable — P01 vs P02 isolates the SBI salary account, P11 vs P12 the Axis account-holder income floor. A freshness test fails if the committed [`tests/test_results.md`](tests/test_results.md) no longer matches live output, so the documentation cannot quietly rot.

| Profile | | Approve | Range\* | Best option | Top path to yes |
|---|---|---|---|---|---|
| P01 Typical private-sector employee | 🟢 | 18/20 | 17–18 | Indian Bank (APR 10.21%, strong) | SBI salary account (+1) |
| P02 Same, holds an SBI salary account | 🟢 | 19/20 | 18–19 | Indian Bank (APR 10.21%, strong) | Wait 6 months in job (+1) |
| P03 Low CIBIL (610) | 🔴 | 0/20 | 0–0 | – | Raise CIBIL to 750 (+19) |
| P04 High existing EMI (68% of income) | 🟡 | 6/20 | 5–19 | Indian Bank (APR 10.08%, borderline) | Cut EMIs by ₹15,500 (+13) |
| P05 New job (3 months) | 🟡 | 12/20 | 10–13 | Indian Bank (APR 10.15%, strong) | Wait 33 months (+5) |
| P06 Age near limit (57, govt) | 🟡 | 16/20 | 13–16 | Union (APR 9.55%, borderline, 24m) | – |
| P07 Age 59, wants ₹20L | 🟡 | 9/20 | 9–12 | Bajaj (APR 11.11%; lends to age 80) | SBI salary account (+1) |
| P08 Too young (20, fresher) | 🟡 | 2/20 | 1–3 | Union (APR 9.98%, borderline) | Wait 12 months (+1) |
| P09 No credit history | 🟡 | 3/20 | 3–3 | Union (APR 9.98%, borderline) | Build history to 750 (+15) |
| P10 Income ₹18k | 🟡 | 4/20 | 1–4 | Indian Bank (APR 10.15%) | Salary ₹30k (+11) |
| P11 Axis account holder, ₹20k | 🟡 | 9/20 | 4–10 | Indian Bank (APR 10.15%) | Salary ₹30k (+7) |
| P12 Same ₹20k, no Axis account | 🟡 | 8/20 | 4–9 | Indian Bank (APR 10.15%) | Salary ₹30k (+8) |
| P13 High earner, ₹3L/mo, wants ₹40L | 🟢 | 19/20 | 19–19 | Axis (APR 9.51%, strong, ₹40L) | SBI salary account (+1) |
| P14 CIBIL 700, EMIs 62% | 🟡 | 8/20 | 1–12 | Indian Bank (APR 10.15%, borderline) | Cut EMIs by ₹9,500 (+4) |
| P15 Small unlisted employer | 🟢 | 9/20 | 9–9 | Union (APR 10.48%, strong) | Raise CIBIL to 750 (+2) |
| P16 Self-employed | 🔴 | – | – | Out of scope (salaried only) | – |
| P17 No EMIs, ₹4L card balance | 🟡 | 17/20 | 13–17 | Indian Bank (APR 10.28%) | Raise CIBIL to 750 (+2) |
| P18 Borderline CIBIL 705 | 🟡 | 12/20 | 9–12 | Indian Bank (APR 10.40%, borderline) | Raise CIBIL to 750 (+6) |
| P19 Government employee, CIBIL 810 | 🟢 | 19/20 | 19–19 | Union (APR 9.25%, strong, fee waived) | – |

\* Lenders approving with every estimate at its strict … lenient bound.

**Parity** — the web app must give byte-identical answers to the Python model. [`tests/test_parity.py`](tests/test_parity.py) runs both engines over the 19 profiles plus 400 randomly generated ones and compares every decision, amount, rate, EMI, fee, APR, binding constraint, confidence grade, rejection reason, lever and range. A Node harness loads the *actual* browser files into a sandbox, so what is tested is what ships. This is what makes static hosting defensible: without it, "two copies of the logic" would be a fair criticism.

That parity test earned its place by catching a one-rupee discrepancy. Python's built-in `round()` uses banker's rounding — `round(0.5)` is `0` — while JavaScript's `Math.round(0.5)` is `1`, so any EMI landing on an exact half-rupee diverged. The fix was to abandon Python's `round()` for a half-up `rnd()` that deliberately follows JavaScript convention, locked in by its own test. When two systems must agree, the difference that bites is never in the logic you were watching; it is in a primitive you assumed was shared.

### Two runtimes, one logic

A browser cannot run Python, and a static site has no server. The alternative was hosting a Python backend — recurring cost, an uptime dependency, cold starts on free tiers, network latency. Porting the engine to JavaScript instead buys free permanent hosting, instant results and offline operation, and it means **no applicant's salary or credit score ever leaves their device**. The cost of that choice is two implementations, and that cost was not accepted so much as relocated into a test that fails the moment they diverge.

| | Python | Browser |
|---|---|---|
| Engine | `src/eligibility.py` | `webui/eligibility.js` |
| Data | CSVs in `data/` | `webui/data.js` (generated) |
| Serves | tests, simulation, CLI, `app.py` | the deployed app |
| Rounding | `rnd()`, half-up | `Math.round` |

### The app itself

Five files in [`webui/`](webui/): `index.html` (structure), `style.css` (styling and animation), `app.js` (interface), `eligibility.js` (engine), `data.js` (generated data). No framework, no build step, no dependencies — Google Fonts is the single external request and it degrades to system fonts. `eligibility.js` knows nothing about buttons; `app.js` knows nothing about FOIR. Charts are hand-written SVG, theming runs on CSS custom properties, and animation respects `prefers-reduced-motion`.

Four pages: **Check** (a four-step form with a live EMI ring, a credit-score gauge and an animated lender scan, then results), **Lenders** (all 20 with every rule, its source link and date — the transparency claim made inspectable), **Insights** (simulation charts), **Method** (the pipeline and all 11 assumptions).

Deployment is a GitHub Actions workflow that publishes **only the `webui/` folder** as the site root. The data, scripts and tests stay in the repository for anyone auditing, without being served. `app.py` exists for local use and exposes the Python engine at `POST /api/evaluate`; it uses only the standard library and the deployed site never calls it.

## What 10,000 applicants reveal

`python scripts/simulate.py` runs **10,000 synthetic salaried applicants** against all 20 lenders — 200,000 decisions, then twice more for the bounds. Seeded (2026), so it reproduces exactly.

**Read this first.** The applicants are invented. Income is log-normal around a ₹35,000 median, scores normal around 730, 10% with no credit history. Every distribution is an assumption (A10), because no public data on real applicant populations exists. These findings describe **how the published rules behave**, not how many real people each lender approves. Full tables: [`docs/insights.md`](docs/insights.md).

**Credit score is the rule that rejects the most people, and income is second. After those two, almost nothing else matters.**

| Rule | Share of all 200,000 checks it fails | Main blocker for applicants nobody approves |
|---|---:|---:|
| Credit score | 34% | 70% |
| Income | 22% | 29% |
| Employer type | 8% | 0% |
| Salary-account rule | 4% | 0% |
| Existing EMIs | 4% | 1% |
| Time in current job | 2% | 0% |
| Work experience | 1% | 0% |
| Age | 0% | 0% |

**Leniency is priced, not given away.** Fintechs approve most and charge most; public banks are the mirror image.

| Segment | Approves | Typical APR |
|---|---:|---|
| Fintech | 65% | 18–23% |
| NBFC | 44% | 15–17% |
| Public bank | 40% | 10–12% |
| Private bank | 31% | 13–15% |

The extremes make the point cleanly: Fibe approves 76% at a median APR of 22.64%, SBI approves 5% at 11.98%.

**The rest of what it found:**

- **A better score is the highest-value change available.** +50 points unlocks **3.95 more lenders** for applicants scoring 650–749 — measured by re-running the model, not estimated.
- **Where your salary lands matters more than people expect.** Opening an SBI salary account flips SBI from no to yes for **47%** of applicants without one. Axis and Kotak lower their income floor for account holders; Union prices government staff slightly better when the account is with Union.
- **Fees change the cheapest lender for 6% of applicants**, at a median cost of ₹1,187 to anyone choosing by headline rate.
- **The unpublished rules are the dominant uncertainty — and this is the most important finding here.** Moving every estimate from strict to lenient takes the average applicant from **6.63 approvals to 9.57**, and **changes the answer for 76% of applicants.** For three applicants in four, the unpublished FOIR caps and salary multiples are doing real work. That is precisely why the range is shown to users and why closing those gaps is the top priority below.
- **Age limits are wider than assumed.** Bajaj lends to age 80 at maturity where most banks stop at 58–60, which makes it the best option for the 59-year-old profile — an answer that is hard to reach by hand.
- **Most approvals are not comfortable.** 90% of the population gets at least one approval but the median applicant gets only 6 of 20, and just **56%** of approvals are strong against 37% borderline and 7% risky.

That last one reframes the whole exercise. "Eligible" is not binary. Most people who qualify only just qualify, and a model that returned a bare yes would be concealing that from them.

## Where this falls short

- The 20 lenders are a **representative shortlist by market segment, not a verified top 20** by loan book, which is not public at lender level in India.
- **85 rules are peer estimates**, mostly FOIR caps and salary multiples that nobody publishes. The effect is measured — it moves the answer for 76% of applicants — but not removed.
- **Pricing for 18 of 20 lenders comes from a template.** It is validated against HDFC's published average, but it is still a template, and it ignores that real rates also vary with income, employer and ticket size.
- **Moneyview publishes only a floor** ("fees start at 2%") with no ceiling, so its true cost may be understated. A known understatement with a note beats an invented maximum.
- **Not modelled:** self-employed applicants, city-specific income floors, pre-approved offers, foreclosure and prepayment costs, credit-enquiry counts, and repayment history beyond what the score already reflects.
- **The simulated population is assumed**, so the insights describe the rules rather than the market.
- **The access date is not an effective date.** Rules may have changed since 11–12 October 2026, which is why every rule carries its date — staleness is visible rather than silent.

## What I'd build next

1. **Replace the estimated FOIR caps and multiples** by running more lender calculators. The sensitivity analysis already ranks them: HDFC, ICICI and IDFC have the largest effect, so this is the highest-value work available and it is not a guess about priority.
2. **Add published CIBIL tables** as more banks release them. Each one replaces template pricing with a real schedule.
3. **Extend to self-employed applicants** — ITR-based income and business vintage, as a genuinely separate rule set rather than an adaptation.
4. **Calibrate the simulated population** against published bureau statistics so the insights describe the market and not only the rules.
5. **Build a defensible lender ranking** from published disbursement data, replacing the judgement-based shortlist.
6. **Back-test against real decisions** if anonymised outcome data ever becomes available. This is the one step that would turn a transparent screening tool into a validated one.

## Reference

### Assumptions

Every number that is not a lender rule lives in [`data/assumptions.csv`](data/assumptions.csv) with its reasoning, and all 11 are shown on the app's Method page. An assumption in a file anyone can change is a design choice; the same assumption buried in code is a hidden bias.

| | Assumption | Value |
|---|---|---|
| A01 | Gross income when not supplied | net ÷ 0.8, flagged in the output whenever used |
| A02 | GST on fees, unless the lender says it is included | 18% |
| A03 | Monthly obligation from card balances | 5% of outstanding |
| A04 | Rate band template for lenders without a published table | Union's published band shape |
| A05 | Borderline credit-score margin | 20 points above the cut-off |
| A06 | Borderline FOIR margin | 5% of income under the cap |
| A07 | Borderline income margin | 10% above the floor |
| A08 | Borderline service margin | 3 months above a minimum |
| A09 | Ranking penalty per estimated deciding rule | 0.25 APR points |
| A10 | Synthetic population for the insights | see `scripts/simulate.py` |
| A11 | Tenure implied by the Axis calculator multiple | 60 months, scaled when age shortens the loan |

Also assumed: no credit history is accepted only where the lender says so (PNB, Union, Fibe); Union's minimum CIBIL is set at 650 because its table prices down to the 650–679 band.

### What is in the repo

```
.
├── README.md
├── app.py                         ← optional local server; serves webui/ + POST /api/evaluate
├── data/
│   ├── lender_rules_long.csv      ← SOURCE OF TRUTH: 368 rules with source, URL, date, evidence
│   ├── lender_rules_matrix.csv    ← one row per lender (generated)
│   ├── rate_tiers.csv             ← published CIBIL rate tables (PNB, Union)
│   ├── estimate_bounds.csv        ← strict/lenient bound per estimate (generated)
│   ├── assumptions.csv            ← A01–A11
│   └── variables.csv              ← input dictionary
├── src/eligibility.py             ← the engine
├── scripts/
│   ├── build_all.py               ← rebuilds everything below, in order
│   ├── long_to_matrix.py
│   ├── build_estimate_bounds.py
│   ├── simulate.py                ← 10,000 applicants → docs/insights.{md,json}
│   └── export_ui_data.py          ← data → webui/data.js
├── webui/                         ← the app (published): index.html, style.css, app.js,
│                                     eligibility.js (JS port), data.js (generated)
├── tests/
│   ├── test_profiles.json         ← 19 profiles with expected outcomes
│   ├── test_results.md            ← full outputs (generated)
│   ├── test_model.py              ← 54 unit and data-integrity tests
│   ├── test_parity.py             ← Python vs browser engine on 415 profiles
│   └── parity_runner.js
├── docs/
│   ├── ARCHITECTURE.md            ← system design with diagrams
│   ├── research_log.md            ← every calculator run, conflict and data decision
│   └── insights.md / insights.json
└── .github/workflows/pages.yml    ← deploys webui/ to GitHub Pages
```

### Running it

**Nothing to install.** Open the [live app](https://sheljasolanki.github.io/Loan-Eligibility-Model/), or open `webui/index.html` directly — engine, data, sample profiles and insights are all bundled.

**With Python 3.9+** (standard library only), from the repo root:

```bash
python src/eligibility.py              # run the 19 profiles → tests/test_results.md
python -m unittest discover -s tests   # 55 tests (parity needs Node.js; skipped without it)
python scripts/simulate.py             # 10,000-applicant insights
python app.py                          # local app at http://localhost:8000
python scripts/build_all.py            # after editing lender_rules_long.csv: rebuild everything
```

From your own code:

```python
import sys; sys.path.insert(0, "src")
import eligibility as E

r = E.run({"age": 30, "employer_category": "pvt_ltd", "net_monthly_income": 60000,
           "existing_emi_total": 8000, "credit_card_outstanding": 0, "cibil_score": 760,
           "work_experience_total": 60, "months_in_current_job": 24,
           "salary_account_banks": [], "requested_amount": 500000, "requested_tenure": 60})

print(r["reason"])                      # "18 of 20 lenders approve; 18 can fund INR 500,000"
print(r["best_explanation"])             # the full written rationale
print(r["uncertainty"]["approvals"])     # {'strict': 17, 'base': 18, 'lenient': 18}
print([p["text"] for p in r["path_to_yes"]])
```

| If | Then |
|---|---|
| `python` is not recognised | use `python3`, or `py` on Windows |
| the page looks unstyled | keep the `webui/` files together; fonts fall back to system fonts offline |
| data edits do not show up | `python scripts/build_all.py` |
