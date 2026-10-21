/* GOALS: what your work serves. You write them; projects and single threads link to them. */
const GO = (() => {
const esc = escP;
let d = null, edit = null, del = null, openG = new Set(), focusG = null;
// Last quarter, this one and the next three.
function quarters(){ const n = new Date(), q = n.getFullYear() * 4 + Math.floor(n.getMonth() / 3);
  return [-1, 0, 1, 2, 3].map(k => `${Math.floor((q + k) / 4)}-Q${(q + k) % 4 + 1}`); }
async function open(focus){
  const r = await fetch("/api/goals");
  if(!r.ok){ $("#go").innerHTML = `<div class="empty">Goals need the app server. Start it with bun app/server.ts.</div>`; return; }
  d = await r.json(); if(focus){ openG.add(+focus); focusG = +focus; } render();
}
// A key result names a metric the app measures, a milestone, or nothing: then you type "now".
function measures(sel){
  const o = (v, t) => `<option value="${esc(v)}" ${v === (sel ?? "") ? "selected" : ""}>${esc(t)}</option>`;
  return o("", "I update it") + `<optgroup label="The app measures">${d.metrics.map(m => o(m.key, m.label)).join("")}</optgroup>`
    + (d.milestones.length ? `<optgroup label="Linear milestone, % done">${d.milestones.map(m => o(`milestone:${m.id}`, `${m.project} · ${m.name}`)).join("")}</optgroup>` : "");
}
const nv = v => v == null ? "" : String(v);
function krRow(k, i){
  return `<div class="kr-row" data-i="${i}">
    <input class="kr-text" aria-label="Key result ${i+1}" maxlength="200" placeholder="${i ? "Another number that proves it" : "3 teams use exports in production"}" value="${esc(k.text ?? "")}">
    <select class="kr-m" aria-label="How it is measured">${measures(k.metric)}</select>
    <label class="kr-n">from<input class="kr-start" inputmode="decimal" value="${esc(nv(k.start))}"></label>
    <label class="kr-n">target<input class="kr-target" inputmode="decimal" value="${esc(nv(k.target))}"></label>
    <label class="kr-n">now<input class="kr-cur" inputmode="decimal" value="${esc(nv(k.metric ? k.value : k.current))}" ${k.metric ? "disabled" : ""}></label>
    <button type="button" class="undo del" data-krdel="${i}" aria-label="Remove key result ${i+1}">✕</button></div>`;
}
// What you typed, so adding or removing a row never loses it.
function readForm(f){
  return {id: f.dataset.id ? +f.dataset.id : null, draft_id: f.dataset.draft ? +f.dataset.draft : null, title: $("#go-title").value, description: $("#go-desc").value, kind: f.dataset.kind, type: f.dataset.type, quarter: $("#go-q").value || null,
    krs: [...f.querySelectorAll(".kr-row")].map(r => ({text: r.querySelector(".kr-text").value, metric: r.querySelector(".kr-m").value || null,
      start: r.querySelector(".kr-start").value, target: r.querySelector(".kr-target").value, current: r.querySelector(".kr-cur").value}))};
}
function form(g){
  const kind = g.kind ?? "team", type = g.type ?? "aspirational", qs = quarters(), krs = g.krs?.length ? g.krs : [{}];
  if(g.quarter && !qs.includes(g.quarter)) qs.unshift(g.quarter);
  const seg = (name, v, opts) => `<div class="seg" role="group" aria-labelledby="go-${name}-l">${opts.map(([k, t]) => `<button type="button" data-${name}="${k}" aria-pressed="${v === k}">${t}</button>`).join("")}</div>`;
  return `<form class="go-form" id="go-form" data-id="${g.id ?? ""}" data-draft="${g.draft_id ?? ""}" data-kind="${kind}" data-type="${type}">
    <label>Objective<input id="go-title" name="title" maxlength="120" required value="${esc(g.title ?? "")}" placeholder="Customers manage datasets as code" autocomplete="off">
      <span class="hint">An outcome, not a task: what is true when you are done?</span></label>
    <label>Description<textarea id="go-desc" maxlength="600" rows="3" placeholder="Why this matters now, and what done looks like">${esc(g.description ?? g.why ?? "")}</textarea></label>
    <div class="row"><div class="fld"><span id="go-kind-l">For</span>${seg("kind", kind, [["team", "Team or company"], ["personal", "Personal"]])}</div>
      <div class="fld"><span id="go-type-l">Type</span>${seg("type", type, [["committed", "Committed · must reach 1.0"], ["aspirational", "Aspirational · 0.7 is on track"]])}</div>
      <label>Quarter<select id="go-q" name="quarter"><option value="">No end</option>${qs.map(q => `<option ${q === g.quarter ? "selected" : ""}>${q}</option>`).join("")}</select></label></div>
    <fieldset class="krs-f"><legend>Key results <span class="hint">2 to 4. Each is a number with a start and a target, so you can tell when it is done.</span></legend>
      ${krs.map(krRow).join("")}
      ${krs.length < 5 ? `<button type="button" class="go-btn" id="kr-add">＋ key result</button>` : `<span class="hint">Five is the most. More is a task list.</span>`}</fieldset>
    <div class="row"><button class="go-btn main" type="submit">${g.id ? "Save objective" : "Create objective"}</button><button class="go-btn" type="button" id="go-cancel">Cancel</button></div></form>`;
}
// One bar per key result: 0 at the start, 1 at the target. The tick is where this type is on track.
function krView(k, type){
  const p = k.progress, line = type === "committed" ? 1 : .7, m = k.metric && (d.metrics.find(x => x.key === k.metric)?.label ?? d.milestones.find(x => `milestone:${x.id}` === k.metric)?.name);
  const unit = d.metrics.find(x => x.key === k.metric)?.unit ?? (k.metric?.startsWith("milestone:") ? "%" : "");
  return `<li class="kr${p != null && p >= line ? " hit" : ""}"><div class="kr-h"><span>${esc(k.text)}</span><b class="num">${p == null ? "–" : p.toFixed(2)}</b></div>
    <div class="kr-bar" role="img" aria-label="${p == null ? "no numbers yet" : `${Math.round(p*100)}% of the way`}"><i style="width:${(p ?? 0)*100}%"></i><s style="left:${line*100}%"></s></div>
    <span class="by">${k.start != null && k.target != null ? `${nv(k.start)} → ${nv(k.target)} ${esc(unit)} · now ${k.value == null ? "–" : nv(k.value)}` : "add a start and a target"} · ${m ? `measured: ${esc(m)}${k.metric.startsWith("milestone:") ? "" : d.metrics.find(x => x.key === k.metric)?.agg === "total" ? ", this quarter so far" : ", last 4 weeks"}` : "you update it"}</span></li>`;
}
// Confidence this week, 1 to 10, with the weeks before it.
function confView(g){
  const now = g.checkins.find(c => c.week === d.week)?.confidence, past = g.checkins.filter(c => c.week !== d.week).slice(-7);
  return `<div class="conf"><span class="lbl">${now ? `Confidence ${d.week.slice(5)}` : `How sure are you, ${d.week.slice(5)}?`}</span>
    <div class="conf-b" role="group" aria-label="Confidence this week, 1 to 10">${Array.from({length: 10}, (_, i) => `<button data-conf="${i+1}" data-g="${g.id}" aria-pressed="${now === i+1}">${i+1}</button>`).join("")}</div>
    ${past.length ? `<span class="by">before: ${past.map(c => `${c.week.slice(5)} ${c.confidence}`).join(" · ")}</span>` : ""}</div>`;
}
// The objective's score: the mean of its key results that have numbers.
const score = g => { const ps = g.krs.map(k => k.progress).filter(p => p != null); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null; };
// Closed: one line per goal, so five goals still fit a screen. Open one to see and change it.
function row(g){
  const s = score(g), line = g.type === "committed" ? 1 : .7, c = g.checkins.find(x => x.week === d.week)?.confidence;
  return `<button class="go-row" data-focus="${g.id}" aria-expanded="false" aria-controls="goal-${g.id}">
    <span class="go-rt"><b>${esc(g.title)}</b><span class="by">${g.kind} · ${g.type}${g.quarter ? ` · ${g.quarter}` : ""}</span></span>
    <span class="go-mini" aria-label="${g.krs.length} key results">${g.krs.map(k => `<i title="${esc(k.text)}"><i style="width:${(k.progress ?? 0)*100}%"${k.progress != null && k.progress >= line ? ' class="hit"' : ""}></i></i>`).join("")}</span>
    <span class="go-score num${s != null && s >= line ? " hit" : ""}" title="Mean of the key results">${s == null ? "–" : s.toFixed(2)}</span>
    <span class="go-conf${c ? "" : " ask"}" title="${c ? `Confidence ${d.week.slice(5)}` : `No confidence for ${d.week.slice(5)} yet`}">${c ?? "?"}</span>
  </button>`;
}
function card(g, max){
  if(edit === g.id) return form(g);
  if(focusG !== g.id && del !== g.id) return row(g);
  const ts = Object.values(g.weeks).flat(), o = openG.has(g.id), linked = new Set(g.projects.map(p => p.id));
  return `<article class="grp ${g.kind}" id="goal-${g.id}">
    <div class="go-h"><h2>${esc(g.title)}</h2><span class="go-k ${g.kind}">${g.kind === "personal" ? "personal" : "team"}</span><span class="go-k">${g.type}</span>${g.quarter ? `<span class="facts">${g.quarter}</span>` : ""}
      <span class="end"><button class="undo" data-edit="${g.id}">edit</button><button class="undo del" data-del="${g.id}">delete</button><button class="undo" data-focus="" aria-expanded="true" aria-label="Close ${esc(g.title)}">close ▴</button></span></div>
    ${del === g.id ? `<div class="banner">Delete this goal? Its links go; projects and threads stay. <span><button class="undo del" data-del-yes="${g.id}">delete</button><button class="undo" data-del-no="1">cancel</button></span></div>` : ""}
    ${g.description ? `<p class="go-desc">${esc(g.description)}</p>` : ""}
    ${g.krs.length ? `<ol class="kr-list">${g.krs.map(k => krView(k, g.type)).join("")}</ol>` : `<p class="krs">No key results yet. <button class="undo" data-edit="${g.id}">add them</button></p>`}
    ${confView(g)}
    <div class="go-p">${g.projects.map(p => `<span class="mchip">${esc(p.name)}<button data-unlink="${esc(p.id)}" data-g="${g.id}" aria-label="Unlink ${esc(p.name)}">✕</button></span>`).join("") || "<span>No project linked.</span>"}
      <select data-link="${g.id}" aria-label="Link a project to ${esc(g.title)}"><option value="">＋ link a project…</option>${d.projects.filter(p => !linked.has(p.id)).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></div>
    ${d.weeks.length ? strip(d.weeks.slice(-8), w => (g.weeks[w] ?? []).length, max) : ""}
    ${ts.length ? `<button class="go-th" data-open="${g.id}" aria-expanded="${o}">${o ? "▾" : "▸"} ${ts.length} thread${ts.length > 1 ? "s" : ""}</button>`
      : `<span class="facts">No threads yet. Link a project, or press L on a thread in review.</span>`}
    ${o ? `<div class="weeks">${[...d.weeks].reverse().filter(w => g.weeks[w]).map(w => `<div class="wk"><span class="lbl">${w.slice(5)}</span><ul>${g.weeks[w].map(t =>
      `<li><a href="#/review?week=${w}&key=${encodeURIComponent(t.key)}"><b>${esc(t.title ?? "Untitled")}</b>${t.direct ? `<span class="go-direct">linked in review</span>` : ""}${t.decided ? `<span class="ok">✓</span>` : `<span class="todo">to review</span>`}</a></li>`).join("")}</ul></div>`).join("")}</div>` : ""}
  </article>`;
}
const ring = dashed => `<svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="none" stroke="var(--s3)" stroke-width="6"/>
  <circle cx="20" cy="20" r="14" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" pathLength="100" stroke-dasharray="${dashed ? "6 6" : "68 100"}" transform="rotate(-90 20 20)"/></svg>`;
// No goals yet: pick a kind, or start from the work you already do.
function first(){
  const top = d.projects.filter(p => p.threads).sort((a, b) => b.threads - a.threads).slice(0, 4);
  return `<div class="go-first">
    <h2>What does your work serve?</h2>
    <p>Name two to four goals. North then shows how much of your work serves each one, and what serves none.</p>
    <div class="go-kinds">
      <button class="go-kind" data-new="team">${ring(false)}<b>Team or company goal</b><span>“Exports API GA”. Usually served by projects.</span></button>
      <button class="go-kind" data-new="personal">${ring(true)}<b>Personal goal</b><span>“Grow two engineers to lead projects”. Usually single threads: a pairing, a review that taught.</span></button></div>
    ${top.length ? `<span class="lbl">Start from your work</span><p>Your busiest projects. One tap makes it a goal, linked, and opens it so you can rename it.</p>
      <div class="go-seeds">${top.map(p => `<button class="go-seed" data-seed="${esc(p.id)}"><i class="src ${p.kind}"></i>${esc(p.name)}<span>${p.threads} threads</span><b>＋</b></button>`).join("")}</div>` : ""}
  </div>`;
}
// Claude's drafts, one in focus: keep or drop each key result, fix a number, then add it.
let dIdx = 0;
const unitOf = m => !m ? "" : m.startsWith("milestone:") ? "%" : (x => x ? x.unit + (x.agg === "total" ? " this quarter" : "") : "")(d.metrics.find(x => x.key === m));
const labelOf = m => !m ? "you update it" : d.metrics.find(x => x.key === m)?.label ?? (x => x ? `milestone · ${x.project} · ${x.name}` : "milestone")(d.milestones.find(x => `milestone:${x.id}` === m));
function drafts(){
  if(!d.drafts.length) return "";
  dIdx = Math.min(dIdx, d.drafts.length - 1);
  const g = d.drafts[dIdx], n = d.drafts.length;
  const kr = (k, i) => `<li class="dr-kr" data-i="${i}">
      <button type="button" class="dr-keep" data-keep="${i}" aria-pressed="true" aria-label="Keep this key result">✓</button>
      <div class="dr-kt"><span>${esc(k.text)}</span><span class="by">${esc(labelOf(k.metric))}</span></div>
      <div class="dr-nums">${k.metric ? `<b class="num" title="Where you are now, measured">${nv(k.start) || "–"}</b>`
          : `<input class="dr-start num" inputmode="decimal" aria-label="Start" placeholder="?" value="${esc(nv(k.start))}">`}
        <i class="dr-arrow" aria-hidden="true"></i>
        <input class="dr-target num" inputmode="decimal" aria-label="Target" value="${esc(nv(k.target))}"><span class="dr-u">${esc(unitOf(k.metric))}</span></div></li>`;
  return `<section class="dr" aria-label="Drafts from Claude">
    <header class="dr-top"><span class="lbl">Claude drafted ${n} objective${n > 1 ? "s" : ""}${g.quarter ? ` for ${g.quarter}` : ""}</span>
      <span class="dr-dots">${d.drafts.map((x, i) => `<button type="button" data-dr="${i}" aria-label="Draft ${i+1}: ${esc(x.title)}" aria-current="${i === dIdx}"></button>`).join("")}</span>
      <span class="dr-n num">${dIdx + 1} of ${n}</span></header>
    <article class="dr-card" data-draft="${g.id}">
      <div class="dr-meta"><span class="go-k">${g.kind}</span><span class="go-k">${g.type === "committed" ? "committed · must reach 1.0" : "aspirational · 0.7 is good"}</span></div>
      <h2 class="dr-title">${esc(g.title)}</h2>
      <p class="dr-why">${esc(g.why)}</p>
      <div class="dr-src"><span class="by">from your data</span>${g.based_on.map(b => `<span class="dr-chip">${esc(b)}</span>`).join("")}</div>
      <ol class="dr-krs">${g.krs.map(kr).join("")}</ol>
      <footer class="dr-act"><button type="button" class="dr-add" data-add="${g.id}">Add as goal</button>
        <button type="button" class="undo" data-use="${g.id}">edit all fields</button>
        <button type="button" class="undo" data-dismiss="${g.id}">skip</button>
        <span class="hint dr-keys"><kbd>A</kbd> add · <kbd>S</kbd> skip · <kbd>←</kbd><kbd>→</kbd></span></footer>
    </article></section>`;
}
// The draft as you left it: only the key results you kept, with your numbers.
function draftGoal(card){
  const g = d.drafts.find(x => x.id === +card.dataset.draft);
  const krs = [...card.querySelectorAll(".dr-kr")].flatMap(li => {
    if(li.querySelector(".dr-keep").getAttribute("aria-pressed") !== "true") return [];
    const k = g.krs[+li.dataset.i];
    return [{text: k.text, metric: k.metric, start: k.metric ? k.start : li.querySelector(".dr-start").value, target: li.querySelector(".dr-target").value}];
  });
  return {title: g.title, description: g.why, kind: g.kind, type: g.type, quarter: g.quarter, draft_id: g.id, krs};
}
async function addDraft(card){
  const g = draftGoal(card);
  if(!g.krs.length) return toast("Keep at least one key result");
  const r = await post("/api/goal", g);
  if(!r.ok) return toast(await r.text());
  RV.reset(); toast(`Added: ${g.title}`); await open();
}
function render(){
  const max = Math.max(1, ...d.goals.flatMap(g => Object.values(g.weeks).map(t => t.length)));
  if(d.goals.length === 1) focusG = d.goals[0].id;
  const list = `<div class="go-list">${d.goals.map(g => card(g, max)).join("")}</div>`;
  $("#go").innerHTML = typeof edit === "string" ? form({kind: edit}) + list
    : edit && typeof edit === "object" ? form(edit) + list
    : !d.goals.length && !d.drafts.length ? first()
    : drafts() + `<button class="todo big go-new" id="go-add">＋ new goal</button>` + list;
  if(edit != null) $("#go-title")?.focus();
}
// A goal named after one of your projects, already linked, open for you to rename.
async function seed(p){
  const r = await post("/api/goal", {title: p.name, kind: "team"});
  if(!r.ok) return toast(await r.text());
  const {id} = await r.json();
  await post("/api/goal-link", {goal_id: id, project_id: p.id, on: true});
  RV.reset(); edit = id; toast(`Goal created from ${p.name}`); await open();
}
async function act(url, body, done){
  const r = await post(url, body);
  if(!r.ok) return toast(await r.text());
  RV.reset(); toast(done); await open();
}
$("#v-goals").addEventListener("click", e => {
  const b = e.target.closest("button"); if(!b) return;
  if(b.id === "go-add"){ edit = "team"; render(); }
  else if(b.dataset.new){ edit = b.dataset.new; render(); }
  else if(b.dataset.seed){ const p = d.projects.find(x => x.id === b.dataset.seed); seed(p); }
  else if(b.id === "go-cancel"){ edit = null; render(); }
  else if(b.dataset.use){ const g = d.drafts.find(x => x.id === +b.dataset.use); edit = {...g, id: null, draft_id: g.id}; render(); }
  else if(b.dataset.dismiss) act("/api/draft-dismiss", {id: +b.dataset.dismiss}, "Skipped. The draft is gone");
  else if(b.dataset.add) addDraft(b.closest(".dr-card"));
  else if(b.dataset.dr){ dIdx = +b.dataset.dr; render(); }
  else if(b.dataset.keep){ const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", on); b.textContent = on ? "✓" : "✕"; b.closest(".dr-kr").classList.toggle("off", !on); }
  else if(b.dataset.kind || b.dataset.type){ const f = b.closest("form"), k = b.dataset.kind ? "kind" : "type"; f.dataset[k] = b.dataset[k];
    f.querySelectorAll(`button[data-${k}]`).forEach(x => x.setAttribute("aria-pressed", x === b)); }
  else if(b.id === "kr-add" || b.dataset.krdel != null){ const f = b.closest("form"), g = readForm(f);
    if(b.id === "kr-add") g.krs.push({}); else g.krs.splice(+b.dataset.krdel, 1);
    f.outerHTML = form(g); $(b.id === "kr-add" ? "#go-form .kr-row:last-of-type .kr-text" : "#kr-add, #go-title")?.focus(); }
  else if(b.dataset.conf){ post("/api/checkin", {goal_id: +b.dataset.g, confidence: +b.dataset.conf}).then(async r => { if(!r.ok) return toast(await r.text()); toast(`Confidence ${b.dataset.conf} saved`); await open(); }); }
  else if(b.dataset.edit){ edit = +b.dataset.edit; render(); }
  else if(b.dataset.del){ del = +b.dataset.del; render(); }
  else if(b.dataset.delNo){ del = null; render(); }
  else if(b.dataset.delYes){ del = null; act("/api/goal", {id: +b.dataset.delYes, delete: true}, "Goal deleted"); }
  else if(b.dataset.unlink) act("/api/goal-link", {goal_id: +b.dataset.g, project_id: b.dataset.unlink, on: false}, "Project unlinked");
  else if(b.dataset.focus != null){ focusG = b.dataset.focus ? +b.dataset.focus : null; render(); if(focusG) $(`#goal-${focusG}`)?.scrollIntoView({block: "nearest"}); }
  else if(b.dataset.open){ const id = +b.dataset.open; openG.has(id) ? openG.delete(id) : openG.add(id); render(); }
});
// Drafts by keyboard, only while Goals is open and you are not typing.
document.addEventListener("keydown", e => {
  if($("#v-goals").hidden || !d?.drafts?.length || edit != null || e.metaKey || e.ctrlKey || e.target.closest("input,select,textarea")) return;
  const card = $(".dr-card"); if(!card) return;
  if(e.key === "ArrowRight" || e.key === "ArrowLeft"){ e.preventDefault(); dIdx = (dIdx + (e.key === "ArrowRight" ? 1 : -1) + d.drafts.length) % d.drafts.length; render(); }
  else if(e.key === "a"){ e.preventDefault(); addDraft(card); }
  else if(e.key === "s"){ e.preventDefault(); act("/api/draft-dismiss", {id: +card.dataset.draft}, "Skipped. The draft is gone"); }
});
$("#v-goals").addEventListener("change", e => {
  // An auto measure fills "now" for you; switching to manual leaves it for you to type.
  const m = e.target.closest(".kr-m"); if(m){ const c = m.closest(".kr-row").querySelector(".kr-cur"); c.disabled = !!m.value; if(m.value) c.value = ""; return; }
  const s = e.target.closest("[data-link]");
  if(s?.value) act("/api/goal-link", {goal_id: +s.dataset.link, project_id: s.value, on: true}, `Linked ${s.selectedOptions[0].textContent}`);
});
$("#v-goals").addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, id = f.dataset.id ? +f.dataset.id : null;
  // f.title is the form's own title attribute, so read the fields by id.
  const g = readForm(f); g.krs = g.krs.filter(k => k.text.trim() || k.start || k.target);
  const r = await post("/api/goal", g);
  if(!r.ok){ // Say what is wrong without clearing what you typed.
    let p = f.querySelector(".err"); if(!p){ p = document.createElement("p"); p.className = "err"; p.setAttribute("role", "alert"); f.lastElementChild.before(p); }
    p.textContent = await r.text(); return; }
  edit = null; toast(id ? "Goal saved" : "Goal created"); await open();
});
return {open};
})();
