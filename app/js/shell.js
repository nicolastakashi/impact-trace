/* REFS */
function renderRefs(k){
  if(!REFS[k]) k = "clarify";
  const tab = ([id, r]) => `<button data-refk="${id}" aria-pressed="${id === k}" style="--c:${MODES[id] ? mc(id) : "var(--ink-2)"}">${MODES[id] ? `<i class="dot" style="background:${mc(id)}"></i>` : ""}${esc(MODES[id] ? MODES[id][0].toUpperCase() + MODES[id].slice(1) : r.title)}<span class="n">${r.items.length}</span></button>`;
  const all = Object.entries(REFS), r = REFS[k];
  $("#refs").innerHTML = `<div class="ref-tabs" role="group" aria-label="Topics">
      <div><span class="lbl">Modes</span>${all.filter(([id]) => MODES[id]).map(tab).join("")}</div>
      <div><span class="lbl">How it is judged</span>${all.filter(([id]) => !MODES[id]).map(tab).join("")}</div></div>
    <article class="refc" style="--c:${MODES[k] ? mc(k) : "var(--ink-3)"}">
    <h3>${MODES[k]?`<i class="dot" style="background:${mc(k)};width:14px;height:14px"></i>`:""}${esc(r.title)}</h3>
    <div class="desc"><p>${esc(r.d)}</p><div><span class="lbl">Looks like</span>${r.ex.map(x => `<span>${esc(x)}</span>`).join("")}</div></div>
    <ul>${r.items.map(x=>`<li>${x.q ? `<q>${esc(x.q)}</q>` : `<p class="says">${esc(x.says)}</p>`}<a class="ref" href="${x.url}" target="_blank" rel="noopener">${esc(x.who)} ↗</a>${x.warn?`<span class="ref warn">⚠ ${esc(x.warn)}</span>`:""}</li>`).join("")}</ul></article>`;
}
$("#refs").addEventListener("click", e => { const b = e.target.closest("[data-refk]"); if(b) history.replaceState(null, "", `#/refs?k=${b.dataset.refk}`), renderRefs(b.dataset.refk); });

/* STORY (Wrapped) */
let sI = 0;
const ph = (a,b)=>ITEMS.filter(i=>i.w>=a&&i.w<=b);
const PHASE_BG = ["linear-gradient(160deg,#2a1406,#ff7a45)","linear-gradient(160deg,#ff7a45,#c8326a)","linear-gradient(160deg,#2a2406,#c9a400 70%,#ffe37a)","linear-gradient(160deg,#0d1a2a,#5b47d6 60%,#b3a1ff)","linear-gradient(160deg,#5b47d6,#ff4d52)"];
const SLIDES = [
  {bg:"linear-gradient(160deg,#16161d,#3a0d12 60%,#ff4d52)", html:()=>`<span class="k">${esc(PERIOD)}</span><span class="huge num">${WEEKS.length}</span><p class="h">weeks of work, with a trace</p>`},
  {bg:"linear-gradient(160deg,#2a0b1a,#ff4f8f)", html:()=>`<span class="k">In total</span><span class="huge num">${ITEMS.length}</span><p class="h">threads with evidence. ${REC.length} times people praised your work.</p>`},
  ...PHASES.map((p,n)=>({bg:PHASE_BG[n%PHASE_BG.length], html:()=>p.rec!=null
    ? `<span class="k">${esc(p.k)}</span><p class="q">“${esc(REC[p.rec].t)}”</p><span class="by">${esc(REC[p.rec].who)}${REC[p.rec].role?" · "+esc(REC[p.rec].role):""}</span>`
    : `<span class="k">${esc(p.k)}</span><p class="h">${esc(p.h)}</p><div class="rowx">${ph(p.from,p.to).map(i=>`<span class="pill">${esc(i.title)}</span>`).join("")}</div>`})),
  {bg:"linear-gradient(160deg,#08230f,#12854a 60%,#7dffa8)", html:()=>{ const m = cnt(ITEMS, modeOf), mx = Math.max(...Object.values(m));
    return `<span class="k">How you delivered</span><div class="bars2">${Object.keys(MODES).map(k=>`<div><span>${MODES[k]}</span><span class="t"><i style="width:${(m[k]||0)/mx*100}%"></i></span><span>${m[k]||0}</span></div>`).join("")}</div>`}},
  {bg:"linear-gradient(160deg,#16161d,#2c2c38)", html:()=>{ const d = ITEMS.filter(i=>i.wm).length;
    return `<span class="k">The open question</span><p class="h">Without you, which of these would have happened?</p><p class="by" style="font-size:15px">${d} of ${ITEMS.length} answered. Only you know the answer.</p><div class="rowx"><button class="pill" data-story-go="review" style="cursor:pointer;color:#fff">Open review →</button></div>`}},
];
function openStory(){ sI = 0; $("#story").hidden = false; drawStory(); }
function drawStory(){
  const s = SLIDES[sI];
  $("#story").innerHTML = `<div class="bg" style="background:${s.bg}"></div>
    <div class="bars">${SLIDES.map((_,i)=>`<i class="${i<sI?"done":""}"><b ${i===sI?'id="curbar"':""}></b></i>`).join("")}</div>
    <button class="close" id="story-x">close · esc</button>
    <button class="tap l" data-step="-1" aria-label="previous"></button><button class="tap r" data-step="1" aria-label="next"></button>
    <div class="slide" id="slide">${s.html()}</div>
    <div class="hint">← → or tap the sides · ${sI+1}/${SLIDES.length}</div>`;
  const bar = $("#curbar");
  if(G){
    G.from("#slide > *",{y:30,opacity:0,duration:.6,stagger:.08,ease:"power3.out",clearProps:"all"});
    G.from("#slide .bars2 i",{width:0,duration:1,stagger:.08,ease:"power3.out",delay:.2});
    const h = $("#slide .huge"); if(h){ const end=+h.textContent,o={v:0}; G.to(o,{v:end,duration:1.2,ease:"power3.out",onUpdate:()=>h.textContent=Math.round(o.v)}); }
    G.to(bar,{width:"100%",duration:.9,ease:"power1.out"});
  } else bar.style.width="100%";
}
function step(d){ sI = Math.max(0, Math.min(SLIDES.length-1, sI+d)); drawStory(); }

/* CMDK */
let cmdSel = 0, cmdRes = [];
const VIEWS = [["home","North"],["goals","Goals"],["projects","Projects"],["project","Project"],["trace","Trace"],["feedback","Feedback"],["review","Review"],["refs","References"],["setup","Setup"]];
function openCmd(){ $("#cmdk").hidden = false; $("#cmdk-input").value=""; filterCmd(); $("#cmdk-input").focus(); }
function filterCmd(){
  const q = $("#cmdk-input").value.toLowerCase();
  cmdRes = [...VIEWS.map(([v,l])=>({t:"view", label:"Go to "+l, v})), {t:"recap", label:"Open recap (Wrapped)", story:1},
    ...ITEMS.map(i=>({t:WEEKS[i.w], label:i.title, item:i.id, m:modeOf(i), hay:(i.title+" "+PROJECTS[i.s].name+" "+(i.quote?.who||"")+" "+(i.rec!=null?REC[i.rec].who:"")).toLowerCase()}))]
    .filter(r=>!q || (r.hay||r.label.toLowerCase()).includes(q)).slice(0,12);
  cmdSel = 0; drawCmd();
}
function drawCmd(){
  $("#cmdk-list").innerHTML = cmdRes.map((r,i)=>`<li><button role="option" data-cmd="${i}" aria-selected="${i===cmdSel}"><i class="dot" style="background:${r.m?mc(r.m):"var(--line-2)"}"></i><span>${esc(r.label)}</span><span class="k">${esc(r.t)}</span></button></li>`).join("") || `<li style="padding:14px;color:var(--ink-3)">Nothing found. Try a person or a stream name.</li>`;
}
function runCmd(i){ const r = cmdRes[i]; if(!r) return; $("#cmdk").hidden = true; if(r.v) show(r.v); else if(r.story) openStory(); else openItem(r.item); }

/* NAV: one page, the address says which view. #/review?week=…&key=… opens one thread. */
function display(v){
  // A project page sits under the Projects tab.
  document.querySelectorAll("nav button").forEach(b=>b.setAttribute("aria-selected", b.dataset.v===(v==="project"?"projects":v)));
  document.querySelectorAll("section.view").forEach(s=>s.hidden = s.id!=="v-"+v);
  $("#setup-btn").setAttribute("aria-current", v === "setup" ? "page" : "false");
  $("#sheet").hidden = true; window.scrollTo(0,0);
  if(v==="home") renderHome();
  const els = document.querySelectorAll(`#v-${v} .panel, #v-${v} .refc, #v-${v} .pcard`);
  if(G && els.length) G.fromTo(els,{y:12,opacity:0},{y:0,opacity:1,duration:.4,stagger:.04,clearProps:"all"});
}
function route(){
  const [path, qs] = location.hash.replace(/^#\/?/, "").split("?");
  const v = VIEWS.some(([k]) => k === path) ? path : "home", p = new URLSearchParams(qs);
  display(v);
  if(v === "review") RV.open(p.get("week"), p.get("key"), p.get("from"));
  if(v === "projects") p.get("p") ? (history.replaceState(null, "", `#/project?id=${encodeURIComponent(p.get("p"))}`), route()) : GV.open();
  if(v === "project") PV.open(p.get("id"));
  if(v === "goals") GO.open(p.get("id"));
  if(v === "refs") renderRefs(p.get("k"));
  if(v === "setup") SU.open();
  if(v === "feedback"){ fbW = Math.max(0, FB.findIndex(f => wk(f.week) === p.get("w"))); fbP = +p.get("p") || 0; renderFeedback(); }
  if(v === "trace"){ sel = new Set((p.get("w") ?? "").split(",").map(w => WEEKS.indexOf(w)).filter(i => i >= 0)); spanSel = p.get("s"); renderTrace(); }
}
function show(v){ if(location.hash.split("?")[0] !== "#/"+v) history.pushState(null, "", "#/"+v); route(); }
addEventListener("hashchange", route);
function renderAll(){ renderTrace(); }

document.addEventListener("click", e=>{
  const t = e.target.closest("button,a,[data-wk]"); if(!t || t.closest("#v-review, #v-projects, #v-project, #v-goals")) return;
  const d = t.dataset;
  if(d.storyGo){ $("#story").hidden = true; show(d.storyGo); return; }
  if(d.step){ step(+d.step); return; }
  if(t.id==="story-x"){ $("#story").hidden = true; return; }
  if(t.id==="t-recap"){ openStory(); return; }
  if(t.id==="cmdk-open"){ openCmd(); return; }
  if(d.cmd){ runCmd(+d.cmd); return; }
  if(d.v){ e.preventDefault(); show(d.v); return; }
  if(d.ref){ e.preventDefault(); location.hash = `#/refs?k=${d.ref}`; return; }
  if(d.goal){ location.hash = `#/trace?w=${[...new Set(ITEMS.filter(i=>d.goal==="none" ? !goalsOf(i).length : goalsOf(i).includes(d.goal)).map(i=>i.w))].sort((a,b)=>a-b).map(w=>WEEKS[w]).join(",")}`; return; }
  if(d.item){ openItem(d.item); return; }
  if(t.id==="x"){ $("#sheet").hidden = true; return; }
  if(d.reci != null){ recI = +d.reci; recOpen = true; renderRec(); return; }
  if(d.notrec){ const i = REC.findIndex(r => r.id === d.notrec);
    setMention(d.notrec, "info").then(ok => { if(!ok || i < 0) return; recUndo = {...REC[i], at:i}; REC.splice(i, 1); recI = Math.min(recI, REC.length-1); renderRec(); }); return; }
  if(d.recundo != null && recUndo){ const u = recUndo;
    setMention(u.id, null).then(ok => { if(!ok) return; REC.splice(u.at, 0, u); recI = u.at; recUndo = null; renderRec(); }); return; }
});
$("#sheet").addEventListener("click", e=>{ if(e.target.id==="sheet") $("#sheet").hidden = true; });
$("#cmdk").addEventListener("click", e=>{ if(e.target.id==="cmdk") $("#cmdk").hidden = true; });
$("#cmdk-input").addEventListener("input", filterCmd);

document.addEventListener("keydown", e=>{
  if((e.metaKey||e.ctrlKey) && e.key.toLowerCase()==="k"){ e.preventDefault(); $("#cmdk").hidden ? openCmd() : ($("#cmdk").hidden = true); return; }
  if(!$("#cmdk").hidden){
    if(e.key==="Escape") $("#cmdk").hidden = true;
    else if(e.key==="ArrowDown"){ e.preventDefault(); cmdSel = Math.min(cmdSel+1, cmdRes.length-1); drawCmd(); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); cmdSel = Math.max(cmdSel-1, 0); drawCmd(); }
    else if(e.key==="Enter") runCmd(cmdSel);
    return;
  }
  if(!$("#story").hidden){ if(e.key==="ArrowRight"||e.key===" ") { e.preventDefault(); step(1); } else if(e.key==="ArrowLeft") step(-1); else if(e.key==="Escape") $("#story").hidden = true; return; }
  if(e.key==="Escape" && $("#sheet").hidden && spanSel && !$("#v-trace").hidden){ pickSpan(spanSel); return; }
  if(e.key==="Escape"){ $("#sheet").hidden = true; return; }
});
