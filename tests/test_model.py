"""Unit tests: maths, calculator calibrations, published rate tables, fees, rule behaviour, confidence, path to yes,
uncertainty, data integrity and expected outcomes for every test profile.
Run: python -m unittest discover -s tests -v"""
import csv, json, os, sys, unittest
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "src"))
import eligibility as E


def load_profiles():
    with open(os.path.join(ROOT, "tests", "test_profiles.json"), encoding="utf-8") as f: return json.load(f)
def read_text(path):
    with open(path, encoding="utf-8") as f: return f.read()

D = E.load_all(); M, T, A = D["matrix"], D["tiers"], D["A"]
BASE = dict(age=30, citizenship="indian_resident", employment_type="salaried", employer_category="pvt_ltd", net_monthly_income=100000,
            work_experience_total=96, months_in_current_job=48, cibil_score=780, existing_emi_total=0, salary_account_banks=[], salary_credited_via_bank=True)
def ev(lid, **kw): return E.evaluate({**BASE, **kw}, M[lid], T, A)
def run(**kw): return E.run({**BASE, **kw}, D)
def rows(name):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f: return list(csv.DictReader(f))


class Maths(unittest.TestCase):
    def test_emi_capacity_roundtrip(self):
        p = 750000; self.assertAlmostEqual(E.capacity(E.emi(p, 9.99, 60), 9.99, 60), p, places=3)
    def test_emi_known_value(self):          # Rs 5L at 9.80% for 60 months ~ Rs 10,574 (bank-style reducing balance)
        self.assertAlmostEqual(E.emi(500000, 9.80, 60), 10574, delta=5)
    def test_apr_equals_rate_without_fees(self):
        self.assertAlmostEqual(E.apr(500000, 0, E.emi(500000, 11.0, 60), 60), 11.0, places=2)
    def test_apr_above_rate_with_fees(self):
        self.assertGreater(E.apr(500000, 10000, E.emi(500000, 11.0, 60), 60), 11.5)
    def test_round_half_up_matches_javascript(self):
        self.assertEqual(E.rnd(2.5), 3); self.assertEqual(E.rnd(10.125, 2), 10.13)


class CalculatorCalibration(unittest.TestCase):
    """Reproduce what each lender's own public calculator returned in our manual runs (docs/research_log.md)."""
    def test_axis_tier1(self):                # obligations 59.84% of income -> 15x (calculator caps display at 15L)
        r = ev("axis", net_monthly_income=104000, existing_emi_total=62234); self.assertTrue(r["eligible"]); self.assertGreaterEqual(r["max_amount"], 1500000)
    def test_axis_tier2(self):                # 60.52% -> 10x = 10.4L
        self.assertEqual(ev("axis", net_monthly_income=104000, existing_emi_total=62943)["max_amount"], 1040000)
    def test_axis_cutoff(self):               # >= 70% -> nothing
        self.assertFalse(ev("axis", net_monthly_income=104000, existing_emi_total=72872)["eligible"])
    def test_axis_multiple_scaled_when_age_cuts_tenure(self):     # A11: a 59-year-old must not get an EMI above income
        r = ev("axis", age=59, employer_category="psu", net_monthly_income=150000, cibil_score=800, requested_amount=2000000)
        self.assertTrue(r["eligible"]); self.assertLess(r["emi"], 0.7 * 150000)
    def test_kotak_never_exceeds_20x_free_income(self):
        self.assertLessEqual(ev("kotak", net_monthly_income=100000, existing_emi_total=20000, cibil_score=800)["max_amount"], 20 * 80000)
    def test_bajaj_10x_cap(self):
        self.assertLessEqual(ev("bajaj", net_monthly_income=100000)["max_amount"], 10 * 100000)


class Pricing(unittest.TestCase):
    def test_pnb_published_rate(self):
        self.assertEqual(ev("pnb", cibil_score=810)["rate"], 10.85)
    def test_pnb_private_employee_needs_750(self):
        r = ev("pnb", employer_category="pvt_ltd", cibil_score=720)
        self.assertFalse(r["eligible"]); self.assertEqual(r["fails"][0][2], {"lever": "cibil", "target": 750})
        self.assertTrue(ev("pnb", employer_category="govt", cibil_score=720)["eligible"])
    def test_union_private_table(self):       # retail_roi.pdf sec 7.1, w.e.f. 08.10.2026
        for score, rate in ((820, 9.30), (760, 9.60), (720, 10.10), (690, 10.60), (660, 11.05)):
            self.assertEqual(ev("union", cibil_score=score)["rate"], rate, score)
    def test_union_no_history_priced_in_750_band(self):
        self.assertEqual(ev("union", cibil_score=None)["rate"], 9.60)
    def test_union_govt_srlge_depends_on_salary_account(self):
        self.assertEqual(ev("union", employer_category="govt", cibil_score=820, salary_account_banks=["union"])["rate"], 9.20)
        self.assertEqual(ev("union", employer_category="govt", cibil_score=820)["rate"], 9.25)
    def test_band_template_for_lenders_without_a_table(self):    # A04: HDFC at 780 -> 9.99 + 0.09 x (24 - 9.99)
        self.assertEqual(ev("hdfc", cibil_score=780)["rate"], 11.25)
        self.assertEqual(ev("hdfc", cibil_score=810)["rate"], 9.99)
    def test_rate_never_outside_published_range(self):
        for lid, L in M.items():
            for score in (650, 700, 720, 750, 800, 850):
                r = ev(lid, cibil_score=score, salary_account_banks=["sbi"], employer_category="govt")
                if r["eligible"] and not any(t["lender_id"] == lid for t in T):
                    self.assertTrue(L["rate_min"] <= r["rate"] <= (L["rate_max"] or L["rate_min"]), (lid, score))


class Fees(unittest.TestCase):
    def test_hdfc_flat_fee_plus_gst(self):    # "Up to Rs 6,500/- + GST"
        self.assertEqual(ev("hdfc", requested_amount=500000)["fee"], 7670)
    def test_union_min_and_max(self):         # 1%, min 500, max 7,500, + GST
        self.assertEqual(ev("union", requested_amount=30000)["fee"], round(500 * 1.18))
        self.assertEqual(ev("union", requested_amount=1000000)["fee"], round(7500 * 1.18))
    def test_sbi_govt_waiver(self):           # 1.5% -> 0.75% for govt, + GST
        self.assertEqual(ev("sbi", employer_category="govt", salary_account_banks=["sbi"], requested_amount=500000, cibil_score=760)["fee"], round(3750 * 1.18))
    def test_indian_bank_govt_nil(self):
        self.assertEqual(ev("indianbank", employer_category="psu", requested_amount=500000)["fee"], 0)
    def test_pnb_documentation_fee(self):     # 1% + Rs 450 above 2 lakh, + GST
        self.assertEqual(ev("pnb", requested_amount=500000)["fee"], round((5000 + 450) * 1.18))
    def test_gst_included_lenders_not_grossed_up(self):
        self.assertEqual(ev("bajaj", requested_amount=500000)["fee"], round(500000 * 0.0413))
    def test_best_option_minimises_true_cost(self):   # ranking is by APR (rate + fees), with the A09 estimate penalty
        r = run(requested_amount=500000, requested_tenure=60)
        score = lambda v: v["apr"] + A["est_penalty"] * len(v["estimated_fields"])
        self.assertEqual(score(r["best"]), min(score(v) for v in r["approvals"] if v["covers_request"]))


class Rules(unittest.TestCase):
    def test_sbi_needs_salary_account(self):
        self.assertFalse(ev("sbi")["eligible"]); self.assertTrue(ev("sbi", salary_account_banks=["sbi"])["eligible"])
    def test_axis_account_lowers_floor(self):
        self.assertFalse(ev("axis", net_monthly_income=20000)["eligible"]); self.assertTrue(ev("axis", net_monthly_income=20000, salary_account_banks=["axis"])["eligible"])
    def test_low_cibil_rejected(self):
        self.assertFalse(ev("hdfc", cibil_score=650)["eligible"])
    def test_no_history_only_where_published(self):
        self.assertFalse(ev("hdfc", cibil_score=None)["eligible"]); self.assertTrue(ev("pnb", cibil_score=None)["eligible"])
    def test_age_window_shrinks_tenure(self):
        r = ev("hdfc", age=58, requested_tenure=72); self.assertTrue(r["eligible"]); self.assertLessEqual(r["tenure"], 24)
    def test_age_over_limit(self):
        self.assertFalse(ev("hdfc", age=61)["eligible"])
    def test_credit_card_dues_count_as_obligations(self):     # A03: 5% of Rs 6L = Rs 30k a month
        clean, card = ev("hdfc", requested_amount=None), ev("hdfc", credit_card_outstanding=600000, requested_amount=None)
        self.assertLess(card["max_amount"], clean["max_amount"])
    def test_non_resident_rejected(self):
        self.assertFalse(run(citizenship="other")["eligible"])
    def test_self_employed_out_of_scope(self):
        r = run(employment_type="self_employed"); self.assertFalse(r["eligible"]); self.assertIn("salaried applicants only", r["reason"])
    def test_cash_salary_rejected(self):
        self.assertFalse(run(salary_credited_via_bank=False)["eligible"])
    def test_amount_never_exceeds_lender_cap(self):
        for lid, L in M.items():
            r = ev(lid, net_monthly_income=1000000, salary_account_banks=[lid], employer_category="govt")
            if r["eligible"]: self.assertLessEqual(r["max_amount"], L["max_amount"])
    def test_emi_never_breaches_foir(self):
        for lid, L in M.items():
            r = ev(lid, existing_emi_total=30000, salary_account_banks=["sbi"], requested_amount=None)
            if r["eligible"] and not L["multiple_tier2"]:
                base = 100000 / A["gross_to_net"] if L["multiple_basis"] == "gross" else 100000
                self.assertLessEqual(30000 + r["emi"], L["foir_cap"] * base * 1.01, lid)


class Confidence(unittest.TestCase):
    def test_cibil_close_to_cutoff_is_borderline(self):
        r = ev("icici", cibil_score=705); self.assertEqual(r["confidence"], "borderline"); self.assertIn("CIBIL only 5 points", r["tight"][0])
    def test_wide_margins_are_strong(self):
        self.assertEqual(ev("icici", cibil_score=820, requested_amount=300000)["confidence"], "strong")
    def test_two_tight_rules_are_risky(self):
        self.assertEqual(ev("icici", cibil_score=705, net_monthly_income=31000, requested_amount=100000)["confidence"], "risky")


class PathToYes(unittest.TestCase):
    def test_every_lever_really_unlocks_its_lenders(self):
        for p in load_profiles():
            r = E.run(p, D)
            for lv in r["path_to_yes"]:
                b = E._apply(p, lv)
                for lid in lv["unlock_ids"]:
                    self.assertTrue(E.evaluate(b, M[lid], T, A)["eligible"], (p["name"], lv["text"], lid))
    def test_low_cibil_profile_is_told_the_score_to_reach(self):
        r = run(cibil_score=610)
        self.assertFalse(r["eligible"]); self.assertEqual(r["path_to_yes"][0]["lever"], "cibil"); self.assertGreaterEqual(r["path_to_yes"][0]["n"], 15)
    def test_never_suggests_cutting_more_emi_than_exists(self):
        for lv in run(existing_emi_total=5000, net_monthly_income=12000)["path_to_yes"]:
            if lv["lever"] == "emi": self.assertLessEqual(lv["reduce_by"], 5000)


class Uncertainty(unittest.TestCase):
    def test_strict_base_lenient_are_ordered(self):
        for p in load_profiles():
            u = E.run(p, D)["uncertainty"]
            if u: self.assertTrue(u["approvals"]["strict"] <= u["approvals"]["base"] <= u["approvals"]["lenient"], p["name"])
    def test_official_only_lender_is_robust(self):
        r = run(salary_account_banks=["sbi"], requested_amount=300000)
        sbi = next(v for v in r["approvals"] if v["lender_id"] == "sbi"); self.assertTrue(sbi["robust"])


class Profiles(unittest.TestCase):
    """Every test profile has an expected outcome recorded in tests/test_profiles.json ('expect')."""
    def test_expected_outcomes(self):
        for p in load_profiles():
            r = E.run(p, D); s = E.strength(r, len(M)); e = p["expect"]
            got = {"eligible": r["eligible"], "approvals": len(r["approvals"]), "tier": s["tier"], "best": r.get("best", {}).get("lender_id")}
            self.assertEqual(got, e, p["name"])
    def test_brief_edge_cases_are_covered(self):
        names = " ".join(p["name"].lower() for p in load_profiles())
        for edge in ("low cibil", "high existing emi", "new job", "self-employed", "age near limit"): self.assertIn(edge, names)


class DataIntegrity(unittest.TestCase):
    def test_counts_dates_and_urls(self):
        self.assertEqual(len(M), 20)
        for r in rows("lender_rules_long.csv"):
            self.assertIn(r["accessed_on"], ("2026-10-11", "2026-10-12"), r["rule_id"]); self.assertTrue(r["source_url"], r["rule_id"])
    def test_three_source_types_and_estimates_flagged(self):
        for r in rows("lender_rules_long.csv"):
            self.assertIn(r["source_type"], ("official_published", "calculator_derived", "peer_estimate"), r["rule_id"])
            self.assertEqual(r["is_estimate"] == "yes", r["source_type"] == "peer_estimate", r["rule_id"])
    def test_no_rule_claims_official_while_saying_unverified(self):
        for r in rows("lender_rules_long.csv"):
            if "not published/verified by us" in r["how_derived_or_evidence"].lower(): self.assertEqual(r["source_type"], "peer_estimate", r["rule_id"])
    def test_every_estimated_numeric_cell_has_bounds(self):
        sys.path.insert(0, os.path.join(ROOT, "scripts")); from build_estimate_bounds import DIRECTION
        bounded = {(b["lender_id"], b["field"]) for b in D["bounds"]}
        for lid, L in M.items():
            for f in L["estimated"] & set(DIRECTION):
                if L[f] is not None: self.assertIn((lid, f), bounded)
    def test_bounds_bracket_base_value(self):
        for b in D["bounds"]:
            lo, hi = sorted((b["strict"], b["lenient"])); self.assertTrue(lo <= b["base"] <= hi, b)
    def test_matrix_matches_long_table(self):
        long = {(r["lender_id"], r["rule_name"]): r["rule_value"] for r in rows("lender_rules_long.csv")}
        self.assertEqual(float(long[("union", "min_cibil_score")]), M["union"]["min_cibil"])
        self.assertEqual(float(long[("hdfc", "processing_fee_max_inr")]), M["hdfc"]["fee_max_inr"])
    def test_test_results_file_is_current(self):     # the committed outputs must match what the model produces now
        profiles = load_profiles()
        expected = E.to_md([E.run(p, D) for p in profiles], len(M))
        self.assertIn(expected, read_text(os.path.join(ROOT, "tests", "test_results.md")), "run: python src/eligibility.py")


if __name__ == "__main__": unittest.main()
