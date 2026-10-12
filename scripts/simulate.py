"""Runs the model over 10,000 synthetic salaried applicants to measure how the RULES behave (not real approval rates).

Answers the brief's insight questions with numbers: which rule rejects the most applicants, how lenders and lender types
differ, what a better CIBIL score or a salary account is worth, how often fees change the best lender, and how much the
peer-estimated data moves the answer. Also checks the rate-band template against HDFC's published average rate.

The population is synthetic (assumption A10 in data/assumptions.csv): every distribution below is an assumption.
Writes docs/insights.json (used by the web app) and docs/insights.md.   Run: python scripts/simulate.py
"""
import collections, json, math, os, random, statistics, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "src"))
import eligibility as E

N, SEED = 10000, 2026
rng = random.Random(SEED)
D = E.load_all(); M, T, A = D["matrix"], D["tiers"], D["A"]
STRICT, LENIENT = E.scenario(M, D["bounds"], "strict"), E.scenario(M, D["bounds"], "lenient")
EMPLOYERS = [("govt", .10), ("psu", .05), ("defence", .02), ("mnc", .15), ("listed", .10), ("public_ltd", .08), ("pvt_ltd", .35), ("small_unlisted", .15)]
BANKS = [("sbi", .35), ("hdfc", .20), ("icici", .15), ("axis", .10), ("kotak", .05), ("pnb", .05), ("union", .05), ("indianbank", .05)]


def pick(pairs):
    x, acc = rng.random(), 0
    for k, w in pairs:
        acc += w
        if x <= acc: return k
    return pairs[-1][0]


def applicant():
    age = round(rng.triangular(21, 58, 30))
    inc = min(500000, max(10000, round(35000 * math.exp(rng.gauss(0, 0.6)), -2)))
    exp = int((age - 21) * 12 * rng.uniform(0.6, 1.0))
    return {"age": age, "employer_category": pick(EMPLOYERS), "net_monthly_income": inc,
            "cibil_score": None if rng.random() < 0.10 else int(min(900, max(300, rng.gauss(730, 55)))),
            "existing_emi_total": 0 if rng.random() < 0.45 else round(inc * rng.uniform(0.05, 0.6), -2),
            "credit_card_outstanding": 0 if rng.random() < 0.70 else round(50000 * math.exp(rng.gauss(0, 0.8)), -3),
            "work_experience_total": exp, "months_in_current_job": int(exp * rng.uniform(0.1, 1.0)),
            "salary_account_banks": [pick(BANKS)] if rng.random() < 0.30 else [],
            "requested_amount": round(inc * rng.uniform(3, 15), -4), "requested_tenure": rng.choice([36, 48, 60])}


def eval_all(a, matrix):
    return {lid: E.evaluate(a, L, T, A) for lid, L in matrix.items()}


pop = [applicant() for _ in range(N)]
pair_fail = collections.Counter(); zero_main = collections.Counter(); n_ok_hist = collections.Counter()
lender_ok = collections.Counter(); lender_apr = collections.defaultdict(list); lender_amt = collections.defaultdict(list)
conf = collections.Counter(); strict_n, base_n, lenient_n, moved = [], [], [], 0
fee_flip = fee_flip_n = 0; fee_saving = []
hdfc_rates = []; cibil_gain = []; sbi_gain = []
for a in pop:
    res = eval_all(a, M)
    ok = [v for v in res.values() if v["eligible"]]
    n_ok_hist[len(ok)] += 1
    blockers = collections.Counter()
    for lid, v in res.items():
        if v["eligible"]:
            lender_ok[lid] += 1; lender_apr[lid].append(v["apr"]); lender_amt[lid].append(v["max_amount"]); conf[v["confidence"]] += 1
            if lid == "hdfc" and a["cibil_score"] and a["cibil_score"] >= 750: hdfc_rates.append(v["rate"])
        else:
            for c in {c for c, _, _ in v["fails"]}: pair_fail[c] += 1; blockers[c] += 1
    if not ok: zero_main[blockers.most_common(1)[0][0]] += 1
    s = sum(v["eligible"] for v in eval_all(a, STRICT).values()); l = sum(v["eligible"] for v in eval_all(a, LENIENT).values())
    strict_n.append(s); base_n.append(len(ok)); lenient_n.append(l); moved += (s != l)
    pool = [v for v in ok if v["covers_request"]] or ok
    if pool:
        by_apr = min(pool, key=lambda v: v["apr"]); by_rate = min(pool, key=lambda v: v["rate"])
        fee_flip_n += 1
        if by_apr is not by_rate:
            fee_flip += 1
            if by_rate["tenure"] == by_apr["tenure"]: fee_saving.append(by_rate["total_cost"] - by_apr["total_cost"])
    if a["cibil_score"] and 650 <= a["cibil_score"] < 750:
        cibil_gain.append(sum(v["eligible"] for v in eval_all(dict(a, cibil_score=a["cibil_score"] + 50), M).values()) - len(ok))
    if "sbi" not in a["salary_account_banks"]:
        sbi_gain.append(E.evaluate(dict(a, salary_account_banks=a["salary_account_banks"] + ["sbi"]), M["sbi"], T, A)["eligible"] - res["sbi"]["eligible"])

pairs = N * len(M)
zero = n_ok_hist[0]
cats = collections.defaultdict(list)
for lid, L in M.items(): cats[L["category"]].append(lender_ok[lid] / N)
med = lambda xs: round(statistics.median(xs), 2) if xs else None
ins = {
    "population": {"n": N, "seed": SEED, "note": "synthetic salaried applicants; distributions are assumptions (A10), not real data"},
    "approved_by_any": round(1 - zero / N, 4),
    "lenders_per_applicant": {str(k): n_ok_hist[k] for k in range(len(M) + 1)},
    "median_lenders": statistics.median(base_n),
    "rule_failures": [{"rule": c, "label": E.LABEL.get(c, c), "share_of_checks": round(n / pairs, 4), "main_blocker_share": round(zero_main[c] / zero, 4) if zero else 0}
                      for c, n in pair_fail.most_common()],
    "lenders": sorted([{"lender_id": lid, "lender": L["lender_name"], "category": L["category"], "approval_rate": round(lender_ok[lid] / N, 4),
                        "median_apr": med(lender_apr[lid]), "median_max_amount": int(statistics.median(lender_amt[lid])) if lender_amt[lid] else None,
                        "n_estimated": int(L["n_estimated"])} for lid, L in M.items()], key=lambda x: -x["approval_rate"]),
    "by_category": {k: round(statistics.mean(v), 4) for k, v in sorted(cats.items(), key=lambda kv: -statistics.mean(kv[1]))},
    "confidence_mix": {k: round(v / sum(conf.values()), 4) for k, v in conf.items()},
    "cibil_plus_50": {"applicants": len(cibil_gain), "avg_extra_lenders": round(statistics.mean(cibil_gain), 2)},
    "sbi_account": {"applicants": len(sbi_gain), "share_unlocking_sbi": round(sum(sbi_gain) / len(sbi_gain), 4)},
    "fees_change_best": {"share": round(fee_flip / fee_flip_n, 4), "median_saving_inr": int(statistics.median(fee_saving)) if fee_saving else 0},
    "uncertainty": {"avg_strict": round(statistics.mean(strict_n), 2), "avg_base": round(statistics.mean(base_n), 2), "avg_lenient": round(statistics.mean(lenient_n), 2),
                    "share_profiles_affected": round(moved / N, 4)},
    "rate_validation": {"hdfc_model_median_rate_cibil_750plus": med(hdfc_rates), "hdfc_published_avg_irr_q1_fy27": 10.89,
                        "source": "hdfc.bank.in/personal-loan/interest-rates-and-charges (Apr-Jun 2026: min 9.97%, avg 10.89%, max 24.06%)"},
}
os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
json.dump(ins, open(os.path.join(ROOT, "docs", "insights.json"), "w"), indent=1)

pc = lambda x: f"{x:.0%}"
md = ["# Insights from 10,000 simulated applicants", "",
      f"Generated by `python scripts/simulate.py` (seed {SEED}). The applicants are **synthetic** (assumption A10): the numbers show how the "
      "published rules behave across a plausible salaried population, not how many real applicants each lender approves.", "",
      "## Headline numbers", "",
      f"- **{pc(ins['approved_by_any'])}** of applicants are approved by at least one lender; the median applicant gets **{ins['median_lenders']:.0f}** of 20.",
      f"- **Fees change the best lender for {pc(ins['fees_change_best']['share'])} of applicants.** When they do, choosing by headline rate costs a median **INR {ins['fees_change_best']['median_saving_inr']:,}** more over the same tenure.",
      f"- **+50 CIBIL points** unlock **{ins['cibil_plus_50']['avg_extra_lenders']}** more lenders on average for applicants scoring 650-749.",
      f"- **An SBI salary account** turns SBI from no to yes for **{pc(ins['sbi_account']['share_unlocking_sbi'])}** of applicants who don't have one (SBI requires it).",
      f"- **Estimated data matters:** with every peer estimate at its strict bound an applicant averages {ins['uncertainty']['avg_strict']} approvals, "
      f"at its lenient bound {ins['uncertainty']['avg_lenient']} (base {ins['uncertainty']['avg_base']}); the answer moves for {pc(ins['uncertainty']['share_profiles_affected'])} of applicants.",
      f"- **Rate check:** for CIBIL 750+ the model's median HDFC rate is **{ins['rate_validation']['hdfc_model_median_rate_cibil_750plus']}%**; HDFC's published average actual rate for Apr-Jun 2026 is **10.89%**.", "",
      "## 1. Which rule rejects the most applicants", "", "| Rule | Share of all applicant x lender checks it fails | Main blocker for applicants no one approves |", "|---|---|---|"]
md += [f"| {r['label']} | {pc(r['share_of_checks'])} | {pc(r['main_blocker_share'])} |" for r in ins["rule_failures"]]
md += ["", "## 2. How lenders differ", "", "| Lender | Type | Approves | Median APR | Median max amount (INR) | Estimated rule cells |", "|---|---|---|---|---|---|"]
md += [f"| {l['lender']} | {l['category'].replace('_', ' ')} | {pc(l['approval_rate'])} | {l['median_apr'] or '-'}% | {l['median_max_amount'] or 0:,} | {l['n_estimated']} |" for l in ins["lenders"]]
md += ["", "Average approval rate by lender type: " + ", ".join(f"{k.replace('_', ' ')} {pc(v)}" for k, v in ins["by_category"].items()) + ".", "",
       "## 3. How confident are approvals", "", "Share of all approvals graded strong / borderline / risky (assumptions A05-A08): " +
       ", ".join(f"{k} {pc(v)}" for k, v in sorted(ins["confidence_mix"].items())) + "."]
open(os.path.join(ROOT, "docs", "insights.md"), "w").write("\n".join(md) + "\n")
print("\n".join(md))
