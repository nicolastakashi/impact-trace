function renderHome(){
  renderFbTile();
  const ups = ITEMS.filter(i=>i.wm==="wouldnt").length;
  $("#home-h").innerHTML = `${esc(WEEKS[0])}–${esc(WEEKS[LAST])} <em>·</em> ${WEEKS.length} weeks`;
  $("#home-p").innerHTML = `<b>${ITEMS.length}</b> threads you kept, <b>${REC.length}</b> times people praised your work, <b>${ups}</b> that would not have happened without you.`;

  // Where the work goes: threads per week, stacked by goal. A thread that serves two goals
  // counts once, in the goal that is served most, so every bar adds up to its week.
  const n = ITEMS.length, served = g => ITEMS.filter(i => goalsOf(i).includes(g.id)).length;
  const GS = [...GOALS].sort((a,b) => served(b) - served(a));
  const first = i => GS.find(g => goalsOf(i).includes(g.id))?.id ?? "none";
  const S = [...GS.map(g => ({id:g.id, name:g.title, c:g.color, p:g.kind === "personal"})),
    {id:"none", name: byGoals ? "Serves no goal" : "Everything else", c:"var(--rest)"}]
    .map(x => ({...x, its: ITEMS.filter(i => first(i) === x.id)}));
  const per = WEEKS.map((_,w) => S.map(x => x.its.filter(i => i.w === w).length));
  const {top, ticks: yt} = axis(Math.max(...per.map(c => c.reduce((a,b) => a+b, 0))));
  const H = 220, fit = S.filter(x => x.id !== "none").reduce((a,x) => a + x.its.length, 0);
  $("#wg-cap").textContent = `Threads you kept each week, by the ${byGoals ? "goal" : "project"} they serve.`;
  $("#wg").innerHTML = `<figure style="margin:0">
      <div class="plot" style="height:${H}px" role="img" aria-label="Threads per week by ${byGoals ? "goal" : "project"}">
        ${yt.map(v => `<div class="tick${v ? "" : " z"}" style="top:${(1 - v/top)*100}%"><span>${v}</span></div>`).join("")}
        <div class="bars" style="--n:${WEEKS.length}">${per.map((c,w) => `<div class="stack" title="${WEEKS[w]}: ${c.reduce((a,b)=>a+b,0)} threads${S.map((x,k) => c[k] ? `\n${x.name}: ${c[k]}` : "").join("")}">${S.map((x,k) => c[k] ? `<i data-s="${x.id}" class="${x.p ? "p" : ""}" style="height:${c[k]/top*H}px;--c:${x.c}"></i>` : "").join("")}</div>`).join("")}</div>
      </div>
      <div class="xax" style="--n:${WEEKS.length}">${WEEKS.map((w,i) => `<span class="${i === LAST ? "now" : ""}">${w}</span>`).join("")}</div>
    </figure>
    <table class="wg-t">
      <thead><tr><th>${byGoals ? "Goal" : "Project"}</th><th>Threads</th><th>Share</th><th title="You said it would not happen without you">Critical</th></tr></thead>
      <tbody>${S.map(x => `<tr data-s="${x.id}" class="${x.id === "none" ? "none" : ""}">
        <td><button data-goal="${x.id}"><i class="sw${x.p ? " p" : ""}" style="--c:${x.c}"></i>${esc(x.name)}</button></td>
        <td>${x.its.length}</td><td>${n ? Math.round(x.its.length/n*100) : 0}%</td><td>${x.its.filter(i => i.wm === "wouldnt").length}</td></tr>`).join("")}</tbody>
    </table>`;
  $("#rings-h").innerHTML = `<span class="ref">${n ? Math.round(fit/n*100) : 0}% serve a ${byGoals ? "goal" : "top project"} · </span>` + (byGoals ? `<a class="ref" href="#/goals">goals →</a>` : `<a class="ref" href="#/goals">add your goals →</a>`);

  // The highlight is where the praise carousel starts.
  const big = ITEMS.find(i=>i.id===HIGHLIGHT.item);
  if(big?.rec != null) recI = big.rec;

  // By mode: longest first, in the mode colors Trace uses.
  const m = cnt(ITEMS, modeOf), mk = Object.keys(MODES).sort((a,b) => (m[b]||0) - (m[a]||0)), mx = Math.max(1, ...Object.values(m));
  $("#t-mix").innerHTML = `<span class="col-h">By mode</span>
    ${mk.map(k=>`<div class="hb"><a class="ref" style="color:var(--ink-2);font:400 12.5px var(--f-body)" href="#" data-ref="${k}">${MODES[k]}</a><span class="tr"><i style="width:${(m[k]||0)/mx*100}%;background:${mc(k)}"></i></span><span class="n">${m[k]||0}</span></div>`).join("")}`;

  // Without you: parts of one whole, so one bar. Only "wouldn't happen" gets the accent.
  const wc = cnt(ITEMS, i=>i.wm), WC = {wouldnt:"var(--accent)", slower:"var(--ink-2)", same:"var(--rest)"};
  const wn = Object.keys(WMS).reduce((a,k) => a + (wc[k]||0), 0);
  $("#t-without").innerHTML = `<span class="col-h">Without you <a class="ref" href="#" data-ref="counterfactual">why →</a></span>
    <div class="part" role="img" aria-label="${Object.keys(WMS).map(k => `${wc[k]||0} ${WMS[k]}`).join(", ")}">${Object.keys(WMS).map(k => wc[k] ? `<i style="flex:${wc[k]};--c:${WC[k]}"></i>` : "").join("")}</div>
    <ul class="pleg">${Object.keys(WMS).map(k => `<li><i class="sw" style="--c:${WC[k]}"></i><b>${wc[k]||0}</b><span>${WMS[k]} · ${wn ? Math.round((wc[k]||0)/wn*100) : 0}%</span></li>`).join("")}</ul>
    ${n - wn ? `<span class="by">${n - wn} not answered yet</span>` : ""}`;

  renderRec(); renderAsks();
  renderNums();

  // Reviews given: columns on a zero baseline, the average as a dashed line, this week in ink.
  // Not accent: a quiet week is not an alert.
  const avg = REVIEWS.reduce((a,b)=>a+b, 0)/REVIEWS.length, {top: rt, ticks: rtk} = axis(Math.max(...REVIEWS)), RH = 110;
  $("#t-rev").innerHTML = `<span class="col-h">Reviews given <a class="ref" href="#" data-ref="elevate">elevate →</a></span>
    <div style="display:flex;align-items:baseline;gap:10px"><span class="statn num" data-count="${REVIEWS[LAST]}">${REVIEWS[LAST]}</span><span style="font-size:12.5px;color:var(--ink-3)">in ${WEEKS[LAST]} · average ${avg.toFixed(0)}</span></div>
    <figure style="margin:0"><div class="plot" style="height:${RH}px" role="img" aria-label="Reviews per week: ${REVIEWS.join(", ")}">
      ${rtk.map(v => `<div class="tick${v ? "" : " z"}" style="top:${(1 - v/rt)*100}%"><span>${v}</span></div>`).join("")}
      <div class="bars" style="--n:${WEEKS.length}">${REVIEWS.map((v,i) => `<div class="stack" title="${WEEKS[i]}: ${v} reviews"><i style="height:${v/rt*RH}px;--c:${i === LAST ? "var(--ink)" : "var(--rest)"}"></i></div>`).join("")}</div>
      <div class="tick" style="top:${(1 - avg/rt)*100}%;border-top:1.5px dashed var(--ink-2)"></div>
    </div>
    <div class="xax" style="--n:${WEEKS.length}">${WEEKS.map((w,i) => `<span class="${i === LAST ? "now" : ""}">${w}</span>`).join("")}</div></figure>`;

  renderWm();

  $("#t-recap").innerHTML = `<span class="play" aria-hidden="true">▶</span>Recap · ${PHASES.length+4} screens`;

  if(G){
    // fromTo, not from: renderHome runs twice on load, and a second from() would start at half opacity and stay there.
    G.fromTo(".north .tile",{y:14,opacity:0},{y:0,opacity:1,duration:.5,stagger:.05,ease:"power2.out",clearProps:"all"});
    // Bars grow from their baseline, left to right, so the eye reads the weeks in order.
    G.fromTo("#v-home .stack, #v-home .spk8 i",{scaleY:0},{scaleY:1,duration:.8,stagger:.04,ease:"expo.out",delay:.2});
    G.fromTo("#v-home .hb .tr i, #v-home .part i",{scaleX:0},{scaleX:1,duration:.8,stagger:.04,ease:"expo.out",delay:.3});
    countUp($("#v-home"));
  }
}
/* NUMBERS: one value per week. Big number is this week; the bars are the 8 weeks, average dashed. */
function renderNums(){
  if(typeof NUMS === "undefined") return;
  // Your time zone comes from this browser, so travel follows you. Work hours are a fixed 09–19.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const f = new Intl.DateTimeFormat("en-GB", {timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23"});
  const late = t => { const p = Object.fromEntries(f.formatToParts(new Date(t)).map(x => [x.type, x.value])); return p.weekday === "Sat" || p.weekday === "Sun" || +p.hour < 9 || +p.hour >= 19; };
  const out = NUMS.slackAt.map(ts => ts.length ? Math.round(ts.filter(late).length / ts.length * 100) : 0);
  // Give vs take: PRs you reviewed per PR you opened. A week with none opened shows 0, not infinity.
  const give = REVIEWS.map((r, i) => NUMS.opened[i] ? +(r / NUMS.opened[i]).toFixed(1) : 0);
  const T = [
    {k:"Slack messages", v:NUMS.slack, d:`in ${NUMS.channels[LAST]} channels`},
    {k:"Meetings", v:NUMS.meetings, u:"h", dp:1, d:"hours accepted or tentative"},
    {k:"Outside work hours", v:out, u:"%", d:"of your messages, before 09, after 19 or weekends"},
    {k:"People who mention you", v:NUMS.reach, d:"different people in Slack"},
    {k:"Lead time", v:NUMS.lead, u:"h", dp:1, d:"median, opened to merged"},
    {k:"Give vs take", v:give, u:"×", dp:1, d:`${REVIEWS[LAST]} PRs reviewed, ${NUMS.opened[LAST]} opened`}];
  $("#nums-h").textContent = `times in ${tz}`;
  $("#nums").innerHTML = T.map(t => { const avg = t.v.reduce((a,b) => a+b, 0) / t.v.length, mx = Math.max(1, ...t.v);
    return `<div><span class="col-h">${t.k}</span>
      <span class="v"><span ${Number.isInteger(t.v[LAST]) ? `data-count="${t.v[LAST]}"` : ""}>${t.v[LAST]}</span>${t.u ? `<small>${t.u}</small>` : ""}</span>
      <span class="d">${t.d} · average ${t.dp ? avg.toFixed(1) : Math.round(avg)}</span>
      <div class="spk8" role="img" aria-label="${t.k} per week: ${t.v.join(", ")}">${t.v.map((v,i) => `<i class="${i === LAST ? "now" : ""}" style="height:${v/mx*100}%" title="${WEEKS[i]}: ${v}${t.u ?? ""}"></i>`).join("")}<span class="avg" style="bottom:${avg/mx*100}%"></span></div></div>`; }).join("");
  $("#t-nums").hidden = false;
}
// Legend and bars point at each other: hover a goal and only its series stays lit.
const wgOn = id => document.querySelectorAll("#wg [data-s]").forEach(e => e.classList.toggle("dim", !!id && e.dataset.s !== id));
$("#wg").addEventListener("mouseover", e => wgOn(e.target.closest("[data-s]")?.dataset.s));
$("#wg").addEventListener("mouseleave", () => wgOn(null));
$("#wg").addEventListener("focusin", e => wgOn(e.target.closest("[data-s]")?.dataset.s));
$("#wg").addEventListener("focusout", () => wgOn(null));
/* RECOGNITION: praise that names your work, Claude's pick checked by code (the quote is in the message).
   One in focus, the rest one click away. */
let recOpen = false, recUndo = null;
// You correct Claude: the mention becomes information, and Claude sees it as an example next time.
async function setMention(id, kind){
  const r = await fetch("/api/mention", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({id, kind})});
  return r.ok;
}
function renderRec(){
  const r = REC[recI], head = `<div class="th"><span class="lbl">Recognition</span><span class="by">${REC.length} in ${WEEKS.length} weeks</span></div>`;
  if(!r){ $("#t-rec").innerHTML = `${head}<p class="rec-full">No praise yet. Shoutouts and thanks that name your work show up here.</p>
    ${recUndo ? `<p class="rec-full">Removed: ${esc(recUndo.who)}. <button class="chip" data-recundo>Undo</button></p>` : ""}`; return; }
  const it = ITEMS.find(i => i.id === r.item), url = /^https:\/\//.test(r.url ?? "") ? r.url : null, q = r.q ?? r.t;
  const ini = s => s.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  // A praise takes the color of the goal its work serves, so recognition reads against your goals.
  const gc = x => { const i = ITEMS.find(i => i.id === x.item); return (i && GOALS.find(g => goalsOf(i).includes(g.id))?.color) || "var(--rest)"; };
  const goal = it && GOALS.find(g => goalsOf(it).includes(g.id));
  // One dot per praise, in its week: the rhythm at a glance, and the way to pick one.
  const strip = WEEKS.map((w, k) => `<div><div class="rs-d">${REC.map((x, i) => [x, i]).filter(([x]) => x.w === k)
    .map(([x, i]) => `<button data-reci="${i}" class="${i === recI ? "on" : ""}" style="--c:${gc(x)}" aria-label="${esc(x.who)}, ${w}${i === recI ? ", shown" : ""}" title="${esc(x.who)} · ${esc(x.about ?? x.where ?? "")}"></button>`).join("")}</div><span>${w}</span></div>`).join("");
  $("#t-rec").innerHTML = `${head}
    <p class="big-q${q.length > 110 ? " long" : ""}">${esc(q)}</p>
    ${r.q && r.q.length < r.t.length * .7 ? `<p class="rec-full">${esc(r.t)}</p>` : ""}
    <div class="rec-who"><span class="av" aria-hidden="true" style="--c:${gc(r)}">${esc(ini(r.who))}</span><div style="display:grid;min-width:0"><b>${esc(r.who)}</b><span class="by">${esc(r.where ?? "")} · ${r.when ? esc(r.when) : WEEKS[r.w]}</span></div></div>
    <div class="rec-act">${url ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener">Slack ↗</a>` : ""}${goal ? `<span class="chip" style="cursor:default"><i class="dot" style="background:${goal.color}"></i>${esc(goal.short)}</span>` : ""}${it ? `<button class="chip" data-item="${it.id}">${esc(it.title)} →</button>` : ""}${r.id ? `<button class="ghost" data-notrec="${esc(r.id)}">Not recognition</button>` : ""}</div>
    ${recUndo ? `<p class="rec-full">Removed: ${esc(recUndo.who)}, "${esc((recUndo.q ?? recUndo.t).slice(0, 60))}". <button class="chip" data-recundo>Undo</button></p>` : ""}
    <div class="rec-strip" role="group" aria-label="Praise per week">${strip}</div>`;
}
/* WHO COMES TO YOU: people who asked you for a review, a decision or an answer in Slack. */
function renderAsks(){
  const head = n => `<div class="th"><span class="lbl">Who comes to you</span><span class="by">${n}</span></div>`;
  if(typeof ASKS === "undefined" || !ASKS.length){ $("#t-asks").innerHTML = `${head("Slack")}<p class="rec-full">No asks yet. Reviews, decisions and questions people bring you show up here.</p>`; return; }
  const ini = s => s.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?", mx = Math.max(1, ...ASKS.flatMap(a => a.per));
  // One stable color per person, from the name: the same person keeps it on every load.
  // Hues 40–310 only: red is for what needs you, never for a person.
  const hue = s => 40 + [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 271, 7);
  $("#t-asks").innerHTML = `${head(`asks in Slack · ${WEEKS[0]}–${WEEKS.at(-1)}`)}<ol class="asks">${ASKS.map(a => `<li style="--p:oklch(0.72 0.13 ${hue(a.who)})">
    <span class="av p" aria-hidden="true">${esc(ini(a.who))}</span>
    <div class="ask-m"><b>${esc(a.who)}</b><span class="ask-t" title="${esc(a.about.join(" · "))}">${esc(a.about.join(" · "))}</span></div>
    <span class="ask-spk" role="img" aria-label="per week: ${a.per.join(", ")}">${a.per.map((n, k) => `<i class="${k === LAST ? "now" : ""}" style="height:${n ? n/mx*100 : 0}%" title="${WEEKS[k]}: ${n}"></i>`).join("")}</span>
    <span class="num">${a.n}</span></li>`).join("")}</ol>`;
}

/* TRACE: your weeks as traces. A week is a trace, a kept thread is a span, its PRs, issues and messages are span events. */
