// GOALS: what your work serves. You write them; projects and single threads link to them.
import { useEffect, useState } from "react";
import { post, Strip, toast } from "./lib";

type D = any;
const nv = (v: unknown) => v == null ? "" : String(v);
const css = (o: Record<string, string | number>) => o as React.CSSProperties;
// Last quarter, this one and the next three.
function quarters() { const n = new Date(), q = n.getFullYear() * 4 + Math.floor(n.getMonth() / 3);
  return [-1, 0, 1, 2, 3].map((k) => `${Math.floor((q + k) / 4)}-Q${(q + k) % 4 + 1}`); }
const line = (type: string) => type === "committed" ? 1 : .7;
// The objective's score: the mean of its key results that have numbers.
const score = (g: D) => { const ps = g.krs.map((k: D) => k.progress).filter((p: D) => p != null); return ps.length ? ps.reduce((a: number, b: number) => a + b, 0) / ps.length : null; };

export function Goals({ focus }: { focus: string | null }) {
  const [d, setD] = useState<D>(null), [fail, setFail] = useState(false);
  // edit: "team" | "personal" for a new goal, a goal id, or a draft opened in the form.
  const [edit, setEdit] = useState<D>(null), [del, setDel] = useState<number | null>(null);
  const [openG, setOpenG] = useState(new Set<number>()), [focusG, setFocusG] = useState<number | null>(null), [dIdx, setDIdx] = useState(0);
  // One goal is open on its own, and stays open when a second one comes.
  const load = async () => { const r = await fetch("/api/goals"); if (!r.ok) return setFail(true); const j = await r.json(); if (j.goals.length === 1) setFocusG(j.goals[0].id); setD(j); };
  useEffect(() => { if (focus) { setOpenG((s) => new Set(s).add(+focus)); setFocusG(+focus); } load(); }, [focus]);
  async function act(url: string, body: unknown, done: string) {
    const r = await post(url, body);
    if (!r.ok) return toast(await r.text());
    toast(done); await load();
  }
  // A goal named after one of your projects, already linked, open for you to rename.
  async function seed(p: D) {
    const r = await post("/api/goal", { title: p.name, kind: "team" });
    if (!r.ok) return toast(await r.text());
    const { id } = await r.json();
    await post("/api/goal-link", { goal_id: id, project_id: p.id, on: true });
    setEdit(id); toast(`Goal created from ${p.name}`); await load();
  }
  async function addDraft(g: D) {
    if (!g.krs.length) return toast("Keep at least one key result");
    const r = await post("/api/goal", g);
    if (!r.ok) return toast(await r.text());
    toast(`Added: ${g.title}`); await load();
  }
  const skip = (id: number) => act("/api/draft-dismiss", { id }, "Skipped. The draft is gone");
  const saved = async (id: number | null) => { setEdit(null); toast(id ? "Goal saved" : "Goal created"); await load(); };

  let body: React.ReactNode;
  if (fail) body = <div className="empty">Goals need the app server. Start it with bun app/server.ts.</div>;
  else if (!d) body = <div className="empty">Loading goals…</div>;
  else {
    const max = Math.max(1, ...d.goals.flatMap((g: D) => Object.values(g.weeks).map((t: D) => t.length)));
    const fg = d.goals.length === 1 ? d.goals[0].id : focusG;
    const form = (g: D) => <GoalForm key={g.id ?? "new"} d={d} g={g} cancel={() => setEdit(null)} saved={saved} />;
    const list = <div className="go-list">{d.goals.map((g: D) => edit === g.id ? form(g)
      : fg !== g.id && del !== g.id ? <Row key={g.id} d={d} g={g} open={() => { setFocusG(g.id); requestAnimationFrame(() => document.getElementById(`goal-${g.id}`)?.scrollIntoView({ block: "nearest" })); }} />
      : <Card key={g.id} d={d} g={g} max={max} del={del === g.id} threads={openG.has(g.id)}
          on={{ edit: () => setEdit(g.id), del: () => setDel(g.id), keep: () => setDel(null), close: () => setFocusG(null),
            gone: () => { setDel(null); act("/api/goal", { id: g.id, delete: true }, "Goal deleted"); },
            threads: () => setOpenG((s) => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; }),
            conf: async (n: number) => { const r = await post("/api/checkin", { goal_id: g.id, confidence: n }); if (!r.ok) return toast(await r.text()); toast(`Confidence ${n} saved`); await load(); },
            link: (p: D, on: boolean) => act("/api/goal-link", { goal_id: g.id, project_id: p.id, on }, on ? `Linked ${p.name}` : "Project unlinked") }} />)}</div>;
    const i = Math.min(dIdx, d.drafts.length - 1);
    body = typeof edit === "string" ? <>{form({ kind: edit })}{list}</>
      : edit && typeof edit === "object" ? <>{form(edit)}{list}</>
      : !d.goals.length && !d.drafts.length ? <First d={d} pick={setEdit} seed={seed} />
      : <>{d.drafts.length > 0 && <Draft key={d.drafts[i].id} d={d} i={i} keys={edit == null} go={setDIdx} add={addDraft} skip={skip}
          use={(g: D) => setEdit({ ...g, id: null, draft_id: g.id })} />}
        <button className="todo big go-new" id="go-add" onClick={() => setEdit("team")}>＋ new goal</button>{list}</>;
  }
  return <section className="view" id="v-goals">
    <div className="vhead"><h1>Goals</h1><p>Link a project here, or one thread in review with <kbd>L</kbd>. North shows how much of your work serves each goal.</p></div>
    <div id="go">{body}</div>
  </section>;
}

// A key result names a metric the app measures, a milestone, or nothing: then you type "now".
function Measures({ d }: { d: D }) {
  return <><option value="">I update it</option>
    <optgroup label="The app measures">{d.metrics.map((m: D) => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
    {d.milestones.length > 0 && <optgroup label="Linear milestone, % done">{d.milestones.map((m: D) =>
      <option key={m.id} value={`milestone:${m.id}`}>{`${m.project} · ${m.name}`}</option>)}</optgroup>}</>;
}

function GoalForm({ d, g, cancel, saved }: { d: D; g: D; cancel: () => void; saved: (id: number | null) => void }) {
  const [f, setF] = useState(() => ({ title: g.title ?? "", description: g.description ?? g.why ?? "", kind: g.kind ?? "team", type: g.type ?? "aspirational", quarter: g.quarter ?? "",
    krs: (g.krs?.length ? g.krs : [{}]).map((k: D) => ({ text: k.text ?? "", metric: k.metric ?? "", start: nv(k.start), target: nv(k.target), current: nv(k.metric ? k.value : k.current) })) }));
  const [err, setErr] = useState(""), [moved, setMoved] = useState<"add" | "del" | null>(null);
  const qs = quarters(); if (g.quarter && !qs.includes(g.quarter)) qs.unshift(g.quarter);
  useEffect(() => { document.getElementById("go-title")?.focus(); }, []);
  // After adding a row, type in it; after removing one, stay on the form.
  useEffect(() => { if (moved) (document.querySelector(moved === "add" ? "#go-form .kr-row:last-of-type .kr-text" : "#kr-add, #go-title") as HTMLElement)?.focus(); }, [moved, f.krs.length]);
  const kr = (i: number, k: Partial<typeof f.krs[0]>) => setF({ ...f, krs: f.krs.map((x: D, j: number) => j === i ? { ...x, ...k } : x) });
  const seg = (name: "kind" | "type", opts: string[][]) => <div className="seg" role="group" aria-labelledby={`go-${name}-l`}>
    {opts.map(([k, t]) => <button key={k} type="button" data-kind={name === "kind" ? k : undefined} data-type={name === "type" ? k : undefined} aria-pressed={f[name] === k} onClick={() => setF({ ...f, [name]: k })}>{t}</button>)}</div>;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { id: g.id ?? null, draft_id: g.draft_id ?? null, ...f, quarter: f.quarter || null,
      krs: f.krs.map((k: D) => ({ ...k, metric: k.metric || null })).filter((k: D) => k.text.trim() || k.start || k.target) };
    const r = await post("/api/goal", body);
    // Say what is wrong without clearing what you typed.
    if (!r.ok) return setErr(await r.text());
    saved(g.id ?? null);
  }
  return <form className="go-form" id="go-form" onSubmit={submit}>
    <label>Objective<input id="go-title" name="title" maxLength={120} required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Customers manage datasets as code" autoComplete="off" />
      <span className="hint">An outcome, not a task: what is true when you are done?</span></label>
    <label>Description<textarea id="go-desc" maxLength={600} rows={3} placeholder="Why this matters now, and what done looks like" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
    <div className="row"><div className="fld"><span id="go-kind-l">For</span>{seg("kind", [["team", "Team or company"], ["personal", "Personal"]])}</div>
      <div className="fld"><span id="go-type-l">Type</span>{seg("type", [["committed", "Committed · must reach 1.0"], ["aspirational", "Aspirational · 0.7 is on track"]])}</div>
      <label>Quarter<select id="go-q" name="quarter" value={f.quarter} onChange={(e) => setF({ ...f, quarter: e.target.value })}><option value="">No end</option>{qs.map((q) => <option key={q}>{q}</option>)}</select></label></div>
    <fieldset className="krs-f"><legend>Key results <span className="hint">2 to 4. Each is a number with a start and a target, so you can tell when it is done.</span></legend>
      {f.krs.map((k: D, i: number) => <div className="kr-row" key={i}>
        <input className="kr-text" aria-label={`Key result ${i + 1}`} maxLength={200} placeholder={i ? "Another number that proves it" : "3 teams use exports in production"} value={k.text} onChange={(e) => kr(i, { text: e.target.value })} />
        {/* An auto measure fills "now" for you; switching to manual leaves it for you to type. */}
        <select className="kr-m" aria-label="How it is measured" value={k.metric} onChange={(e) => kr(i, e.target.value ? { metric: e.target.value, current: "" } : { metric: "" })}><Measures d={d} /></select>
        <label className="kr-n">from<input className="kr-start" inputMode="decimal" value={k.start} onChange={(e) => kr(i, { start: e.target.value })} /></label>
        <label className="kr-n">target<input className="kr-target" inputMode="decimal" value={k.target} onChange={(e) => kr(i, { target: e.target.value })} /></label>
        <label className="kr-n">now<input className="kr-cur" inputMode="decimal" value={k.current} disabled={!!k.metric} onChange={(e) => kr(i, { current: e.target.value })} /></label>
        <button type="button" className="undo del" aria-label={`Remove key result ${i + 1}`} onClick={() => { setF({ ...f, krs: f.krs.filter((_: D, j: number) => j !== i) }); setErr(""); setMoved("del"); }}>✕</button></div>)}
      {f.krs.length < 5 ? <button type="button" className="go-btn" id="kr-add" onClick={() => { setF({ ...f, krs: [...f.krs, { text: "", metric: "", start: "", target: "", current: "" }] }); setErr(""); setMoved("add"); }}>＋ key result</button>
        : <span className="hint">Five is the most. More is a task list.</span>}</fieldset>
    {err && <p className="err" role="alert">{err}</p>}
    <div className="row"><button className="go-btn main" type="submit">{g.id ? "Save objective" : "Create objective"}</button><button className="go-btn" type="button" id="go-cancel" onClick={cancel}>Cancel</button></div></form>;
}

const metricOf = (d: D, m: string) => d.metrics.find((x: D) => x.key === m);
// One bar per key result: 0 at the start, 1 at the target. The tick is where this type is on track.
function KR({ d, k, type }: { d: D; k: D; type: string }) {
  const p = k.progress, l = line(type), mt = k.metric && metricOf(d, k.metric), ms = k.metric?.startsWith("milestone:");
  const name = k.metric && (mt?.label ?? d.milestones.find((x: D) => `milestone:${x.id}` === k.metric)?.name);
  const unit = mt?.unit ?? (ms ? "%" : "");
  return <li className={`kr${p != null && p >= l ? " hit" : ""}`}><div className="kr-h"><span>{k.text}</span><b className="num">{p == null ? "–" : p.toFixed(2)}</b></div>
    <div className="kr-bar" role="img" aria-label={p == null ? "no numbers yet" : `${Math.round(p * 100)}% of the way`}><i style={{ width: `${(p ?? 0) * 100}%` }}></i><s style={{ left: `${l * 100}%` }}></s></div>
    <span className="by">{`${k.start != null && k.target != null ? `${nv(k.start)} → ${nv(k.target)} ${unit} · now ${k.value == null ? "–" : nv(k.value)}` : "add a start and a target"} · ${name
      ? `measured: ${name}${ms ? "" : mt?.agg === "total" ? ", this quarter so far" : ", last 4 weeks"}` : "you update it"}`}</span></li>;
}

// Closed: one line per goal, so five goals still fit a screen. Open one to see and change it.
function Row({ d, g, open }: { d: D; g: D; open: () => void }) {
  const s = score(g), l = line(g.type), c = g.checkins.find((x: D) => x.week === d.week)?.confidence;
  return <button className="go-row" data-focus={g.id} aria-expanded="false" aria-controls={`goal-${g.id}`} onClick={open}>
    <span className="go-rt"><b>{g.title}</b><span className="by">{`${g.kind} · ${g.type}${g.quarter ? ` · ${g.quarter}` : ""}`}</span></span>
    <span className="go-mini" aria-label={`${g.krs.length} key results`}>{g.krs.map((k: D, i: number) =>
      <i key={i} title={k.text}><i style={{ width: `${(k.progress ?? 0) * 100}%` }} className={k.progress != null && k.progress >= l ? "hit" : undefined}></i></i>)}</span>
    <span className={`go-score num${s != null && s >= l ? " hit" : ""}`} title="Mean of the key results">{s == null ? "–" : s.toFixed(2)}</span>
    <span className={`go-conf${c ? "" : " ask"}`} title={c ? `Confidence ${d.week.slice(5)}` : `No confidence for ${d.week.slice(5)} yet`}>{c ?? "?"}</span>
  </button>;
}

function Card({ d, g, max, del, threads, on }: { d: D; g: D; max: number; del: boolean; threads: boolean; on: D }) {
  const ts = Object.values(g.weeks).flat(), linked = new Set(g.projects.map((p: D) => p.id));
  const now = g.checkins.find((c: D) => c.week === d.week)?.confidence, past = g.checkins.filter((c: D) => c.week !== d.week).slice(-7);
  return <article className={`grp ${g.kind}`} id={`goal-${g.id}`}>
    <div className="go-h"><h2>{g.title}</h2><span className={`go-k ${g.kind}`}>{g.kind === "personal" ? "personal" : "team"}</span><span className="go-k">{g.type}</span>{g.quarter && <span className="facts">{g.quarter}</span>}
      <span className="end"><button className="undo" onClick={on.edit}>edit</button><button className="undo del" onClick={on.del}>delete</button><button className="undo" aria-expanded="true" aria-label={`Close ${g.title}`} onClick={on.close}>close ▴</button></span></div>
    {del && <div className="banner">Delete this goal? Its links go; projects and threads stay. <span><button className="undo del" onClick={on.gone}>delete</button><button className="undo" onClick={on.keep}>cancel</button></span></div>}
    {g.description && <p className="go-desc">{g.description}</p>}
    {g.krs.length ? <ol className="kr-list">{g.krs.map((k: D, i: number) => <KR key={i} d={d} k={k} type={g.type} />)}</ol>
      : <p className="krs">No key results yet. <button className="undo" onClick={on.edit}>add them</button></p>}
    {/* Confidence this week, 1 to 10, with the weeks before it. */}
    <div className="conf"><span className="lbl">{now ? `Confidence ${d.week.slice(5)}` : `How sure are you, ${d.week.slice(5)}?`}</span>
      <div className="conf-b" role="group" aria-label="Confidence this week, 1 to 10">{Array.from({ length: 10 }, (_, i) =>
        <button key={i} aria-pressed={now === i + 1} onClick={() => on.conf(i + 1)}>{i + 1}</button>)}</div>
      {past.length > 0 && <span className="by">{`before: ${past.map((c: D) => `${c.week.slice(5)} ${c.confidence}`).join(" · ")}`}</span>}</div>
    <div className="go-p">{g.projects.length ? g.projects.map((p: D) => <span key={p.id} className="mchip">{p.name}<button aria-label={`Unlink ${p.name}`} onClick={() => on.link(p, false)}>✕</button></span>) : <span>No project linked.</span>}
      <select aria-label={`Link a project to ${g.title}`} value="" onChange={(e) => { const p = d.projects.find((x: D) => x.id === e.target.value); if (p) on.link(p, true); }}>
        <option value="">＋ link a project…</option>{d.projects.filter((p: D) => !linked.has(p.id)).map((p: D) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
    {d.weeks.length > 0 && <Strip weeks={d.weeks.slice(-8)} count={(w) => (g.weeks[w] ?? []).length} max={max} />}
    {ts.length ? <button className="go-th" aria-expanded={threads} onClick={on.threads}>{`${threads ? "▾" : "▸"} ${ts.length} thread${ts.length > 1 ? "s" : ""}`}</button>
      : <span className="facts">No threads yet. Link a project, or press L on a thread in review.</span>}
    {threads && <div className="weeks">{[...d.weeks].reverse().filter((w: string) => g.weeks[w]).map((w: string) => <div key={w} className="wk"><span className="lbl">{w.slice(5)}</span><ul>{g.weeks[w].map((t: D) =>
      <li key={t.key}><a href={`#/review?week=${w}&key=${encodeURIComponent(t.key)}`}><b>{t.title ?? "Untitled"}</b>{t.direct && <span className="go-direct">linked in review</span>}{t.decided ? <span className="ok">✓</span> : <span className="todo">to review</span>}</a></li>)}</ul></div>)}</div>}
  </article>;
}

const Ring = ({ dashed }: { dashed: boolean }) => <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true"><circle cx="20" cy="20" r="14" fill="none" stroke="var(--s3)" strokeWidth="6" />
  <circle cx="20" cy="20" r="14" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" pathLength={100} strokeDasharray={dashed ? "6 6" : "68 100"} transform="rotate(-90 20 20)" /></svg>;
// No goals yet: pick a kind, or start from the work you already do.
function First({ d, pick, seed }: { d: D; pick: (k: string) => void; seed: (p: D) => void }) {
  const top = d.projects.filter((p: D) => p.threads).sort((a: D, b: D) => b.threads - a.threads).slice(0, 4);
  return <div className="go-first">
    <h2>What does your work serve?</h2>
    <p>Name two to four goals. North then shows how much of your work serves each one, and what serves none.</p>
    <div className="go-kinds">
      <button className="go-kind" data-new="team" onClick={() => pick("team")}><Ring dashed={false} /><b>Team or company goal</b><span>“Exports API GA”. Usually served by projects.</span></button>
      <button className="go-kind" data-new="personal" onClick={() => pick("personal")}><Ring dashed /><b>Personal goal</b><span>“Grow two engineers to lead projects”. Usually single threads: a pairing, a review that taught.</span></button></div>
    {top.length > 0 && <><span className="lbl">Start from your work</span><p>Your busiest projects. One tap makes it a goal, linked, and opens it so you can rename it.</p>
      <div className="go-seeds">{top.map((p: D) => <button key={p.id} className="go-seed" onClick={() => seed(p)}><i className={`src ${p.kind}`}></i>{p.name}<span>{`${p.threads} threads`}</span><b>＋</b></button>)}</div></>}
  </div>;
}

// Claude's drafts, one in focus: keep or drop each key result, fix a number, then add it.
const unitOf = (d: D, m: string) => !m ? "" : m.startsWith("milestone:") ? "%" : ((x) => x ? x.unit + (x.agg === "total" ? " this quarter" : "") : "")(metricOf(d, m));
const labelOf = (d: D, m: string) => !m ? "you update it" : metricOf(d, m)?.label ?? ((x) => x ? `milestone · ${x.project} · ${x.name}` : "milestone")(d.milestones.find((x: D) => `milestone:${x.id}` === m));
function Draft({ d, i, keys, go, add, skip, use }: { d: D; i: number; keys: boolean; go: (i: number) => void; add: (g: D) => void; skip: (id: number) => void; use: (g: D) => void }) {
  const g = d.drafts[i], n = d.drafts.length;
  const [krs, setKrs] = useState(() => g.krs.map((k: D) => ({ keep: true, start: nv(k.start), target: nv(k.target) })));
  const set = (j: number, v: D) => setKrs(krs.map((x: D, k: number) => k === j ? { ...x, ...v } : x));
  // The draft as you left it: only the key results you kept, with your numbers.
  const goal = () => ({ title: g.title, description: g.why, kind: g.kind, type: g.type, quarter: g.quarter, draft_id: g.id,
    krs: g.krs.flatMap((k: D, j: number) => krs[j].keep ? [{ text: k.text, metric: k.metric, start: k.metric ? k.start : krs[j].start, target: krs[j].target }] : []) });
  // Drafts by keyboard, only while you are not typing.
  useEffect(() => {
    if (!keys) return;
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || (e.target as HTMLElement).closest("input,select,textarea")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); go((i + (e.key === "ArrowRight" ? 1 : -1) + n) % n); }
      else if (e.key === "a") { e.preventDefault(); add(goal()); }
      else if (e.key === "s") { e.preventDefault(); skip(g.id); }
    };
    document.addEventListener("keydown", on); return () => document.removeEventListener("keydown", on);
  });
  return <section className="dr" aria-label="Drafts from Claude">
    <header className="dr-top"><span className="lbl">{`Claude drafted ${n} objective${n > 1 ? "s" : ""}${g.quarter ? ` for ${g.quarter}` : ""}`}</span>
      <span className="dr-dots">{d.drafts.map((x: D, j: number) => <button key={x.id} type="button" aria-label={`Draft ${j + 1}: ${x.title}`} aria-current={j === i} onClick={() => go(j)}></button>)}</span>
      <span className="dr-n num">{`${i + 1} of ${n}`}</span></header>
    <article className="dr-card">
      <div className="dr-meta"><span className="go-k">{g.kind}</span><span className="go-k">{g.type === "committed" ? "committed · must reach 1.0" : "aspirational · 0.7 is good"}</span></div>
      <h2 className="dr-title">{g.title}</h2>
      <p className="dr-why">{g.why}</p>
      <div className="dr-src"><span className="by">from your data</span>{g.based_on.map((b: string) => <span key={b} className="dr-chip">{b}</span>)}</div>
      <ol className="dr-krs">{g.krs.map((k: D, j: number) => <li key={j} className={`dr-kr${krs[j].keep ? "" : " off"}`}>
        <button type="button" className="dr-keep" aria-pressed={krs[j].keep} aria-label="Keep this key result" onClick={() => set(j, { keep: !krs[j].keep })}>{krs[j].keep ? "✓" : "✕"}</button>
        <div className="dr-kt"><span>{k.text}</span><span className="by">{labelOf(d, k.metric)}</span></div>
        <div className="dr-nums">{k.metric ? <b className="num" title="Where you are now, measured">{nv(k.start) || "–"}</b>
            : <input className="dr-start num" inputMode="decimal" aria-label="Start" placeholder="?" value={krs[j].start} onChange={(e) => set(j, { start: e.target.value })} />}
          <i className="dr-arrow" aria-hidden="true"></i>
          <input className="dr-target num" inputMode="decimal" aria-label="Target" value={krs[j].target} onChange={(e) => set(j, { target: e.target.value })} /><span className="dr-u">{unitOf(d, k.metric)}</span></div></li>)}</ol>
      <footer className="dr-act"><button type="button" className="dr-add" onClick={() => add(goal())}>Add as goal</button>
        <button type="button" className="undo" onClick={() => use(g)}>edit all fields</button>
        <button type="button" className="undo" onClick={() => skip(g.id)}>skip</button>
        <span className="hint dr-keys"><kbd>A</kbd> add · <kbd>S</kbd> skip · <kbd>←</kbd><kbd>→</kbd></span></footer>
    </article></section>;
}
