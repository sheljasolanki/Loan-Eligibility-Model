"""Builds data/lender_rules_matrix.csv (one row per lender) from data/lender_rules_long.csv (the source of truth).

Every rule in the long table has exactly one source_type:
  official_published  - read on the lender's own website / PDF
  calculator_derived  - reverse-engineered from the lender's own public calculator
  peer_estimate       - not published by the lender; estimated from peers or a third-party page (flagged)
Run: python scripts/long_to_matrix.py
"""
import csv, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
FIELD = {("min_age","all_salaried"):"min_age",("max_age_at_application","all_salaried"):"max_age_app",("max_age_at_maturity","all_salaried"):"max_age_maturity",
 ("min_net_monthly_income","default (non-account-holder)"):"min_income",("min_net_monthly_income","all_salaried"):"min_income",
 ("min_net_monthly_income_if_salary_account_holder","salary_account_holder"):"min_income_account_holder",
 ("min_cibil_score","all_salaried"):"min_cibil",("min_total_experience","all_salaried"):"min_exp_months",("min_current_job_tenure","all_salaried"):"min_cur_job_months",
 ("min_loan_amount","all_salaried"):"min_amount",("max_loan_amount","all_salaried"):"max_amount",("min_tenure","all_salaried"):"min_tenure",("max_tenure","all_salaried"):"max_tenure",
 ("starting_interest_rate","all_salaried"):"rate_min",("max_interest_rate","all_salaried"):"rate_max",
 ("processing_fee_max_pct","all_salaried"):"fee_pct",("processing_fee_min_inr","all_salaried"):"fee_min_inr",("processing_fee_max_inr","all_salaried"):"fee_max_inr",
 ("processing_fee_gst_included","all_salaried"):"fee_gst_included",("processing_fee_waivers","all_salaried"):"fee_waivers",("documentation_fee_inr","all_salaried"):"doc_fee_inr",
 ("foir_cap","all_salaried"):"foir_cap",("salary_multiple_cap","all_salaried"):"multiple",("salary_multiple_basis","all_salaried"):"multiple_basis",
 ("salary_multiple_when_obligations_high","all_salaried"):"multiple_tier2",("obligation_ratio_threshold_for_tier2","all_salaried"):"tier2_obligation_ratio",
 ("account_requirement","all_salaried"):"account_requirement",("employer_types_accepted","all_salaried"):"employer_types",("foreclosure_charges","all_salaried"):"foreclosure"}
FIELDS = list(dict.fromkeys(FIELD.values()))
SOURCE_TYPES = ("official_published", "calculator_derived", "peer_estimate")

old = {r["lender_id"]: r for r in csv.DictReader(open(os.path.join(D, "lender_rules_matrix.csv")))}
out = {}
for r in csv.DictReader(open(os.path.join(D, "lender_rules_long.csv"), encoding="utf-8")):
    assert r["source_type"] in SOURCE_TYPES, f"{r['rule_id']}: unknown source_type {r['source_type']}"
    f = FIELD.get((r["rule_name"], r["applies_to"]))
    if not f: continue
    m = out.setdefault(r["lender_id"], {"lender_id": r["lender_id"], "lender_name": r["lender_name"], "product_name": r["product_name"],
                                         **{k: "" for k in FIELDS}, "official": [], "calculator": [], "estimated": [], "dates": set()})
    m[f] = r["rule_value"]
    m[{"official_published": "official", "calculator_derived": "calculator", "peer_estimate": "estimated"}[r["source_type"]]].append(f)
    m["dates"].add(r["accessed_on"])

COLS = ["lender_id","lender_name","product_name","category","lender_type"] + FIELDS + \
       ["n_official","n_calculator","n_estimated","estimated_fields","calculator_fields","confidence","primary_source_url","accessed_on"]
with open(os.path.join(D, "lender_rules_matrix.csv"), "w", newline="") as fh:
    w = csv.DictWriter(fh, COLS); w.writeheader()
    for lid, m in out.items():
        o = old.get(lid, {})
        n_est = len(m["estimated"])
        conf = "high" if n_est <= 2 else "medium" if n_est <= 5 else "low"
        row = {k: m[k] for k in ("lender_id", "lender_name", "product_name", *FIELDS)}
        row.update(category=o.get("category", ""), lender_type=o.get("lender_type", ""), primary_source_url=o.get("primary_source_url", ""),
                   n_official=len(m["official"]), n_calculator=len(m["calculator"]), n_estimated=n_est,
                   estimated_fields="|".join(m["estimated"]), calculator_fields="|".join(m["calculator"]),
                   confidence=conf, accessed_on=max(m["dates"]))
        w.writerow(row)
print(len(out), "lenders")
