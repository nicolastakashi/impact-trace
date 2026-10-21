const DAY = 864e5, DOW = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const EVK = {pr_merged:"PR merged", pr_open:"PR opened", issue_completed:"issue done", issue_open:"issue open", review_comment:"review received",
  reviews_given:"reviews given", slack_message:"Slack", slack_mention:"mention", meeting:"meeting", doc_created:"doc created", doc_edited:"doc edited"};
// Heatmap rows, longest on top like a duration axis: label and lower bound in hours.
const BUCKETS = [["3d +", 72], ["1–3 d", 24], ["< 1 d", .25], ["instant", 0]];
// WEEKS carry no year; the 8 weeks cross a new year at most once.
const yearOf = w => +PERIOD.slice(0,4) + (+WEEKS[w].slice(1) < +WEEKS[0].slice(1));
const monday = w => { const y = yearOf(w), j = new Date(y, 0, 4); return new Date(y, 0, 4 - (j.getDay()+6)%7 + (+WEEKS[w].slice(1)-1)*7).getTime(); };
const fmtDay = t => new Date(t).toLocaleDateString("en", {month:"short", day:"numeric"});
const fmtWhen = t => { const d = new Date(t); return `${DOW[(d.getDay()+6)%7]} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };
const fmtDur = i => { const h = i.hrs; if(h == null) return "no time"; if(h < 1/60) return "instant"; if(h < 1) return `${Math.round(h*60)}m`;
  return h < 24 ? `${Math.floor(h)}h ${Math.round(h%1*60)}m` : `${Math.floor(h/24)}d ${Math.round(h%24)}h`; };
for(const it of ITEMS){
  it.ev ??= [];
  const ts = it.ev.filter(e=>e[1]).map(e=>Date.parse(e[1]));
  it.t0 = ts.length ? Math.min(...ts) : null; it.t1 = ts.length ? Math.max(...ts) : null;
  it.hrs = ts.length ? (it.t1 - it.t0)/36e5 : null;
  it.day = ts.length ? Math.min(6, Math.max(0, Math.floor((it.t0 - monday(it.w))/DAY))) : 0;
  it.b = it.hrs == null ? 3 : BUCKETS.findIndex(([,lo]) => it.hrs >= lo);
}
let tf = {mode:null, crit:false}, spanSel = null, openRoots = new Set(), selKey = "", heatShown = false, brush = null;
const passes = i => (!tf.mode || i.mode === tf.mode) && (!tf.crit || i.wm === "wouldnt");
const pctOf = (xs, f) => xs.length ? xs.filter(f).length / xs.length : 0;
const selLabel = ws => ws.length > 1 && ws.at(-1)-ws[0] === ws.length-1 ? `${WEEKS[ws[0]]}–${WEEKS[ws.at(-1)]}` : ws.map(i=>WEEKS[i]).join(", ");
const posIn = w => t => Math.min(100, Math.max(0, (t - monday(w)) / (7*DAY) * 100));

function renderTrace(){
  if(!ITEMS.length){ $("#tr-lead").textContent = "No threads kept yet. Keep one in Review and it shows here."; return; }
  if(!sel.size) sel.add(LAST);
  const ws = [...sel].sort((a,b)=>a-b), key = ws.join(), vis = !$("#v-trace").hidden;
  // A new selection opens its newest week; two weeks or fewer open all.
  if(key !== selKey){ selKey = key; openRoots = new Set(ws.length <= 2 ? ws : [ws.at(-1)]);
    const sw = ITEMS.find(i=>i.id===spanSel)?.w; sel.has(sw) ? openRoots.add(sw) : spanSel = null; }
  if(vis) traceUrl();
  const by = cnt(ITEMS, modeOf), top = Object.keys(by).sort((a,b)=>by[b]-by[a])[0], crit = ITEMS.filter(i=>i.wm==="wouldnt").length;
  $("#tr-lead").innerHTML = `${ITEMS.length} threads you kept, drawn as spans. Most are <b>${MODES[top]}</b> (${Math.round(by[top]/ITEMS.length*100)}%). <b>${crit}</b> are on your critical path: without you, they would not happen.`;
  drawSvc(); drawHeat(); drawWaterfall(); drawSide();
  if(vis){ if(!heatShown){ heatShown = true; animHeat(); } play(); }
}

function drawSvc(){
  const by = cnt(ITEMS, modeOf), crit = ITEMS.filter(i=>i.wm==="wouldnt").length;
  $("#svc").classList.toggle("f", !!tf.mode);
  $("#svc").innerHTML = Object.keys(MODES).filter(m=>by[m]).sort((a,b)=>by[b]-by[a]).map(m=>
    `<button data-mf="${m}" aria-pressed="${tf.mode===m}" style="--c:${mc(m)}"><i class="sw"></i>${MODES[m]}<b>${by[m]}</b></button>`).join("")
    + `<span class="svc-sep" aria-hidden="true"></span><button data-crit aria-pressed="${tf.crit}" title="Spans where, without you, it would not happen"><i class="sw crit"></i>critical path<b>${crit}</b></button>`;
}

function drawHeat(){
  const xs = ITEMS.filter(passes), N = WEEKS.length, c = {};
  xs.forEach(i => { const k = `${i.w*7+i.day}:${i.b}`; c[k] = (c[k]||0)+1; });
  const max = Math.max(1, ...Object.values(c)), col = tf.mode ? mc(tf.mode) : "var(--accent)";
  let h = [...sel].map(w=>`<i class="hm-band" style="grid-column:${2+w*7} / span 7"></i>`).join("");
  BUCKETS.forEach(([lab], b) => {
    h += `<span class="hm-y" style="grid-row:${b+1}">${lab}</span>`;
    for(let d = 0; d < N*7; d++){ const n = c[`${d}:${b}`] || 0, w = Math.floor(d/7);
      h += `<i class="hm-c${d%7>4?" we":""}${sel.has(w)?" in":""}" data-w="${w}" data-d="${d}" data-b="${b}" style="grid-column:${d+2};grid-row:${b+1}${n?`;--v:${Math.round(45+55*n/max)}%;--c:${col}`:""}"${n?` data-n="${n}" title="${n} span${n>1?"s":""} · ${WEEKS[w]} ${DOW[d%7]} · ${lab}"`:""}></i>`; }
  });
  h += WEEKS.map((wk,w)=>`<button class="hm-x${sel.has(w)?" in":""}" data-w="${w}" style="grid-column:${2+w*7} / span 7">${wk}<small>${fmtDay(monday(w))}</small></button>`).join("");
  $("#hm").style.setProperty("--n", N*7); $("#hm").innerHTML = h;
  $("#hm-scale").innerHTML = `1<i style="--c:${col}"></i>${max} span${max>1?"s":""} per day`;
  const ws = [...sel].sort((a,b)=>a-b);
  $("#selinfo").innerHTML = `<b>${selLabel(ws)}</b> · ${xs.filter(i=>sel.has(i.w)).length} spans<small>drag across weeks to compare · shift-click adds a week</small>`;
}
function animHeat(){
  if(!G) return;
  // Time sweeps left to right: each column lands a beat after the one before.
  G.from("#hm .hm-c[data-n]", {opacity:0, scale:.3, duration:.5, ease:"expo.out", stagger:(i, el)=>+el.dataset.d*.012, clearProps:"opacity,transform"});
}

function drawWaterfall(){
  const ws = [...sel].sort((a,b)=>b-a), shown = ITEMS.filter(i=>sel.has(i.w) && passes(i));
  $("#wf-head").innerHTML = `<div><span class="lbl">Trace view</span><h2>${ws.length === 1 ? WEEKS[ws[0]] : selLabel([...ws].reverse())}<small>${shown.length} span${shown.length===1?"":"s"} · ${ws.length} trace${ws.length===1?"":"s"}</small></h2></div>
    <div class="wf-ctl">${ws.length > 1 ? `<button id="wf-all">${openRoots.size === ws.length ? "collapse all" : "expand all"}</button>` : ""}<button id="wf-replay" title="Play the week again">▶ replay</button></div>`;
  $("#wf-axis").innerHTML = `<span class="lbl">Span</span><div class="wt">${DOW.map((d,k)=>`<span style="left:${k/7*100}%">${d}</span>`).join("")}</div>`;
  $("#wf").innerHTML = ws.map(w => {
    const pos = posIn(w), m0 = monday(w), on = ITEMS.filter(i=>i.w===w && passes(i)).sort((a,b)=>(a.t0??0)-(b.t0??0)), open = openRoots.has(w);
    const t = on.filter(i=>i.t0!=null), a = t.length ? pos(Math.min(...t.map(i=>i.t0))) : 0, b = t.length ? pos(Math.max(...t.map(i=>i.t1))) : 0;
    return `<div class="wr root"><button class="wn" data-root="${w}" aria-expanded="${open}"><span class="chev">${open?"▾":"▸"}</span>${WEEKS[w]}<span class="wd">${fmtDay(m0)} – ${fmtDay(m0+6*DAY)}</span><span class="du">${on.length} spans</span></button>
      <div class="wt">${t.length ? `<span class="rbar" style="left:${a}%;width:${b-a}%"></span>` : ""}${t.map(i=>`<i class="rtick" style="left:${pos(i.t0)}%;--c:${mc(i.mode)}"></i>`).join("")}</div></div>`
      + (!open ? "" : on.map(i => spanRow(i, pos)).join("") || `<div class="wr none">No spans in ${WEEKS[w]} match the filter.</div>`);
  }).join("");
}
function spanRow(i, pos){
  const L = i.t0 == null ? 0 : pos(i.t0), W = i.t0 == null ? 100 : pos(i.t1) - L;
  // An instant span is its one event: no ticks inside.
  const ticks = W < .4 ? "" : i.ev.filter(e=>e[1]).map(e=>`<i class="evt" style="left:${(pos(Date.parse(e[1]))-L)/W*100}%"></i>`).join("");
  return `<div class="wr sp${spanSel===i.id?" on":""}" data-span="${esc(i.id)}" style="--c:${mc(i.mode)}"><button class="wn" data-span="${esc(i.id)}" aria-pressed="${spanSel===i.id}"><i class="sw"></i><span class="nm">${esc(i.title)}</span><span class="du">${fmtDur(i)}</span></button>
    <div class="wt"><span class="bar${i.wm==="wouldnt"?" crit":""}${i.t0==null?" ghost":""}" style="left:${L}%;width:${W}%" title="${esc(i.title)} · ${fmtDur(i)} · ${i.ev.length} events">${ticks}</span></div></div>`;
}
function markSpan(){
  document.querySelectorAll("#wf .wr.sp").forEach(r=>{ const on = r.dataset.span === spanSel; r.classList.toggle("on", on); r.querySelector(".wn").setAttribute("aria-pressed", on); });
}
function play(){
  if(!G) return;
  // A replay during a replay would start from half-drawn bars: finish the old one first.
  play.tl?.progress(1).kill();
  const W = $(".wf-phl").clientWidth, D = 1.4, tl = play.tl = G.timeline();
  if(!W) return;
  // The playhead sweeps Monday to Sunday; each span grows from its start as the playhead reaches it.
  tl.from("#wf .wn", {opacity:0, x:-8, duration:.35, ease:"power3.out", stagger:.02, clearProps:"opacity,transform"}, 0);
  tl.fromTo("#wf-ph", {x:0, opacity:1}, {x:W, duration:D, ease:"none"}, 0).to("#wf-ph", {opacity:0, duration:.3});
  document.querySelectorAll("#wf .bar, #wf .rtick").forEach(b => tl.from(b, {scaleX:b.classList.contains("bar")?0:1, opacity:0, duration:.5, ease:"expo.out", clearProps:"opacity,transform"}, parseFloat(b.style.left)/100*D));
}

function drawSide(){
  const i = spanSel && ITEMS.find(x=>x.id===spanSel), sb = $("#sb");
  if(!i){
    const ws = [...sel].sort((a,b)=>a-b), xs = ITEMS.filter(x=>sel.has(x.w) && passes(x)), rest = ITEMS.filter(x=>!sel.has(x.w) && passes(x));
    const by = cnt(xs, modeOf), order = Object.keys(MODES).filter(m=>by[m]).sort((a,b)=>by[b]-by[a]);
    const long = xs.filter(x=>x.hrs!=null).sort((a,b)=>b.hrs-a.hrs)[0], crit = xs.filter(x=>x.wm==="wouldnt");
    sb.innerHTML = `<span class="lbl">Trace summary</span>
      <div class="sb-big"><b>${xs.length}</b><span>span${xs.length===1?"":"s"} in ${selLabel(ws)}</span></div>
      ${xs.length ? `<div class="mixbar" aria-hidden="true">${order.map(m=>`<i style="flex:${by[m]};--c:${mc(m)}" title="${MODES[m]}: ${by[m]}"></i>`).join("")}</div>
      <ul class="sb-modes">${order.map(m=>{ const d = rest.length ? Math.round((pctOf(xs,x=>x.mode===m) - pctOf(rest,x=>x.mode===m))*100) : 0;
        return `<li><i class="sw" style="--c:${mc(m)}"></i><span>${MODES[m]}</span><b>${by[m]}</b><small>${d ? `${d>0?"+":"−"}${Math.abs(d)} pp` : ""}</small></li>`; }).join("")}</ul>
      ${rest.length ? `<p class="sb-note">pp: how much bigger or smaller the share of each mode is than in the other weeks.</p>` : ""}
      <div class="sb-kv"><span>critical path</span><b>${crit.length} of ${xs.length}</b></div>
      ${long ? `<div class="sb-kv"><span>longest</span><button data-span="${esc(long.id)}">${esc(long.title)} · ${fmtDur(long)}</button></div>` : ""}
      <p class="sb-note">Click a span to see its events.</p>` : `<p class="sb-note">No spans match the filter.</p>`}`;
  } else {
    const pr = PROJECTS[i.s];
    const pct = Math.round(pctOf(ITEMS, x => (x.hrs ?? 0) < (i.hrs ?? 0))*100);
    const timed = i.ev.filter(e=>e[1]).sort((a,b)=>Date.parse(a[1])-Date.parse(b[1])), untimed = i.ev.filter(e=>!e[1]);
    const ev = e => `<li><time>${e[1] ? fmtWhen(Date.parse(e[1])) : "no time"}</time><span class="k">${EVK[e[0]] ?? e[0]}</span>${e[3] ? `<a href="${esc(e[3])}" target="_blank" rel="noopener">${esc(e[2] || e[3])} ↗</a>` : `<span class="t">${esc(e[2])}</span>`}</li>`;
    sb.innerHTML = `<div class="sb-top"><span class="sb-mode" style="--c:${mc(i.mode)}"><i class="sw"></i>${MODES[i.mode]} · ${WEEKS[i.w]}</span><button class="x" id="sb-x">close <kbd>esc</kbd></button></div>
      <h3>${esc(i.title)}</h3>
      <div class="sb-dur"><b>${fmtDur(i)}</b><span>${i.hrs ? `longer than ${pct}% of your spans` : "one moment, one event"}</span></div>
      <dl class="attrs"><dt>mode</dt><dd>${MODES[i.mode]}</dd><dt>without_you</dt><dd>${i.wm ? WMS[i.wm] : "not answered"}</dd>
        <dt>project</dt><dd>${pr && i.s!=="none" ? (pr.url ? `<a href="${esc(pr.url)}" target="_blank" rel="noopener">${esc(pr.name)} ↗</a>` : esc(pr.name)) : "none"}</dd>
        <dt>pillar</dt><dd>${PILLAR[i.pillar] ?? "none"}</dd><dt>started</dt><dd>${i.t0 ? `${fmtWhen(i.t0)}, ${fmtDay(i.t0)}` : "no time"}</dd></dl>
      ${i.summary ? `<p class="sb-sum">${esc(i.summary)}</p>` : ""}
      <span class="lbl">Span events · ${i.ev.length}</span>
      <ol class="evl">${timed.map(ev).join("")}${untimed.map(ev).join("")}</ol>
      ${typeof SAMPLE === "undefined" ? `<a class="ref" href="#/review?week=${yearOf(i.w)}-${esc(WEEKS[i.w])}&key=${encodeURIComponent(i.id)}">change it in review →</a>` : ""}`;
  }
  if(G && !$("#v-trace").hidden){
    G.from("#sb > *", {y:8, opacity:0, filter:"blur(6px)", duration:.4, ease:"power3.out", stagger:.03, clearProps:"filter,transform,opacity"});
    G.from("#sb .mixbar i", {scaleX:0, duration:.6, ease:"expo.out", stagger:.04, clearProps:"transform"});
  }
}
// The address keeps weeks and the open span, so reload and a shared link show the same thing.
const traceUrl = () => history.replaceState(null, "", `#/trace?w=${[...sel].sort((a,b)=>a-b).map(i=>WEEKS[i]).join(",")}${spanSel ? `&s=${encodeURIComponent(spanSel)}` : ""}`);
const pickSpan = id => { spanSel = spanSel === id ? null : id; markSpan(); drawSide(); traceUrl(); };

$("#v-trace").addEventListener("click", e => {
  const b = e.target.closest("button, .wr.sp"); if(!b) return;
  const d = b.dataset;
  if(d.mf){ tf.mode = tf.mode === d.mf ? null : d.mf; drawSvc(); drawHeat(); drawWaterfall(); drawSide(); play(); }
  else if("crit" in d){ tf.crit = !tf.crit; drawSvc(); drawHeat(); drawWaterfall(); drawSide(); play(); }
  else if(d.root){ const w = +d.root; openRoots.has(w) ? openRoots.delete(w) : openRoots.add(w); drawWaterfall(); play(); }
  else if(b.id === "wf-all"){ openRoots = new Set(openRoots.size === sel.size ? [] : sel); drawWaterfall(); play(); }
  else if(b.id === "wf-replay") play();
  else if(b.id === "sb-x") pickSpan(spanSel);
  else if(d.span) pickSpan(d.span);
  // Week labels are buttons, so the keyboard can pick a week too. Pointer picks go through the brush.
  else if(d.w != null && e.detail === 0){ sel = new Set([+d.w]); renderTrace(); }
});
// Linked views: hovering a span lights its heatmap cell.
$("#wf").addEventListener("pointerover", e => {
  document.querySelectorAll("#hm .ping").forEach(c=>c.classList.remove("ping"));
  const r = e.target.closest(".wr.sp"); if(!r) return; const i = ITEMS.find(x=>x.id===r.dataset.span); if(!i) return;
  $(`#hm [data-d="${i.w*7+i.day}"][data-b="${i.b}"]`)?.classList.add("ping");
});
$("#wf").addEventListener("pointerleave", () => document.querySelectorAll("#hm .ping").forEach(c=>c.classList.remove("ping")));
// Brush: drag across weeks selects them; shift-click adds or removes one week.
const weekAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("#hm [data-w]"); return el ? +el.dataset.w : null; };
function brushTo(){ sel = new Set(brush.add ? brush.before : []); for(let w = Math.min(brush.a, brush.b); w <= Math.max(brush.a, brush.b); w++) sel.add(w); }
$("#hm").addEventListener("pointerdown", e => { const w = weekAt(e); if(w == null) return; e.preventDefault();
  $("#hm").setPointerCapture(e.pointerId); brush = {a:w, b:w, add:e.shiftKey || e.metaKey, before:new Set(sel)}; });
$("#hm").addEventListener("pointermove", e => { if(!brush) return; const w = weekAt(e); if(w == null || w === brush.b) return; brush.b = w; brushTo(); drawHeat(); });
$("#hm").addEventListener("pointerup", () => { if(!brush) return;
  if(brush.add && brush.a === brush.b && brush.before.has(brush.a) && brush.before.size > 1){ sel = new Set(brush.before); sel.delete(brush.a); } else brushTo();
  brush = null; renderTrace(); });

/* ITEM SHEET */
function openItem(id){
  const it = ITEMS.find(i=>i.id===id), m = modeOf(it), st = PROJECTS[it.s], g = GOALS.find(x=>goalsOf(it).includes(x.id));
  const r = it.rec!=null ? REC[it.rec] : null, q = it.quote || (r && {t:r.t, who:`${r.who} · ${r.where}`});
  const ref = REFS[m].items[0];
  // flame: item → sources → links
  const srcs = cnt(it.links, l=>l[0]);
  if(q) srcs[r?"Recognition":"Slack"] = (srcs[r?"Recognition":"Slack"]||0)+1;
  const lv2 = Object.keys(srcs);
  const flame = `<div class="flame" aria-label="Item evidence, as a flame graph">
    <div class="lv"><span class="sp" style="background:${mc(m)}">${esc(it.id)} · ${MODES[m]}</span></div>
    ${lv2.length?`<div class="lv">${lv2.map(s=>`<span class="sp" style="flex:${srcs[s]};background:color-mix(in srgb,${mc(m)} 62%,var(--s3))">${s} · ${srcs[s]}</span>`).join("")}</div>
    <div class="lv">${lv2.map(s=>{ const ls = it.links.filter(l=>l[0]===s);
      const extra = (s==="Recognition"||(s==="Slack"&&q&&!r)) ? [`<span class="sp" style="flex:1;background:color-mix(in srgb,${mc(m)} 38%,var(--s3));color:var(--ink)">${s==="Recognition"?"★ "+esc(r.who):"quote"}</span>`] : [];
      return ls.map(l=>`<a class="sp" href="${l[2]}" target="_blank" rel="noopener" style="flex:1;background:color-mix(in srgb,${mc(m)} 38%,var(--s3));color:var(--ink)" title="${esc(l[1])}">${esc(l[1])} ↗</a>`).concat(extra).join(""); }).join("")}</div>`:""}
  </div>`;
  $("#sheet-in").innerHTML = `<button class="x" id="x">close <kbd>esc</kbd></button>
    <div class="crumbs" aria-label="Item link chain">
      ${g?`<b class="ex2" style="border-style:dashed"><i class="dot" style="background:${g.color}"></i> ${esc(g.short)}</b>`:`<b class="ex2">no goal</b>`}<span class="sep">▸</span>
      ${st.url?`<a href="${st.url}" target="_blank" rel="noopener">${esc(st.name)} ↗</a>`:`<b>${esc(st.name)}</b>`}
      ${it.ms?`<span class="sep">▸</span><b>${esc(it.ms)}</b>`:""}<span class="sep">▸</span><b>${it.id} · ${WEEKS[it.w]}</b>
    </div>
    <h2>${esc(it.title)}</h2>
    <div class="chips">
      <button class="chip" data-ref="${m}"><i class="dot" style="background:${mc(m)}"></i>${MODES[m]}</button>
      ${it.wm?`<button class="chip" data-ref="counterfactual">${WMS[it.wm]}</button>`:""}
      <button class="chip" data-ref="tracking">${PILLAR[it.pillar]}</button>
      <span class="chip" style="cursor:default">${g?`<i class="dot" style="background:${g.color}"></i>${esc(g.short)}`:"no goal"}</span>
    </div>
    <div class="sec"><span class="lbl">Evidence</span>${flame}</div>
    ${q?`<figure class="qblock"><p>“${esc(q.t)}”</p><figcaption class="by">${esc(q.who)}</figcaption></figure>`:""}
    <div class="two">
      <div class="why"><span class="lbl">Why this counts · ${MODES[m]}</span><p>“${esc(ref.q)}”</p><a class="ref" href="${ref.url}" target="_blank" rel="noopener">${esc(ref.who)} ↗</a><a class="ref" href="#" data-ref="${m}">all sources →</a></div>
      <div class="sec"><span class="lbl">Without you, would it have happened?</span><p class="oneline" style="font-size:20px;margin:0">${it.wm ? esc(WMS[it.wm]) : "not answered"}</p>
        ${typeof SAMPLE === "undefined" ? `<a class="ref" href="#/review?week=${yearOf(it.w)}-${esc(WEEKS[it.w])}&key=${encodeURIComponent(it.id)}">change it in review →</a>` : ""}<a class="ref" href="#" data-ref="counterfactual">why this question →</a></div>
    </div>`;
  $("#sheet").hidden = false; $("#x").focus();
  if(G){ G.from("#sheet-in",{y:40,opacity:0,duration:.35,ease:"power3.out",clearProps:"all"}); G.from("#sheet-in .flame .sp",{scaleX:0,duration:.5,stagger:.04,ease:"power2.out",clearProps:"transform"}); }
}
