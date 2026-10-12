# Pending changes (not yet applied to lender_rules.csv)
Axis, ICICI already applied before this log started.

## Axis calculator run (user, 2026-10-11)
Inputs: net income 104000, expenses incl. other EMIs 28000 (DOB not entered) -> eligible up to 1,500,000.
Derived: 15,00,000 / 1,04,000 = 14.4x monthly income. FOIR NOT derivable from one run. Source: axis.bank.in personal loan eligibility calculator, accessed 2026-10-11. Keep foir_max as estimate until more runs.

## Axis calculator runs (income 104000, DOB blank)
expenses 0 -> 15,00,000 | 28,000 -> 15,00,000 | 50,000 -> 15,00,000 | 50,177 -> 15,00,000 | 70,745 -> 10,40,000 (=10.0x income)
Reading: 15L is a flat cap at low obligations (14.4x income; calculator ceiling or product cap). Obligations of 68% of income still returned 10.4L, so Axis FOIR is NOT below ~68%; likely 70-85% (inference, needs more runs). Still estimate.
TODO runs: expenses 55k,60k,65k,75k,80k,90k; income 30k/60k/2L with expenses 0 (find salary-multiple cap).

## Axis calculator runs, batch 2 (user, 2026-10-11)
income 104000: expenses 62,943 -> 10,40,000 | 72,872 -> 0
expenses 0: income 30,000 -> 4,50,000 (15.0x) | 60,000 -> 9,00,000 (15.0x) | 2,00,000 -> 15,00,000 (cap; 15x would be 30L)
DERIVED (Axis, calculator-observed, source axis.bank.in calculator, 2026-10-11):
- salary_multiple_max = 15x net monthly income (base tier)
- calculator absolute cap = INR 15,00,000 (calculator ceiling; product page says up to 50L -> note conflict)
- obligation tiers: 15x until existing obligations between 48.3% (50,177) and 60.5% (62,943) of income, then 10x (10.4L=10x) up to 68.0% (70,745), ineligible (0) at 70.1% (72,872) -> hard cutoff ~70% of income (72,800) i.e. foir_max ~0.70 on existing obligations. Mark is_estimate=no but notes 'calculator-derived'. TODO narrow drop point (52k, 56k) if time.

## Axis narrowing runs (user): income 104000, expenses 52,000 -> 15L ; 56,000 -> 15L
So 15x tier holds up to at least 53.8% of income (56,000); drop to 10x occurs between 56,000 and 62,943 (53.8%-60.5%) -> likely a 60% threshold (62,400). Final Axis model: 15x if obligations <=~60% income; 10x if 60-70%; ineligible >=70%.

## Axis boundary confirmed (user): income 104000, expenses 62,234 (59.84%) -> 15L ; 62,943 (60.52%) -> 10.4L
=> 15x tier ends at exactly 60% of income; 10x tier 60-70%; 0 at >=70% (between 68.0% and 70.07%). Axis FOIR rule CONFIRMED by calculator (is_estimate=no, note 'calculator-derived').

## Kotak (user pasted eligibility text + calculator run, 2026-10-11)
Official eligibility table (kotak calculator page): employer MNC/public ltd/pvt ltd; age 21-60; min net income 25,000 (Kotak salary a/c), 30,000 (non-Kotak salary a/c), 20,000 (Kotak employees); graduate/diploma; 1 yr experience; CIBIL 750+ 'generally considered good' (soft; keep min_cibil estimate, cibil_preferred=750 official); rate 'as low as 10.99%'; up to Rs 1 crore.
Calculator run: salary 50,000, obligations 5,000, tenure 10y -> eligible 9,00,000; EMI 11,158; interest 439,045. Implied calculator rate = 8.50% p.a. (reverse-solved), 18.0x salary, (EMI+obligations)/salary = 32.3% -> FOIR not binding here.

## Kotak calculator runs (user, 2026-10-11; kotak.bank.in personal loan eligibility calculator)
tenure 10 months, obligations 0: salary 30k->6L, 50k->10L, 100k->20L, 200k->40L  (=20x salary; EMI shown 103,937 for 10L/10mo i.e. >salary, so calculator does NOT enforce FOIR or tenure)
tenure 10y, salary 100k: obl 0->20L (EMI 24,797) | 20k->16L | 40k->12L | 50k->10L | 60k->8L | 70k->6L | 80k->4L | 99k->20k (EMI 247) | 100k->0 (error 'obligation should not be greater than net income')
earlier: salary 50k, obl 5k, 10y -> 9L (=20 x 45k)
DERIVED: Kotak calculator eligible amount = 20 x (net monthly income - existing obligations). Tenure does not change the amount. Assumed rate for EMI display = 8.5% p.a. No FOIR cap visible in calculator (obligations up to 99% of income still gave a nonzero amount). No cap seen up to 40L at 200k income (product max 1 Cr).
Model decision: salary_multiple_free_income = 20 (calculator-derived, indicative, not a published rule); FOIR for Kotak stays a flagged estimate (0.55) applied by our model as prudential check; note calculator is generous vs real underwriting.

## SBI (user-verified screenshots + T&C text, 2026-10-11; sbi.bank.in personal loan / Xpress Credit pages)
- eligibility: govt/defence/corporate salaried only; MUST have SBI Salary Package Account; min service: govt/defence 6 months, corporate 12 months; age 21-60 (govt/defence >60 case-by-case); Indian national; 'decent credit score as per bank internal policy' (NO numeric CIBIL cutoff -> min_cibil not disclosed; CIBIL>=800 gets 50% fee waiver)
- min net monthly salary: govt/defence 20,000; corporate 25,000  (REPLACES estimate 15,000 -> official)
- amount: min 1 lakh, max 50 lakh subject to EMI/NMI <=65% AND 30x NMI, whichever lower
- rate (w.e.f. 15.12.2025, updated 28-09-2026): 10.00%-15.00% (spread 1.25-6.25% over 2-yr MCLR 8.75%); mean ROI Q1 FY27 11.54%  (REPLACES estimate 10.3-14.1)
- tenure: min 6 months, max 84 months; loan must close by retirement/end of contract/age 60
- processing fee: up to 1.50% (min 1,000, max 15,000) + GST; waivers: defence 100%, Platinum/Rhodium salary pkg 100%, govt 50% (0.75%), CIBIL>=800 50%
- prepayment: 2% of prepaid amount; waived: defence after 6 months; govt/corporate after 3 yrs; Platinum/Rhodium after 6 months
- penal charge: 2.40% p.a. on irregular portion up to 60 days; 5% p.a. beyond 60 days
- docs: PAN, 6 months salary slips, employment proof, ITR/Form16, 6 months salary account statement

## IDFC FIRST (user-verified screenshots, 2026-10-11; idfcfirst.bank.in FIRSTmoney personal loan page)
- occupation: salaried or self-employed; age 21-60; CIBIL 710+ (hard-looking 'should have'; self-employed page says 760+)
- amount: min 50,000, max 15 lakh (approved per bank internal policy & creditworthiness)
- EMI calculator: tenure 9-60 months; rate slider 9.99%-38%; zero foreclosure charges ('repay anytime')
- Check: 1L @9.99% 60m -> EMI 2,124 (matches formula)
- Still missing: min income, work experience, FOIR (not published; use eligibility check flow or keep estimate)

## IDFC FIRST footer (user screenshot): fixed rate, monthly reducing; ROI from 9.99% p.a. (0.83% p.m.); tenure 9-60 months; min EMI 2,124; MAX APR 35% (APR includes fees; slider max nominal rate 38% - CONFLICT 35 APR vs 38 slider, keep rate_max 38 w/ note, apr_max 35); fees page: idfcfirst.bank.in/personal-banking/loans/personal-loan/fees-and-charges (processing fee already 0-3.5% incl GST)

## IndusInd (user-verified screenshots, 2026-10-11; indusind.bank.in personal loan pages)
- rates: starting 10.49% p.a. (no max published -> rate_max stays estimate); processing fee up to 3.5% (excl. govt taxes); tenure 12-84 months (up to 48 months for ONLINE personal loan)
- salaried: min age 21; max age at maturity 60 or retirement (earlier); min net monthly income 25,000 for online application; 2 yrs employment + 1 yr current org; 1 yr stay at current residence if rented; CIBIL 'good, preferably 730 or above' (soft -> cibil_preferred 730 official, min_cibil estimate)
- self-employed professionals: min age 25; max age at maturity 65; min annual net income post tax 4.8 lakh; 4 yrs post-qualification experience
- self-employed individuals: min age 25; max age at maturity 65; min annual net income post tax 4.8 lakh; 5 yrs post-qualification experience
- note: self-employed = two sub-types (professional: doctors/CAs etc; individual: business owners) -> model input self_employed_type

## Bank of Baroda (user screenshot FAQ, 2026-10-11)
- eligibility: min age 21; gainfully employed OR self-employed; income sufficient to repay EMI; CIBIL 'must be above 701 and above' -> min_cibil 701 (official FAQ wording; keep, resolves BoB CIBIL), selfemp_offered = yes (FAQ) -> change earlier 'not stated'

## PNB (user screenshots, 2026-10-11; pnb.bank.in)
Salaried public scheme (pnb.bank.in/personalloanforpublic.html): quantum up to 24x GROSS monthly salary, max Rs 20 lakh, depending on repaying capacity (confirms salary_multiple 24x, max 20L; note FAQ page's 20x/15L is older -> official scheme page wins)
RLLR 8.35% (PNB interest-rate page); other advances rate tables are collapsed -> personal loan spread/rate range still NOT captured: user to open 'Retail Advances' accordion and read personal loan row.
PNB self-employed scheme (separate scheme 'Personal Loan Scheme for Self-Employed'): applicable only to professionals (CA/CS, data analysts, architects/valuers, LIC agents, engineers, software developers, financial consultants); individuals only; min gross annual income 6 lakh for last 2 yrs; CIC score >= 750; satisfactory savings/current a/c with PNB for 2 yrs with min annual credits 5 lakh in previous FY; amount = 10x average gross monthly income of last 2 yrs, max 5 lakh; margin nil; security: third-party guarantor (not close relative) with GAI>=6 lakh and CIC>=650; repayment max 60 EMIs or age 65 whichever earlier; prepayment nil; scheme only in metro/urban branches (initially metro only). => PNB selfemp_offered = yes (restricted professionals, 5L cap)

## PNB rate table (user screenshots, 2026-10-11; pnb.bank.in retail advances rate page)
Digital personal loan (PAPL) - floating = RLLR 8.35% + BSP spread; fixed shown:
- Central/State Govt/PSU/Pvt employees (CIBIL TU): >=800 -> RLLR+2.50% (presently 10.85%) fixed 11.85% | 750-799 or nil history (-1/0) -> RLLR+3.50% (11.85%) fixed 12.85% | 700-749 -> RLLR+4.50% (12.85%) fixed 13.85% (NOT applicable to Pvt employees => Pvt employees need CIBIL >=750 or nil history)
- Pensioners: CIBIL>=680 -> RLLR+2.50% (10.85%) fixed 11.85%
- Existing customer on basis of QAB & TRV: >=800 -> 10.85% (fixed 11.85%); 750-799 -> RLLR+4.50% (12.85%) fixed 13.85%
- Existing car/home/personal loan borrower: >=800 -> 10.85% (fixed 11.85); 750-799 -> RLLR+3.50% (11.85%) fixed 12.85%
- NTB customers (PNB SWAAGAT): >=800 -> 10.85% / fixed 11.85; 750-799 -> 11.85% / fixed 12.85; 700-749 incl -1/0/no hit -> 12.85% / fixed 13.85
- Fully repaid home/car/education/personal loan borrowers: >=800 -> 10.85% / 11.85 fixed; 750-799 -> 11.85% / 12.85 fixed
- Pensioner scheme: starting 10.60% p.a. headline; floating RLLR+2.50% (10.85%), fixed 11.85%
DERIVED for model (official): PNB digital PL floating rate (presently) 10.85% (CIBIL>=800) / 11.85% (750-799) / 12.85% (700-749, govt/PSU only); fixed 11.85/12.85/13.85. => PNB rate_min 10.85 (floating; fixed 11.85), rate_max 12.85 floating (13.85 fixed) for PAPL; REPLACES estimate 12.15. PNB min_cibil: 700 (govt/PSU) / 750 (private employees) OFFICIAL -> replaces estimate. Rate is CIBIL-tiered => good example for README (score-based pricing).

## Bajaj Finance (user screenshot, bajajfinserv.in personal loan page, 2026-10-11)
rate from 10% p.a.; amount 40,000 - 55 lakh; tenure 12-108 months (calculator options 84/96/108); CIBIL 650 and above required (CONFIRMS 650, replaces 685); loan variants: Term loan (fixed instalments, part-prepayment charges applicable) and Flexi loan (zero charges on withdrawals and pre-payment) -> Flexi variant = prepayment nil; 100% online. Still unpublished: min salary (keep 25001 estimate), max rate (30.5 from earlier official scrape), FOIR.

## Calculator runs (user, 2026-10-11) - dropdown 'AMLA' (city), DOB 04/05/2000, income slider 25K-10L, 'Monthly expenses' -- ASSUMED Bajaj Finserv calculator (CONFIRM lender/URL)
income 25,000 exp 0 -> 2,50,000 (10x) | 30,000 exp 0 -> 3,00,000 (10x) | 30,000 exp 20,000 -> 1,17,663 | 60,000 exp 20,000 -> 6,00,000 (10x)
Analysis: 10x monthly income cap when expenses low. 1,17,663 = EMI 2,500 at 10% for 60 months exactly (one of several fits) -> consistent w/ Bajaj 10% start rate; EMI capacity 2,500 at income 30k/exp 20k. Not yet enough to derive FOIR: 25%*(income-exp) fits this point but fails 60k/20k (would give 4.7L, shown 6L). TODO runs: income 60k with exp 25k,30k,35k,40k,45k; income 1L exp 0; note lender+URL.

## Calculator batch 3 (same calculator, income 60,000; AMLA, DOB 04/05/2000), user 2026-10-11
expenses 33,000 -> 5,64,784 | 35,000 -> 4,70,654 | 40,000 -> 2,35,327 | 41,000 -> 1,88,261 | 42,000 -> 1,41,196 | 43,000 -> 94,131 | 44,000 -> 47,065 | 45,000 -> 0
DERIVED (fits every run to the rupee): eligible = min( 10 x monthly income , PV_factor(10% p.a., 60 months)=47.0653 x (0.75 x income - expenses) ).
=> FOIR = 75% of income (EMI + expenses <= 75%), assumed rate 10.0%, assumed tenure 60 months, salary multiple cap 10x. Checks: 30k/20k -> 2,500 x 47.0653 = 1,17,663 OK; 60k/20k -> 11.8L capped to 6L (10x) OK.
Lender presumed Bajaj Finserv (CONFIRM lender name + URL). If confirmed: Bajaj foir_max=0.75 (calculator-derived, is_estimate=no), salary_multiple_max=10.

## CONFIRMED (user): the calculator runs above are Bajaj Finserv — https://www.bajajfinserv.in/personal-loan-eligibility-calculator (accessed 2026-10-11)
=> Bajaj: foir_max=0.75 (calculator-derived), salary_multiple_max=10, assumed calc rate 10%, 60 months. is_estimate=no, note 'calculator-derived'.

## Tata Capital (user screenshots, tatacapital.com/personal-loan.html, 2026-10-11)
amount 40,000 - 35,00,000 (resolves min 40k vs 75k: 40,000 official); tenure up to 6 years (72 months); rate starting 10.99%; ROI range 10.99% - 33% (max ROI 33% OFFICIAL, replaces estimate 24); APR 10.99% - 45% (apr_max 45); rate depends on income, CIBIL, loan amount, tenure, repayment capacity, employment nature, debt-to-income ratio, financial history; EMI calculator default 10.99%, 2y, 1L -> EMI 4,660 (matches formula). Still unpublished: FOIR (calculator on tatacapital.com/personal-loan-eligibility-calculator may exist), CIBIL cutoff (725+ preferred, from earlier scrape).

## Tata Capital eligibility table (user screenshot, salaried, 2026-10-11)
employment: salaried in private company / public sector / govt org; age 21-58; Indian residents only; min monthly salary 20,000 (confirms 20k); work experience at least 1 year (CONFLICT: earlier scrape said 1y current job + 2y total -> use 1y total from this table, note conflict); credit score 725+ 'improves approval chances' (soft). Tata eligibility/FOIR calculator NOT WORKING for user -> Tata foir_max stays estimate (0.55 private/NBFC peer default, flagged is_estimate=yes, method=peer median), no calculator-derived value.

## Poonawalla (user screenshot, poonawallafincorp.com/personal-loan, 2026-10-11): up to 50 lakh; starting 9.99% p.a.; tenure 12-84 months (confirms scrape). Still unverified by user: min income 25k, CIBIL 700, fee up to 4%, max rate, FOIR.
## USER-VERIFIED SO FAR: ICICI, Axis, Kotak, SBI, IDFC FIRST, IndusInd, BoB(partial), PNB, Bajaj, Tata, Poonawalla
## LEFT: HDFC, Aditya Birla, Moneyview, KreditBee, SMFG/Fullerton, Hero FinCorp, Navi, CASHe, Fibe (+ BoB amount/location table, PNB min income & age)

## Moneyview (user screenshots FAQ, moneyview.in, 2026-10-11)
min amount 5,000; max amount decided by lending partner's own underwriting model, up to 10 lakh; loans via digital lending PARTNERS (moneyview is the platform); tenure 3-60 months; monthly interest 1.16% - 3% (= 13.9% - 36% p.a. nominal) -> rate_min 14.0 (page '14% annually'), rate_max 36.0 now OFFICIAL (was estimate); APR 17% - 45% (apr_max 45, apr_min 17); disbursal within 24 hours of approval.
## Fibe (user screenshot, EMI calculator, fibe.in, 2026-10-11)
calculator: loan amount 10K - 10L; interest rate slider 12% - 30%; tenure 6-36 months. Check: 1,45,000 @18% 12m -> EMI 13,294. => rate_max 30% per calculator (replaces 36 estimate; but slider may not equal policy max -> keep note 'calculator slider'); rate_min 12 (calculator) vs 18% 'starting from' on page (earlier scrape) -> CONFLICT; tenure 6-36 confirmed; min amount 10,000.

## User decisions (2026-10-12)
- HDFC CIBIL = 720 (user-found; source/url to confirm; keep is_estimate per source)
- Fibe: rate_min = 18% (use page 'starting from 18%', not calculator slider's 12%); rate_max 30% (calculator slider)
- KreditBee CIBIL = 670 (user-found)
## LEFT TO CHECK (after HDFC, Fibe, KreditBee, Moneyview done): Aditya Birla, SMFG/Fullerton, Hero FinCorp, Navi, CASHe (+ BoB amount/location & rate, PNB min income/max age, Poonawalla min income/CIBIL/fee)

## HDFC CIBIL SOURCE (user screenshot, 2026-10-12): https://www.hdfc.bank.in/personal-loan/eligibility-criteria FAQ 'What is the minimum credit score to apply for a Personal Loan?' -> 'you need a minimum credit score of 720 to be eligible for Personal Loans. The credit score varies from bank to bank.' => min_cibil=720, source_type=official, is_estimate=no (replaces estimate 650). Note: FAQ wording is generic ('varies from bank to bank') - flag as 'stated in FAQ'.

## Aditya Birla Capital (user screenshot, adityabirlacapital.com/loans/personal-finance/personal-loan, 2026-10-12) - SALARIED ONLY
age min 21 or 23 (by loan type), max 60 (entry age extended up to 62 in some cases); salaried employee at a recognized organization; stable monthly income; CIBIL 700+ 'helps quicker approval and better terms' (soft; 650+ seen on other tab); work experience 6 months in current employment; docs: ID proof, address proof, latest 3 months salary slips, 6 months bank statements showing salary credits, photo.
## NEW USER DIRECTIVES (2026-10-12)
1) Scope = SALARIED ONLY (drop self-employed rows from model; keep in notes only if wanted)
2) Use ONLY official bank/lender website data - remove/replace anything sourced from third parties (paisabazaar etc.); unverifiable -> blank/'not disclosed', not peer estimate?? (ASK user)
3) Add rule: 'account required with the bank' (salary account/existing relationship) per lender (SBI salary account mandatory; Axis/Kotak/HDFC differ by account)
4) Restructure data into math-model-friendly wide matrix (one row per lender, numeric columns) like friend's repo, plus keep long evidence table for sources

## 2026-10-12 update (fees, rate tables, source-type clean-up)
- Source types reduced to three: official_published, calculator_derived, peer_estimate. All PaisaBazaar rows and every row whose
  evidence said "copied from classmate's repo, not verified" (33 rows previously labelled official/calculator) are now peer_estimate.
- Processing fees (all from lender's own pages): HDFC up to Rs 6,500 + GST flat (hdfc.bank.in/personal-loan/interest-rates-and-charges);
  YES up to 2.5%; Federal FedPremia 2% (retail-loan-charges PDF); Indian Bank Clean Salary Loan 1% max Rs 10,000, Govt/PSU nil;
  Moneyview "starts at 2%"; PNB 1% + documentation Rs 270/450, defence nil, excl. GST (page updated 01-10-2026);
  Union 1% min Rs 500 max Rs 7,500, SRLGE (govt) nil (service-charges.pdf sec 12.7); Aditya Birla up to 2.5% (personal-finance page);
  SBI 1.5% min 1,000 max 15,000, waivers defence 100% / govt 50% / CIBIL>=800 50%. A ChatGPT summary claimed Aditya Birla 4%: not on any ABC page, rejected.
- Rate tables: Union retail ROI PDF (w.e.f. 08.10.2026, EBLR 8.25%) sec 7.1 (salaried non-govt, 6 CIC bands) and sec 9 SRLGE (govt, by salary-account status)
  added to rate_tiers.csv. SBI (10.00-15.00%, no bands) and Indian Bank (9.65-10.15%, no bands) publish no CIBIL table.
- Union min CIBIL set to 650 (rate table prices down to 650-679 and "below 650"; project decision). Union min age 18 stays a peer estimate (PaisaBazaar).
- Aditya Birla max rate 28% (official, replaces 31.75 estimate). Fibe max rate 30% from its calculator slider (decision of 2026-10-11 now applied).
- HDFC publishes realised pricing for Q1 FY27: avg IRR 10.89%, min 9.97%, max 24.06%; avg APR 11.18%. Used to validate the rate-band template.
- Aditya Birla FOIR article: "ideal FOIR is usually below 40%" -> used as the strict bound for ABFL's estimated FOIR, not as the base value.
- City-tier income floors dropped from scope; city_tier removed from variables.csv.
