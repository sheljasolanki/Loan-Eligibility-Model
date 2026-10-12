"""Rebuild every generated file from data/lender_rules_long.csv, in order. Run: python scripts/build_all.py"""
import os, subprocess, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
for step in ("scripts/long_to_matrix.py", "scripts/build_estimate_bounds.py", "src/eligibility.py", "scripts/simulate.py", "scripts/export_ui_data.py"):
    print(f"== {step}"); subprocess.run([sys.executable, os.path.join(ROOT, step)], check=True, stdout=subprocess.DEVNULL if step == "scripts/simulate.py" else None)
print("done - now run: python -m unittest discover -s tests")
