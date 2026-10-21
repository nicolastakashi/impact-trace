// GOALS: what your work serves. You write them; projects and single threads link to them.
import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, ChevronUp, Plus, X } from "lucide-react";
import { By, post, Strip, toast } from "./lib";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";
import { Input, Label, NativeSelect, Textarea } from "./ui/input";

type D = any;
const nv = (v: unknown) => v == null ? "" : String(v);
// Last quarter, this one and the next three.
function quarters() { const n = new Date(), q = n.getFullYear() * 4 + Math.floor(n.getMonth() / 3);
  return [-1, 0, 1, 2, 3].map((k) => `${Math.floor((q + k) / 4)}-Q${(q + k) % 4 + 1}`); }
const line = (type: string) => type === "committed" ? 1 : .7;
// The objective's score: the mean of its key results that have numbers.
const score = (g: D) => { const ps = g.krs.map((k: D) => k.progress).filter((p: D) => p != null); return ps.length ? ps.reduce((a: number, b: number) => a + b, 0) / ps.length : null; };
const title = "m-0 font-num font-extrabold uppercase text-balance";

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
  if (fail) body = <p className="p-10 text-center text-ink-2">Goals need the app server. Start it with bun app/server.ts.</p>;
  else if (!d) body = <p className="p-10 text-center text-ink-2">Loading goals…</p>;
  else {
    const max = Math.max(1, ...d.goals.flatMap((g: D) => Object.values(g.weeks).map((t: D) => t.length)));
    const fg = d.goals.length === 1 ? d.goals[0].id : focusG;
    const form = (g: D) => <GoalForm key={g.id ?? "new"} d={d} g={g} cancel={() => setEdit(null)} saved={saved} />;
    const list = <div className="grid gap-2">{d.goals.map((g: D) => edit === g.id ? form(g)
      : fg !== g.id && del !== g.id ? <Row key={g.id} d={d} g={g} open={() => { setFocusG(g.id); requestAnimationFrame(() => document.getElementById(`goal-${g.id}`)?.scrollIntoView({ block: "nearest" })); }} />
      : <GoalCard key={g.id} d={d} g={g} max={max} del={del === g.id} threads={openG.has(g.id)}
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
        <Button variant="outline" className="justify-self-start border-brand/50 font-mono text-[13px] tracking-wider text-brand uppercase hover:bg-brand/10 hover:text-brand" onClick={() => setEdit("team")}><Plus />new goal</Button>{list}</>;
  }
  return <section className="view" id="v-goals">
    <div className="vhead"><h1>Goals</h1><p>Link a project here, or one thread in review with <kbd>L</kbd>. North shows how much of your work serves each goal.</p></div>
    <div className="grid gap-3.5">{body}</div>
  </section>;
}

// A key result names a metric the app measures, a milestone, or nothing: then you type "now".
function Measures({ d }: { d: D }) {
  return <><option value="">I update it</option>
    <optgroup label="The app measures">{d.metrics.map((m: D) => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
    {d.milestones.length > 0 && <optgroup label="Linear milestone, % done">{d.milestones.map((m: D) =>
      <option key={m.id} value={`milestone:${m.id}`}>{`${m.project} · ${m.name}`}</option>)}</optgroup>}</>;
}

// Two or more buttons, one pressed: a choice that is always visible.
function Seg({ label, value, opts, set }: { label: string; value: string; opts: string[][]; set: (v: string) => void }) {
  return <div className="grid gap-1.5 text-sm text-ink-2"><span id={`go-${label}-l`}>{label === "kind" ? "For" : "Type"}</span>
    <div className="inline-flex gap-1" role="group" aria-labelledby={`go-${label}-l`}>{opts.map(([k, t]) =>
      <Button key={k} type="button" variant="outline" aria-pressed={value === k} onClick={() => set(k!)}
        className="bg-secondary font-normal text-ink-2 aria-pressed:border-ink-2 aria-pressed:bg-s3 aria-pressed:text-ink">{t}</Button>)}</div></div>;
}

function GoalForm({ d, g, cancel, saved }: { d: D; g: D; cancel: () => void; saved: (id: number | null) => void }) {
  const [f, setF] = useState(() => ({ title: g.title ?? "", description: g.description ?? g.why ?? "", kind: g.kind ?? "team", type: g.type ?? "aspirational", quarter: g.quarter ?? "",
    krs: (g.krs?.length ? g.krs : [{}]).map((k: D) => ({ text: k.text ?? "", metric: k.metric ?? "", start: nv(k.start), target: nv(k.target), current: nv(k.metric ? k.value : k.current) })) }));
  const [err, setErr] = useState(""), [moved, setMoved] = useState<"add" | "del" | null>(null);
  const qs = quarters(); if (g.quarter && !qs.includes(g.quarter)) qs.unshift(g.quarter);
  useEffect(() => { document.getElementById("go-title")?.focus(); }, []);
  // After adding a row, type in it; after removing one, stay on the form.
  useEffect(() => { if (moved) (document.querySelector(moved === "add" ? "#go-form [data-kr]:last-of-type input" : "#kr-add, #go-title") as HTMLElement)?.focus(); }, [moved, f.krs.length]);
  const kr = (i: number, k: Partial<typeof f.krs[0]>) => setF({ ...f, krs: f.krs.map((x: D, j: number) => j === i ? { ...x, ...k } : x) });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { id: g.id ?? null, draft_id: g.draft_id ?? null, ...f, quarter: f.quarter || null,
      krs: f.krs.map((k: D) => ({ ...k, metric: k.metric || null })).filter((k: D) => k.text.trim() || k.start || k.target) };
    const r = await post("/api/goal", body);
    // Say what is wrong without clearing what you typed.
    if (!r.ok) return setErr(await r.text());
    saved(g.id ?? null);
  }
  const hint = "text-[12.5px] font-normal text-ink-3", num = "text-[11.5px]";
  return <Card className="gap-3.5 shadow-none sm:p-5"><form className="grid gap-3.5" id="go-form" onSubmit={submit}>
    <Label>Objective<Input id="go-title" name="title" maxLength={120} required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Customers manage datasets as code" autoComplete="off" />
      <span className={hint}>An outcome, not a task: what is true when you are done?</span></Label>
    <Label>Description<Textarea id="go-desc" maxLength={600} rows={3} placeholder="Why this matters now, and what done looks like" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Label>
    <div className="flex flex-wrap items-end gap-3">
      <Seg label="kind" value={f.kind} set={(kind) => setF({ ...f, kind })} opts={[["team", "Team or company"], ["personal", "Personal"]]} />
      <Seg label="type" value={f.type} set={(type) => setF({ ...f, type })} opts={[["committed", "Committed · must reach 1.0"], ["aspirational", "Aspirational · 0.7 is on track"]]} />
      <Label>Quarter<NativeSelect id="go-q" name="quarter" className="min-w-35" value={f.quarter} onChange={(e) => setF({ ...f, quarter: e.target.value })}><option value="">No end</option>{qs.map((q) => <option key={q}>{q}</option>)}</NativeSelect></Label></div>
    <fieldset className="m-0 grid gap-2 border-0 p-0"><legend className="mb-1.5 grid gap-0.5 p-0 text-sm text-ink-2">Key results <span className={hint}>2 to 4. Each is a number with a start and a target, so you can tell when it is done.</span></legend>
      {f.krs.map((k: D, i: number) => <div data-kr key={i} className="grid grid-cols-3 items-end gap-2 rounded-xl border border-line p-2.5 lg:grid-cols-[minmax(180px,2fr)_minmax(150px,1.3fr)_repeat(3,minmax(64px,.5fr))_auto] lg:border-0 lg:p-0">
        <Input className="col-span-3 lg:col-span-1" aria-label={`Key result ${i + 1}`} maxLength={200} placeholder={i ? "Another number that proves it" : "3 teams use exports in production"} value={k.text} onChange={(e) => kr(i, { text: e.target.value })} />
        {/* An auto measure fills "now" for you; switching to manual leaves it for you to type. */}
        <NativeSelect className="col-span-3 lg:col-span-1" aria-label="How it is measured" value={k.metric} onChange={(e) => kr(i, e.target.value ? { metric: e.target.value, current: "" } : { metric: "" })}><Measures d={d} /></NativeSelect>
        <Label className={num}>from<Input inputMode="decimal" value={k.start} onChange={(e) => kr(i, { start: e.target.value })} /></Label>
        <Label className={num}>target<Input inputMode="decimal" value={k.target} onChange={(e) => kr(i, { target: e.target.value })} /></Label>
        <Label className={num}>now<Input inputMode="decimal" value={k.current} disabled={!!k.metric} onChange={(e) => kr(i, { current: e.target.value })} /></Label>
        <Button type="button" variant="ghost" size="icon" className="col-start-3 justify-self-end text-brand lg:col-start-auto" aria-label={`Remove key result ${i + 1}`}
          onClick={() => { setF({ ...f, krs: f.krs.filter((_: D, j: number) => j !== i) }); setErr(""); setMoved("del"); }}><X /></Button></div>)}
      {f.krs.length < 5 ? <Button type="button" variant="outline" className="justify-self-start font-mono text-[13px] tracking-wider uppercase" id="kr-add"
          onClick={() => { setF({ ...f, krs: [...f.krs, { text: "", metric: "", start: "", target: "", current: "" }] }); setErr(""); setMoved("add"); }}><Plus />key result</Button>
        : <span className={hint}>Five is the most. More is a task list.</span>}</fieldset>
    {err && <p className="m-0 text-[13px] text-brand" role="alert">{err}</p>}
    <div className="flex flex-wrap gap-3"><Button type="submit">{g.id ? "Save objective" : "Create objective"}</Button><Button variant="outline" type="button" onClick={cancel}>Cancel</Button></div>
  </form></Card>;
}

const metricOf = (d: D, m: string) => d.metrics.find((x: D) => x.key === m);
// One bar per key result: 0 at the start, 1 at the target. The tick is where this type is on track.
function KR({ d, k, type }: { d: D; k: D; type: string }) {
  const p = k.progress, l = line(type), hit = p != null && p >= l, mt = k.metric && metricOf(d, k.metric), ms = k.metric?.startsWith("milestone:");
  const name = k.metric && (mt?.label ?? d.milestones.find((x: D) => `milestone:${x.id}` === k.metric)?.name);
  const unit = mt?.unit ?? (ms ? "%" : "");
  return <li className="grid gap-1.5"><div className="flex justify-between gap-3 text-[14.5px]"><span>{k.text}</span><b className={cn("num text-base", hit && "text-ok")}>{p == null ? "–" : p.toFixed(2)}</b></div>
    <div className="relative h-2 rounded bg-s3" role="img" aria-label={p == null ? "no numbers yet" : `${Math.round(p * 100)}% of the way`}>
      <i className={cn("absolute inset-y-0 left-0 rounded", hit ? "bg-ok" : "bg-ink-2")} style={{ width: `${(p ?? 0) * 100}%` }} />
      <s className="absolute -top-0.75 -bottom-0.75 -ml-px w-0.5 bg-ink" style={{ left: `${l * 100}%` }} /></div>
    <By>{`${k.start != null && k.target != null ? `${nv(k.start)} → ${nv(k.target)} ${unit} · now ${k.value == null ? "–" : nv(k.value)}` : "add a start and a target"} · ${name
      ? `measured: ${name}${ms ? "" : mt?.agg === "total" ? ", this quarter so far" : ", last 4 weeks"}` : "you update it"}`}</By></li>;
}

// Closed: one line per goal, so five goals still fit a screen. Open one to see and change it.
function Row({ d, g, open }: { d: D; g: D; open: () => void }) {
  const s = score(g), l = line(g.type), c = g.checkins.find((x: D) => x.week === d.week)?.confidence;
  return <button aria-expanded="false" aria-controls={`goal-${g.id}`} onClick={open}
    className="grid cursor-pointer grid-cols-[1fr_48px_30px] items-center gap-2.5 rounded-xl border border-line bg-card px-4.5 py-3.5 text-left transition-colors hover:border-input hover:bg-secondary sm:grid-cols-[1fr_auto_56px_34px] sm:gap-4.5">
    <span className="grid min-w-0 gap-0.5"><b className="truncate font-num text-lg leading-tight font-extrabold uppercase max-sm:whitespace-normal">{g.title}</b><By>{`${g.kind} · ${g.type}${g.quarter ? ` · ${g.quarter}` : ""}`}</By></span>
    <span className="col-span-full row-start-2 flex gap-1 sm:col-auto sm:row-auto" aria-label={`${g.krs.length} key results`}>{g.krs.map((k: D, i: number) =>
      <i key={i} title={k.text} className="h-1.5 w-7.5 overflow-hidden rounded-full bg-s3"><i className={cn("block h-full", k.progress != null && k.progress >= l ? "bg-ok" : "bg-ink-2")} style={{ width: `${(k.progress ?? 0) * 100}%` }} /></i>)}</span>
    <span className={cn("num text-right text-xl font-bold", s != null && s >= l && "text-ok")} title="Mean of the key results">{s == null ? "–" : s.toFixed(2)}</span>
    <span className={cn("grid size-7.5 place-items-center rounded-lg border border-input bg-secondary font-num text-sm font-semibold", !c && "border-dashed text-ink-3")}
      title={c ? `Confidence ${d.week.slice(5)}` : `No confidence for ${d.week.slice(5)} yet`}>{c ?? "?"}</span>
  </button>;
}

function GoalCard({ d, g, max, del, threads, on }: { d: D; g: D; max: number; del: boolean; threads: boolean; on: D }) {
  const ts = Object.values(g.weeks).flat(), linked = new Set(g.projects.map((p: D) => p.id));
  const now = g.checkins.find((c: D) => c.week === d.week)?.confidence, past = g.checkins.filter((c: D) => c.week !== d.week).slice(-7);
  return <Card id={`goal-${g.id}`} className={cn("scroll-mt-24 gap-3.5 sm:p-5.5", g.kind === "personal" && "border-dashed")}>
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5"><h2 className={cn(title, "text-[22px] leading-tight")}>{g.title}</h2>
      <Badge variant={g.kind === "personal" ? "dashed" : "outline"}>{g.kind === "personal" ? "personal" : "team"}</Badge><Badge>{g.type}</Badge>{g.quarter && <By>{g.quarter}</By>}
      <span className="ml-auto flex gap-2"><Button variant="dashed" size="xs" onClick={on.edit}>edit</Button><Button variant="dashed-destructive" size="xs" onClick={on.del}>delete</Button>
        <Button variant="dashed" size="xs" aria-expanded="true" aria-label={`Close ${g.title}`} onClick={on.close}>close<ChevronUp /></Button></span></div>
    {del && <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-brand/45 bg-secondary px-3.5 py-2.5 text-[13.5px] text-ink-2">Delete this goal? Its links go; projects and threads stay.
      <span className="flex gap-2"><Button variant="dashed-destructive" size="xs" onClick={on.gone}>delete</Button><Button variant="dashed" size="xs" onClick={on.keep}>cancel</Button></span></div>}
    {g.description && <p className="m-0 max-w-[65ch] text-[14.5px] leading-relaxed text-ink-2">{g.description}</p>}
    {g.krs.length ? <ol className="m-0 grid max-w-190 list-none gap-3 p-0">{g.krs.map((k: D, i: number) => <KR key={i} d={d} k={k} type={g.type} />)}</ol>
      : <p className="m-0 text-sm text-ink-2">No key results yet. <Button variant="dashed" size="xs" onClick={on.edit}>add them</Button></p>}
    {/* Confidence this week, 1 to 10, with the weeks before it. */}
    <div className="grid gap-1.5"><span className="lbl">{now ? `Confidence ${d.week.slice(5)}` : `How sure are you, ${d.week.slice(5)}?`}</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Confidence this week, 1 to 10">{Array.from({ length: 10 }, (_, i) =>
        <Button key={i} variant="outline" size="icon-sm" aria-pressed={now === i + 1} onClick={() => on.conf(i + 1)}
          className="bg-secondary font-num text-[13px] font-semibold text-ink-2 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-background">{i + 1}</Button>)}</div>
      {past.length > 0 && <By>{`before: ${past.map((c: D) => `${c.week.slice(5)} ${c.confidence}`).join(" · ")}`}</By>}</div>
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">{g.projects.length ? g.projects.map((p: D) =>
      <Badge key={p.id} variant="soft" className="gap-1 rounded-lg py-0.5 pr-0.5 font-mono">{p.name}<Button variant="ghost" size="xs" className="size-5 p-0 text-ink-3 hover:text-brand" aria-label={`Unlink ${p.name}`} onClick={() => on.link(p, false)}><X className="size-3" /></Button></Badge>)
      : <span>No project linked.</span>}
      <NativeSelect aria-label={`Link a project to ${g.title}`} value="" className="h-7 w-auto border-dashed bg-transparent px-1.5 font-mono text-[11.5px] text-ink-2"
        onChange={(e) => { const p = d.projects.find((x: D) => x.id === e.target.value); if (p) on.link(p, true); }}>
        <option value="">＋ link a project…</option>{d.projects.filter((p: D) => !linked.has(p.id)).map((p: D) => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></div>
    {d.weeks.length > 0 && <Strip weeks={d.weeks.slice(-8)} count={(w) => (g.weeks[w] ?? []).length} max={max} />}
    {ts.length ? <Button variant="link" className="h-auto justify-self-start p-0 font-normal" aria-expanded={threads} onClick={on.threads}>{threads ? <ChevronDown /> : <ChevronRight />}{`${ts.length} thread${ts.length > 1 ? "s" : ""}`}</Button>
      : <By>No threads yet. Link a project, or press L on a thread in review.</By>}
    {threads && <div className="grid gap-2.5">{[...d.weeks].reverse().filter((w: string) => g.weeks[w]).map((w: string) =>
      <div key={w} className="grid gap-1 sm:grid-cols-[40px_1fr] sm:gap-3"><span className="lbl pt-2">{w.slice(5)}</span><ul className="m-0 grid list-none gap-1 p-0">{g.weeks[w].map((t: D) =>
        <li key={t.key}><a className="block rounded-lg px-2.5 py-1.5 no-underline hover:bg-secondary" href={`#/review?week=${w}&key=${encodeURIComponent(t.key)}`}><b className="font-medium">{t.title ?? "Untitled"}</b>
          {t.direct && <By className="ml-1.5">linked in review</By>}{t.decided ? <Check className="ml-1.5 inline size-3.5 text-ok" aria-label="decided" /> : <By className="ml-1.5 text-brand uppercase">to review</By>}</a></li>)}</ul></div>)}</div>}
  </Card>;
}

const Ring = ({ dashed }: { dashed: boolean }) => <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true" className="row-span-2"><circle cx="20" cy="20" r="14" fill="none" stroke="var(--s3)" strokeWidth="6" />
  <circle cx="20" cy="20" r="14" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" pathLength={100} strokeDasharray={dashed ? "6 6" : "68 100"} transform="rotate(-90 20 20)" /></svg>;
// No goals yet: pick a kind, or start from the work you already do.
function First({ d, pick, seed }: { d: D; pick: (k: string) => void; seed: (p: D) => void }) {
  const top = d.projects.filter((p: D) => p.threads).sort((a: D, b: D) => b.threads - a.threads).slice(0, 4);
  const kind = "grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3.5 gap-y-1 rounded-xl border border-input bg-secondary px-4.5 py-4 text-left transition hover:-translate-y-px hover:border-brand motion-reduce:transition-none motion-reduce:hover:translate-y-0";
  return <Card className="gap-3.5">
    <h2 className={cn(title, "text-[clamp(24px,3vw,34px)] leading-none")}>What does your work serve?</h2>
    <p className="m-0 max-w-[60ch] text-[14.5px] text-ink-2">Name two to four goals. North then shows how much of your work serves each one, and what serves none.</p>
    <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
      <button className={kind} onClick={() => pick("team")}><Ring dashed={false} /><b className="text-base">Team or company goal</b><span className="text-[13.5px] text-ink-2">“Exports API GA”. Usually served by projects.</span></button>
      <button className={cn(kind, "border-dashed")} onClick={() => pick("personal")}><Ring dashed /><b className="text-base">Personal goal</b><span className="text-[13.5px] text-ink-2">“Grow two engineers to lead projects”. Usually single threads: a pairing, a review that taught.</span></button></div>
    {top.length > 0 && <><span className="lbl mt-2.5">Start from your work</span><p className="m-0 text-[14.5px] text-ink-2">Your busiest projects. One tap makes it a goal, linked, and opens it so you can rename it.</p>
      <div className="flex flex-wrap gap-2">{top.map((p: D) => <button key={p.id} onClick={() => seed(p)}
        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-input py-1.5 pr-2 pl-3.5 text-left text-sm font-medium hover:border-solid hover:border-brand">
        <i className={cn("size-2 rotate-45 rounded-xs", p.kind === "topic" ? "bg-(--m-solve)" : "bg-(--m-elevate)")} />{p.name}<By>{`${p.threads} threads`}</By>
        <b className="grid size-5.5 place-items-center rounded-full bg-s3 text-brand"><Plus className="size-3.5" /></b></button>)}</div></>}
  </Card>;
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
  const big = "num h-9 w-16 px-2 text-right font-num text-xl font-bold";
  return <section className="grid gap-2.5" aria-label="Drafts from Claude">
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2.5"><span className="lbl">{`Claude drafted ${n} objective${n > 1 ? "s" : ""}${g.quarter ? ` for ${g.quarter}` : ""}`}</span>
      <span className="flex gap-1.5">{d.drafts.map((x: D, j: number) => <button key={x.id} type="button" aria-label={`Draft ${j + 1}: ${x.title}`} aria-current={j === i} onClick={() => go(j)}
        className="h-1.5 w-5.5 cursor-pointer rounded-full bg-s3 p-0 transition-all aria-[current=true]:w-9 aria-[current=true]:bg-ink" />)}</span>
      <span className="num ml-auto text-[15px] font-semibold text-ink-3">{`${i + 1} of ${n}`}</span></header>
    <Card className="animate-in gap-3.5">
      <div className="flex flex-wrap gap-2"><Badge>{g.kind}</Badge><Badge>{g.type === "committed" ? "committed · must reach 1.0" : "aspirational · 0.7 is good"}</Badge></div>
      <h2 className={cn(title, "max-w-[40ch] text-[clamp(26px,3.4vw,40px)] leading-none")}>{g.title}</h2>
      <p className="m-0 max-w-[62ch] text-[15.5px] leading-relaxed text-ink-2">{g.why}</p>
      <div className="flex flex-wrap items-center gap-1.5"><By className="mr-1">from your data</By>{g.based_on.map((b: string) => <Badge key={b} variant="soft">{b}</Badge>)}</div>
      <ol className="m-0 mt-1 grid list-none border-t border-line p-0">{g.krs.map((k: D, j: number) => <li key={j} data-off={krs[j].keep ? undefined : ""}
        className="group grid grid-cols-[auto_1fr] items-center gap-3.5 border-b border-line py-3 transition-opacity data-off:opacity-40 sm:grid-cols-[auto_1fr_auto]">
        <Button type="button" variant="outline" size="icon-sm" aria-pressed={krs[j].keep} aria-label="Keep this key result" onClick={() => set(j, { keep: !krs[j].keep })}
          className="border-ok bg-ok/15 text-ok aria-[pressed=false]:border-input aria-[pressed=false]:bg-transparent aria-[pressed=false]:text-ink-3">{krs[j].keep ? <Check /> : <X />}</Button>
        <div className="grid gap-0.5 text-[15px]"><span className="group-data-off:line-through">{k.text}</span><By>{labelOf(d, k.metric)}</By></div>
        <div className="col-start-2 flex items-center gap-2 sm:col-start-auto">{k.metric ? <b className="num text-right text-xl font-bold" title="Where you are now, measured">{nv(k.start) || "–"}</b>
            : <Input className={big} inputMode="decimal" aria-label="Start" placeholder="?" value={krs[j].start} onChange={(e) => set(j, { start: e.target.value })} />}
          <i className="relative h-0.5 w-11 bg-input after:absolute after:-top-1 after:-right-px after:border-y-[5px] after:border-l-[7px] after:border-y-transparent after:border-l-input" aria-hidden="true" />
          <Input className={big} inputMode="decimal" aria-label="Target" value={krs[j].target} onChange={(e) => set(j, { target: e.target.value })} />
          <span className="max-w-[11ch] min-w-[3ch] text-[12.5px] leading-tight text-ink-3">{unitOf(d, k.metric)}</span></div></li>)}</ol>
      <footer className="mt-1 flex flex-wrap items-center gap-x-4.5 gap-y-2.5"><Button size="lg" className="font-semibold" onClick={() => add(goal())}>Add as goal</Button>
        <Button variant="dashed" size="xs" onClick={() => use(g)}>edit all fields</Button>
        <Button variant="dashed" size="xs" onClick={() => skip(g.id)}>skip</Button>
        <span className="ml-auto hidden text-[12.5px] text-ink-3 sm:inline"><kbd>A</kbd> add · <kbd>S</kbd> skip · <kbd>←</kbd><kbd>→</kbd></span></footer>
    </Card></section>;
}
