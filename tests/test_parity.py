"""The web app (webui/eligibility.js) must give exactly the same answers as the Python model.
Runs both on every test profile plus 400 random profiles and compares every number, decision, lever and range.
Run: python -m unittest tests.test_parity -v   (needs Node.js; skipped if node is not installed)"""
import json, os, random, shutil, subprocess, sys, unittest
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "src"))
import eligibility as E


def load_profiles():
    with open(os.path.join(ROOT, "tests", "test_profiles.json"), encoding="utf-8") as f: return json.load(f)
def read_text(path):
    with open(path, encoding="utf-8") as f: return f.read()

KEYS = ("lender_id", "max_amount", "approved_amount", "rate", "tenure", "emi", "fee", "total_cost", "apr", "binding", "covers_request",
        "confidence", "robust", "estimated_fields")


def random_profiles(n, seed=7):
    rng = random.Random(seed); out = []
    banks = ["sbi", "axis", "kotak", "union", "hdfc", "pnb", "indianbank"]
    for i in range(n):
        age = rng.randint(19, 62)
        exp = rng.randint(0, max(0, (age - 19) * 12))
        out.append({"name": f"R{i}", "age": age, "employer_category": rng.choice(["govt", "psu", "defence", "mnc", "listed", "public_ltd", "pvt_ltd", "small_unlisted"]),
                    "net_monthly_income": rng.choice([12000, 18000, 22000, 26000, 31000, 45000, 60000, 85000, 120000, 250000]),
                    "existing_emi_total": rng.choice([0, 0, 2000, 8000, 15000, 30000]), "credit_card_outstanding": rng.choice([0, 0, 50000, 200000]),
                    "cibil_score": rng.choice([None, 580, 640, 655, 690, 705, 715, 722, 735, 760, 790, 815]),
                    "work_experience_total": exp, "months_in_current_job": rng.randint(0, exp) if exp else 0,
                    "salary_account_banks": rng.sample(banks, rng.choice([0, 0, 1, 2])),
                    "requested_amount": rng.choice([None, 100000, 300000, 800000, 2500000]), "requested_tenure": rng.choice([None, 24, 60, 84])})
    return out


def norm(r):
    return {"eligible": r["eligible"], "best": r.get("best", {}).get("lender_id"),
            "approvals": [{k: v[k] for k in KEYS} for v in r["approvals"]],
            "rejections": [(x["lender_id"], x["codes"], x["fixable"]) for x in r["rejections"]],
            "levers": [(p["text"], p["n"], p["unlock_ids"]) for p in r["path_to_yes"]],
            "uncertainty": r["uncertainty"] and {k: r["uncertainty"][k] for k in ("approvals", "max_amount")}}


@unittest.skipUnless(shutil.which("node"), "node not installed")
class Parity(unittest.TestCase):
    def test_python_and_browser_engines_agree(self):
        subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "export_ui_data.py")], check=True, capture_output=True)
        profiles = load_profiles() + random_profiles(400)
        D = E.load_all()
        py = [norm(E.run(p, D)) for p in profiles]
        js = json.loads(subprocess.run(["node", os.path.join(ROOT, "tests", "parity_runner.js")], input=json.dumps(profiles),
                                       capture_output=True, text=True, check=True).stdout)
        js = [norm(r) for r in js]
        for p, a, b in zip(profiles, py, js):
            self.assertEqual(a, b, p["name"])


if __name__ == "__main__": unittest.main()
