// Rule-based personal-loan eligibility engine for salaried applicants in India. No machine learning.
// Line-for-line port of src/eligibility.py so the web app and the Python model give identical results.
// tests/test_parity.py runs both on the test profiles plus random profiles and fails on any difference.
(function (global) {
  "use strict";
  const DECIDING = ["min_income", "min_cibil", "max_amount", "max_tenure", "rate_min", "rate_max", "foir_cap", "multiple", "fee_pct"];
  const NO_HISTORY_OK = {
    pnb: "PNB prices no-history applicants in its 750-799 band",
    union: "Union prices no-history (-1) applicants in its 750-799 band",
    fibe: "Fibe says first-time borrowers are considered",
  };
  const LABEL = { cibil: "credit score", age: "age", income: "income", emi: "existing EMIs", experience: "work experience", job: "time in current job",
    employer: "employer type", account: "salary-account rule", amount: "loan size", salary: "salary credit", citizenship: "citizenship" };
  const GOVT = new Set(["govt", "psu", "defence"]);
  const BANDS = [[800, "800+"], [750, "750-799"], [700, "700-749"], [680, "680-699"], [650, "650-679"], [300, "<650"]];
  const KNOWN = new Set(["govt", "psu", "defence", "mnc", "listed", "public_ltd", "pvt_ltd", "corporate", "pvt_company", "public_sector", "unlisted_public", "llp", "doctor"]);
  const ALIASES = {
    govt: ["govt", "public_sector"], psu: ["psu", "public_sector", "govt"], defence: ["defence", "govt"],
    mnc: ["mnc", "listed", "corporate", "pvt_ltd", "public_ltd", "pvt_company"], listed: ["listed", "public_ltd", "corporate", "mnc", "pvt_company", "unlisted_public"],
    public_ltd: ["public_ltd", "corporate", "pvt_company", "unlisted_public"], pvt_ltd: ["pvt_ltd", "corporate", "pvt_company", "llp"], small_unlisted: [],
  };

  // ---------------------------------------------------------------- formatting helpers (messages only)
  const comma = (x) => Math.round(x).toLocaleString("en-US");
  const pct0 = (x) => Math.round(x * 100) + "%";
  const g = (x) => String(+x.toFixed(6));

  // ---------------------------------------------------------------- data
  function prepare(raw) {
    const A = {}; for (const r of raw.assumptions) A[r.id] = r;
    const template = {};
    for (const part of A.A04.value.split("|")) { const [band, pos] = part.trim().split(":"); template[band] = parseFloat(pos); }
    const matrix = {};
    for (const r of raw.matrix) {
      matrix[r.lender_id] = { ...r, estimated: new Set((r.estimated_fields || "").split("|").filter(Boolean)), calc: new Set((r.calculator_fields || "").split("|").filter(Boolean)) };
    }
    return {
      matrix, order: raw.matrix.map((r) => r.lender_id), tiers: raw.tiers, bounds: raw.bounds,
      A: { gross_to_net: +A.A01.value, gst: +A.A02.value / 100, card_share: +A.A03.value, band_template: template, cibil_margin: +A.A05.value,
        foir_margin: +A.A06.value, income_margin: +A.A07.value, tenure_margin: +A.A08.value, est_penalty: +A.A09.value, calc_ref_tenure: +A.A11.value },
    };
  }

  function scenario(D, which) {
    if (which === "base") return D.matrix;
    const M = {};
    for (const k of D.order) M[k] = { ...D.matrix[k] };
    for (const b of D.bounds) M[b.lender_id][b.field] = b[which];
    return M;
  }

  // ---------------------------------------------------------------- maths
  function rnd(x, nd = 0) { const f = Math.pow(10, nd); return Math.floor(x * f + 0.5) / f; }
  function emi(p, ratePct, n) { const r = ratePct / 1200; return r === 0 ? p / n : (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1); }
  function capacity(room, ratePct, n) { const r = ratePct / 1200; return r === 0 ? room * n : (room * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n)); }
  function apr(principal, fee, monthly, n) {
    const net = principal - fee; let lo = 0, hi = 1;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      const pv = mid === 0 ? monthly * n : (monthly * (1 - Math.pow(1 + mid, -n))) / mid;
      if (pv > net) lo = mid; else hi = mid;
    }
    return rnd(lo * 1200, 2);
  }
  function bandOf(c) { for (const [lo, name] of BANDS) if (c >= lo) return name; return "<650"; }

  // ---------------------------------------------------------------- rules
  function employerOk(accepted, cat) {
    if (accepted === "any" || !accepted) return true;
    const acc = accepted.split("|");
    if (!acc.some((x) => KNOWN.has(x))) return true;
    const al = ALIASES[cat] || [cat];
    return acc.some((x) => al.includes(x));
  }

  function price(L, a, tiers, A) {
    const cibil = a.cibil_score, noHist = cibil == null || cibil < 0;
    const own = tiers.filter((t) => t.lender_id === L.lender_id);
    if (own.length) {
      const group = GOVT.has(a.employer_category) ? "govt_psu" : "private_employee";
      const holds = (a.salary_account_banks || []).includes(L.lender_id);
      const cand = own.filter((t) => t.employer_group === group && (t.salary_account === "any" || t.salary_account === (holds ? "yes" : "no")));
      for (const t of cand) {
        if ((noHist && t.includes_no_history === "yes") || (!noHist && t.cibil_min <= cibil && cibil <= t.cibil_max))
          return [t.rate_pct, `published ${L.lender_name} CIBIL table (${t.scheme})`, null];
      }
      const lowest = cand.length ? Math.min(...cand.map((t) => t.cibil_min)) : null;
      return [null, `${L.lender_name}'s published rate table has no band for this score (${group.replace("_", " ")}s need ${lowest}+)`, { lever: "cibil", target: lowest }];
    }
    const lo = L.rate_min, hi = L.rate_max != null ? L.rate_max : L.rate_min;
    const band = noHist ? "750-799" : bandOf(cibil);
    const pos = A.band_template[band];
    const note = hi !== lo ? `band template (A04): CIBIL band ${band} sits ${pct0(pos)} of the way from ${lo}% to ${hi}%` : "only one published rate";
    return [rnd(lo + pos * (hi - lo), 2), note, null];
  }

  function feeFor(L, amount, a, A) {
    const pct = L.fee_pct, fmin = L.fee_min_inr, fmax = L.fee_max_inr;
    if (pct == null && fmax == null) return [0, "no fee published"];
    let fee = pct == null ? fmax : (amount * pct) / 100;
    if (fmin != null) fee = Math.max(fee, fmin);
    if (fmax != null) fee = Math.min(fee, fmax);
    const limits = [fmin ? `min ${comma(fmin)}` : "", fmax ? `max ${comma(fmax)}` : ""].filter(Boolean).join(", ");
    let note = (pct != null ? `${g(pct)}% of loan` : `flat up to INR ${comma(fmax)}`) + (pct != null && limits ? ` (${limits})` : "");
    let mult = 1, why = null;
    for (const part of (L.fee_waivers || "").split(";").filter(Boolean)) {
      const [key, ms] = part.split("="); const m = parseFloat(ms); const emp = a.employer_category;
      const hit = key === emp || (key === "govt" && emp === "defence" && !L.fee_waivers.includes("defence")) || (key === "cibil800" && (a.cibil_score || 0) >= 800);
      if (hit && m < mult) { mult = m; why = key; }
    }
    if (why) note += `; ${mult === 0 ? "waived" : pct0(1 - mult) + " waiver"} for ${why === "cibil800" ? "CIBIL 800+" : why}`;
    fee *= mult;
    if (L.doc_fee_inr) {
      const [small, large] = L.doc_fee_inr.split(";").map(Number);
      const doc = amount <= 200000 ? small : large;
      if (!(why && mult === 0)) { fee += doc; note += ` + documentation INR ${comma(doc)}`; }
    }
    if (L.fee_gst_included !== "yes") { fee *= 1 + A.gst; note += " + 18% GST"; }
    return [rnd(fee), note];
  }

  const obligations = (a, A) => (a.existing_emi_total || 0) + A.card_share * (a.credit_card_outstanding || 0);

  function evaluate(a, L, tiers, A) {
    const fails = [], notes = [];
    const lid = L.lender_id, holds = (a.salary_account_banks || []).includes(lid);
    const inc = a.net_monthly_income, obl = obligations(a, A), cibil = a.cibil_score, noHist = cibil == null || cibil < 0;
    if ((a.citizenship || "indian_resident") !== "indian_resident") fails.push(["citizenship", "only Indian resident citizens are eligible", null]);
    if (a.salary_credited_via_bank === false) fails.push(["salary", "salary must be credited to a bank account (cash salary rejected)", null]);
    if (L.account_requirement === "mandatory" && !holds) fails.push(["account", "needs a salary account with this bank (mandatory)", { lever: "account", bank: lid }]);
    if (!employerOk(L.employer_types, a.employer_category)) fails.push(["employer", `employer type '${a.employer_category}' not accepted (accepts ${L.employer_types})`, null]);
    if (a.age < L.min_age) fails.push(["age", `age ${g(a.age)} is below the minimum ${L.min_age}`, { lever: "wait", months: Math.trunc((L.min_age - a.age) * 12) }]);
    if (L.max_age_app && a.age > L.max_age_app) fails.push(["age", `age ${g(a.age)} is above the maximum ${L.max_age_app} at application`, null]);
    const capAge = L.max_age_maturity || L.max_age_app || 60;
    if (a.age >= capAge) fails.push(["age", `age ${g(a.age)} leaves no repayment window before age ${capAge}`, null]);
    const floor = holds && L.min_income_account_holder ? L.min_income_account_holder : L.min_income;
    if (floor && inc < floor) {
      const fix = L.min_income_account_holder && !holds && inc >= L.min_income_account_holder ? { lever: "account", bank: lid } : { lever: "income", target: floor };
      fails.push(["income", `net income ${comma(inc)} is below the minimum ${comma(floor)}` + (holds && L.min_income_account_holder ? " (account-holder floor)" : ""), fix]);
    }
    if (L.min_cibil) {
      if (noHist) {
        if (NO_HISTORY_OK[lid]) notes.push(NO_HISTORY_OK[lid]);
        else fails.push(["cibil", `no credit history; lender expects CIBIL ${L.min_cibil}+`, { lever: "cibil", target: L.min_cibil }]);
      } else if (cibil < L.min_cibil) fails.push(["cibil", `CIBIL ${cibil} is below ${L.min_cibil}`, { lever: "cibil", target: L.min_cibil }]);
    }
    const expGap = (L.min_exp_months || 0) - a.work_experience_total, jobGap = (L.min_cur_job_months || 0) - a.months_in_current_job;
    const waitM = Math.trunc(Math.max(expGap, jobGap));
    if (expGap > 0) fails.push(["experience", `total experience ${g(a.work_experience_total)}m is below ${L.min_exp_months}m`, { lever: "wait", months: waitM }]);
    if (jobGap > 0) fails.push(["job", `time in current job ${g(a.months_in_current_job)}m is below ${L.min_cur_job_months}m`, { lever: "wait", months: waitM }]);
    const monthsLeft = Math.trunc((capAge - a.age) * 12);
    if (a.age < capAge && monthsLeft < L.min_tenure) fails.push(["age", `only ${monthsLeft} months left before age ${capAge}; minimum tenure ${L.min_tenure}`, null]);
    if (fails.length) return { eligible: false, fails };

    const wantN = a.requested_tenure || L.max_tenure;
    const n = Math.trunc(Math.max(Math.min(L.max_tenure, monthsLeft, wantN), L.min_tenure));
    const ageCut = monthsLeft < Math.min(L.max_tenure, wantN);
    const [rate, rnote, rfix] = price(L, a, tiers, A);
    if (rate == null) return { eligible: false, fails: [["cibil", rnote, rfix]] };
    const gross = a.gross_monthly_income || inc / A.gross_to_net;
    if (L.multiple_basis === "gross" && !a.gross_monthly_income) notes.push(`gross income assumed = net / ${A.gross_to_net} (A01)`);
    const baseInc = L.multiple_basis === "gross" ? gross : inc;
    const ratio = obl / inc;
    let amt, binding;
    if (L.multiple_tier2) {
      if (ratio >= L.foir_cap) return { eligible: false, fails: [["emi", `existing EMIs are ${pct0(ratio)} of income; the lender stops at ${pct0(L.foir_cap)}`, { lever: "emi", reduce_by: obl - L.foir_cap * inc + 1 }]] };
      const mult = ratio > L.tier2_obligation_ratio ? L.multiple_tier2 : L.multiple;
      if (mult === L.multiple_tier2) notes.push(`EMIs above ${pct0(L.tier2_obligation_ratio)} of income cut the multiple to ${mult}x`);
      let byMult = mult * baseInc;
      const ref = Math.min(A.calc_ref_tenure, L.max_tenure);
      if (n < ref) { byMult *= capacity(1, rate, n) / capacity(1, rate, ref); notes.push(`salary multiple scaled to the ${n}-month tenure so the EMI stays affordable (A11)`); }
      amt = Math.min(byMult, L.max_amount); binding = amt === byMult ? "salary multiple" : "lender cap";
    } else {
      const room = L.foir_cap * baseInc - obl, needRoom = emi(L.min_amount, rate, n);
      if (room < needRoom) return { eligible: false, fails: [["emi", `existing EMIs leave ${room <= 0 ? "no" : "too little"} room under the ${pct0(L.foir_cap)} FOIR cap`, { lever: "emi", reduce_by: obl - (L.foir_cap * baseInc - needRoom) }]] };
      const byFoir = capacity(room, rate, n);
      const byMult = L.multiple * (L.multiple_basis === "free_income" ? inc - obl : baseInc);
      amt = Math.min(byFoir, byMult, L.max_amount);
      binding = amt === byFoir ? "FOIR" : amt === byMult ? "salary multiple" : "lender cap";
    }
    if (amt < L.min_amount) return { eligible: false, fails: [["amount", `affordable amount ${comma(amt)} is below the lender minimum ${comma(L.min_amount)}`, null]] };
    const maxAmt = Math.floor(amt / 1000) * 1000;
    const req = a.requested_amount;
    const approved = Math.trunc(req ? Math.min(maxAmt, req) : maxAmt);
    const m = emi(approved, rate, n);
    const [fee, feeNote] = feeFor(L, approved, a, A);
    const interest = m * n - approved;

    const tight = [];
    if (noHist) tight.push("no credit history");
    else if (L.min_cibil && cibil - L.min_cibil < A.cibil_margin) {
      const gap = cibil - L.min_cibil;
      tight.push(gap === 0 ? `CIBIL exactly at the ${L.min_cibil} cut-off` : `CIBIL only ${gap} points above the ${L.min_cibil} cut-off`);
    }
    const foirAfter = (obl + m) / (L.multiple_tier2 ? inc : baseInc);
    if (L.foir_cap - foirAfter < A.foir_margin) tight.push(`EMIs would use ${pct0(foirAfter)} of income (cap ${pct0(L.foir_cap)})`);
    if (floor && inc < floor * (1 + A.income_margin)) tight.push(`income within ${pct0(A.income_margin)} of the ${comma(floor)} floor`);
    if (L.min_exp_months && -expGap < A.tenure_margin) tight.push("experience just meets the minimum");
    if (L.min_cur_job_months && -jobGap < A.tenure_margin) tight.push("time in current job just meets the minimum");
    if (ageCut) notes.push(`tenure cut to ${n} months by the age limit ${capAge}`);
    const level = !tight.length ? "strong" : tight.length === 1 ? "borderline" : "risky";
    return {
      eligible: true, lender_id: lid, lender: L.lender_name, category: L.category, max_amount: maxAmt, approved_amount: approved,
      rate, rate_basis: rnote, tenure: n, emi: rnd(m), fee, fee_basis: feeNote,
      total_interest: rnd(interest), total_cost: rnd(interest + fee), total_repayable: rnd(m * n + fee), apr: apr(approved, fee, m, n),
      binding, covers_request: !req || maxAmt >= req,
      estimated_fields: DECIDING.filter((f) => L.estimated.has(f)).sort(), calculator_fields: DECIDING.filter((f) => L.calc.has(f)).sort(),
      confidence: level, tight, notes,
    };
  }

  // ---------------------------------------------------------------- whole-market run
  function evaluateAll(a, M, D) { const o = {}; for (const k of D.order) o[k] = evaluate(a, M[k], D.tiers, D.A); return o; }

  function applyLever(a, lv) {
    const b = JSON.parse(JSON.stringify(a));
    if (lv.lever === "cibil") b.cibil_score = lv.target;
    else if (lv.lever === "emi") b.existing_emi_total = Math.max(0, (b.existing_emi_total || 0) - lv.reduce_by);
    else if (lv.lever === "wait") { b.months_in_current_job += lv.months; b.work_experience_total += lv.months; b.age += lv.months / 12; }
    else if (lv.lever === "income") b.net_monthly_income = lv.target;
    else if (lv.lever === "account") b.salary_account_banks = [...(b.salary_account_banks || []), lv.bank];
    return b;
  }

  function leverText(lv, a, M) {
    switch (lv.lever) {
      case "cibil": return a.cibil_score == null || a.cibil_score === -1 ? `Build a credit history and reach CIBIL ${lv.target}` : `Raise CIBIL from ${a.cibil_score} to ${lv.target}`;
      case "emi": return `Cut existing EMIs by INR ${comma(lv.reduce_by)} a month`;
      case "wait": return `Wait ${lv.months} more month${lv.months !== 1 ? "s" : ""} in your job`;
      case "income": return `Net salary of INR ${comma(lv.target)} a month`;
      case "account": return `Hold your salary account with ${M[lv.bank].lender_name}`;
    }
    return lv.lever;
  }

  function roundLever(lv) { const o = { ...lv }; if (o.lever === "emi") o.reduce_by = Math.ceil(o.reduce_by / 500) * 500; return o; }
  const keyOf = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  const effort = (l) => l.target || l.reduce_by || l.months || 0;

  function pathToYes(a, res, M, D) {
    const rejected = D.order.filter((k) => !res[k].eligible);
    if (!rejected.length) return [];
    const cand = new Map();
    for (const lid of rejected) for (const [, , fix] of res[lid].fails) if (fix) { const lv = roundLever(fix); cand.set(keyOf(lv), lv); }
    const levers = [];
    for (const lv of cand.values()) {
      if (lv.lever === "emi" && lv.reduce_by > (a.existing_emi_total || 0)) continue;
      if (lv.lever === "cibil" && lv.target > 900) continue;
      const b = applyLever(a, lv);
      const unlocked = rejected.filter((lid) => evaluate(b, M[lid], D.tiers, D.A).eligible).sort();
      if (unlocked.length) levers.push({ ...lv, text: leverText(lv, a, M), unlocks: unlocked.map((l) => M[l].lender_name), unlock_ids: unlocked, n: unlocked.length });
    }
    levers.sort((x, y) => (x.lever < y.lever ? -1 : x.lever > y.lever ? 1 : effort(x) - effort(y)));
    const kept = [], bestN = {};
    for (const l of levers) { const key = l.lever !== "account" ? l.lever : l.bank; if (l.n > (bestN[key] || 0)) { kept.push(l); bestN[key] = l.n; } }
    return kept.sort((x, y) => y.n - x.n || effort(x) - effort(y));
  }

  function run(a, D) {
    const M = D.matrix, A = D.A;
    if ((a.employment_type || "salaried") !== "salaried")
      return { profile: a.name, eligible: false, approvals: [], rejections: [], path_to_yes: [], uncertainty: null,
        reason: "Out of scope: this model covers salaried applicants only. Self-employed income is assessed on ITRs and business vintage, which these lenders publish separately." };
    const res = evaluateAll(a, M, D), strict = evaluateAll(a, scenario(D, "strict"), D), lenient = evaluateAll(a, scenario(D, "lenient"), D);
    const ok = D.order.map((k) => res[k]).filter((v) => v.eligible).sort((x, y) => x.apr - y.apr);
    for (const v of ok) v.robust = strict[v.lender_id].eligible;
    const rejections = D.order.filter((k) => !res[k].eligible).map((k) => ({
      lender_id: k, lender: M[k].lender_name, reasons: res[k].fails.map((f) => f[1]),
      codes: [...new Set(res[k].fails.map((f) => f[0]))].sort(), fixable: res[k].fails.every((f) => f[2] != null) }));
    const req = a.requested_amount;
    const bestAmount = (rr) => Math.max(0, ...D.order.filter((k) => rr[k].eligible).map((k) => rr[k].max_amount));
    const count = (rr) => D.order.filter((k) => rr[k].eligible).length;
    const unc = { approvals: { strict: count(strict), base: ok.length, lenient: count(lenient) },
      max_amount: { strict: bestAmount(strict), base: bestAmount(res), lenient: bestAmount(lenient) },
      robust: ok.filter((v) => v.robust).map((v) => v.lender), data_sensitive: ok.filter((v) => !v.robust).map((v) => v.lender),
      only_if_lenient: D.order.filter((k) => lenient[k].eligible && !res[k].eligible).map((k) => M[k].lender_name) };
    const out = { profile: a.name, eligible: ok.length > 0, approvals: ok, rejections, uncertainty: unc, path_to_yes: pathToYes(a, res, M, D) };
    if (!ok.length) {
      const cats = {};
      for (const k of D.order) for (const [c] of res[k].fails) cats[c] = (cats[c] || 0) + 1;
      const top = Object.entries(cats).sort((x, y) => y[1] - x[1]).slice(0, 3);
      const near = D.order.filter((k) => res[k].fails.length === 1).slice(0, 3).map((k) => [M[k].lender_name, res[k].fails[0][1]]);
      out.reason = "No lender approves. Most common blockers: " + top.map(([c, n]) => `${LABEL[c] || c} (${n} lender${n !== 1 ? "s" : ""})`).join(", ") + ".";
      if (near.length) out.closest = near.map(([n, m]) => `${n}: fails only because ${m}`);
      return out;
    }
    let pool = ok.filter((v) => v.covers_request); if (!pool.length) pool = ok;
    const score = (v) => v.apr + A.est_penalty * v.estimated_fields.length;
    let best = pool[0];
    for (const v of pool) if (score(v) < score(best) || (score(v) === score(best) && v.max_amount > best.max_amount)) best = v;
    let c = pool[0]; for (const v of pool) if (v.rate < c.rate) c = v;
    let why = `${best.lender} is the cheapest real option: APR ${best.apr}% (rate ${best.rate}% plus INR ${comma(best.fee)} upfront fees) for ${best.tenure} months, EMI about INR ${comma(best.emi)} on INR ${comma(best.approved_amount)}; total cost INR ${comma(best.total_cost)} (it can fund up to INR ${comma(best.max_amount)}, limited by ${best.binding}).`;
    if (req && !best.covers_request) why = `No lender can fund the full INR ${comma(req)}. ` + why;
    if (c !== best && c.apr > best.apr) {
      why += ` ${c.lender} has a lower headline rate (${c.rate}%) but a higher true cost once fees are counted (APR ${c.apr}%)`;
      why += c.tenure === best.tenure && c.total_cost > best.total_cost ? `, INR ${comma(c.total_cost - best.total_cost)} more over the same tenure.` : ".";
    } else if (c !== best) why += ` ${c.lender} looks cheaper (APR ${c.apr}%) but rests on less-verified data (${c.estimated_fields.join(", ")}).`;
    why += best.estimated_fields.length ? ` Data caveat: ${best.estimated_fields.join(", ")} are peer estimates for this lender.` : " Every deciding rule for this lender is official or from its own calculator.";
    why += ` Confidence: ${best.confidence}` + (best.tight.length ? ` (${best.tight.join("; ")}).` : ".");
    out.best = best; out.best_explanation = why;
    out.reason = `${ok.length} of ${D.order.length} lenders approve` + (req ? `; ${ok.filter((v) => v.covers_request).length} can fund INR ${comma(req)}` : "");
    return out;
  }

  function strength(r, total) {
    if (!r.eligible) return { tier: "red", label: "Not eligible", reasons: [] };
    const b = r.best, share = r.approvals.length / total;
    const reasons = [
      b.covers_request ? null : "the best lender can't fund the full amount",
      b.confidence === "strong" ? null : `the best option is ${b.confidence} (${b.tight.join("; ")})`,
      b.robust ? null : "the best option depends on estimated data",
      share >= 0.3 ? null : `only ${r.approvals.length} of ${total} lenders approve`,
    ].filter(Boolean);
    return { tier: reasons.length ? "yellow" : "green", label: reasons.length ? "Eligible, with caveats" : "Strong match", reasons };
  }

  global.PLE = { prepare, run, evaluate, strength, emi, apr, LABEL };
})(typeof window !== "undefined" ? window : globalThis);
