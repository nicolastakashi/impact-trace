const GV = (() => {
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let data = null, linear = new Map(), filter = "all", ask = null;
async function open(){
  // Always fresh: decisions made in review change the counts here.
  const [g1, l1] = await Promise.all([fetch("/api/groups").then(r => r.json()), fetch("/api/projects?weeks=").then(r => r.ok ? r.json() : {projects: []}).catch(() => ({projects: []}))]);
  data = g1; linear = new Map(l1.projects.map(x => [x.id, x])); ask = null;
  render();
}
function render(){
  const gs = data.groups.filter(g => filter === "all" || g.kind === filter)
    .map(g => ({...g, total: Object.values(g.weeks).reduce((a, ts) => a + ts.length, 0)}))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const max = Math.max(1, ...gs.flatMap(g => Object.values(g.weeks).map(ts => ts.length)));
  $("#grp-list").innerHTML = gs.map(g => { const todo = Object.values(g.weeks).flat().filter(t => !t.decided).length;
    return `<div class="grp"><a class="grp-a" href="#/project?id=${encodeURIComponent(g.id)}" aria-label="${esc(g.name)}">
    <span class="gh"><h2>${esc(g.name)}</h2>${todo ? `<span class="todo">${todo} to review</span>` : ""}<span class="chev">→</span></span>
    ${sourceLine(g, linear.get(g.id))}
    ${strip(data.weeks, w => (g.weeks[w] ?? []).length, max)}</a>
    <div class="grp-act">${actions(g, gs)}</div></div>`; }).join("")
    || `<div class="empty">No projects yet. In review, press P on a thread to pick one or create a topic.</div>`;
  $("#grp-deleted").innerHTML = data.deleted.length ? `<details><summary class="lbl">Deleted · ${data.deleted.length}</summary><ul>${data.deleted.map(p =>
    `<li><i class="src ${p.kind}"></i>${esc(p.name)}<button class="undo" data-restore="${esc(p.id)}">restore</button></li>`).join("")}</ul></details>` : "";
}
// Merge and delete from the list. Each asks once, inline, and names what will happen.
function actions(g, gs){
  if(ask?.id === g.id && ask.into){ const to = gs.find(x => x.id === ask.into) ?? data.groups.find(x => x.id === ask.into);
    return `Merge ${esc(g.name)} into ${esc(to.name)}? Its ${g.total} thread${g.total === 1 ? "" : "s"} move there. You can split it out again.
      <span class="end"><button class="undo" data-go="merge">merge</button> <button class="undo" data-go="no">cancel</button></span>`; }
  if(ask?.id === g.id) return `Delete ${esc(g.name)}? ${g.total} thread${g.total === 1 ? "" : "s"} will have no project${g.merged?.length ? ", and the merged projects stand alone again" : ""}. You can restore it below.
      <span class="end"><button class="undo del" data-go="delete">delete</button> <button class="undo" data-go="no">cancel</button></span>`;
  return `<select data-into="${esc(g.id)}" aria-label="Merge ${esc(g.name)} into another project"><option value="">merge into…</option>${data.groups.filter(x => x.id !== g.id).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select>
    <button class="undo del end" data-del="${esc(g.id)}">delete</button>`;
}
async function go(url, body){
  const r = await fetch(url, {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body)});
  if(!r.ok){ toast(await r.text()); return; }
  RV.reset(); toast(url === "/api/merge" ? "Merged" : "Deleted"); await open();
}
function toast(msg){ const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 1800); }
$("#v-projects").addEventListener("change", e => {
  const s = e.target.closest("[data-into]"); if(!s || !s.value) return;
  ask = {id: s.dataset.into, into: s.value}; render(); });
$("#v-projects").addEventListener("click", async e => {
  const del = e.target.closest("[data-del]"), g = e.target.closest("[data-go]");
  if(del){ ask = {id: del.dataset.del}; render(); return; }
  if(g){ const a = ask; ask = null;
    if(g.dataset.go === "merge") await go("/api/merge", {from: a.id, into: a.into});
    else if(g.dataset.go === "delete") await go("/api/delete", {id: a.id});
    else render();
    return; }
  const rs = e.target.closest("[data-restore]");
  if(rs){ const r = await fetch("/api/restore", {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({id: rs.dataset.restore})});
    if(r.ok){ RV.reset(); await open(); } return; }
  const b = e.target.closest("[data-f]"); if(!b) return;
  filter = b.dataset.f; document.querySelectorAll("#v-projects [data-f]").forEach(x => x.setAttribute("aria-pressed", x === b)); render(); });
return {open};
})();

// Shared by the list and the project page.
const escP = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function strip(weeks, count, max){
  return `<div class="strip" style="--n:${weeks.length}">${weeks.map(w => { const c = count(w);
    return `<i class="${c ? "on" : ""}" style="--v:${c / max}" title="${w}: ${c}">${c || ""}</i>`; }).join("")}${weeks.map(w => `<span>${w.slice(5)}</span>`).join("")}</div>`;
}
function sourceLine(g, L){
  const merged = g.merged?.length ? ` · includes ${g.merged.map(m => escP(m.name)).join(", ")}` : "";
  if(g.kind === "topic" || !L) return `<span class="facts"><i class="src topic"></i>topic${merged}</span>`;
  return `<span class="facts"><i class="src linear"></i>Linear${L.status ? ` · ${escP(L.status)}` : ""}${L.open ? ` · ${L.open} open` : ""}${merged}</span>`;
}

/* PROJECT: one project, all of it. Sources on top; every thread opens to its events. */
const PV = (() => {
const esc = escP;
const KIND = {pr_merged:"PR merged", pr_open:"PR open", issue_completed:"issue done", issue_open:"issue open",
  review_comment:"review received", reviews_given:"reviews given", slack_message:"Slack", slack_mention:"mention",
  meeting:"meeting", doc_created:"doc created", doc_edited:"doc edited"};
const post = (url, body) => fetch(url, {method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify(body)});
function toast(msg){ const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 1800); }
let d = null, id = null, all = [], openT = new Set(), showGone = false, merging = false, deleting = false;

async function open(pid){
  if(pid !== id){ openT = new Set(); showGone = false; merging = false; deleting = false; }
  id = pid;
  const r = await fetch(`/api/project?id=${encodeURIComponent(pid)}`);
  if(!r.ok){ $("#pv").innerHTML = `<div class="empty">This project does not exist. <a href="#/projects">Back to projects</a></div>`; return; }
  const j = await r.json();
  // A merged project lives inside another one now: go there.
  if(j.into){ history.replaceState(null, "", `#/project?id=${encodeURIComponent(j.into)}`); return open(j.into); }
  d = j;
  all = (await (await fetch("/api/groups")).json()).groups;
  render();
}

function render(){
  const p = d.project, many = d.sources.length > 1;
  const src = new Map(d.sources.map(s => [s.id, s]));
  const live = d.threads.filter(t => !t.discarded), gone = d.threads.length - live.length;
  const ts = showGone ? d.threads : live, todo = live.filter(t => !t.decided).length;
  const max = Math.max(1, ...d.weeks.map(w => live.filter(t => t.week === w).length));
  const others = all.filter(g => g.id !== p.id);
  if(d.deleted){ $("#pv").innerHTML = `<a class="crumb" href="#/projects">← Projects</a>
    <div class="vhead"><h1>${esc(p.name)}</h1></div>
    <div class="banner">You deleted this project, so its threads have no project. <button class="undo" id="pv-restore">restore</button></div>`; return; }
  const n = live.length;
  $("#pv").innerHTML = `
    <a class="crumb" href="#/projects">← Projects</a>
    <div class="vhead"><h1>${esc(p.name)}</h1>${todo ? `<a class="todo big" href="#/review?week=${live.find(t => !t.decided).week}&key=${encodeURIComponent(live.find(t => !t.decided).key)}&from=${encodeURIComponent(p.id)}">${todo} to review →</a>` : `<span class="lbl">all reviewed ✓</span>`}</div>
    <div class="pv-top">
      <div class="r-sec"><span class="lbl">Sources</span>
        <ul class="sources">${d.sources.map((s, i) => `<li><i class="src ${s.kind}"></i><span>${esc(s.name)}</span><span class="lbl">${s.kind === "topic" ? "topic" : "Linear"}</span>
          ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener" aria-label="Open in Linear">↗</a>` : ""}
          ${i ? `<button class="undo" data-split="${esc(s.id)}">split out</button>` : ""}</li>`).join("")}
          <li>${merging ? `<select id="pv-pick" aria-label="Project to merge in"><option value="">Pick a project to merge in…</option>${others.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select><button class="undo" id="pv-merge" hidden></button><button class="undo" id="pv-cancel">cancel</button>`
            : others.length ? `<button class="undo" id="pv-add">＋ merge another project in</button>` : ""}</li></ul>
        ${deleting ? `<div class="banner danger">Delete ${esc(p.name)}? ${n} thread${n === 1 ? "" : "s"} will have no project${many ? ", and the merged projects stand alone again" : ""}. You can restore it from the list.
            <span><button class="undo del" id="pv-del-yes">delete</button><button class="undo" id="pv-del-no">cancel</button></span></div>`
          : `<button class="undo del" id="pv-del">delete project</button>`}</div>
      <div class="r-sec"><div class="pv-goals" role="group" aria-label="Goals this project serves"><span class="lbl">Serves</span>${d.goals.length
          ? d.goals.map(g => `<button class="gl-chip" data-pg="${g.id}" aria-pressed="${!!g.on_}">${esc(g.title)}</button>`).join("")
          : `<a class="crumb" href="#/goals">no goals yet · add one →</a>`}</div>
        ${p.status || d.open || p.lead ? `<span class="facts">${[p.status, d.open ? `${d.open} open issues` : "", p.lead ? `lead ${esc(p.lead)}` : ""].filter(Boolean).join(" · ")}</span>` : ""}
        ${d.ms.map(m => `<div class="msr"><span>${esc(m.name)}</span><span class="tr"><i style="width:${m.progress||0}%"></i></span><b>${m.progress==null?"—":m.progress+"%"}</b></div>`).join("")}</div>
    </div>
    ${strip(d.weeks, w => live.filter(t => t.week === w).length, max)}
    <div class="pv-weeks">${d.weeks.filter(w => ts.some(t => t.week === w)).map(w => `<div class="pv-wk"><span class="lbl">${w.slice(5)}</span><ul>${ts.filter(t => t.week === w).map(t => {
      const o = openT.has(t.key);
      return `<li class="pv-t ${t.discarded ? "gone" : ""}"><button class="pv-th" data-t="${esc(t.key)}" aria-expanded="${o}"><span class="chev">${o ? "▾" : "▸"}</span><b>${esc(t.title ?? "Untitled")}</b><span class="n">${t.events.length}</span>
        ${t.discarded ? `<span class="lbl">discarded</span>` : t.decided ? `<span class="ok" title="You decided this">✓</span>` : `<span class="todo">to review</span>`}</button>
        ${o ? `<ul class="pv-ev">${t.events.map(e => { const s = src.get(e.source);
          return `<li><span class="k">${KIND[e.kind] ?? e.kind}</span><span class="x">${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title ?? e.id)} ↗</a>` : esc(e.title ?? e.id)}</span>${many && s ? `<span class="from"><i class="src ${s.kind}"></i>${esc(s.name)}</span>` : "<span></span>"}</li>`; }).join("")}</ul>
          <div class="pv-act"><a class="undo" href="#/review?week=${t.week}&key=${encodeURIComponent(t.key)}&from=${encodeURIComponent(p.id)}">open in review →</a>
            <select data-move="${esc(t.key)}" data-week="${t.week}" aria-label="Move this thread"><option value="">Move to another project…</option>${others.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("")}</select></div>` : ""}</li>`; }).join("")}</ul></div>`).join("")
      || `<span class="lbl">No threads yet. Pick this project for a thread in review with P.</span>`}</div>
    ${gone ? `<button class="undo" id="pv-gone">${showGone ? "hide" : "show"} ${gone} discarded</button>` : ""}`;
}

async function act(url, body, done, next = id){
  const r = await post(url, body);
  if(!r.ok){ toast(await r.text()); return; }
  RV.reset(); toast(done); merging = false; await open(next);
}
$("#v-project").addEventListener("click", e => {
  const b = e.target.closest("button"); if(!b) return;
  if(b.dataset.t){ openT.has(b.dataset.t) ? openT.delete(b.dataset.t) : openT.add(b.dataset.t); render(); }
  else if(b.dataset.split) act("/api/unmerge", {from: b.dataset.split}, "Split out again");
  else if(b.id === "pv-add"){ merging = true; render(); $("#pv-pick").focus(); }
  else if(b.id === "pv-cancel"){ merging = false; render(); }
  else if(b.id === "pv-merge") act("/api/merge", {from: b.dataset.from, into: id}, `Merged ${b.dataset.name}`);
  else if(b.id === "pv-gone"){ showGone = !showGone; render(); }
  else if(b.dataset.pg){ const on = b.getAttribute("aria-pressed") !== "true";
    act("/api/goal-link", {goal_id: +b.dataset.pg, project_id: id, on}, on ? `Serves ${b.textContent}` : `No longer serves ${b.textContent}`); }
  else if(b.id === "pv-del"){ deleting = true; render(); }
  else if(b.id === "pv-del-no"){ deleting = false; render(); }
  else if(b.id === "pv-del-yes") post("/api/delete", {id}).then(async r => {
    if(!r.ok) return toast(await r.text());
    RV.reset(); toast(`Deleted ${d.project.name}`); location.hash = "#/projects"; });
  else if(b.id === "pv-restore") act("/api/restore", {id}, "Restored");
});
$("#v-project").addEventListener("change", e => {
  if(e.target.id === "pv-pick"){
    // The button names exactly what will happen; pressing it is the confirmation.
    const btn = $("#pv-merge"), name = e.target.selectedOptions[0].textContent;
    btn.hidden = !e.target.value; btn.dataset.from = e.target.value; btn.dataset.name = name; btn.textContent = `merge ${name} in`;
  }
  const mv = e.target.closest("[data-move]");
  if(mv && mv.value){ const name = mv.selectedOptions[0].textContent;
    act("/api/group", {week: mv.dataset.week, key: mv.dataset.move, group_id: mv.value}, `Moved to ${name}`); }
});
return {open};
})();

/* GOALS: what your work serves. You write them; projects and single threads link to them. */
