/* FEEDBACK: how you show up, from your own messages. The experiment first, then each pattern with your words and a stronger version. */
const FB = typeof FEEDBACK === "undefined" ? [] : FEEDBACK, CATS = typeof FB_CATS === "undefined" ? [] : FB_CATS;
if(CATS.length) REFS.feedback = {title:"Feedback categories", d:"What Claude may flag in your Slack messages, and who says it matters. Anything outside this list is dropped by the code.",
  ex: CATS.map(c => c.name), items: Object.values(CATS.reduce((a, c) => { for(const x of c.refs){ const k = x.url + (x.q ?? x.says);
    a[k] ??= {...x, names: []}; a[k].names.push(c.name); } return a; }, {})).map(x => ({...x, who: `${x.names.join(", ")} · ${x.who}`}))};
REFS.sbi = {title:"How feedback is written", d:"Each card follows Situation, Behavior, Impact: where you wrote it, your exact words, what it costs. Then what to say next time.",
  ex:["Situation", "Behavior", "Impact", "Next time"], items:[
  {q:"Describe the actual, observable behavior being discussed.", who:"Center for Creative Leadership, SBI model", url:"https://www.ccl.org/articles/leading-effectively-articles/sbi-feedback-model-a-quick-win-to-improve-talent-conversations-development/"},
  {q:"No feedback about the past, only ideas for the future.", who:"Marshall Goldsmith, Feedforward", url:"https://hr.uiowa.edu/sites/hr.uiowa.edu/files/2022-10/FeedForward.pdf"}]};
// Why a pattern counts: its first source, the rest on the References page.
function srcOf(it){
  const c = CATS.find(x => x.id === it.category && x.kind === (it.keep ? "strength" : "pattern")), x = c?.refs[0]; if(!x) return "";
  return `<details class="fb-src"><summary>Why this counts · ${esc(x.who.split(",")[0])}</summary><div><p>${x.q ? `“${esc(x.q)}”` : esc(x.says)}</p>
    <a class="ref" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.who)} ↗</a>${x.warn ? `<span class="ref warn">${esc(x.warn)}</span>` : ""}<a class="ref" href="#/refs?k=feedback">all sources →</a></div></details>`;
}

let fbW = 0, fbP = 0;
const wk = w => w.slice(5);
const nextWeek = w => `W${String(+w.slice(6) + 1).padStart(2, "0")}`; // ponytail: W53 and New Year are not handled
const spark = t => { const mx = Math.max(1, ...t); return `<span class="spk" aria-hidden="true">${t.map(n => `<i style="--h:${n/mx}"></i>`).join("")}</span>`; };
// Wrap the pattern's phrases in <mark>, so you see which words carry it.
function markQ(text, markers){
  if(!markers?.length) return esc(text);
  const re = new RegExp(markers.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  let out = "", i = 0;
  for(const m of text.matchAll(re)){ out += esc(text.slice(i, m.index)) + `<mark>${esc(m[0])}</mark>`; i = m.index + m[0].length; }
  return out + esc(text.slice(i));
}
const when = e => `${e.channel} · ${wk(e.week)}${e.at ? ` · ${fmtWhen(Date.parse(e.at))}` : ""}`;

const fbItems = f => [...f.patterns.map(p => ({...p, key:`pattern:${p.name}`})), ...(f.strength ? [{...f.strength, keep:true, key:"strength"}] : [])];
const vdOf = (f, key) => f?.verdicts?.[key]?.v;
// Keys A and R judge the pattern in focus, so only its buttons show them.
const vdBtns = (f, key, yes = "Accept", no = "Reject", keys = true) => `<div class="vd" role="group" aria-label="Your verdict">
  <button data-vd="accept" data-key="${esc(key)}" aria-pressed="${vdOf(f, key) === "accept"}">✓ ${yes}${keys ? " <kbd>A</kbd>" : ""}</button>
  <button data-vd="reject" data-key="${esc(key)}" aria-pressed="${vdOf(f, key) === "reject"}">✕ ${no}${keys ? " <kbd>R</kbd>" : ""}</button></div>`;
const vdWhy = (f, key) => vdOf(f, key) !== "reject" ? "" : `<form class="vd-why" data-key="${esc(key)}"><input id="fb-why" name="why" maxlength="400" autocomplete="off"
  placeholder="What is wrong with it? Claude reads this next week." value="${esc(f.verdicts[key].why ?? "")}" aria-label="Why you rejected it"><button>Save reason</button></form>`;
async function setVerdict(key, v, why){
  const f = FB[fbW], old = f.verdicts?.[key]; fbJust = key;
  f.verdicts = {...f.verdicts}; if(v) f.verdicts[key] = {v, why: why ?? null}; else delete f.verdicts[key];
  renderFeedback(false);
  // The example has no server behind it: the verdict lives on this page only.
  if(typeof SAMPLE !== "undefined") return fbToast(v ? (v === "accept" ? "Accepted (example only)" : "Rejected (example only)") : "Taken back");
  const r = await post("/api/feedback", {week: f.week, item: key, verdict: v, why}).catch(() => null);
  if(!r?.ok){ if(old) f.verdicts[key] = old; else delete f.verdicts[key]; renderFeedback(false); return fbToast(`Not saved: ${r ? await r.text() : "server not reachable"}`); }
  fbToast(why != null ? "Reason saved. Claude reads it next week." : !v ? "Taken back" : v === "accept" ? "Accepted" : "Rejected. Say why, and Claude learns from it.");
  if(v === "reject" && why == null) $("#fb-why")?.focus();
}
const fbToast = msg => toast(msg, 2200);

function renderFeedback(anim = true){
  const f = FB[fbW];
  if(!f){ $("#fb-lead").textContent = ""; $("#fb").innerHTML = `<div class="panel empty">Your first feedback comes with the next collection, on Monday at 18:00. Claude reads the Slack messages you wrote that week and the 7 before it.</div>`; return; }
  const weeksNav = FB.length > 1 ? `<div class="fb-weeks" role="group" aria-label="Feedback week">${FB.map((x, k) => `<button data-fbw="${k}" aria-pressed="${k === fbW}">${wk(x.week)}</button>`).join("")}</div>` : "";
  if(!f.messages.at(-1) && !f.patterns.length){ $("#fb-lead").textContent = "";
    $("#fb").innerHTML = `${weeksNav}<div class="panel empty">You wrote no Slack messages in ${wk(f.week)}, so there is no feedback for it.</div>`; return; }
  const total = f.messages.reduce((a, b) => a + b, 0), e = f.experiment, items = fbItems(f);
  fbP = Math.min(fbP, items.length - 1);
  $("#fb-lead").textContent = `${total} of your Slack messages · ${wk(f.weeks[0])}–${wk(f.weeks.at(-1))}`;
  const p = f.previous;
  const prev = p && p.do ? `<details class="fb-prev"><summary><span class="lbl">Last experiment · ${wk(p.week)}</span>${p.before != null && p.after != null ? `<span class="n">${p.before} → ${p.after}</span>` : ""}</summary>
    <p>${esc(p.do)}</p>${f.last_experiment ? `<p>${esc(f.last_experiment)}</p>` : ""}</details>` : "";
  const t = e?.trend, n = t ? t.length + 1 : 0, mx = t ? Math.max(1, ...t) : 1;
  const chart = t ? `<div class="fb-chart"><span class="cap"><b>${t.reduce((a, b) => a + b, 0)}</b>messages with these phrases in 8 weeks, ${t.at(-1)} in ${wk(f.week)}</span>
      <div class="fb-bars" style="--n:${n}">${t.map((c, k) => `<div class="b${k === t.length - 1 ? " now" : ""}"><em>${c}</em><i style="--h:${c/mx}"></i></div>`).join("")}<div class="b next" title="Measured after the next collection"><em>?</em><i></i></div></div>
      <div class="fb-ax" style="--n:${n}">${f.weeks.map(w => `<span>${wk(w)}</span>`).join("")}<span class="next">${nextWeek(f.week)}</span></div></div>` : "";
  const it = items[fbP];
  $("#fb").innerHTML = `
    ${weeksNav}
    ${prev}
    ${e ? `<div class="panel fb-try${vdOf(f, "experiment") === "reject" ? " rej" : ""}"><div><span class="lbl">Try this week</span><p class="fb-do">${esc(e.do)}</p>
        <div class="fb-tag"><span>Measured by</span><span class="fb-mk">${e.markers.map(m => `<code>${esc(m)}</code>`).join("")}</span></div>
        ${vdBtns(f, "experiment", "I'll try it", "Not this one", false)}${vdNote(f, "experiment")}${vdWhy(f, "experiment")}</div>${chart}</div>` : ""}
    <div class="panel fb-pp">
      <div class="fb-tabs" role="tablist" aria-label="What Claude saw">${items.map((x, k) => { const v = vdOf(f, x.key),
          st = v === "accept" ? `<span class="ok">✓ accepted</span> · ` : v === "reject" ? "✕ rejected · " : "";
        return `<button role="tab" class="fb-tab${x.keep ? " keep" : ""}${v === "reject" ? " rej" : ""}" data-fbp="${k}" aria-selected="${k === fbP}">
          <b>${x.keep ? "✓ " : ""}${esc(x.name)}</b><small>${st}${x.keep ? "keep doing" : `${x.trend.reduce((a, b) => a + b, 0)} messages`}</small></button>`; }).join("")}</div>
      <div class="fb-focus${vdOf(f, it?.key) === "reject" ? " rej" : ""}" id="fb-focus" role="tabpanel">${focus(it, f)}</div>
    </div>`;
  if(anim) animFocus(true); else document.querySelectorAll("#fb-focus .rw").forEach(c => c.classList.add("on"));
}
// What a verdict does, said where you made it.
const NOTE = {
  pattern: {accept:"Accepted. Claude keeps tracking it next week, and its count shows there.",
    reject:"Rejected. Next week Claude leaves it out, unless new messages show it clearly. A reason helps it learn what you mean."},
  strength: {accept:"Accepted. Claude keeps it as a strength to build on.", reject:"Rejected. Claude will not call this a strength again without new evidence."},
  experiment: {accept:"Next Monday counts these phrases in {w} and shows before → after here.", reject:"Passed. Next week Claude proposes a different experiment, and nothing is measured for this one."},
};
let fbJust = null;
const vdNote = (f, key) => { const v = vdOf(f, key); if(!v || fbJust !== key) return "";
  const t = NOTE[key.startsWith("pattern:") ? "pattern" : key][v].replace("{w}", nextWeek(f.week));
  return `<p class="vd-note" role="status">${t}</p>`; };
function focus(it, f){
  if(!it) return `<p class="fb-why">No pattern stood out in these weeks.</p>`;
  const card = x => `<article class="rw${it.keep ? " keep" : ""}">
      <div class="rw-h"><span>${esc(when(x))}</span>${x.url ? `<a class="ref" href="${esc(x.url)}" target="_blank" rel="noopener">open in Slack ↗</a>` : ""}</div>
      <p class="rw-was">“${markQ(x.quote, it.markers)}”</p>
      ${x.instead ? `<div class="rw-now"><span>Next time</span><p>${esc(x.instead)}</p></div>` : ""}</article>`;
  const [first, ...rest] = it.evidence, more = it.matches ?? [];
  let chart = "";
  if(!it.keep){
    const total = it.trend.reduce((a, b) => a + b, 0), mx = Math.max(1, ...it.trend), re = new RegExp(it.markers.map(m => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
    // Two quotes can come from one message: count messages, so the numbers add up to the total.
    const quoted = new Set(it.evidence.filter(x => re.test(x.quote)).map(x => x.at + x.channel)).size;
    chart = `<div class="fb-wk"><p class="fb-sub"><b>${total}</b> messages with <span class="fb-mk" style="display:inline-flex">${it.markers.map(m => `<code>${esc(m)}</code>`).join("")}</span>:
        ${quoted} quoted with a stronger version${more.length ? `, ${more.length} more below` : ""}.${it.evidence.length > quoted ? ` ${it.evidence.length - quoted} quoted say it in other words, not counted.` : ""}</p>
      <div class="fb-bars" style="--n:${it.trend.length}">${it.trend.map((c, j) => `<div class="b${j === it.trend.length - 1 ? " now" : ""}"><em>${c}</em><i style="--h:${c/mx}"></i></div>`).join("")}</div>
      <div class="fb-ax" style="--n:${it.trend.length}">${f.weeks.map(w => `<span>${wk(w)}</span>`).join("")}</div></div>`;
  }
  const label = [rest.length && `${rest.length} more example${rest.length > 1 ? "s" : ""}`, more.length && `${more.length} more message${more.length > 1 ? "s" : ""}`, !it.keep && "8-week count"].filter(Boolean).join(" · ");
  const extra = label ? `<details class="fb-more"><summary>${label}</summary><div class="fb-more-in">${chart}${rest.length ? `<div class="rws">${rest.map(card).join("")}</div>` : ""}
      ${more.length ? `<ol>${more.map(m => `<li><div class="rw-h"><span>${esc(when(m))}</span>${m.url ? `<a class="ref" href="${esc(m.url)}" target="_blank" rel="noopener">open in Slack ↗</a>` : ""}</div><p>${markQ(m.text, it.markers)}</p></li>`).join("")}</ol>` : ""}</div></details>` : "";
  return `<div class="fb-fh"><h2>${esc(it.name)}</h2>${vdBtns(f, it.key, "Accept", "Reject")}</div>${vdNote(f, it.key)}${vdWhy(f, it.key)}
    <p class="fb-why">${esc(it.why)}</p>${srcOf(it)}<div class="rws">${first ? card(first) : ""}</div>${extra}`;
}
function animFocus(all){
  const cards = [...document.querySelectorAll("#fb-focus .rw")];
  // Diagnosis, then the fix: the weak words get marked, then the stronger version appears.
  if(!G){ cards.forEach(c => c.classList.add("on")); return; }
  G.from("#fb-focus .fb-bars .b i", {scaleY:0, duration:.6, ease:"expo.out", stagger:.04, clearProps:"transform"});
  if(all){ G.from("#fb .fb-try .fb-bars .b:not(.next) i", {scaleY:0, duration:.7, ease:"expo.out", stagger:.05, clearProps:"transform"});
    G.from("#fb .fb-do", {opacity:0, y:10, filter:"blur(6px)", duration:.6, ease:"power3.out", clearProps:"all"}); }
  G.from("#fb-focus > .fb-fh, #fb-focus > .fb-why, #fb-focus > .fb-src", {opacity:0, y:8, filter:"blur(6px)", duration:.45, ease:"power3.out", stagger:.04, clearProps:"all"});
  cards.forEach((c, k) => {
    G.from(c, {opacity:0, y:12, duration:.45, ease:"power3.out", delay:.12 + k*.1, clearProps:"all", onStart:() => setTimeout(() => c.classList.add("on"), 200)});
    const now = c.querySelector(".rw-now"); if(now) G.from(now, {opacity:0, x:-8, filter:"blur(4px)", duration:.5, ease:"power3.out", delay:.75 + k*.1, clearProps:"all"});
  });
}
function renderFbTile(){
  const f = FB[0], e = vdOf(f, "experiment") === "reject" ? null : f?.experiment, el = $("#t-fb");
  el.hidden = !e;
  if(!e) return;
  el.innerHTML = `<div style="display:grid;gap:8px;min-width:0"><span class="lbl">Try this week</span><p class="do-full">${esc(e.do)}</p><span class="by">from the pattern “${esc(e.pattern ?? "")}” · open feedback →</span></div>
    ${e.trend ? `<div class="fb-n ${e.trend.at(-1) < e.trend.reduce((a, b) => a + b, 0) / e.trend.length ? "good" : "bad"}"><span class="num">${e.trend.at(-1)}</span><span class="by">times in ${wk(f.week)}</span>${spark(e.trend)}</div>` : ""}`;
}
$("#v-feedback").addEventListener("click", e => {
  const b = e.target.closest("button"); if(!b || b.closest(".vd-why")) return;
  if(b.dataset.vd){ setVerdict(b.dataset.key, vdOf(FB[fbW], b.dataset.key) === b.dataset.vd ? null : b.dataset.vd); return; }
  if(b.dataset.fbw != null){ fbW = +b.dataset.fbw; fbP = 0; fbUrl(); renderFeedback(); }
  else if(b.dataset.fbp != null){ fbP = +b.dataset.fbp; fbJust = null; fbUrl();
    document.querySelectorAll("#fb .fb-tab").forEach(x => x.setAttribute("aria-selected", x === b));
    const it = fbItems(FB[fbW])[fbP];
    $("#fb-focus").classList.toggle("rej", vdOf(FB[fbW], it.key) === "reject"); $("#fb-focus").innerHTML = focus(it, FB[fbW]); animFocus(false); }
});
$("#v-feedback").addEventListener("submit", e => { e.preventDefault(); const k = e.target.dataset.key; setVerdict(k, "reject", e.target.why.value); });
// A and R judge the pattern in focus, the way Review takes keys.
document.addEventListener("keydown", e => {
  if($("#v-feedback").hidden || e.metaKey || e.ctrlKey || e.altKey || e.target.closest("input, textarea, select") || !$("#cmdk").hidden) return;
  const k = e.key.toLowerCase(), f = FB[fbW], it = f && fbItems(f)[fbP]; if(!it || (k !== "a" && k !== "r")) return;
  const v = k === "a" ? "accept" : "reject"; setVerdict(it.key, vdOf(f, it.key) === v ? null : v);
});
const fbUrl = () => history.replaceState(null, "", `#/feedback?w=${FB[fbW] ? wk(FB[fbW].week) : ""}&p=${fbP}`);
