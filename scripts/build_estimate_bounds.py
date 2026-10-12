"""Builds data/estimate_bounds.csv: a strict and a lenient value for every peer-estimated numeric rule.

Why: about a quarter of the rule cells are peer estimates. The model runs three scenarios (base / strict / lenient)
so every result can say how much it depends on unverified data.

Method: for an estimated field, collect the same field's NON-estimated values (official or calculator-derived) from
other lenders in the same category; if fewer than 3 exist, use all lenders. Strict = the toughest of those values for
the applicant, lenient = the easiest. The base value is always kept inside [lenient, strict].
Run: python scripts/build_estimate_bounds.py   (after scripts/long_to_matrix.py)
"""
import csv, os
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
# +1: a higher value is tougher on the applicant (floors, rates, fees); -1: a lower value is tougher (caps, limits)
DIRECTION = {"min_age": 1, "min_income": 1, "min_income_account_holder": 1, "min_cibil": 1, "min_exp_months": 1, "min_cur_job_months": 1,
             "min_amount": 1, "min_tenure": 1, "rate_min": 1, "rate_max": 1, "fee_pct": 1,
             "max_age_app": -1, "max_age_maturity": -1, "max_amount": -1, "max_tenure": -1, "foir_cap": -1, "multiple": -1}
# lender-specific evidence that is softer than a rule but narrows the range
OVERRIDES = {("abfl", "foir_cap", "strict"): (0.40, "Aditya Birla's own FOIR article: 'The ideal FOIR is usually below 40%' "
                                                    "(adityabirlacapital.com/abc-of-money/what-is-foir-and-how-is-it-calculated-for-a-personal-loan)")}



def main():
    rows = list(csv.DictReader(open(os.path.join(D, "lender_rules_matrix.csv"))))
    def num(v): return float(v) if v not in ("", None) else None
    out = []
    for r in rows:
        for f in filter(None, r["estimated_fields"].split("|")):
            if f not in DIRECTION or num(r[f]) is None: continue
            same = [num(x[f]) for x in rows if x["lender_id"] != r["lender_id"] and x["category"] == r["category"]
                    and f not in x["estimated_fields"].split("|") and num(x[f]) is not None]
            pool, scope = (same, f"published {r['category'].replace('_', ' ')} peers") if len(same) >= 3 else \
                ([num(x[f]) for x in rows if x["lender_id"] != r["lender_id"] and f not in x["estimated_fields"].split("|") and num(x[f]) is not None], "all published peers")
            base = num(r[f]); d = DIRECTION[f]
            strict = max(pool + [base]) if d > 0 else min(pool + [base])
            lenient = min(pool + [base]) if d > 0 else max(pool + [base])
            if f == "rate_max" and num(r["rate_min"]) is not None:   # a max rate can never sit below the lender's own published min rate
                lenient = max(lenient, num(r["rate_min"]))
            method = f"strict/lenient = toughest/easiest of {len(pool)} {scope}"
            for side in ("strict", "lenient"):
                if (r["lender_id"], f, side) in OVERRIDES:
                    v, why = OVERRIDES[(r["lender_id"], f, side)]
                    if side == "strict": strict = v
                    else: lenient = v
                    method += f"; {side} = {v} from {why}"
            out.append(dict(lender_id=r["lender_id"], field=f, base=base, strict=strict, lenient=lenient, n_peers=len(pool), method=method))
    with open(os.path.join(D, "estimate_bounds.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, ["lender_id", "field", "base", "strict", "lenient", "n_peers", "method"]); w.writeheader(); w.writerows(out)
    print(len(out), "estimated numeric cells bounded")


if __name__ == "__main__":
    main()
