const RV = (() => {
const MODE_KEYS = ["a","s","d","f","g","h"], PILLAR_KEYS = ["z","x","c"];
const KIND = {pr_merged:"PR merged", pr_open:"PR open", issue_completed:"issue done", issue_open:"issue open",
  review_comment:"review received", reviews_given:"reviews given", slack_message:"Slack", slack_mention:"mention",
  meeting:"meeting", doc_created:"doc created", doc_edited:"doc edited"};
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const post = (url, body) => fetch(url, {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body)});
let data = null, cur = 0, draft = {}, from = null, all = false, keys = false;

async function load(week){
  data = await (await fetch("/api/review" + (week ? `?week=${week}` : ""))).json();
  // Claude's "probably routine" go last, so the work that needs you comes first.
  data.threads.sort((a, b) => routine(a) - routine(b));
  cur = Math.max(0, data.threads.findIndex(t => !t.human.discard));
}
// Called by the router. Keeps your place when you come back to the tab.
async function open(week, key, fromGroup){
  from = fromGroup;
  if(!data || (week && week !== data.week)){ draft = {}; await load(week); }
  if(key){ const i = data.threads.findIndex(t => t.key === key); if(i >= 0) cur = i; }
  render();
}

const routine = t => t.claude.discard === "yes" && !t.human.discard ? 1 : 0;
// Pending only hides what you decided, but keeps the open thread so the card does not jump away.
const shown = i => $("#rv-show").value === "all" || !data.threads[i].human.discard || i === cur;
function pick(t){
  return draft[t.key] ??= {title: t.human.title ?? t.claude.title ?? "", summary: t.human.summary ?? t.claude.summary ?? "", mode: t.human.mode ?? t.claude.mode, pillar: t.human.pillar ?? t.claude.pillar};
}

function stats(){
  const decided = data.threads.filter(t => t.human.discard);
  data.pending[data.week] = data.threads.length - decided.length;
  PENDING = {...data.pending}; renderWm();
  $("#rv-week").innerHTML = data.weeks.map(w => `<option value="${w}" ${w===data.week?"selected":""}>${w} · ${data.pending[w] ? `${data.pending[w]} left` : "done"}</option>`).join("");
  $("#rv-done").textContent = `${decided.length}/${data.threads.length}`;
}

function render(){
  stats();
  const ts = data.threads;
  if(!ts.length){ $("#rv-queue").innerHTML = ""; $("#rv-card").innerHTML = `<div class="empty">No suggested threads yet. Run <code>./run.sh</code> to collect the week and suggest labels.</div>`; return; }
  const firstRoutine = ts.findIndex((t,i) => routine(t) && shown(i)), nRoutine = ts.filter(routine).length;
  $("#rv-queue").innerHTML = ts.map((t,i) => { if(!shown(i)) return ""; const d = pick(t); return `${i===firstRoutine?`<li class="sep"><span class="lbl">Probably routine · ${nRoutine}</span><button id="discard-all">discard all <kbd>⇧0</kbd></button></li>`:""}<li><button data-i="${i}" aria-current="${i===cur}" class="${t.human.discard==="yes"?"gone":""}">
    <i class="dot" style="background:${mc(d.mode)}"></i><span class="t">${esc(d.title)}</span>
    <span class="n ${t.human.discard?"done":""}">${t.human.discard==="yes"?"✕":t.human.discard?"✓":t.events.length}</span></button></li>`; }).join("");
  const t = ts[cur], d = pick(t), ev = new Set(JSON.parse(t.claude.evidence ?? "[]"));
  // The address follows the open thread, so reload and back keep your place.
  if(!$("#v-review").hidden) history.replaceState(null, "", `#/review?week=${data.week}&key=${encodeURIComponent(t.key)}${from ? `&from=${encodeURIComponent(from)}` : ""}`);
  const back = from && data.groups.find(g => g.id === from), group = t.projects[0];
  // Claude's evidence first.
  const evs = [...t.events].sort((a, b) => ev.has(b.id) - ev.has(a.id));
  const kinds = Object.entries(t.events.reduce((a,e) => (a[KIND[e.kind]??e.kind] = (a[KIND[e.kind]??e.kind]||0)+1, a), {})).map(([k,n]) => `${n} ${k}`).join(" · ");
  $("#rv-card").innerHTML = `
    <div class="r-prog" aria-hidden="true">${ts.map((x,i) => `<i class="${x.human.discard==="yes"?"g":x.human.discard?"d":i===cur?"c":""}"></i>`).join("")}</div>
    <div class="gwrap">
      ${back ? `<a class="crumb" href="#/project?id=${encodeURIComponent(back.id)}">← ${esc(back.name)}</a>` : ""}
      <button class="gbtn" id="gopen" aria-haspopup="listbox" aria-expanded="false" title="Change project (P)">${t.projects.length ? t.projects.map(p => esc(p.name) + (p.by === "claude" ? ` <span class="ai" title="Claude placed this thread here">Claude</span>` : "")).join(", ") : "no project"} ▾</button>
      ${t.projects.some(p => p.by === "claude") ? `<button class="undo" id="unassign">wrong project ✕</button>` : ""}
      ${group && group.id !== from ? `<a class="crumb" href="#/project?id=${encodeURIComponent(group.id)}">across weeks →</a>` : ""}
      <button class="discard" data-wm="discard" aria-pressed="${t.human.discard==="yes"}" title="Not your impact: routine, noise, or someone else's work (0)"><kbd>0</kbd>discard${routine(t)?` <span class="ai" title="Claude thinks this is routine">Claude</span>`:""}</button>
      <div class="gpop" id="gpop" hidden><input id="gq" placeholder="Find a project, or type a new topic" autocomplete="off" aria-label="Project"><ul id="gl-list" role="listbox"></ul></div></div>
    <div class="r-goals" id="rv-goals" role="group" aria-label="Goals this thread serves"><span class="lbl">Serves</span>${data.goals.length ? data.goals.map(g => {
      // A goal its project serves is on through the project; change that on the project's page.
      const via = t.goals.project.includes(g.id), on = via || t.goals.direct.includes(g.id);
      return `<button class="gl-chip" data-gl="${g.id}" aria-pressed="${on}" ${via ? `disabled title="Through its project"` : ""}>${esc(g.title)}${via ? " · via project" : ""}</button>`; }).join("")
      : `<a class="crumb" href="#/goals">no goals yet · add one →</a>`}</div>
    <div class="r-sec">
      <input class="r-title" id="rv-title" value="${esc(d.title)}" aria-label="Thread title">
      <textarea class="r-summary" id="rv-summary" rows="2" aria-label="Summary of what you did" placeholder="No summary yet">${esc(d.summary)}</textarea></div>
    <div class="r-sec">
      <button class="r-more" id="all" aria-expanded="${all}"><span>${kinds}</span><span class="lbl">${all ? "hide" : "evidence"} ${all ? "▴" : "▾"}</span></button>
      ${all ? `<ul class="r-events">${evs.map(e => `<li class="${ev.has(e.id)?"ev":""}">
      <span class="k">${KIND[e.kind]??e.kind}</span>
      <span class="ev-x">${e.url?`<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title ?? e.id)} ↗</a>`:esc(e.title ?? e.id)}
      ${e.author && e.kind!=="pr_merged" && e.kind!=="pr_open" ? ` <span class="lbl">${esc(e.author)}</span>`:""}
      ${e.text?`<small>${esc(e.text)}</small>`:""}</span></li>`).join("")}</ul>` : ""}</div>
    <div class="r-fields">
      <span class="lbl">Mode</span><div class="seg" role="group" aria-label="Mode">${Object.keys(MODES).map((k,i) => seg("mode", k, MODES[k], MODE_KEYS[i], d, t, mc(k))).join("")}</div>
      <span class="lbl">Pillar</span><div class="seg" role="group" aria-label="Pillar">${Object.keys(PILLAR).map((k,i) => seg("pillar", k, PILLAR[k], PILLAR_KEYS[i], d, t)).join("")}</div>
      <span></span><span class="legend"><i class="sug-dot"></i> Claude's pick</span>
    </div>
    <div class="r-ask"><span class="q">Without you?</span>
      <div class="r-wm">${WM.map(([k,l],i) => `<button data-wm="${k}" aria-pressed="${t.human.discard==="no" && t.human.without_me===k}"><kbd>${i+1}</kbd>${l}</button>`).join("")}</div></div>
    <div class="r-keys" ${keys ? "" : "hidden"}><span><kbd>A</kbd>–<kbd>H</kbd> mode</span><span><kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd> pillar</span>
      <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> without you, save</span><span><kbd>0</kbd> discard</span><span><kbd>⇧0</kbd> discard all routine</span><span><kbd>J</kbd><kbd>K</kbd> move</span>
      <span><kbd>T</kbd> edit title</span><span><kbd>E</kbd> edit summary</span><span><kbd>V</kbd> evidence</span><span><kbd>O</kbd> open evidence</span><span><kbd>P</kbd> project</span><span><kbd>L</kbd> goal</span><span><kbd>?</kbd> hide</span></div>`;
  $("#rv-queue [aria-current=true]")?.scrollIntoView({block:"nearest"});
}

// One segment per value. Yours is filled; Claude's pick has a dot.
function seg(field, k, label, key, d, t, color){
  const sug = t.claude[field] === k;
  return `<button data-${field}="${k}" aria-pressed="${d[field]===k}" class="${sug ? "sug" : ""}" style="${color ? `--c:${color}` : ""}" title="${label} (${key.toUpperCase()})${sug ? " · Claude's pick" : ""}">
    ${color ? `<i class="dot" style="background:${color}"></i>` : ""}${label}<kbd>${key.toUpperCase()}</kbd></button>`;
}

function set(field, v){ pick(data.threads[cur])[field] = v; render(); }
function go(i){ cur = Math.min(Math.max(i,0), data.threads.length-1); all = false; render(); }
// J/K step over threads the filter hides.
function step(dir){ for(let i = cur + dir; i >= 0 && i < data.threads.length; i += dir) if(shown(i)) return go(i); }
function toast(msg){ const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 1800); }
// When a week has nothing left, open the next week that does.
async function nextWeek(){
  const w = data.weeks.find(w => w !== data.week && data.pending[w] > 0);
  if(!w){ toast("All weeks done"); return render(); }
  toast(`${data.week} done · opening ${w}`); draft = {}; await load(w); render();
}
function after(){
  const next = data.threads.findIndex((x,i) => i > cur && !x.human.discard), any = data.threads.findIndex(x => !x.human.discard);
  if(next >= 0) go(next); else if(any >= 0) go(any); else if($("#rv-show").value === "pending") nextWeek(); else render();
}

async function decide(wm){
  const t = data.threads[cur], d = pick(t);
  d.title = $("#rv-title").value.trim() || d.title;
  d.summary = $("#rv-summary").value.trim();
  const labels = wm === "discard" ? {discard: "yes"} : {title: d.title, mode: d.mode, pillar: d.pillar, without_me: wm, discard: "no", ...(d.summary && {summary: d.summary})};
  const r = await post("/api/labels", {week: data.week, key: t.key, labels});
  if(!r.ok){ toast(`Not saved: ${await r.text()}`); return; }
  Object.assign(t.human, labels);
  toast(wm === "discard" ? "Discarded" : "Saved");
  after();
}

// One decision for every thread Claude marked routine and you have not decided.
async function discardAll(){
  const todo = data.threads.filter(routine);
  for(const t of todo){
    const r = await post("/api/labels", {week: data.week, key: t.key, labels:{discard:"yes"}});
    if(!r.ok){ toast(`Stopped: ${await r.text()}`); break; }
    t.human.discard = "yes";
  }
  toast(`Discarded ${todo.filter(t => t.human.discard === "yes").length}`);
  after();
}

// Project picker: existing projects first, then "create" for a new topic.
let gSel = 0, gRes = [];
function gRender(){
  const q = $("#gq").value.trim().toLowerCase();
  gRes = data.groups.filter(g => g.name.toLowerCase().includes(q));
  if(q && !data.groups.some(g => g.name.toLowerCase() === q)) gRes.push({create: $("#gq").value.trim()});
  gSel = Math.min(gSel, Math.max(gRes.length-1, 0));
  $("#gl-list").innerHTML = gRes.map((g,i) => `<li><button role="option" data-g="${i}" aria-selected="${i===gSel}">
    <span>${g.create ? `Create “${esc(g.create)}”` : esc(g.name)}</span><span class="k">${g.create ? "new topic" : g.kind === "topic" ? "topic" : "linear"}</span></button></li>`).join("")
    || `<li class="lbl" style="padding:8px 10px">No projects yet. Type a name to create a topic.</li>`;
}
function gOpen(){ $("#gpop").hidden = false; $("#gopen").setAttribute("aria-expanded","true"); $("#gq").value = ""; gSel = 0; gRender(); $("#gq").focus(); }
function gClose(){ $("#gpop").hidden = true; $("#gopen")?.setAttribute("aria-expanded","false"); }
// After a regroup the thread's key can change, so find it again by one of its events.
async function reloadAt(eventId){
  draft = {}; await load(data.week);
  const i = data.threads.findIndex(t => t.events.some(e => e.id === eventId));
  go(i >= 0 ? i : cur);
}
async function gChoose(i){
  const g = gRes[i]; if(!g) return;
  const t = data.threads[cur];
  const r = await post("/api/group", {week: data.week, key: t.key, ...(g.create ? {name: g.create} : {group_id: g.id})});
  if(!r.ok){ toast(`Not moved: ${await r.text()}`); return; }
  gClose(); await reloadAt(t.events[0].id); toast(g.create ? `Created ${g.create}` : `Moved to ${g.name}`);
}
async function linkGoal(id, on){
  const t = data.threads[cur];
  const r = await post("/api/goal-link", {goal_id: id, week: data.week, key: t.key, on});
  if(!r.ok){ toast(`Not linked: ${await r.text()}`); return; }
  t.goals.direct = on ? [...t.goals.direct, id] : t.goals.direct.filter(x => x !== id);
  render(); $(`#rv-goals [data-gl="${id}"]`)?.focus(); toast(on ? "Linked to the goal" : "Unlinked");
}
async function unassign(){
  const t = data.threads[cur];
  const r = await post("/api/unassign", {week: data.week, key: t.key});
  if(!r.ok){ toast(`Not undone: ${await r.text()}`); return; }
  await reloadAt(t.events[0].id); toast("Project removed");
}

$("#v-review").addEventListener("click", e => {
  const b = e.target.closest("button"); if(!b) return;
  if(b.dataset.i) go(+b.dataset.i);
  else if(b.dataset.mode) set("mode", b.dataset.mode);
  else if(b.dataset.pillar) set("pillar", b.dataset.pillar);
  else if(b.dataset.wm) decide(b.dataset.wm);
  else if(b.id === "unassign") unassign();
  else if(b.dataset.gl) linkGoal(+b.dataset.gl, b.getAttribute("aria-pressed") !== "true");
  else if(b.id === "discard-all") discardAll();
  else if(b.id === "all"){ all = !all; render(); }
  else if(b.id === "gopen") $("#gpop").hidden ? gOpen() : gClose();
  else if(b.dataset.g) gChoose(+b.dataset.g);
});
$("#v-review").addEventListener("input", e => {
  if(e.target.id === "gq"){ gSel = 0; gRender(); }
  else if(e.target.id === "rv-title" || e.target.id === "rv-summary") pick(data.threads[cur])[e.target.id.slice(3)] = e.target.value;
});
$("#rv-week").addEventListener("change", async e => { draft = {}; await load(e.target.value); render(); });
$("#rv-show").addEventListener("change", () => render());
document.addEventListener("keydown", e => {
  // Only while review is the open view and nothing sits on top of it.
  if(!data || $("#v-review").hidden || !$("#cmdk").hidden || !$("#sheet").hidden || !$("#story").hidden) return;
  if(e.target.id === "gq"){
    if(e.key === "Escape"){ e.preventDefault(); gClose(); }
    else if(e.key === "ArrowDown"){ e.preventDefault(); gSel = Math.min(gSel+1, gRes.length-1); gRender(); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); gSel = Math.max(gSel-1, 0); gRender(); }
    else if(e.key === "Enter"){ e.preventDefault(); gChoose(gSel); }
    return;
  }
  if(e.target.id === "rv-title" || e.target.id === "rv-summary"){ if(e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)){ e.preventDefault(); e.target.blur(); } return; }
  if(e.target.tagName === "SELECT" || e.metaKey || e.ctrlKey || e.altKey || !data.threads.length) return;
  const k = e.key.toLowerCase();
  if(MODE_KEYS.includes(k)) set("mode", Object.keys(MODES)[MODE_KEYS.indexOf(k)]);
  else if(PILLAR_KEYS.includes(k)) set("pillar", Object.keys(PILLAR)[PILLAR_KEYS.indexOf(k)]);
  else if(["1","2","3"].includes(k)) decide(WM[+k-1][0]);
  else if(e.code === "Digit0" && e.shiftKey) discardAll();
  else if(k === "0") decide("discard");
  else if(k === "j") step(1);
  else if(k === "k") step(-1);
  else if(k === "t"){ $("#rv-title").focus(); $("#rv-title").select(); }
  else if(k === "e"){ const s = $("#rv-summary"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  else if(k === "p") gOpen();
  else if(k === "l"){ const c = $("#rv-goals .gl-chip:not(:disabled)") ?? $("#rv-goals a"); c?.focus(); }
  else if(e.key === "?"){ keys = !keys; render(); }
  else if(k === "v"){ all = !all; render(); }
  else if(k === "o"){ const a = $(".r-events li.ev a") ?? $(".r-events a"); if(a) window.open(a.href, "_blank", "noopener"); }
  else return;
  e.preventDefault();
});
// Threads change when projects merge, so the next visit loads them again.
return {open, reset: () => { data = null; }};
})();

/* PROJECTS: every project across weeks. A thread opens in review, with a way back here. */
