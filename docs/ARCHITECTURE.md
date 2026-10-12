# System architecture

How the project fits together: where the data comes from, how it becomes a decision, and how the same
logic reaches both the command line and the browser. Diagrams are Mermaid and render on GitHub.

## 1. The big picture

```mermaid
flowchart LR
    subgraph SRC["Public sources"]
        S1["Lender product pages<br/>fee schedules, rate PDFs, FAQs"]
        S2["Lender calculators<br/>run at many inputs"]
        S3["Peer values<br/>third-party pages, comparable lenders"]
    end

    subgraph DATA["data/  (source of truth)"]
        D1["lender_rules_long.csv<br/>368 rules, one per row<br/>value, unit, source type,<br/>URL, date read, evidence"]
        D2["rate_tiers.csv<br/>published CIBIL rate tables<br/>PNB, Union"]
        D3["assumptions.csv<br/>A01-A11"]
        D4["variables.csv<br/>applicant inputs"]
    end

    subgraph BUILD["scripts/  (generated, never hand-edited)"]
        B1["long_to_matrix.py"]
        B2["build_estimate_bounds.py"]
        B3["simulate.py<br/>10,000 synthetic applicants"]
        B4["export_ui_data.py"]
    end

    subgraph GEN["Generated files"]
        G1["lender_rules_matrix.csv<br/>one row per lender"]
        G2["estimate_bounds.csv<br/>strict and lenient bound<br/>for every estimate"]
        G3["docs/insights.md / .json"]
        G4["webui/data.js"]
    end

    subgraph ENG["Two engines, one logic"]
        E1["src/eligibility.py<br/>Python"]
        E2["webui/eligibility.js<br/>JavaScript port"]
    end

    subgraph OUT["Outputs"]
        O1["tests/test_results.md"]
        O2["Web app<br/>GitHub Pages"]
        O3["python app.py<br/>local server"]
    end

    S1 --> D1
    S2 --> D1
    S3 --> D1
    D1 --> B1 --> G1
    D1 --> B2 --> G2
    G1 --> E1
    G2 --> E1
    D2 --> E1
    D3 --> E1
    E1 --> B3 --> G3
    E1 --> O1
    G1 --> B4
    G2 --> B4
    D1 --> B4
    G3 --> B4
    B4 --> G4 --> E2 --> O2
    E1 --> O3
```

Everything below `lender_rules_long.csv` is generated from it. To change a rule, edit that one file and run
`python scripts/build_all.py`; the matrix, bounds, insights and web data are rebuilt in order.

## 2. Evidence model

Every rule is a row with a **source type**, a **URL** and the **date it was read**. There are exactly three types:

| Source type | Meaning |
|---|---|
| `official_published` | Stated on the lender's own page, PDF, fee schedule or FAQ |
| `calculator_derived` | Reverse-engineered from the lender's own public calculator |
| `peer_estimate` | Not published by the lender; taken from comparable lenders or a third-party page |

Only a lender's own website counts as official. Each peer estimate has a strict and a lenient bound in
`estimate_bounds.csv`, which is what lets the model say how much its answer depends on unpublished data.

## 3. Decision pipeline (per applicant, per lender)

```mermaid
flowchart TD
    A["Applicant inputs<br/>age, income, EMIs, CIBIL, employer,<br/>salary account, amount, tenure"] --> G

    G["1. Gates<br/>age at maturity, min income, min CIBIL,<br/>employer type, time in job, salary account"]
    G -->|any gate fails| R["Not eligible<br/>reasons recorded"]
    G -->|all pass| P

    P["2. Price<br/>published CIBIL table (PNB, Union)<br/>or band template between the<br/>lender's min and max rate"] --> Z
    Z["3. Size<br/>min of FOIR capacity,<br/>salary multiple, lender cap"] --> C
    C["4. Cost<br/>fee % with min/max, waivers, GST<br/>-> APR, total cost, total repayable"] --> F
    F["5. Confidence<br/>strong / borderline / risky<br/>from margins on each rule"] --> K
    K["6. Rank<br/>lowest APR + 0.25 per estimated<br/>deciding field"] --> Y
    Y["7. Path to yes<br/>re-run with each lever changed<br/>(CIBIL, EMIs, salary account, tenure in job)"] --> U
    U["8. Uncertainty<br/>re-run with every estimate at its<br/>strict and lenient bound<br/>-> robust or data-sensitive"] --> RES

    RES["Result<br/>approvals, best option, rejections,<br/>path to yes, approval range, traffic light"]
```

All of this is deterministic. There is no machine learning, because there is no approval data to train on.

## 4. One logic, two runtimes

| | Python | Browser |
|---|---|---|
| Engine | `src/eligibility.py` | `webui/eligibility.js` (line-for-line port) |
| Data | CSVs in `data/` | `webui/data.js` (generated) |
| Used for | tests, simulation, command line, `app.py` | the deployed web app |
| Rounding | `rnd()` is half-up to match JS `Math.round` | `Math.round` |

`tests/test_parity.py` runs both engines on 415 profiles and fails if any result differs. That is what makes it safe
to host the app as static files: the web app never calls a server.

## 5. Web app

```mermaid
flowchart LR
    I["index.html"] --> A["app.js<br/>wizard, charts, drawers,<br/>animations"]
    A --> E["eligibility.js<br/>PLE.prepare / run / evaluate"]
    E --> D["data.js<br/>LOAN_DATA, SOURCES,<br/>TEST_PROFILES, INSIGHTS"]
    I --> S["style.css"]
```

| Page | What it does |
|---|---|
| Check | 4-step form, live EMI ring, lender scan, results, best option, "Try it" path-to-yes, uncertainty range |
| Lenders | Directory of all 20 lenders with every rule, its source link and date read |
| Insights | Charts from the 10,000-applicant simulation |
| Method | The pipeline and the assumptions |

No framework and no build step. Fonts are the only external request (Google Fonts).

## 6. Deployment

```mermaid
flowchart LR
    P["git push to main"] --> W[".github/workflows/pages.yml"]
    W --> U["upload webui/ as the site"]
    U --> H["GitHub Pages<br/>static hosting"]
    H --> B["Visitor's browser<br/>runs eligibility.js"]
```

Only `webui/` is published. `app.py` is for running locally and is not used in deployment.

## 7. Testing

| Layer | File | Checks |
|---|---|---|
| Unit | `tests/test_model.py` | 54 tests: maths, gates, pricing, fees, rounding, data integrity, path-to-yes really unlocks what it claims |
| Profiles | `tests/test_profiles.json` | 19 profiles incl. edge cases, each with an expected outcome |
| Output freshness | `tests/test_results.md` | Test fails if the committed results differ from what the model produces now |
| Parity | `tests/test_parity.py` + `parity_runner.js` | Python and JavaScript agree on 415 profiles |

## 8. Folder map

```
data/      source of truth + generated matrix and bounds
src/       Python engine
scripts/   build, simulate and export scripts (build_all.py runs them in order)
webui/     static web app (published)
tests/     unit, profile and parity tests, plus generated results
docs/      research log, insights, this file
app.py     optional local server (serves webui/, POST /api/evaluate)
```
