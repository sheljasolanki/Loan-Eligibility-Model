(function () {
  "use strict";
  const D = PLE.prepare(LOAN_DATA);
  const N = D.order.length;
  const M = D.matrix;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
  const lakh = (n) => (n >= 1e5 ? "₹" + (n / 1e5).toFixed(n >= 1e7 ? 0 : n >= 1e6 ? 1 : 2).replace(/\.?0+$/, "") + " L" : inr(n));
  const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SHORT = { "State Bank of India": "SBI", "Punjab National Bank": "PNB", "Kotak Mahindra Bank": "Kotak", "Union Bank of India": "Union", "Aditya Birla Capital": "Aditya Birla",
    "Fibe (EarlySalary)": "Fibe", "Poonawalla Fincorp": "Poonawalla", "IDFC FIRST Bank": "IDFC FIRST", "IndusInd Bank": "IndusInd" };
  const short = (name) => SHORT[name] || name.replace(/ Bank$/, "").replace(/ Finance$/, "").replace(/ Capital$/, "");
  const CAT = { private_bank: "private bank", public_bank: "public bank", nbfc: "NBFC", fintech: "fintech" };
  const months = (m) => (m >= 12 ? Math.floor(m / 12) + "y " : "") + (m % 12) + "m";

  function countUp(el, to, { dur = 1300, fmt = (v) => Math.round(v), from = 0 } = {}) {
    if (reduce) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    (function f(t) { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(from + (to - from) * e); if (p < 1) requestAnimationFrame(f); })(t0);
  }
  function ripple(e) {
    const b = e.currentTarget, r = b.getBoundingClientRect(), s = document.createElement("span"), d = Math.max(r.width, r.height);
    s.className = "ripple"; Object.assign(s.style, { width: d + "px", height: d + "px", left: e.clientX - r.left - d / 2 + "px", top: e.clientY - r.top - d / 2 + "px" });
    b.appendChild(s); setTimeout(() => s.remove(), 600);
  }
  // tooltip for anything with data-tip
  const tip = $("#tip");
  document.addEventListener("pointerover", (e) => { const t = e.target.closest("[data-tip]"); if (t) { tip.innerHTML = t.dataset.tip; tip.classList.add("on"); } });
  document.addEventListener("pointerout", (e) => { if (e.target.closest("[data-tip]")) tip.classList.remove("on"); });
  document.addEventListener("pointermove", (e) => {
    tip.style.left = Math.min(e.clientX + 14, innerWidth - 270) + "px"; tip.style.top = e.clientY + 16 + "px";
    const g = $("#cursorGlow"); g.style.left = e.clientX + "px"; g.style.top = e.clientY + "px";
  });
  const io = new IntersectionObserver((es) => es.forEach((x) => x.isIntersecting && x.target.classList.add("vis")), { threshold: 0.1 });
  $$(".reveal").forEach((el) => io.observe(el));

  // ======================================================================= routing
  const links = $$("#navLinks a"), pill = $("#navPill"), inited = {};
  function movePill(a) { pill.style.left = a.offsetLeft + "px"; pill.style.width = a.offsetWidth + "px"; }
  function go(page) {
    if (!["check", "lenders", "insights", "method"].includes(page)) page = "check";
    closeDrawer();
    $$(".page").forEach((p) => (p.hidden = p.id !== "page-" + page));
    links.forEach((a) => a.classList.toggle("on", a.dataset.go === page));
    movePill(links.find((a) => a.dataset.go === page));
    if (!inited[page]) { inited[page] = true; ({ lenders: initLenders, insights: initInsights, method: initMethod }[page] || (() => {}))(); }
    if (page === "insights") animateBars($("#page-insights"));
    window.scrollTo(0, 0);
  }
  addEventListener("hashchange", () => go(location.hash.slice(1)));
  addEventListener("resize", () => movePill($("#navLinks a.on") || links[0]));

  // ======================================================================= hero
  const nOfficial = SOURCES.filter((s) => s.source_type === "official_published").length;
  $("#eyebrowText").textContent = `Rules read from ${N} lenders' own websites`;
  $("#heroStats").innerHTML = [[N, "Lenders"], [SOURCES.length, "Sourced rules"], [Math.round((nOfficial / SOURCES.length) * 100), "% official", "%"], [0, "ML models"]]
    .map(([n, l, s], i) => `<div class="stat" style="animation-delay:${1 + i * 0.1}s"><div class="n" data-count="${n}" data-suffix="${s || ""}">0</div><div class="l">${l}</div></div>`).join("");
  setTimeout(() => $$("[data-count]").forEach((el) => countUp(el, +el.dataset.count, { fmt: (v) => Math.round(v) + el.dataset.suffix })), 1000);
  const names = D.order.map((k) => M[k].lender_name);
  $("#marquee").innerHTML = [...names, ...names].map((n) => `<span>${esc(n)}</span>`).join("");

  // ======================================================================= form
  const FIELDS = {
    age: { label: "Age", min: 18, max: 65, step: 1, fmt: (v) => v + " yrs" },
    net_monthly_income: { label: "Net monthly salary", min: 10000, max: 500000, step: 1000, scale: "log", fmt: inr },
    existing_emi_total: { label: "Existing EMIs a month", min: 0, max: 200000, step: 500, scale: "sqrt", fmt: inr },
    credit_card_outstanding: { label: "Credit-card balance", min: 0, max: 1000000, step: 5000, scale: "sqrt", fmt: inr, note: "5% counts as a monthly obligation" },
    work_experience_total: { label: "Total experience", min: 0, max: 480, step: 1, fmt: months },
    months_in_current_job: { label: "In current job", min: 0, max: 480, step: 1, fmt: months },
    cibil_score: { label: "CIBIL score", min: 300, max: 900, step: 1, fmt: (v) => v, bare: true },
    requested_amount: { label: "Amount", min: 25000, max: 5000000, step: 5000, scale: "log", fmt: lakh },
    requested_tenure: { label: "Tenure", min: 6, max: 84, step: 6, fmt: (v) => v + " months" },
  };
  const DEFAULT = { name: "You", employment_type: "salaried", citizenship: "indian_resident", salary_credited_via_bank: true, age: 29, employer_category: "pvt_ltd",
    net_monthly_income: 60000, existing_emi_total: 5000, credit_card_outstanding: 0, work_experience_total: 60, months_in_current_job: 30, cibil_score: 760,
    requested_amount: 500000, requested_tenure: 60, salary_account_banks: [] };
  let S = JSON.parse(JSON.stringify(DEFAULT));
  let noHist = false;

  const toPos = (f, v) => { const t = (v - f.min) / (f.max - f.min); return f.scale === "log" ? Math.log(v / f.min) / Math.log(f.max / f.min) : f.scale === "sqrt" ? Math.sqrt(Math.max(0, t)) : t; };
  const fromPos = (f, p) => { let v = f.scale === "log" ? f.min * Math.pow(f.max / f.min, p) : f.scale === "sqrt" ? f.min + p * p * (f.max - f.min) : f.min + p * (f.max - f.min); return Math.min(f.max, Math.max(f.min, Math.round(v / f.step) * f.step)); };

  $$(".field").forEach((box) => {
    const k = box.dataset.field, f = FIELDS[k];
    box.innerHTML = (f.bare ? "" : `<div class="frow"><label for="r-${k}">${f.label}</label><input class="val" id="v-${k}" inputmode="numeric" aria-label="${f.label} value" /></div>`) +
      `<input type="range" id="r-${k}" min="0" max="1000" step="1" aria-label="${f.label}" />` + (f.note ? `<div class="frow"><span></span><span class="unit">${f.note}</span></div>` : "");
    const r = $("#r-" + k, box), v = $("#v-" + k, box);
    r.addEventListener("input", () => { S[k] = fromPos(f, r.value / 1000); paintField(k); live(); });
    if (v) {
      v.addEventListener("focus", () => { v.value = S[k]; v.select(); });
      const commit = () => { const n = parseFloat(String(v.value).replace(/[^\d.]/g, "")); if (!isNaN(n)) S[k] = Math.min(f.max, Math.max(f.min, n)); paintField(k); live(); };
      v.addEventListener("blur", commit); v.addEventListener("keydown", (e) => e.key === "Enter" && v.blur());
    }
  });
  function paintField(k) {
    const f = FIELDS[k], r = $("#r-" + k), v = $("#v-" + k);
    if (S[k] == null) return;
    const p = toPos(f, S[k]); r.value = Math.round(p * 1000); r.style.setProperty("--p", p * 100 + "%");
    if (v && document.activeElement !== v) { v.value = f.fmt(S[k]); v.classList.add("bump"); clearTimeout(v._t); v._t = setTimeout(() => v.classList.remove("bump"), 140); }
  }

  const EMPLOYERS = [["govt", "Government"], ["psu", "PSU"], ["defence", "Defence"], ["mnc", "MNC"], ["listed", "Listed co."], ["public_ltd", "Public Ltd"], ["pvt_ltd", "Private Ltd"], ["small_unlisted", "Small firm"]];
  $("#employer").innerHTML = EMPLOYERS.map(([k, v]) => `<button type="button" class="chip" data-k="${k}">${v}</button>`).join("");
  $("#employer").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; S.employer_category = b.dataset.k; paintChips(); live(); });
  const BANKS = D.order.filter((k) => M[k].lender_type === "bank");
  $("#banks").innerHTML = BANKS.map((k) => `<button type="button" class="chip" data-k="${k}">${short(M[k].lender_name)}</button>`).join("");
  $("#banks").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    const set = new Set(S.salary_account_banks); set.has(b.dataset.k) ? set.delete(b.dataset.k) : set.add(b.dataset.k);
    S.salary_account_banks = [...set]; paintChips(); live();
  });
  $("#noHistory").addEventListener("click", () => { noHist = !noHist; paintChips(); live(); });
  function paintChips() {
    $$("#employer .chip").forEach((c) => c.classList.toggle("on", c.dataset.k === S.employer_category));
    $$("#banks .chip").forEach((c) => c.classList.toggle("on", S.salary_account_banks.includes(c.dataset.k)));
    $("#noHistory").setAttribute("aria-pressed", noHist);
  }
  function paintAll() { Object.keys(FIELDS).forEach(paintField); paintChips(); }

  // presets
  $("#preset").innerHTML += TEST_PROFILES.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join("");
  $("#preset").addEventListener("change", (e) => {
    if (e.target.value === "") return;
    const p = TEST_PROFILES[+e.target.value];
    S = { ...JSON.parse(JSON.stringify(DEFAULT)), credit_card_outstanding: 0, ...JSON.parse(JSON.stringify(p)) };
    if (!S.requested_tenure) S.requested_tenure = 60;
    if (!S.requested_amount) S.requested_amount = 300000;
    noHist = p.cibil_score == null || p.cibil_score < 0;
    if (noHist) S.cibil_score = 750;
    paintAll(); live();
  });

  // gauge
  function gauge() {
    const v = S.cibil_score, p = ((v - 300) / 600) * 100;
    $("#gArc").setAttribute("stroke-dasharray", noHist ? "0 100" : `${p} 100`);
    const a = Math.PI * (1 - (noHist ? 0 : p) / 100);
    $("#gKnob").setAttribute("cx", 130 + 110 * Math.cos(a)); $("#gKnob").setAttribute("cy", 140 - 110 * Math.sin(a));
    $("#gScore").textContent = noHist ? "—" : v;
    const [b, c] = noHist ? ["NO HISTORY", "#94a487"] : v >= 750 ? ["EXCELLENT", "#8fd14f"] : v >= 700 ? ["GOOD", "#bfe88f"] : v >= 650 ? ["FAIR", "#e2c15a"] : ["NEEDS WORK", "#e5675f"];
    $("#gBand").textContent = b; $("#gBand").setAttribute("fill", c);
  }

  function applicant() { return { ...JSON.parse(JSON.stringify(S)), cibil_score: noHist ? null : S.cibil_score, name: "You" }; }

  // live preview
  $("#scan").innerHTML = D.order.map((k) => `<div class="ln" data-id="${k}">${esc(short(M[k].lender_name))}</div>`).join("");
  let liveT, lastOk = new Set();
  function live() {
    gauge();
    const a = applicant(), n = a.requested_tenure, newEmi = PLE.emi(a.requested_amount, 12, n);
    const old = a.existing_emi_total + 0.05 * (a.credit_card_outstanding || 0), inc = a.net_monthly_income;
    const p1 = Math.min(100, (old / inc) * 100), p2 = Math.min(100 - p1, (newEmi / inc) * 100);
    $("#ringOld").setAttribute("stroke-dasharray", `${p1} 100`);
    $("#ringNew").setAttribute("stroke-dasharray", `${p2} 100`); $("#ringNew").setAttribute("transform", `rotate(${-90 + p1 * 3.6} 66 66)`);
    const tot = Math.round(((old + newEmi) / inc) * 100);
    $("#ringPct").textContent = tot + "%";
    $("#kvOld").textContent = inr(old); $("#kvNew").textContent = inr(newEmi); $("#kvLeft").textContent = inr(Math.max(0, inc - old - newEmi));
    $("#foirMsg").textContent = tot <= 50 ? "✓ Inside most lenders' EMI limits (50–75% of income)." : tot <= 70 ? "⚠ Above 50%: several banks will cut the amount or decline." : "✕ Above 70%: almost every lender stops here.";
    clearTimeout(liveT);
    liveT = setTimeout(() => {
      const R = PLE.run(a, D), ok = new Set(R.approvals.map((v) => v.lender_id));
      $$(".ln").forEach((el) => {
        const was = lastOk.has(el.dataset.id), is = ok.has(el.dataset.id);
        el.className = "ln " + (is ? "yes" : "no") + (was !== is ? " flip" : "");
      });
      lastOk = ok; $("#scanCount").textContent = `${ok.size}/${N}`;
    }, 90);
  }

  // stepper
  const TITLES = ["You", "Income", "Credit", "Loan"];
  let step = 0;
  $("#steps").innerHTML = TITLES.map((t, i) => `<button type="button" class="step" data-i="${i}" role="tab"><span class="bar"><i></i></span><span>${t}</span></button>`).join("");
  function goStep(i, back) {
    step = i;
    $$(".pane").forEach((p) => { p.classList.remove("on", "back"); if (+p.dataset.pane === i) { void p.offsetWidth; p.classList.add("on"); if (back) p.classList.add("back"); } });
    $$(".step").forEach((s, k) => { s.classList.toggle("on", k === i); s.classList.toggle("done", k < i); s.setAttribute("aria-selected", k === i); });
    $("#stepNo").textContent = i + 1;
    $("#prevBtn").style.visibility = i ? "visible" : "hidden";
    $("#nextBtn").textContent = i === 3 ? `Scan ${N} lenders ✦` : "Continue →";
  }
  $("#steps").addEventListener("click", (e) => { const s = e.target.closest(".step"); if (s) goStep(+s.dataset.i, +s.dataset.i < step); });
  $("#prevBtn").addEventListener("click", () => goStep(step - 1, true));
  $("#nextBtn").addEventListener("click", (e) => { ripple(e); step < 3 ? goStep(step + 1) : scanThenShow(); });

  // ======================================================================= results
  let lastR = null, sortKey = "apr";
  function scanThenShow() {
    const a = applicant(), R = PLE.run(a, D), ok = new Set(R.approvals.map((v) => v.lender_id)), els = $$(".ln"), gap = reduce ? 0 : 80;
    els.forEach((el) => (el.className = "ln"));
    els.forEach((el, i) => {
      setTimeout(() => el.classList.add("scanning"), i * gap);
      setTimeout(() => { el.classList.remove("scanning"); el.classList.add(ok.has(el.dataset.id) ? "yes" : "no", "flip"); }, i * gap + 240);
    });
    lastOk = ok;
    setTimeout(() => show(R), els.length * gap + 420);
  }

  function show(R) {
    lastR = R;
    const res = $("#results"); res.hidden = false;
    res.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    const T = PLE.strength(R, N), n = R.approvals.length;
    $("#vOf").textContent = `of ${N} lenders say yes`;
    $("#vRing").style.stroke = T.tier === "red" ? "var(--no)" : T.tier === "yellow" ? "var(--warn)" : "var(--lime)";
    $("#vRing").setAttribute("stroke-dasharray", "0 100");
    setTimeout(() => { $("#vRing").setAttribute("stroke-dasharray", `${(n / N) * 100} 100`); countUp($("#vNum"), n); }, 250);
    $("#vTier").className = "tier " + T.tier; $("#vTier").textContent = T.label;
    $("#vHead").textContent = R.eligible ? (T.tier === "green" ? "You're in good shape." : "You qualify, with caveats.") : R.path_to_yes && R.path_to_yes.length ? "Not yet, but there's a path." : "Not with these lenders.";
    $("#vReason").textContent = R.reason;
    $("#vWhy").innerHTML = (T.reasons || []).map((x) => `<li>${esc(x)}</li>`).join("") + (R.closest ? R.closest.map((x) => `<li>${esc(x)}</li>`).join("") : "");
    drawFlow(R); drawBest(R); drawPath(R); drawUnc(R); drawGrid(R); drawRej(R);
    $("#sortSeg").parentElement.style.display = $("#lenderGrid").style.display = R.approvals.length ? "" : "none";
    $("#flowCard").style.display = R.uncertainty ? "" : "none";
    $("#pathCard").parentElement.style.display = R.uncertainty ? "" : "none";
  }

  function drawFlow(R) {
    const el = $("#flow"), W = 1100, rowH = 25, ok = R.approvals, rej = R.rejections, rows = [...ok.map((v) => ({ v })), ...rej.map((r) => ({ r }))];
    const H = Math.max(260, rows.length * rowH + 30), sx = 160, sy = H / 2, ex = 640;
    let p = "", lab = "";
    rows.forEach((row, i) => {
      const y = 22 + i * ((H - 44) / Math.max(1, rows.length - 1)), v = row.v, best = v && R.best && v.lender_id === R.best.lender_id;
      const strands = v ? (best ? 7 : i < 3 ? 5 : 3) : 1;
      for (let k = 0; k < strands; k++) {
        const o = (k - (strands - 1) / 2) * 3;
        p += `<path class="strand ${v ? "yes" : "no"}" pathLength="1" d="M${sx} ${sy + o * 1.3} C${sx + 220} ${sy + o * 3},${ex - 220} ${y + o},${ex} ${y + o * 0.4}" stroke-width="${v ? (best ? 1.4 : 0.9) : 0.8}" opacity="${v ? 0.3 + 0.1 * (k % 3) : 1}" style="animation-delay:${i * 35 + k * 20}ms"${v ? ' filter="url(#fg)"' : ""}/>`;
      }
      const id = v ? v.lender_id : row.r.lender_id, name = v ? v.lender : row.r.lender;
      lab += `<g class="lrow" data-lender="${id}"><circle cx="${ex}" cy="${y}" r="${best ? 5 : 3}" fill="${v ? "#8fd14f" : "#5a2c28"}"/>
        <text x="${ex + 14}" y="${y + 4}" font-size="12.5" fill="${v ? "#e6f1dc" : "#7d6360"}">${esc(name)}${best ? " ✦" : ""}</text>
        <text x="${W - 8}" y="${y + 4}" font-size="12.5" text-anchor="end" fill="${v ? "#8fd14f" : "#a2554f"}">${v ? `${lakh(v.max_amount)} · ${v.apr}% APR` : "declined"}</text></g>`;
    });
    el.classList.remove("draw");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${ok.length} lenders approve, ${rej.length} decline">
      <defs><filter id="fg" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${p}
      <circle cx="${sx}" cy="${sy}" r="74" fill="none" stroke="rgba(143,209,79,.22)" stroke-dasharray="2 6"/>
      <circle cx="${sx}" cy="${sy}" r="62" fill="#060905" stroke="#8fd14f" stroke-width="1.5" filter="url(#fg)"/>
      <text x="${sx}" y="${sy - 12}" text-anchor="middle" font-size="10.5" fill="#94a487" letter-spacing="2">YOUR PROFILE</text>
      <text x="${sx}" y="${sy + 18}" text-anchor="middle" font-size="27" font-weight="700" fill="#8fd14f">${ok.length}/${N}</text>
      <text x="${sx}" y="${sy + 37}" text-anchor="middle" font-size="10" fill="#94a487" letter-spacing="1.5">APPROVE</text>${lab}</svg>`;
    requestAnimationFrame(() => el.classList.add("draw"));
    $$(".lrow", el).forEach((g) => g.addEventListener("click", () => openLender(g.dataset.lender)));
  }

  function badges(v) {
    return `<span class="badge ${v.confidence}" data-tip="${esc(v.tight.length ? v.tight.join("<br>") : "Clears every rule with room to spare")}">${v.confidence}</span>` +
      (v.robust ? `<span class="badge strong" data-tip="Still approves when every peer estimate is set to its strictest value">robust</span>` : `<span class="badge borderline" data-tip="Declines when peer-estimated values are set to their strict bound">data-sensitive</span>`) +
      (v.estimated_fields.length ? `<span class="badge" data-tip="Peer-estimated deciding rules: ${esc(v.estimated_fields.join(", "))}">${v.estimated_fields.length} est.</span>` : `<span class="badge strong" data-tip="All deciding rules are official or calculator-derived">verified</span>`);
  }

  function drawBest(R) {
    const b = R.best;
    if (!b) { $("#bestWrap").innerHTML = ""; return; }
    $("#bestWrap").innerHTML = `<div class="best"><div class="in"><div><div class="crown">✦ Best option · lowest true cost</div><h3>${esc(b.lender)}</h3><div class="badges">${badges(b)}</div><p>${esc(R.best_explanation)}</p></div>
      <div class="metrics">
        <div class="m"><small>You can borrow</small><b data-c="${b.max_amount}" data-f="lakh">${lakh(b.max_amount)}</b><em>limited by ${b.binding}</em></div>
        <div class="m"><small>APR (true cost)</small><b>${b.apr}%</b><em>rate ${b.rate}% + fees</em></div>
        <div class="m"><small>EMI</small><b data-c="${b.emi}" data-f="inr">${inr(b.emi)}</b><em>${b.tenure} months on ${lakh(b.approved_amount)}</em></div>
        <div class="m"><small>Total cost</small><b data-c="${b.total_cost}" data-f="inr">${inr(b.total_cost)}</b><em>interest + ${inr(b.fee)} fees</em></div>
      </div></div></div>`;
    $$("#bestWrap [data-c]").forEach((el) => countUp(el, +el.dataset.c, { fmt: el.dataset.f === "lakh" ? lakh : inr, dur: 1100 }));
  }

  function drawPath(R) {
    // per lever type: the option that unlocks most, plus a cheaper one only if it is clearly cheaper
    const eff = (l) => l.target || l.reduce_by || l.months || 0, kept = {};
    for (const l of R.path_to_yes || []) {
      const key = l.lever === "account" ? l.bank : l.lever, k = (kept[key] = kept[key] || []);
      const clearlyCheaper = k.length === 1 && (l.lever === "cibil" ? l.target <= k[0].target - 30 : eff(l) < 0.7 * eff(k[0]));
      if (!k.length || clearlyCheaper) k.push(l);
    }
    const L = Object.values(kept).flat().sort((x, y) => y.n - x.n).slice(0, 4), box = $("#pathList");
    if (!L.length) {
      box.innerHTML = `<p class="hint">${R.rejections.length ? "No single change unlocks another lender: the remaining no's come from age, employer type or loan-size rules." : `Every one of the ${N} lenders already says yes.`}</p>`; return;
    }
    box.innerHTML = L.map((l, i) => `<div class="lever"><span class="plus">+${l.n}</span><div><b>${esc(l.text)}</b><span>${esc(l.unlocks.slice(0, 5).join(", "))}${l.unlocks.length > 5 ? ` and ${l.unlocks.length - 5} more` : ""}</span></div>
      <button type="button" class="btn ghost" data-lever="${i}">Try it</button></div>`).join("");
    $$("[data-lever]", box).forEach((btn) => btn.addEventListener("click", (e) => {
      ripple(e); const l = L[+btn.dataset.lever];
      if (l.lever === "cibil") { noHist = false; S.cibil_score = l.target; }
      else if (l.lever === "emi") S.existing_emi_total = Math.max(0, S.existing_emi_total - l.reduce_by);
      else if (l.lever === "wait") { S.months_in_current_job += l.months; S.work_experience_total += l.months; S.age = Math.round((S.age + l.months / 12) * 10) / 10; }
      else if (l.lever === "income") S.net_monthly_income = l.target;
      else if (l.lever === "account") S.salary_account_banks = [...new Set([...S.salary_account_banks, l.bank])];
      paintAll(); live(); setTimeout(() => show(PLE.run(applicant(), D)), 150);
    }));
  }

  function rangeRow(label, lo, base, hi, max, fmt) {
    const P = (x) => (max ? (x / max) * 100 : 0);
    return `<div class="unc-row"><div class="cap"><span>${label}</span><b>${fmt(lo)} – ${fmt(hi)}</b></div>
      <div class="range"><div class="rail"></div><div class="span" style="left:${P(lo)}%;width:${Math.max(0.8, P(hi) - P(lo))}%"></div><div class="dot" style="left:${P(base)}%" data-tip="Base case: ${fmt(base)}"></div>
      ${P(hi) - P(lo) > 14 ? `<span class="tick" style="left:${P(lo)}%">strict</span><span class="tick" style="left:${P(hi)}%">lenient</span>` : `<span class="tick" style="left:${Math.min(88, Math.max(12, (P(lo) + P(hi)) / 2))}%">${hi === lo ? "same in every case" : "strict → lenient"}</span>`}</div></div>`;
  }
  function drawUnc(R) {
    const u = R.uncertainty, box = $("#uncBody");
    if (!u) { box.innerHTML = ""; return; }
    if (!u.approvals.lenient) { box.innerHTML = `<p class="hint">No lender approves even with every estimated rule at its most lenient value, so the no comes from rules the lenders publish, not from our estimates.</p>`; return; }
    const amtMax = Math.max(u.max_amount.lenient, u.max_amount.base, 1);
    box.innerHTML = `<p class="hint small">The model re-ran with every peer-estimated rule at its strictest and its most lenient published peer value.</p>` +
      rangeRow("Lenders that approve", u.approvals.strict, u.approvals.base, u.approvals.lenient, N, (x) => x) +
      rangeRow("Largest amount on offer", u.max_amount.strict, u.max_amount.base, u.max_amount.lenient, amtMax, lakh) +
      `<p class="unc-note">${u.data_sensitive.length ? `<b>Data-sensitive:</b> ${esc(u.data_sensitive.join(", "))} ${u.data_sensitive.length === 1 ? "approves only while its" : "approve only while their"} estimated rules hold.` : "Every approval survives the strict case."}${u.only_if_lenient.length ? ` <b>Possible upside:</b> ${esc(u.only_if_lenient.join(", "))} would also approve if their unpublished rules are lenient.` : ""}</p>`;
  }

  function drawGrid(R) {
    const grid = $("#lenderGrid"), ok = [...R.approvals];
    ok.sort((a, b) => (sortKey === "max_amount" ? b.max_amount - a.max_amount : a[sortKey] - b[sortKey]));
    const maxA = Math.max(1, ...ok.map((v) => v.max_amount));
    grid.innerHTML = ok.map((v) => `<article class="lc enter ${R.best && v.lender_id === R.best.lender_id ? "is-best" : ""}" data-lender="${v.lender_id}" data-tilt tabindex="0">
      <div class="top"><h5>${esc(v.lender)}${R.best && v.lender_id === R.best.lender_id ? " ✦" : ""}</h5><span class="cat">${CAT[v.category] || v.category}</span></div>
      <div class="amt">${lakh(v.max_amount)}</div><div class="sub2">max · limited by ${v.binding}</div>
      <div class="meter"><i data-w="${(v.max_amount / maxA) * 100}"></i></div>
      <div class="row"><span>APR <span class="muted">(rate ${v.rate}%)</span></span><b>${v.apr}%</b></div>
      <div class="row"><span>EMI · ${v.tenure} mo</span><b>${inr(v.emi)}</b></div>
      <div class="row"><span>Fees</span><b data-tip="${esc(v.fee_basis)}">${inr(v.fee)}</b></div>
      <div class="row"><span>Total cost</span><b>${inr(v.total_cost)}</b></div>
      <div class="badges">${badges(v)}</div></article>`).join("") || `<p class="hint">No lender approves this profile.</p>`;
    $$(".lc", grid).forEach((c, i) => setTimeout(() => { c.classList.remove("enter"); c.classList.add("in"); const m = $(".meter i", c); m.style.width = m.dataset.w + "%"; }, reduce ? 0 : 120 + i * 55));
    $$(".lc", grid).forEach((c) => {
      c.addEventListener("click", (e) => { if (!e.target.closest("[data-tip]")) openLender(c.dataset.lender); });
      c.addEventListener("keydown", (e) => e.key === "Enter" && openLender(c.dataset.lender));
      if (reduce) return;
      c.addEventListener("pointermove", (e) => { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; c.style.transform = `perspective(700px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-3px)`; });
      c.addEventListener("pointerleave", () => (c.style.transform = ""));
    });
  }
  $("#sortSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || !lastR) return;
    sortKey = b.dataset.sort; $$("#sortSeg button").forEach((x) => x.classList.toggle("on", x === b)); drawGrid(lastR);
  });

  function drawRej(R) {
    const rj = R.rejections || [];
    $("#rejCard").style.display = rj.length ? "" : "none";
    const fixes = {}; (R.path_to_yes || []).forEach((l) => l.unlock_ids.forEach((id) => (fixes[id] = fixes[id] || l.text)));
    $("#rejSummary").textContent = `${rj.length} lender${rj.length === 1 ? "" : "s"} declined. See exactly why`;
    $("#rejList").innerHTML = rj.map((x) => `<div class="rej-row"><b>${esc(x.lender)}</b><span>${esc(x.reasons.join("; "))}${fixes[x.lender_id] ? ` <span class="muted">→ fix: ${esc(fixes[x.lender_id])}</span>` : ""}</span></div>`).join("");
  }

  // ======================================================================= lender drawer
  const RULE_NAMES = { min_age: "Minimum age", max_age_at_application: "Maximum age at application", max_age_at_maturity: "Maximum age at maturity",
    min_net_monthly_income: "Minimum net income", min_net_monthly_income_if_salary_account_holder: "Minimum income (salary-account holders)",
    min_cibil_score: "Minimum CIBIL", min_total_experience: "Minimum total experience", min_current_job_tenure: "Minimum time in current job",
    min_loan_amount: "Minimum loan", max_loan_amount: "Maximum loan", min_tenure: "Minimum tenure", max_tenure: "Maximum tenure",
    starting_interest_rate: "Lowest rate", max_interest_rate: "Highest rate", processing_fee_max_pct: "Processing fee (%)", processing_fee_min_inr: "Minimum fee",
    processing_fee_max_inr: "Maximum fee", processing_fee_gst_included: "GST included in fee", processing_fee_waivers: "Fee waivers", documentation_fee_inr: "Documentation fee",
    foir_cap: "FOIR cap (EMIs ÷ income)", salary_multiple_cap: "Salary multiple", salary_multiple_basis: "Multiple applies to", salary_multiple_when_obligations_high: "Multiple when EMIs are high",
    obligation_ratio_threshold_for_tier2: "High-EMI threshold", account_requirement: "Salary-account rule", employer_types_accepted: "Employers accepted", foreclosure_charges: "Foreclosure charges" };
  const SRC = { official_published: ["official", "official"], calculator_derived: ["calculator", "calculator"], peer_estimate: ["estimate", "peer estimate"] };
  const FIELD_OF = { min_age: "min_age", max_age_at_application: "max_age_app", min_net_monthly_income: "min_income", min_cibil_score: "min_cibil", min_total_experience: "min_exp_months",
    min_current_job_tenure: "min_cur_job_months", min_loan_amount: "min_amount", max_loan_amount: "max_amount", min_tenure: "min_tenure", max_tenure: "max_tenure",
    starting_interest_rate: "rate_min", max_interest_rate: "rate_max", foir_cap: "foir_cap", salary_multiple_cap: "multiple", processing_fee_max_pct: "fee_pct" };
  function fmtRule(r) {
    const v = r.rule_value;
    if (r.unit === "INR" || r.unit === "INR/month") return isNaN(+v) ? v : inr(+v);
    if (r.unit === "fraction_of_income") return pct(+v);
    if (r.unit === "percent_pa" || r.unit === "percent_of_loan") return v + "%";
    if (r.unit === "months") return v + " months";
    if (r.unit === "years") return v + " yrs";
    if (r.unit === "x_monthly_income") return v + "× income";
    return String(v).replace(/\|/g, ", ").replace(/_/g, " ");
  }
  function openLender(id) {
    const L = M[id], rules = SOURCES.filter((s) => s.lender_id === id), host = (u) => { try { return new URL(u).hostname.replace("www.", ""); } catch (e) { return u; } };
    const tiers = D.tiers.filter((t) => t.lender_id === id);
    const bounds = Object.fromEntries(D.bounds.filter((b) => b.lender_id === id).map((b) => [b.field, b]));
    const o = rules.filter((r) => r.source_type === "official_published").length, c = rules.filter((r) => r.source_type === "calculator_derived").length, e = rules.length - o - c;
    $("#drawerBody").innerHTML = `<span class="label">${CAT[L.category] || L.category} · ${esc(L.product_name)}</span><h2 id="drawerTitle" style="margin:8px 0 10px;font-size:30px">${esc(L.lender_name)}</h2>
      <div class="provbar"><i class="o" style="flex:${o}"></i><i class="c" style="flex:${c}"></i><i class="e" style="flex:${e}"></i></div>
      <div class="prov mono muted" style="margin:6px 0 14px">${o} official · ${c} calculator · ${e} peer estimate · read ${esc(L.accessed_on)}</div>
      ${tiers.length ? `<div class="label" style="margin-top:8px">Published CIBIL rate table</div><div class="table-wrap"><table><tr><th>Employee</th><th>Salary a/c</th><th>CIBIL</th><th>Rate</th></tr>${tiers.map((t) => `<tr><td>${t.employer_group.replace("_", " ")}</td><td class="val">${t.salary_account}</td><td class="val">${t.cibil_min}–${t.cibil_max}${t.includes_no_history === "yes" ? " + no history" : ""}</td><td class="val">${t.rate_pct}%</td></tr>`).join("")}</table></div>` : ""}
      <div class="label" style="margin-top:18px">Every rule</div>
      ${rules.map((r) => { const s = SRC[r.source_type] || ["estimate", r.source_type], b = bounds[FIELD_OF[r.rule_name]];
        return `<div class="rule"><div class="rh"><span class="rn">${esc(RULE_NAMES[r.rule_name] || r.rule_name)}</span><span class="rv">${esc(fmtRule(r))}</span></div>
          ${r.how_derived_or_evidence ? `<div class="ev">${esc(r.how_derived_or_evidence)}</div>` : ""}
          ${b ? `<div class="ev">Uncertainty range: strict ${esc(fmtRule({ ...r, rule_value: b.strict }))} · lenient ${esc(fmtRule({ ...r, rule_value: b.lenient }))}</div>` : ""}
          <div class="meta"><span class="src ${s[0]}">${s[1]}</span><a href="${esc(r.source_url)}" target="_blank" rel="noopener">${esc(host(r.source_url))} ↗</a><span>${esc(r.accessed_on)}</span></div></div>`; }).join("")}`;
    $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false"); $(".drawer-panel").scrollTop = 0; $(".drawer .iconbtn").focus();
  }
  function closeDrawer() { $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); }
  $$("[data-close]").forEach((x) => x.addEventListener("click", closeDrawer));
  addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

  // ======================================================================= lenders page
  function initLenders() {
    const types = ["all", ...new Set(D.order.map((k) => M[k].category))];
    $("#typeSeg").innerHTML = types.map((t, i) => `<button type="button" data-t="${t}" class="${i ? "" : "on"}">${t === "all" ? "All" : CAT[t] || t}</button>`).join("");
    const counts = (id) => { const r = SOURCES.filter((s) => s.lender_id === id); const o = r.filter((s) => s.source_type === "official_published").length, c = r.filter((s) => s.source_type === "calculator_derived").length; return [o, c, r.length - o - c]; };
    $("#dirGrid").innerHTML = D.order.map((k) => { const L = M[k], [o, c, e] = counts(k);
      return `<button type="button" class="dc reveal" data-lender="${k}" data-cat="${L.category}" data-name="${esc(L.lender_name.toLowerCase())}">
        <div class="card-head"><h4>${esc(L.lender_name)}</h4><span class="cat">${CAT[L.category]}</span></div>
        <div class="stats2"><div>Rate<b>${L.rate_max != null ? `${L.rate_min}–${L.rate_max}%` : `from ${L.rate_min}%`}</b></div><div>Up to<b>${lakh(L.max_amount)}</b></div>
        <div>Min income<b>${L.min_income ? inr(L.min_income) : "—"}</b></div><div>Min CIBIL<b>${L.min_cibil ?? "—"}</b></div>
        <div>Fee<b>${L.fee_pct != null ? L.fee_pct + "%" : L.fee_max_inr ? "≤ " + inr(L.fee_max_inr) : "—"}</b></div><div>Max tenure<b>${L.max_tenure} mo</b></div></div>
        <div class="provbar"><i class="o" style="flex:${o}"></i><i class="c" style="flex:${c}"></i><i class="e" style="flex:${e}"></i></div>
        <div class="prov">${o} official · ${c} calculator · ${e} estimate</div></button>`; }).join("");
    $$("#dirGrid .dc").forEach((d, i) => { d.style.transitionDelay = (i % 6) * 40 + "ms"; io.observe(d); d.addEventListener("click", () => openLender(d.dataset.lender)); });
    const filter = () => { const q = $("#lenderSearch").value.trim().toLowerCase(), t = $("#typeSeg .on").dataset.t;
      $$("#dirGrid .dc").forEach((d) => (d.style.display = (t === "all" || d.dataset.cat === t) && d.dataset.name.includes(q) ? "" : "none")); };
    $("#lenderSearch").addEventListener("input", filter);
    $("#typeSeg").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; $$("#typeSeg button").forEach((x) => x.classList.toggle("on", x === b)); filter(); });
  }

  // ======================================================================= insights page
  function hbars(el, items) {
    const max = Math.max(...items.map((x) => x.value), 1e-9);
    el.innerHTML = items.map((x) => `<div class="hb" data-tip="${esc(x.tip || "")}"><span class="nm">${esc(x.name)}${x.tag ? `<em>${esc(x.tag)}</em>` : ""}</span><span class="bar"><i data-w="${(x.value / max) * 100}"></i></span><span class="v">${x.label}</span></div>`).join("");
  }
  function animateBars(root) { $$(".hb .bar i", root).forEach((b, i) => { b.style.width = "0"; setTimeout(() => (b.style.width = b.dataset.w + "%"), reduce ? 0 : 80 + i * 30); }); }
  function initInsights() {
    const I = INSIGHTS;
    if (!I) { $("#kpis").innerHTML = `<p class="hint">Run python scripts/simulate.py then scripts/export_ui_data.py to generate insights.</p>`; return; }
    const kp = [[I.approved_by_any * 100, "%", "approved by at least one lender"], [I.median_lenders, "", `lenders say yes for the median applicant (of ${N})`],
      [I.cibil_plus_50.avg_extra_lenders, "", "extra lenders unlocked by +50 CIBIL (650–749)"], [I.fees_change_best.share * 100, "%", "of applicants: fees change the cheapest lender"]];
    $("#kpis").innerHTML = kp.map(([v, s, l], i) => `<div class="kpi"><b data-k="${i}">0</b><span>${l}</span></div>`).join("");
    kp.forEach(([v, s], i) => countUp($(`[data-k="${i}"]`), v, { fmt: (x) => (Number.isInteger(v) ? Math.round(x) : x.toFixed(1)) + s }));
    hbars($("#chartRules"), I.rule_failures.filter((r) => r.share_of_checks > 0).map((r) => ({ name: r.label, value: r.share_of_checks, label: pct(r.share_of_checks),
      tip: `<b>${esc(r.label)}</b><br>fails ${pct(r.share_of_checks, 1)} of checks<br>main blocker for ${pct(r.main_blocker_share)} of applicants nobody approves` })));
    hbars($("#chartTypes"), Object.entries(I.by_category).map(([k, v]) => ({ name: CAT[k] || k, value: v, label: pct(v) })));
    hbars($("#chartLenders"), I.lenders.map((l) => ({ name: l.lender, tag: CAT[l.category], value: l.approval_rate, label: pct(l.approval_rate),
      tip: `<b>${esc(l.lender)}</b><br>approves ${pct(l.approval_rate)}<br>median APR ${l.median_apr ?? "—"}%<br>median max ${l.median_max_amount ? lakh(l.median_max_amount) : "—"}<br>${l.n_estimated} estimated rule cells` })));
    const rv = I.rate_validation;
    $("#validCard").innerHTML = `<div class="label">Does the rate model hold up?</div><p class="hint small">For CIBIL 750+, the band template prices HDFC at its median rate below. HDFC publishes what it actually charged in Apr–Jun 2026.</p>
      <div class="versus"><div class="m"><small>Model, HDFC, CIBIL 750+</small><b>${rv.hdfc_model_median_rate_cibil_750plus}%</b></div><div class="m"><small>HDFC actual average</small><b>${rv.hdfc_published_avg_irr_q1_fy27}%</b></div></div>
      <p class="hint small" style="margin-top:12px">A straight line between HDFC's 9.99% and 24% would put a 760 score near 17%. Source: ${esc(rv.source)}</p>`;
    const u = I.uncertainty;
    $("#uncInsight").innerHTML = `<div class="label">How much estimated data moves the answer</div><p class="hint small">Average lenders approving, with every peer estimate at its strict bound, as stored, and at its lenient bound</p>
      ${rangeRow("Lenders approving (average applicant)", u.avg_strict, u.avg_base, u.avg_lenient, N, (x) => x.toFixed(1))}
      <p class="unc-note">The answer changes for <b>${pct(u.share_profiles_affected)}</b> of applicants between the strict and lenient cases, mostly through unpublished FOIR caps and salary multiples.</p>`;
    animateBars($("#page-insights"));
  }

  // ======================================================================= method page
  function initMethod() {
    const steps = [["Gates", "Age, income floor, CIBIL, experience, job tenure, employer type, salary-account rule, residency."],
      ["Price", "Published CIBIL table (PNB, Union) or the band template between a lender's published min and max rate."],
      ["Size", "Smallest of FOIR capacity, salary multiple and lender cap. Axis uses its calculator's tiered rule."],
      ["Cost", "Processing fee with waivers, min/max and GST, plus interest, gives total cost and APR."],
      ["Confidence", "How far you clear each rule: strong, borderline or risky."],
      ["Rank", "Lowest APR among lenders that fund your amount, with a small penalty for estimated data."],
      ["Path to yes", "Smallest single change that unlocks more lenders, tested by re-running the model."],
      ["Uncertainty", "Re-run with every estimate at its strict and lenient bound to give a range."]];
    $("#pipeline").innerHTML = steps.map(([h, p]) => `<li class="reveal"><h4>${h}</h4><p>${p}</p></li>`).join("");
    $$("#pipeline li").forEach((li, i) => { li.style.transitionDelay = i * 70 + "ms"; io.observe(li); setTimeout(() => li.classList.add("lit"), 900 + i * 160); setTimeout(() => li.classList.remove("lit"), 1500 + i * 160); });
    const by = (t) => SOURCES.filter((s) => s.source_type === t).length, o = by("official_published"), c = by("calculator_derived"), e = by("peer_estimate");
    $("#srcMix").innerHTML = `<p class="hint small">${SOURCES.length} rules across ${N} lenders, each with a source link and the date it was read.</p>
      <div class="provbar" style="height:10px"><i class="o" style="flex:${o}"></i><i class="c" style="flex:${c}"></i><i class="e" style="flex:${e}"></i></div>
      <div class="mixrow"><span class="src official">official ${o}</span> <span class="src calculator">calculator ${c}</span> <span class="src estimate">peer estimate ${e}</span></div>
      <p class="hint small" style="margin-top:14px">Peer estimates are values a lender doesn't publish, taken from comparable lenders or a third-party page. Every one has a strict and lenient bound in data/estimate_bounds.csv.</p>`;
    $("#assumptions").innerHTML = `<tr><th>ID</th><th>Assumption</th><th>Value</th><th>Why</th></tr>` +
      LOAN_DATA.assumptions.map((a) => `<tr><td>${a.id}</td><td>${esc(a.name.replace(/_/g, " "))}</td><td class="val">${esc(a.value)}</td><td>${esc(a.rationale)}</td></tr>`).join("");
  }

  // ======================================================================= boot
  paintAll(); goStep(0); live();
  go(location.hash.slice(1) || "check");
})();
