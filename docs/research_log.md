# Research log

How every rule in `data/lender_rules_long.csv` was obtained, from which source, on which date,
and what it changed. Research ran from 11–12 October 2026 and covers **20 lenders, 368 rules**.

Scope: **personal loans, salaried applicants, public sources only.** Self-employed criteria were
collected for some lenders before the scope was fixed; they are recorded in section 7 for reference
but are not in the model.

## 1. How a value earns its label

Every rule carries one of three source types. The test suite fails if a rule is labelled official
while its own evidence note says otherwise.

| Source type | What it means | Count |
|---|---|---:|
| `official_published` | Printed on the lender's own page, PDF, fee schedule or FAQ | 273 |
| `calculator_derived` | Reverse-engineered from the lender's own public calculator (section 3) | 10 |
| `peer_estimate` | Not published by the lender; from a comparable lender or a third-party page | 85 |

Only a lender's **own website** counts as official. A third-party aggregator such as PaisaBazaar is
always a peer estimate, however specific its number looks.

## 2. Coverage by lender

Official rules per lender, after the verification pass in section 6.

| Lender | Official | Calculator | Peer estimate |
|---|---:|---:|---:|
| State Bank of India | 21 | 0 | 2 |
| HDFC Bank | 16 | 0 | 3 |
| L&T Finance | 16 | 1 | 4 |
| ICICI Bank | 15 | 0 | 3 |
| Indian Bank | 15 | 0 | 5 |
| Axis Bank | 14 | 4 | 2 |
| IndusInd Bank | 14 | 0 | 4 |
| Kotak Mahindra Bank | 14 | 2 | 2 |
| KreditBee | 14 | 0 | 3 |
| Poonawalla Fincorp | 14 | 0 | 4 |
| Tata Capital | 14 | 0 | 3 |
| Aditya Birla Capital | 13 | 0 | 4 |
| IDFC FIRST Bank | 13 | 0 | 5 |
| Bajaj Finance | 12 | 2 | 3 |
| Federal Bank | 12 | 0 | 7 |
| Moneyview | 12 | 0 | 4 |
| Punjab National Bank | 12 | 0 | 7 |
| Fibe (EarlySalary) | 11 | 1 | 4 |
| Union Bank of India | 11 | 0 | 9 |
| YES BANK | 10 | 0 | 7 |

## 3. Reverse-engineering lender calculators

No lender publishes its FOIR cap or salary multiple. Three lenders expose a public eligibility
calculator, so those rules were recovered by running the calculator across many inputs and fitting
the result. This is the strongest evidence in the dataset after a printed figure.

### 3.1 Axis Bank — FOIR tiers found by bisection

Source: axis.bank.in personal loan eligibility calculator, 11 Oct 2026. Net income ₹1,04,000 held
constant, obligations varied.

| Existing obligations | % of income | Eligible amount | Implied multiple |
|---:|---:|---:|---|
| 0 | 0% | 15,00,000 | capped |
| 50,177 | 48.3% | 15,00,000 | capped |
| 56,000 | 53.8% | 15,00,000 | capped |
| 62,234 | **59.8%** | 15,00,000 | capped |
| 62,943 | **60.5%** | 10,40,000 | 10× |
| 70,745 | 68.0% | 10,40,000 | 10× |
| 72,872 | **70.1%** | 0 | rejected |

A second sweep with obligations at zero gave the base multiple: income ₹30,000 → ₹4,50,000 and
₹60,000 → ₹9,00,000, both exactly 15×; income ₹2,00,000 → ₹15,00,000, where the ₹15 lakh calculator
ceiling binds instead.

**Derived rule (A11):** 15× net monthly income while obligations are at or below 60% of income;
10× between 60% and 70%; ineligible at 70% and above. The 60% and 70% boundaries are confirmed to
within 0.7 percentage points, so these are stored as `calculator_derived`, not estimates.

*Conflict noted:* the calculator ceiling is ₹15 lakh while the product page advertises up to ₹50 lakh.
Recorded on the rule rather than silently resolved.

### 3.2 Kotak Mahindra Bank — a free-income multiple

Source: kotak.bank.in personal loan eligibility calculator, 11 Oct 2026.

| Salary | Obligations | Eligible |
|---:|---:|---:|
| 1,00,000 | 0 | 20,00,000 |
| 1,00,000 | 20,000 | 16,00,000 |
| 1,00,000 | 50,000 | 10,00,000 |
| 1,00,000 | 80,000 | 4,00,000 |
| 1,00,000 | 99,000 | 20,000 |
| 50,000 | 5,000 | 9,00,000 |

**Derived:** eligible = 20 × (net monthly income − existing obligations). Tenure does not change the
amount, and obligations at 99% of income still return a positive figure, so the calculator applies
**no FOIR cap at all**.

That result is too generous to use as an underwriting rule — at 10 months' tenure it returned an EMI
larger than the applicant's salary. So the multiple is stored as calculator-derived while Kotak's
FOIR stays a flagged peer estimate (0.55) applied by this model as a prudential check. The note on
the rule says the calculator is more generous than real underwriting.

### 3.3 Bajaj Finserv — a FOIR that fits every run to the rupee

Source: bajajfinserv.in/personal-loan-eligibility-calculator, 11 Oct 2026. Income ₹60,000.

| Monthly expenses | Eligible |
|---:|---:|
| 33,000 | 5,64,784 |
| 35,000 | 4,70,654 |
| 40,000 | 2,35,327 |
| 42,000 | 1,41,196 |
| 44,000 | 47,065 |
| 45,000 | 0 |

**Derived:** eligible = min( 10 × income , 47.0653 × (0.75 × income − expenses) ), where 47.0653 is
the present-value factor for 10% p.a. over 60 months.

This fits every run exactly, which pins three things at once: **FOIR = 75%**, an assumed rate of 10%
and an assumed tenure of 60 months, with a **10× salary multiple** cap. Cross-check at a different
income: ₹30,000 income with ₹20,000 expenses → ₹1,17,663, matching to the rupee.

## 4. Published rate tables

Two lenders publish the actual CIBIL-band rate table. These are used directly; every other lender is
priced with the band template (assumption A04).

**Punjab National Bank** — retail advances rate page, 11 Oct 2026. RLLR 8.35%.

| Customer group | CIBIL | Floating | Fixed |
|---|---|---|---|
| Govt / PSU / private employees | ≥ 800 | 10.85% | 11.85% |
| Govt / PSU / private employees | 750–799 or no history | 11.85% | 12.85% |
| Govt / PSU only | 700–749 | 12.85% | 13.85% |
| Pensioners | ≥ 680 | 10.85% | 11.85% |

This also settles PNB's minimum CIBIL, which is otherwise unstated: **700 for government and PSU
employees, 750 for private-sector employees**, because the 700–749 band is explicitly not available
to them. It replaced an estimated 12.15% flat rate.

**Union Bank of India** — retail ROI PDF effective 08 Oct 2026, EBLR 8.25%. Section 7.1 covers
salaried non-government applicants across six CIC bands; section 9 covers the SRLGE government
scheme, split by whether the salary account is held with Union. Both are in `data/rate_tiers.csv`.

SBI (10.00–15.00%) and Indian Bank (9.65–10.15%) publish a range but no bands.

**Validation source.** HDFC publishes the rates it actually charged in Q1 FY27: average IRR 10.89%,
range 9.97%–24.06%, average APR 11.18%. The band template predicts 11.25% for HDFC at CIBIL 750+,
which is within 0.36 points. A straight line between the published minimum and maximum would have
said about 17%.

## 5. Findings from lender pages

Everything below was read on the lender's own site on 11–12 October 2026.

**State Bank of India** (Xpress Credit). Government, defence and corporate salaried only, and an SBI
Salary Package Account is **mandatory**. Minimum service 6 months government and defence, 12 months
corporate. Age 21–60. Minimum net salary ₹20,000 government and defence, ₹25,000 corporate — this
replaced an estimated ₹15,000. Amount ₹1 lakh to ₹50 lakh, subject to EMI/NMI ≤ 65% **and** 30× net
monthly income, whichever is lower. Tenure 6–84 months, closing by retirement. Rate 10.00%–15.00%
(spread 1.25–6.25% over the two-year MCLR of 8.75%), replacing an estimated 10.3–14.1%. Processing
fee up to 1.50%, minimum ₹1,000, maximum ₹15,000, plus GST, waived fully for defence and
Platinum/Rhodium packages and halved for government and for CIBIL ≥ 800. No numeric credit-score
cut-off is published: the page says "decent credit score as per bank internal policy".

**HDFC Bank.** Minimum credit score **720**, from the eligibility-criteria FAQ, replacing an estimated
650. The FAQ wording is generic ("varies from bank to bank"), so the rule is flagged as stated in an
FAQ. Processing fee is a flat cap of **₹6,500 + GST**, which makes HDFC comparatively cheap on large
loans.

**IDFC FIRST Bank.** Age 21–60, CIBIL 710+, amount ₹50,000 to ₹15 lakh, tenure 9–60 months, zero
foreclosure charges, processing fee 0–3.5% including GST. A calculator check confirmed the EMI
formula: ₹1 lakh at 9.99% over 60 months gives ₹2,124. *Conflict:* the footer states a maximum APR of
35% while the rate slider goes to 38%. Both are stored — nominal maximum 38%, APR maximum 35% — with
a note.

**IndusInd Bank.** Rate from 10.49% with no published maximum, so the maximum stays an estimate.
Processing fee up to 3.5% excluding taxes. Tenure 12–84 months, or up to 48 months for the online
product. Minimum age 21, maximum age at maturity 60 or retirement. Minimum net income ₹25,000 for
online applications. Two years' employment with one year in the current organisation. The credit
score is "good, preferably 730 or above" — soft wording, so 730 is stored as a preferred score and
the hard minimum stays an estimate.

**Bajaj Finance.** Rate from 10%. Amount ₹40,000 to ₹55 lakh. Tenure 12–108 months. **CIBIL 650 and
above**, confirming 650 and replacing an estimated 685. Two variants: a term loan, and a Flexi loan
with no prepayment charges.

**Tata Capital.** Amount ₹40,000 to ₹35 lakh, resolving an earlier ₹40,000-versus-₹75,000 conflict in
favour of ₹40,000. Tenure up to 72 months. Rate 10.99%–33%, where the published maximum of 33%
replaced an estimated 24%, and APR 10.99%–45%. Salaried eligibility: age 21–58, minimum monthly
salary ₹20,000, at least one year of work experience, credit score 725+ "improves approval chances"
(soft). Tata's own eligibility calculator did not load, so its FOIR remains a peer estimate at 0.55
with no calculator-derived value.

**Bank of Baroda.** FAQ states the credit score "must be above 701", which settles its minimum at 701.

**Moneyview.** A platform rather than a lender: the maximum amount is set by each partner's own
underwriting, up to ₹10 lakh, with a minimum of ₹5,000. Tenure 3–60 months. Monthly interest
1.16%–3%, which is 14%–36% a year, now official in place of estimates. APR 17%–45%. The processing
fee "starts at 2%", so the stored figure is a floor, not a cap.

**Fibe (EarlySalary).** Calculator: amount ₹10,000–₹10 lakh, rate slider 12%–30%, tenure 6–36 months.
*Conflict:* the slider starts at 12% while the page says "starting from 18%". Decision: use 18% as
the minimum (the page) and 30% as the maximum (the slider), with the maximum noted as
calculator-derived rather than policy.

**Aditya Birla Capital.** Salaried only. Age 21 or 23 depending on loan type, maximum 60, extended to
62 in some cases. Six months in current employment. CIBIL 700+ "helps quicker approval" (soft).
Maximum rate **28%**, official, replacing an estimated 31.75%. Processing fee up to 2.5%.

**Punjab National Bank** (scheme page). Up to **24× gross monthly salary, maximum ₹20 lakh**. An older
FAQ page says 20× and ₹15 lakh; the scheme page wins and the conflict is recorded. Processing fee 1%
plus a documentation fee of ₹270 or ₹450, nil for defence, excluding GST.

**Union Bank of India.** Processing fee 1%, minimum ₹500, maximum ₹7,500; nil under the SRLGE
government scheme. Minimum CIBIL set to **650**, since the published rate table prices bands down to
650–679 and treats "below 650" separately. Union's minimum age of 18 is a PaisaBazaar value and
remains a peer estimate.

**Others.** YES Bank processing fee up to 2.5%. Federal Bank FedPremia 2%, from the retail-loan
charges PDF, with a minimum net salary of ₹25,000. Indian Bank Clean Salary Loan 1% capped at
₹10,000, nil for government and PSU borrowers. Poonawalla Fincorp up to ₹50 lakh from 9.99% over
12–84 months; its minimum income, credit score, fee and FOIR are all still unverified.
KreditBee minimum CIBIL 670.

## 6. The verification pass — 12 October

An audit found **33 rules labelled `official_published` whose own evidence note said the value had
been copied from a peer repo and never verified**. They were relabelled `peer_estimate`, and a test
now fails if a rule is ever marked official while its note says otherwise.

That left a subtler problem: those rows still carried the lender's **own URL**. The link looks
official while the number is not, which is worse than an honest estimate, because anyone checking the
link finds nothing. So every one of those pages was opened and read.

**Eight values turned out to be published after all** and are now `official_published`:

| Rule | Value | What the page says |
|---|---|---|
| Union max loan | ₹50,00,000 | "up to Rs.50 lakhs", subject to eligibility and repayment capacity |
| Union max tenure | **84 months — corrected from 60** | repayment "up to 84 months (7 years)" |
| Federal max loan | ₹25,00,000 | "Maximum Loan amount of Rs.25 Lakh" |
| PNB max tenure | 72 months | "maximum 72 (Seventy-Two) equated monthly installments" |
| L&T minimum age | 21 | applicants "aged between 21 and 58 years" |
| L&T maximum age | 58 | same sentence |
| L&T minimum tenure | 12 months | "tenure ranging from 12 to 72 months" |
| Kotak minimum tenure | 12 months | "Borrow up to Rs.1 crore for 1-6 years" |

L&T's ₹50,000 minimum loan was reclassified `calculator_derived`: it is the lower bound of the
loan-amount field in L&T's own EMI calculator, not a stated rule.

**One value was wrong, not merely mislabelled.** Union's maximum tenure was 60 months, inherited from
the peer repo; the bank's own page says 84. Correcting it changed one expected test outcome — for
profile P19, a government employee with CIBIL 810, the best option moves from Axis to Union at 9.25%
APR with the fee waived. Union always had the cheaper rate; it now also carries one fewer estimated
deciding field, so the ranking penalty (A09) no longer pushes it behind Axis.

**The remaining 46 rules stay peer estimates.** The page was read and the value is simply not there.
Each note now records which page was checked, so the URL is not mistaken for a source for the number.

Totals after this pass: **273 official, 10 calculator-derived, 85 peer estimates**, from 265 / 9 / 94.

## 7. Conflicts, and how each was resolved

| Conflict | Resolution |
|---|---|
| Axis calculator caps at ₹15 lakh; product page says ₹50 lakh | Both stored; calculator ceiling noted on the rule |
| IDFC maximum APR 35% vs rate slider 38% | Both stored — nominal max 38%, APR max 35% |
| Fibe slider starts at 12%; page says "from 18%" | Page wins for the minimum; slider used for the maximum |
| PNB scheme page 24× / ₹20 lakh vs FAQ 20× / ₹15 lakh | Scheme page wins |
| Tata: 1 year total experience vs an earlier 1 year current + 2 years total | Eligibility table wins (1 year total) |
| Federal: features say 60 months, "Other Loans" says 48 | 60 months, from the features section |
| Union: peer repo 60 months vs bank page 84 | Bank page wins; value corrected |
| L&T minimum income: blog says ₹25,000 tier-1 / ₹15,000 tier-2 | Stricter value stored, conflict flagged |
| Aditya Birla fee: a ChatGPT summary claimed 4% | **Rejected** — not on any Aditya Birla page; the official 2.5% used |

## 8. Decisions taken

**11 October.** Fibe's maximum rate set to 30% from the calculator slider. HDFC minimum CIBIL 720
and KreditBee 670 adopted from user-found sources.

**12 October.**
- Scope narrowed to **salaried only**; self-employed rows dropped from the model.
- Source types reduced to exactly three, and all PaisaBazaar-derived values moved to `peer_estimate`.
- An "account required with the bank" rule added per lender, since SBI makes its salary account
  mandatory while Axis, Kotak and HDFC merely price it differently.
- Data restructured into a wide matrix, one row per lender, for the model, with the long evidence
  table kept as the source of truth.
- **City-tier income floors dropped** from scope; `city_tier` removed from `variables.csv`.
- Aditya Birla's FOIR article ("ideal FOIR is usually below 40%") used as the **strict bound** for
  ABFL's estimated FOIR, not as its base value.

## 9. Still unpublished

These are the gaps that remain, and the reason the model measures its own uncertainty rather than
hiding it. Section 8.7 of the README quantifies the effect: moving every estimate from its strict to
its lenient bound changes the answer for 76% of applicants.

- **FOIR caps and salary multiples** — not published by any of the 20 lenders. Recovered by
  calculator for Axis, Kotak and Bajaj only; estimated for the other 17.
- **Minimum credit score** — Axis, L&T and SBI publish none. SBI says only "a decent Credit score, as
  per Bank's internal policy".
- **Minimum income** — Bajaj and IDFC publish none.
- **Maximum rate** — Kotak and IndusInd publish a starting rate only.
- **Maximum age** — Indian Bank publishes a minimum entry age of 21 and no maximum.
- **Poonawalla Fincorp** — minimum income, credit score, fee and FOIR all unverified.

Researching FOIR caps and salary multiples for HDFC, ICICI and IDFC would remove the largest single
source of uncertainty in the model.
