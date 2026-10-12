"""Rule-based personal-loan eligibility engine for salaried applicants in India. No machine learning.

For every lender in data/lender_rules_matrix.csv the engine
  1. runs hard gates      age, income floor, CIBIL, experience, job tenure, employer type, salary-account rule, citizenship
  2. prices the loan      published CIBIL table (PNB, Union) or the band template (assumption A04) between published min/max rate
  3. sizes the loan       min(FOIR capacity, salary-multiple limit, lender cap)   [Axis: tiered calculator rule]
  4. costs the loan       processing fee (with waivers, min/max, GST) + interest -> total cost and APR
  5. grades confidence    how far the applicant clears each rule (strong / borderline / risky)
then, across lenders, it
  6. ranks by true cost   lowest APR among lenders that fund the request (small penalty for estimated data, A09)
  7. finds a path to yes  the smallest single change that unlocks more lenders
  8. measures uncertainty re-runs with every peer-estimated value at its strict and lenient bound (data/estimate_bounds.csv)

Run:  python src/eligibility.py      (runs tests/test_profiles.json -> tests/test_results.md)
"""
import copy, csv, json, math, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
TEXT_COLS = {"lender_id", "lender_name", "product_name", "category", "lender_type", "multiple_basis", "account_requirement", "employer_types",
             "foreclosure", "fee_gst_included", "fee_waivers", "doc_fee_inr", "estimated_fields", "calculator_fields", "confidence",
             "primary_source_url", "accessed_on"}
DECIDING = ("min_income", "min_cibil", "max_amount", "max_tenure", "rate_min", "rate_max", "foir_cap", "multiple", "fee_pct")
NO_HISTORY_OK = {"pnb": "PNB prices no-history applicants in its 750-799 band", "union": "Union prices no-history (-1) applicants in its 750-799 band",
                 "fibe": "Fibe says first-time borrowers are considered"}
LABEL = {"cibil": "credit score", "age": "age", "income": "income", "emi": "existing EMIs", "experience": "work experience", "job": "time in current job",
         "employer": "employer type", "account": "salary-account rule", "amount": "loan size", "salary": "salary credit", "citizenship": "citizenship"}
GOVT = {"govt", "psu", "defence"}
BANDS = [(800, "800+"), (750, "750-799"), (700, "700-749"), (680, "680-699"), (650, "650-679"), (300, "<650")]


# ----------------------------------------------------------------------------------------------------------- data
def _csv(name):
    with open(os.path.join(ROOT, "data", name), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_assumptions():
    A = {r["id"]: r for r in _csv("assumptions.csv")}
    template = {}
    for part in A["A04"]["value"].split("|"):
        band, pos = part.strip().split(":")
        template[band] = float(pos)
    return {"gross_to_net": float(A["A01"]["value"]), "gst": float(A["A02"]["value"]) / 100, "card_share": float(A["A03"]["value"]),
            "band_template": template, "cibil_margin": float(A["A05"]["value"]), "foir_margin": float(A["A06"]["value"]),
            "income_margin": float(A["A07"]["value"]), "tenure_margin": float(A["A08"]["value"]), "est_penalty": float(A["A09"]["value"]),
            "calc_ref_tenure": float(A["A11"]["value"])}


def load_matrix():
    out = {}
    for r in _csv("lender_rules_matrix.csv"):
        for k, v in r.items():
            if k not in TEXT_COLS:
                r[k] = float(v) if v not in ("", None) else None
        r["estimated"] = set(filter(None, r["estimated_fields"].split("|")))
        r["calc"] = set(filter(None, r["calculator_fields"].split("|")))
        out[r["lender_id"]] = r
    return out


def load_tiers():
    tiers = _csv("rate_tiers.csv")
    for t in tiers:
        t["cibil_min"], t["cibil_max"], t["rate_pct"] = float(t["cibil_min"]), float(t["cibil_max"]), float(t["rate_pct"])
    return tiers


def load_bounds():
    return [dict(r, base=float(r["base"]), strict=float(r["strict"]), lenient=float(r["lenient"])) for r in _csv("estimate_bounds.csv")]


def load_all():
    return {"matrix": load_matrix(), "tiers": load_tiers(), "bounds": load_bounds(), "A": load_assumptions()}


def scenario(matrix, bounds, which):
    """Copy of the matrix with every peer-estimated numeric value moved to its 'strict' or 'lenient' bound."""
    if which == "base": return matrix
    M = copy.deepcopy(matrix)
    for b in bounds:
        M[b["lender_id"]][b["field"]] = b[which]
    return M


# ----------------------------------------------------------------------------------------------------------- maths
def rnd(x, nd=0):
    """Round half up (same as JavaScript's Math.round), so webui/eligibility.js gives identical numbers."""
    f = 10 ** nd
    v = math.floor(x * f + 0.5) / f
    return int(v) if nd == 0 else v


def emi(p, rate_pct, n):
    r = rate_pct / 1200
    return p / n if r == 0 else p * r * (1 + r) ** n / ((1 + r) ** n - 1)


def capacity(emi_room, rate_pct, n):
    """Loan principal whose EMI equals emi_room (present value of an annuity)."""
    r = rate_pct / 1200
    return emi_room * n if r == 0 else emi_room * ((1 + r) ** n - 1) / (r * (1 + r) ** n)


def apr(principal, upfront_fee, monthly, n):
    """Annual percentage rate: the rate at which the EMIs repay what actually reaches the borrower (principal minus fees)."""
    net = principal - upfront_fee
    lo, hi = 0.0, 1.0
    for _ in range(100):
        mid = (lo + hi) / 2
        pv = monthly * n if mid == 0 else monthly * (1 - (1 + mid) ** -n) / mid
        lo, hi = (mid, hi) if pv > net else (lo, mid)
    return rnd(lo * 1200, 2)


def band_of(cibil):
    for lo, name in BANDS:
        if cibil >= lo: return name
    return "<650"


# ----------------------------------------------------------------------------------------------------------- rules
def employer_ok(accepted, category):
    if accepted in ("any", "", None): return True
    acc = set(accepted.split("|"))
    known = {"govt", "psu", "defence", "mnc", "listed", "public_ltd", "pvt_ltd", "corporate", "pvt_company", "public_sector", "unlisted_public", "llp", "doctor"}
    if not (acc & known): return True          # e.g. "permanent_regular": a status condition, not an employer class
    aliases = {"govt": {"govt", "public_sector"}, "psu": {"psu", "public_sector", "govt"}, "defence": {"defence", "govt"},
               "mnc": {"mnc", "listed", "corporate", "pvt_ltd", "public_ltd", "pvt_company"}, "listed": {"listed", "public_ltd", "corporate", "mnc", "pvt_company", "unlisted_public"},
               "public_ltd": {"public_ltd", "corporate", "pvt_company", "unlisted_public"}, "pvt_ltd": {"pvt_ltd", "corporate", "pvt_company", "llp"},
               "small_unlisted": set()}
    return bool(acc & aliases.get(category, {category}))


def price(L, a, tiers, A):
    """Expected rate and how it was found. Returns (None, reason, fix) when a published table has no band for this applicant."""
    cibil = a.get("cibil_score")
    no_hist = cibil is None or cibil < 0
    own = [t for t in tiers if t["lender_id"] == L["lender_id"]]
    if own:
        group = "govt_psu" if a["employer_category"] in GOVT else "private_employee"
        holds = L["lender_id"] in a.get("salary_account_banks", [])
        cand = [t for t in own if t["employer_group"] == group and t["salary_account"] in ("any", "yes" if holds else "no")]
        for t in cand:
            if (no_hist and t["includes_no_history"] == "yes") or (not no_hist and t["cibil_min"] <= cibil <= t["cibil_max"]):
                return t["rate_pct"], f"published {L['lender_name']} CIBIL table ({t['scheme']})", None
        lowest = min((t["cibil_min"] for t in cand), default=None)
        return None, f"{L['lender_name']}'s published rate table has no band for this score ({group.replace('_', ' ')}s need {lowest:.0f}+)", \
            {"lever": "cibil", "target": lowest}
    lo, hi = L["rate_min"], L["rate_max"] if L["rate_max"] is not None else L["rate_min"]
    band = "750-799" if no_hist else band_of(cibil)
    pos = A["band_template"][band]
    note = f"band template (A04): CIBIL band {band} sits {pos:.0%} of the way from {lo}% to {hi}%" if hi != lo else "only one published rate"
    return rnd(lo + pos * (hi - lo), 2), note, None


def fee_for(L, amount, a, A):
    """Upfront cost in INR (processing fee after waivers, documentation fee, GST) and a short explanation."""
    pct, fmin, fmax = L["fee_pct"], L["fee_min_inr"], L["fee_max_inr"]
    if pct is None and fmax is None:
        return 0.0, "no fee published"
    fee = fmax if pct is None else amount * pct / 100           # HDFC publishes only a flat "up to Rs 6,500"
    if fmin is not None: fee = max(fee, fmin)
    if fmax is not None: fee = min(fee, fmax)
    limits = ", ".join(x for x in (f"min {fmin:,.0f}" if fmin else "", f"max {fmax:,.0f}" if fmax else "") if x)
    note = (f"{pct:g}% of loan" if pct is not None else f"flat up to INR {fmax:,.0f}") + (f" ({limits})" if pct is not None and limits else "")
    mult, why = 1.0, None
    for part in filter(None, (L["fee_waivers"] or "").split(";")):
        key, m = part.split("="); m = float(m)
        emp = a["employer_category"]
        hit = key == emp or (key == "govt" and emp == "defence" and "defence" not in L["fee_waivers"]) or \
              (key == "cibil800" and (a.get("cibil_score") or 0) >= 800)
        if hit and m < mult: mult, why = m, key
    if why: note += f"; {'waived' if mult == 0 else f'{1 - mult:.0%} waiver'} for {'CIBIL 800+' if why == 'cibil800' else why}"
    fee *= mult
    if L["doc_fee_inr"]:
        small, large = (float(x) for x in L["doc_fee_inr"].split(";"))
        doc = small if amount <= 200000 else large
        if not (why and mult == 0): fee += doc; note += f" + documentation INR {doc:,.0f}"
    if L["fee_gst_included"] != "yes":
        fee *= 1 + A["gst"]; note += " + 18% GST"
    return rnd(fee), note


def obligations(a, A):
    return (a.get("existing_emi_total") or 0) + A["card_share"] * (a.get("credit_card_outstanding") or 0)


def evaluate(a, L, tiers, A):
    """One applicant x one lender. Returns an approval dict, or {'eligible': False, 'fails': [(code, message, fix|None)]}."""
    fails, notes = [], []
    lid = L["lender_id"]
    holds = lid in a.get("salary_account_banks", [])
    inc, obl = a["net_monthly_income"], obligations(a, A)
    cibil = a.get("cibil_score")
    no_hist = cibil is None or cibil < 0
    if a.get("citizenship", "indian_resident") != "indian_resident": fails.append(("citizenship", "only Indian resident citizens are eligible", None))
    if not a.get("salary_credited_via_bank", True): fails.append(("salary", "salary must be credited to a bank account (cash salary rejected)", None))
    if L["account_requirement"] == "mandatory" and not holds:
        fails.append(("account", "needs a salary account with this bank (mandatory)", {"lever": "account", "bank": lid}))
    if not employer_ok(L["employer_types"], a["employer_category"]):
        fails.append(("employer", f"employer type '{a['employer_category']}' not accepted (accepts {L['employer_types']})", None))
    if a["age"] < L["min_age"]:
        fails.append(("age", f"age {a['age']:g} is below the minimum {L['min_age']:.0f}", {"lever": "wait", "months": int((L["min_age"] - a["age"]) * 12)}))
    if L["max_age_app"] and a["age"] > L["max_age_app"]: fails.append(("age", f"age {a['age']:g} is above the maximum {L['max_age_app']:.0f} at application", None))
    cap_age = L["max_age_maturity"] or L["max_age_app"] or 60
    if a["age"] >= cap_age: fails.append(("age", f"age {a['age']:g} leaves no repayment window before age {cap_age:.0f}", None))
    floor = L["min_income_account_holder"] if (holds and L["min_income_account_holder"]) else L["min_income"]
    if floor and inc < floor:
        fix = {"lever": "account", "bank": lid} if (L["min_income_account_holder"] and not holds and inc >= L["min_income_account_holder"]) \
            else {"lever": "income", "target": floor}
        fails.append(("income", f"net income {inc:,.0f} is below the minimum {floor:,.0f}" + (" (account-holder floor)" if holds and L["min_income_account_holder"] else ""), fix))
    if L["min_cibil"]:
        if no_hist:
            if lid in NO_HISTORY_OK: notes.append(NO_HISTORY_OK[lid])
            else: fails.append(("cibil", f"no credit history; lender expects CIBIL {L['min_cibil']:.0f}+", {"lever": "cibil", "target": L["min_cibil"]}))
        elif cibil < L["min_cibil"]:
            fails.append(("cibil", f"CIBIL {cibil:.0f} is below {L['min_cibil']:.0f}", {"lever": "cibil", "target": L["min_cibil"]}))
    exp_gap = (L["min_exp_months"] or 0) - a["work_experience_total"]
    job_gap = (L["min_cur_job_months"] or 0) - a["months_in_current_job"]
    if exp_gap > 0: fails.append(("experience", f"total experience {a['work_experience_total']:g}m is below {L['min_exp_months']:.0f}m", {"lever": "wait", "months": int(max(exp_gap, job_gap))}))
    if job_gap > 0: fails.append(("job", f"time in current job {a['months_in_current_job']:g}m is below {L['min_cur_job_months']:.0f}m", {"lever": "wait", "months": int(max(exp_gap, job_gap))}))
    months_left = int((cap_age - a["age"]) * 12)
    if a["age"] < cap_age and months_left < L["min_tenure"]:
        fails.append(("age", f"only {months_left} months left before age {cap_age:.0f}; minimum tenure {L['min_tenure']:.0f}", None))
    if fails: return {"eligible": False, "fails": fails}

    want_n = a.get("requested_tenure") or L["max_tenure"]
    n = int(max(min(L["max_tenure"], months_left, want_n), L["min_tenure"]))
    age_cut = months_left < min(L["max_tenure"], want_n)
    rate, rnote, rfix = price(L, a, tiers, A)
    if rate is None: return {"eligible": False, "fails": [("cibil", rnote, rfix)]}
    gross = a.get("gross_monthly_income") or inc / A["gross_to_net"]
    if L["multiple_basis"] == "gross" and not a.get("gross_monthly_income"): notes.append(f"gross income assumed = net / {A['gross_to_net']} (A01)")
    base_inc = gross if L["multiple_basis"] == "gross" else inc
    ratio = obl / inc

    if L["multiple_tier2"]:                       # Axis calculator rule: tiered multiple on obligations/income, hard cut-off at foir_cap
        if ratio >= L["foir_cap"]:
            return {"eligible": False, "fails": [("emi", f"existing EMIs are {ratio:.0%} of income; the lender stops at {L['foir_cap']:.0%}",
                                                  {"lever": "emi", "reduce_by": obl - L["foir_cap"] * inc + 1})]}
        mult = L["multiple_tier2"] if ratio > L["tier2_obligation_ratio"] else L["multiple"]
        if mult == L["multiple_tier2"]: notes.append(f"EMIs above {L['tier2_obligation_ratio']:.0%} of income cut the multiple to {mult:.0f}x")
        by_mult = mult * base_inc
        ref = min(A["calc_ref_tenure"], L["max_tenure"])          # the calculator's multiple implies an EMI at its own tenure (A11)
        if n < ref:
            by_mult *= capacity(1, rate, n) / capacity(1, rate, ref)
            notes.append(f"salary multiple scaled to the {n}-month tenure so the EMI stays affordable (A11)")
        amt = min(by_mult, L["max_amount"]); binding = "salary multiple" if amt == by_mult else "lender cap"
        foir_cap_used = L["foir_cap"]
    else:
        room = L["foir_cap"] * base_inc - obl
        need_room = emi(L["min_amount"], rate, n)
        if room < need_room:
            return {"eligible": False, "fails": [("emi", f"existing EMIs leave {'no' if room <= 0 else 'too little'} room under the {L['foir_cap']:.0%} FOIR cap",
                                                  {"lever": "emi", "reduce_by": obl - (L["foir_cap"] * base_inc - need_room)})]}
        by_foir = capacity(room, rate, n)
        by_mult = L["multiple"] * ((inc - obl) if L["multiple_basis"] == "free_income" else base_inc)
        amt = min(by_foir, by_mult, L["max_amount"])
        binding = "FOIR" if amt == by_foir else "salary multiple" if amt == by_mult else "lender cap"
        foir_cap_used = L["foir_cap"]
    if amt < L["min_amount"]:
        return {"eligible": False, "fails": [("amount", f"affordable amount {amt:,.0f} is below the lender minimum {L['min_amount']:,.0f}", None)]}
    max_amt = int(amt // 1000 * 1000)
    req = a.get("requested_amount")
    approved = int(min(max_amt, req) if req else max_amt)
    m = emi(approved, rate, n)
    fee, fee_note = fee_for(L, approved, a, A)
    interest = m * n - approved

    # confidence: how much slack the applicant has on each rule this lender checks (A05-A08)
    tight = []
    if no_hist: tight.append("no credit history")
    elif L["min_cibil"] and cibil - L["min_cibil"] < A["cibil_margin"]:
        gap = cibil - L["min_cibil"]
        tight.append(f"CIBIL exactly at the {L['min_cibil']:.0f} cut-off" if gap == 0 else f"CIBIL only {gap:.0f} points above the {L['min_cibil']:.0f} cut-off")
    foir_after = (obl + m) / (inc if L["multiple_tier2"] else base_inc)
    if foir_cap_used - foir_after < A["foir_margin"]: tight.append(f"EMIs would use {foir_after:.0%} of income (cap {foir_cap_used:.0%})")
    if floor and inc < floor * (1 + A["income_margin"]): tight.append(f"income within {A['income_margin']:.0%} of the {floor:,.0f} floor")
    if L["min_exp_months"] and -exp_gap < A["tenure_margin"]: tight.append("experience just meets the minimum")
    if L["min_cur_job_months"] and -job_gap < A["tenure_margin"]: tight.append("time in current job just meets the minimum")
    if age_cut: notes.append(f"tenure cut to {n} months by the age limit {cap_age:.0f}")
    level = "strong" if not tight else "borderline" if len(tight) == 1 else "risky"

    return {"eligible": True, "lender_id": lid, "lender": L["lender_name"], "category": L["category"], "max_amount": max_amt, "approved_amount": approved,
            "rate": rate, "rate_basis": rnote, "tenure": n, "emi": rnd(m), "fee": fee, "fee_basis": fee_note,
            "total_interest": rnd(interest), "total_cost": rnd(interest + fee), "total_repayable": rnd(m * n + fee), "apr": apr(approved, fee, m, n),
            "binding": binding, "covers_request": (not req) or max_amt >= req,
            "estimated_fields": sorted(f for f in DECIDING if f in L["estimated"]), "calculator_fields": sorted(f for f in DECIDING if f in L["calc"]),
            "confidence": level, "tight": tight, "notes": notes}


# ----------------------------------------------------------------------------------------------------------- whole-market run
def _evaluate_all(a, M, D):
    return {lid: evaluate(a, L, D["tiers"], D["A"]) for lid, L in M.items()}


def _apply(a, lever):
    b = copy.deepcopy(a)
    k = lever["lever"]
    if k == "cibil": b["cibil_score"] = lever["target"]
    elif k == "emi":
        cut = lever["reduce_by"]
        b["existing_emi_total"] = max(0.0, (b.get("existing_emi_total") or 0) - cut)
    elif k == "wait":
        b["months_in_current_job"] += lever["months"]; b["work_experience_total"] += lever["months"]; b["age"] += lever["months"] / 12
    elif k == "income": b["net_monthly_income"] = lever["target"]
    elif k == "account": b["salary_account_banks"] = list(b.get("salary_account_banks", [])) + [lever["bank"]]
    return b


def _lever_text(lever, a, M):
    k = lever["lever"]
    if k == "cibil":
        return f"Build a credit history and reach CIBIL {lever['target']:.0f}" if a.get("cibil_score") in (None, -1) else f"Raise CIBIL from {a['cibil_score']:.0f} to {lever['target']:.0f}"
    if k == "emi": return f"Cut existing EMIs by INR {lever['reduce_by']:,.0f} a month"
    if k == "wait": return f"Wait {lever['months']} more month{'s' if lever['months'] != 1 else ''} in your job"
    if k == "income": return f"Net salary of INR {lever['target']:,.0f} a month"
    if k == "account": return f"Hold your salary account with {M[lever['bank']]['lender_name']}"
    return k


def _round_lever(lv):
    lv = dict(lv)
    if lv["lever"] == "emi": lv["reduce_by"] = float(-(-lv["reduce_by"] // 500) * 500)     # round up to the next INR 500
    if lv["lever"] == "income": lv["target"] = float(lv["target"])
    return lv


def path_to_yes(a, res, M, D):
    """Single changes that unlock rejected lenders, best first. Each lever is tested by re-running the model, not assumed."""
    rejected = [lid for lid, v in res.items() if not v["eligible"]]          # list, not set: keeps output order deterministic
    if not rejected: return []
    cand = {}
    for lid in rejected:
        for _, _, fix in res[lid]["fails"]:
            if fix:
                lv = _round_lever(fix); cand[json.dumps(lv, sort_keys=True)] = lv
    levers = []
    for lv in cand.values():
        if lv["lever"] == "emi" and lv["reduce_by"] > (a.get("existing_emi_total") or 0): continue   # cannot cut more EMI than exists
        if lv["lever"] == "cibil" and lv["target"] > 900: continue
        b = _apply(a, lv)
        unlocked = sorted(lid for lid in rejected if evaluate(b, M[lid], D["tiers"], D["A"])["eligible"])
        if unlocked:
            levers.append({**lv, "text": _lever_text(lv, a, M), "unlocks": [M[l]["lender_name"] for l in unlocked], "unlock_ids": unlocked, "n": len(unlocked)})
    # keep, per lever type, only options that unlock more than a cheaper option of the same type
    effort = lambda l: l.get("target") or l.get("reduce_by") or l.get("months") or 0
    levers.sort(key=lambda l: (l["lever"], effort(l)))
    kept, best_n = [], {}
    for l in levers:
        key = l["lever"] if l["lever"] != "account" else l["bank"]
        if l["n"] > best_n.get(key, 0): kept.append(l); best_n[key] = l["n"]
    return sorted(kept, key=lambda l: (-l["n"], effort(l)))


def _pick_best(ok, req, A):
    pool = [v for v in ok if v["covers_request"]] or ok
    return min(pool, key=lambda v: (v["apr"] + A["est_penalty"] * len(v["estimated_fields"]), -v["max_amount"])), pool


def run(a, data=None):
    D = data or load_all()
    M, A = D["matrix"], D["A"]
    if a.get("employment_type", "salaried") != "salaried":
        return {"profile": a.get("name"), "eligible": False, "approvals": [], "rejections": [], "path_to_yes": [], "uncertainty": None,
                "reason": "Out of scope: this model covers salaried applicants only. Self-employed income is assessed on ITRs and business vintage, which these lenders publish separately."}
    res = _evaluate_all(a, M, D)
    strict = _evaluate_all(a, scenario(M, D["bounds"], "strict"), D)
    lenient = _evaluate_all(a, scenario(M, D["bounds"], "lenient"), D)
    ok = sorted((v for v in res.values() if v["eligible"]), key=lambda v: v["apr"])
    for v in ok: v["robust"] = strict[v["lender_id"]]["eligible"]
    rejections = [{"lender_id": k, "lender": M[k]["lender_name"], "reasons": [m for _, m, _ in v["fails"]],
                   "codes": sorted({c for c, _, _ in v["fails"]}), "fixable": all(f is not None for _, _, f in v["fails"])}
                  for k, v in res.items() if not v["eligible"]]
    req = a.get("requested_amount")

    def best_amount(rr):
        good = [v for v in rr.values() if v["eligible"]]
        return max((v["max_amount"] for v in good), default=0)
    unc = {"approvals": {"strict": sum(v["eligible"] for v in strict.values()), "base": len(ok), "lenient": sum(v["eligible"] for v in lenient.values())},
           "max_amount": {"strict": best_amount(strict), "base": best_amount(res), "lenient": best_amount(lenient)},
           "robust": [v["lender"] for v in ok if v["robust"]], "data_sensitive": [v["lender"] for v in ok if not v["robust"]],
           "only_if_lenient": [M[k]["lender_name"] for k, v in lenient.items() if v["eligible"] and not res[k]["eligible"]]}
    out = {"profile": a.get("name"), "eligible": bool(ok), "approvals": ok, "rejections": rejections, "uncertainty": unc,
           "path_to_yes": path_to_yes(a, res, M, D)}
    if not ok:
        cats = {}
        for v in res.values():
            for c, _, _ in v["fails"]: cats[c] = cats.get(c, 0) + 1
        top = sorted(cats.items(), key=lambda x: -x[1])[:3]
        near = [(M[k]["lender_name"], v["fails"][0][1]) for k, v in res.items() if len(v["fails"]) == 1][:3]
        out["reason"] = "No lender approves. Most common blockers: " + ", ".join(f"{LABEL.get(c, c)} ({n} lender{'s' if n != 1 else ''})" for c, n in top) + "."
        if near: out["closest"] = [f"{n}: fails only because {m}" for n, m in near]
        return out

    best, pool = _pick_best(ok, req, A)
    cheapest_rate = min(pool, key=lambda v: v["rate"])
    why = (f"{best['lender']} is the cheapest real option: APR {best['apr']}% (rate {best['rate']}% plus INR {best['fee']:,} upfront fees) "
           f"for {best['tenure']} months, EMI about INR {best['emi']:,} on INR {best['approved_amount']:,}; total cost INR {best['total_cost']:,} "
           f"(it can fund up to INR {best['max_amount']:,}, limited by {best['binding']}).")
    if req and not best["covers_request"]: why = f"No lender can fund the full INR {req:,.0f}. " + why
    c = cheapest_rate
    if c is not best and c["apr"] > best["apr"]:
        why += f" {c['lender']} has a lower headline rate ({c['rate']}%) but a higher true cost once fees are counted (APR {c['apr']}%)"
        why += (f", INR {c['total_cost'] - best['total_cost']:,} more over the same tenure." if c["tenure"] == best["tenure"] and c["total_cost"] > best["total_cost"] else ".")
    elif c is not best:
        why += f" {c['lender']} looks cheaper (APR {c['apr']}%) but rests on less-verified data ({', '.join(c['estimated_fields'])})."
    if best["estimated_fields"]: why += f" Data caveat: {', '.join(best['estimated_fields'])} are peer estimates for this lender."
    else: why += " Every deciding rule for this lender is official or from its own calculator."
    why += f" Confidence: {best['confidence']}" + (f" ({'; '.join(best['tight'])})." if best["tight"] else ".")
    out.update(best=best, best_explanation=why,
               reason=f"{len(ok)} of {len(res)} lenders approve" + ("" if not req else f"; {sum(v['covers_request'] for v in ok)} can fund INR {req:,.0f}"))
    return out


def strength(r, total):
    """Overall traffic light for the UI and README (green / yellow / red)."""
    if not r["eligible"]: return {"tier": "red", "label": "Not eligible", "reasons": []}
    b = r["best"]; share = len(r["approvals"]) / total
    reasons = [x for x in (
        None if b["covers_request"] else "the best lender can't fund the full amount",
        None if b["confidence"] == "strong" else f"the best option is {b['confidence']} ({'; '.join(b['tight'])})",
        None if b["robust"] else "the best option depends on estimated data",
        None if share >= 0.3 else f"only {len(r['approvals'])} of {total} lenders approve") if x]
    return {"tier": "green" if not reasons else "yellow", "label": "Strong match" if not reasons else "Eligible, with caveats", "reasons": reasons}


# ----------------------------------------------------------------------------------------------------------- report
def to_md(results, total):
    L = []
    for r in results:
        s = strength(r, total)
        L.append(f"## {r['profile']}\n\n**Result:** {'ELIGIBLE' if r['eligible'] else 'NOT ELIGIBLE'} ({s['tier'].upper()}) - {r['reason']}\n")
        if s["reasons"]: L.append("Why not green: " + "; ".join(s["reasons"]) + ".\n")
        if r["eligible"]:
            L.append(f"**Best option:** {r['best_explanation']}\n\n| Lender | Max amount | Rate % | APR % | Tenure | EMI | Fees | Total cost | Limited by | Confidence | Robust to estimates |\n|---|---|---|---|---|---|---|---|---|---|---|")
            for v in r["approvals"]:
                L.append(f"| {v['lender']}{' (best)' if v is r['best'] else ''} | {v['max_amount']:,} | {v['rate']} | {v['apr']} | {v['tenure']} | {v['emi']:,} | {v['fee']:,} | {v['total_cost']:,} | {v['binding']} | {v['confidence']} | {'yes' if v['robust'] else 'no'} |")
            L.append("")
        elif r.get("closest"): L.append("**Closest misses:** " + "; ".join(r["closest"]) + "\n")
        u = r.get("uncertainty")
        if u: L.append(f"**Uncertainty from estimated data:** {u['approvals']['strict']}-{u['approvals']['lenient']} lenders approve (base {u['approvals']['base']}); "
                       f"largest amount INR {u['max_amount']['strict']:,}-{u['max_amount']['lenient']:,}.\n")
        if r.get("path_to_yes"):
            L.append("**Path to yes:** " + "; ".join(f"{p['text']} -> +{p['n']} ({', '.join(p['unlocks'])})" for p in r["path_to_yes"][:4]) + "\n")
        if r["rejections"]:
            L.append("<details><summary>Rejected lenders and reasons</summary>\n")
            for x in r["rejections"]: L.append(f"- {x['lender']}: {'; '.join(x['reasons'])}")
            L.append("\n</details>\n")
    return "\n".join(L)


if __name__ == "__main__":
    D = load_all()
    profiles = json.load(open(os.path.join(ROOT, "tests", "test_profiles.json")))
    results = [run(p, D) for p in profiles]
    open(os.path.join(ROOT, "tests", "test_results.md"), "w").write(
        "# Test results\n\nGenerated by `python src/eligibility.py` from `tests/test_profiles.json`. Do not edit by hand.\n\n" + to_md(results, len(D["matrix"])))
    for r in results: print(f"{r['profile'][:50]:<52}{'ELIGIBLE ' if r['eligible'] else 'NOT ELIG '}{r['reason'][:80]}")
