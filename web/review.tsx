// REVIEW: real threads from SQLite. Claude suggests, you decide: your decisions are the gold set.
import { useEffect, useReducer, useRef } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import gsap from "gsap";
import { MODES, mc, PILLAR, post, reduced, toast } from "./lib";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";
import { Input, NativeSelect, Textarea } from "./ui/input";

type D = any;
type Draft = { title: string; summary: string; mode: string; pillar: string };
const WM = [["wouldnt", "wouldn't happen"], ["slower", "slower"], ["same", "same"]] as const;
const MODE_KEYS = ["a", "s", "d", "f", "g", "h"], PILLAR_KEYS = ["z", "x", "c"];
// Event kinds as people say them.
const KIND: Record<string, string> = { pr_merged: "PR merged", pr_open: "PR open", issue_completed: "issue done", issue_open: "issue open",
  review_comment: "review received", reviews_given: "reviews given", slack_message: "Slack", slack_mention: "mention",
  meeting: "meeting", doc_created: "doc created", doc_edited: "doc edited" };
const kind = (k: string) => KIND[k] ?? k;
const routine = (t: D) => t.claude.discard === "yes" && !t.human.discard ? 1 : 0;
// Your place and your unsaved edits, so leaving the tab and coming back keeps both.
const place: { week?: string; key?: string; draft: Record<string, Draft> } = { draft: {} };

const Ai = ({ title }: { title: string }) => <span title={title} className="rounded-[5px] border px-1 font-mono text-[10px] font-medium tracking-wider text-ink-3 uppercase">Claude</span>;
const crumb = "font-mono text-xs font-medium text-ink-3 no-underline hover:text-brand";
const select = "h-8.5 w-auto bg-s1 px-2 font-mono text-[13px] font-medium";

export function Review({ p }: { p: URLSearchParams }) {
  // One mutable state, like the old view: the key handler and the async steps always read the latest.
  const s = useRef({ data: null as D, cur: 0, all: false, keys: false, show: "pending", fail: false, pop: false, q: "", sel: 0 }).current;
  const [, render] = useReducer((n: number) => n + 1, 0);
  const from = p.get("from"), cardRef = useRef<HTMLElement>(null);

  async function load(week?: string | null) {
    const r = await fetch("/api/review" + (week ? `?week=${week}` : "")).catch(() => null);
    if (!r?.ok) { s.fail = true; return; }
    const d = await r.json();
    // Claude's "probably routine" go last, so the work that needs you comes first.
    d.threads.sort((a: D, b: D) => routine(a) - routine(b));
    if (d.week !== place.week) place.draft = {};
    s.data = d; s.cur = Math.max(0, d.threads.findIndex((t: D) => !t.human.discard));
  }
  useEffect(() => { (async () => {
    const week = p.get("week") ?? place.week, key = p.get("key") ?? (week === place.week ? place.key : null);
    await load(week);
    const i = key && s.data ? s.data.threads.findIndex((t: D) => t.key === key) : -1;
    if (i >= 0) s.cur = i;
    render();
  })(); }, [p.get("week"), p.get("key")]);

  const d = s.data, ts: D[] = d?.threads ?? [], t = ts[s.cur];
  const pick = (t: D): Draft => place.draft[t.key] ??= { title: t.human.title ?? t.claude.title ?? "", summary: t.human.summary ?? t.claude.summary ?? "", mode: t.human.mode ?? t.claude.mode, pillar: t.human.pillar ?? t.claude.pillar };
  // Pending hides what you decided, but keeps the open thread so the card does not jump away.
  const shown = (i: number) => s.show === "all" || !ts[i].human.discard || i === s.cur;

  // The address follows the open thread, so reload and back keep your place.
  useEffect(() => {
    if (!d || !t) return;
    place.week = d.week; place.key = t.key;
    history.replaceState(null, "", `#/review?week=${d.week}&key=${encodeURIComponent(t.key)}${from ? `&from=${encodeURIComponent(from)}` : ""}`);
    document.querySelector("#rv-queue [aria-current=true]")?.scrollIntoView({ block: "nearest" });
  });
  // The next thread slides in: you see that the decision moved on, not the same card redrawn.
  useEffect(() => { if (t && cardRef.current && !reduced()) gsap.fromTo(cardRef.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: .3, ease: "power2.out" }); }, [t?.key]);

  const set = (f: "mode" | "pillar", v: string) => { pick(ts[s.cur])[f] = v; render(); };
  const go = (i: number) => { s.cur = Math.min(Math.max(i, 0), s.data.threads.length - 1); s.all = false; render(); };
  // J/K step over threads the filter hides.
  const step = (dir: number) => { for (let i = s.cur + dir; i >= 0 && i < ts.length; i += dir) if (shown(i)) return go(i); };
  // When a week has nothing left, open the next week that does.
  async function nextWeek() {
    const w = d.weeks.find((w: string) => w !== d.week && d.pending[w] > 0);
    if (!w) { toast("All weeks done"); return render(); }
    toast(`${d.week} done · opening ${w}`); await load(w); render();
  }
  function after() {
    const ts = s.data.threads, next = ts.findIndex((x: D, i: number) => i > s.cur && !x.human.discard), any = ts.findIndex((x: D) => !x.human.discard);
    s.data.pending[s.data.week] = ts.filter((x: D) => !x.human.discard).length;
    // The header badge counts what is left.
    dispatchEvent(new Event("pending"));
    if (next >= 0) go(next); else if (any >= 0) go(any); else if (s.show === "pending") nextWeek(); else render();
  }
  async function decide(wm: string) {
    const t = ts[s.cur], dr = pick(t);
    dr.title = dr.title.trim() || t.human.title || t.claude.title || ""; dr.summary = dr.summary.trim();
    const labels = wm === "discard" ? { discard: "yes" } : { title: dr.title, mode: dr.mode, pillar: dr.pillar, without_me: wm, discard: "no", ...(dr.summary && { summary: dr.summary }) };
    const r = await post("/api/labels", { week: d.week, key: t.key, labels });
    if (!r.ok) return toast(`Not saved: ${await r.text()}`);
    Object.assign(t.human, labels);
    toast(wm === "discard" ? "Discarded" : "Saved");
    after();
  }
  // One decision for every thread Claude marked routine and you have not decided.
  async function discardAll() {
    const todo = ts.filter(routine);
    for (const t of todo) {
      const r = await post("/api/labels", { week: d.week, key: t.key, labels: { discard: "yes" } });
      if (!r.ok) { toast(`Stopped: ${await r.text()}`); break; }
      t.human.discard = "yes";
    }
    toast(`Discarded ${todo.filter((t) => t.human.discard === "yes").length}`);
    after();
  }
  // After a regroup the thread's key can change, so find it again by one of its events.
  async function reloadAt(eventId: string) {
    const cur = s.cur; place.draft = {}; await load(d.week);
    const i = s.data.threads.findIndex((t: D) => t.events.some((e: D) => e.id === eventId));
    go(i >= 0 ? i : cur);
  }

  // Project picker: existing projects first, then "create" for a new topic.
  const q = s.q.trim(), res: D[] = d ? d.groups.filter((g: D) => g.name.toLowerCase().includes(q.toLowerCase())) : [];
  if (q && !d.groups.some((g: D) => g.name.toLowerCase() === q.toLowerCase())) res.push({ create: q });
  const sel = Math.min(s.sel, Math.max(res.length - 1, 0));
  const gOpen = () => { s.pop = true; s.q = ""; s.sel = 0; render(); };
  const gClose = () => { s.pop = false; render(); };
  async function gChoose(i: number) {
    const g = res[i]; if (!g) return;
    const t = ts[s.cur], r = await post("/api/group", { week: d.week, key: t.key, ...(g.create ? { name: g.create } : { group_id: g.id }) });
    if (!r.ok) return toast(`Not moved: ${await r.text()}`);
    s.pop = false; await reloadAt(t.events[0].id); toast(g.create ? `Created ${g.create}` : `Moved to ${g.name}`);
  }
  async function linkGoal(id: number, on: boolean) {
    const t = ts[s.cur], r = await post("/api/goal-link", { goal_id: id, week: d.week, key: t.key, on });
    if (!r.ok) return toast(`Not linked: ${await r.text()}`);
    t.goals.direct = on ? [...t.goals.direct, id] : t.goals.direct.filter((x: number) => x !== id);
    render(); toast(on ? "Linked to the goal" : "Unlinked");
  }
  async function unassign() {
    const t = ts[s.cur], r = await post("/api/unassign", { week: d.week, key: t.key });
    if (!r.ok) return toast(`Not undone: ${await r.text()}`);
    await reloadAt(t.events[0].id); toast("Project removed");
  }

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      // Only while nothing sits on top of review: the sheet, search and the story are dialogs.
      if (!s.data || document.querySelector("[role=dialog]:not([hidden])")) return;
      if (el.id === "gq") {
        if (e.key === "Escape") gClose();
        else if (e.key === "ArrowDown") { s.sel = Math.min(sel + 1, res.length - 1); render(); }
        else if (e.key === "ArrowUp") { s.sel = Math.max(sel - 1, 0); render(); }
        else if (e.key === "Enter") gChoose(sel);
        else return;
        return e.preventDefault();
      }
      if (el.id === "rv-title" || el.id === "rv-summary") { if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); el.blur(); } return; }
      if (el.closest("input,select,textarea") || e.metaKey || e.ctrlKey || e.altKey || !ts.length) return;
      const k = e.key.toLowerCase();
      if (MODE_KEYS.includes(k)) set("mode", Object.keys(MODES)[MODE_KEYS.indexOf(k)]!);
      else if (PILLAR_KEYS.includes(k)) set("pillar", Object.keys(PILLAR)[PILLAR_KEYS.indexOf(k)]!);
      else if (["1", "2", "3"].includes(k)) decide(WM[+k - 1]![0]);
      else if (e.code === "Digit0" && e.shiftKey) discardAll();
      else if (k === "0") decide("discard");
      else if (k === "j") step(1);
      else if (k === "k") step(-1);
      else if (k === "t") { const i = document.getElementById("rv-title") as HTMLInputElement; i.focus(); i.select(); }
      else if (k === "e") { const a = document.getElementById("rv-summary") as HTMLTextAreaElement; a.focus(); a.setSelectionRange(a.value.length, a.value.length); }
      else if (k === "p") gOpen();
      else if (k === "l") (document.querySelector("#rv-goals button:not(:disabled), #rv-goals a") as HTMLElement | null)?.focus();
      else if (e.key === "?") { s.keys = !s.keys; render(); }
      else if (k === "v") { s.all = !s.all; render(); }
      else if (k === "o") { const a = (document.querySelector("#rv-events [data-ev] a") ?? document.querySelector("#rv-events a")) as HTMLAnchorElement | null; if (a) open(a.href, "_blank", "noopener"); }
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", on); return () => document.removeEventListener("keydown", on);
  });

  const decided = ts.filter((t) => t.human.discard).length;
  if (d) d.pending[d.week] = ts.length - decided;
  const head = <div className="vhead"><h1>Weekly <em>review</em></h1>
    <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
      <label className="grid gap-1.5"><span className="lbl">Week</span>
        <NativeSelect aria-label="Week" className={select} value={d?.week ?? ""} onChange={async (e) => { place.draft = {}; await load(e.target.value); render(); }}>
          {d?.weeks.map((w: string) => <option key={w} value={w}>{`${w} · ${d.pending[w] ? `${d.pending[w]} left` : "done"}`}</option>)}</NativeSelect></label>
      <label className="grid gap-1.5"><span className="lbl">Show</span>
        <NativeSelect aria-label="Show" className={select} value={s.show} onChange={(e) => { s.show = e.target.value; render(); }}>
          <option value="pending">Pending</option><option value="all">All</option></NativeSelect></label>
      <div className="grid gap-1.5"><span className="lbl">Decided</span><b className="font-num text-[28px] leading-none font-bold tabular-nums">{d ? `${decided}/${ts.length}` : "–"}</b></div>
    </div></div>;
  const empty = (m: React.ReactNode) => <section className="view" id="v-review">{head}<div className="rounded-2xl border border-line bg-card p-10 text-center text-ink-2 shadow-card">{m}</div></section>;
  if (s.fail) return empty("Review needs the app server. Start it with bun app/server.ts.");
  if (!d) return empty("Loading threads…");
  if (!t) return empty(<>No suggested threads yet. Run <code>./run.sh</code> to collect the week and suggest labels.</>);

  const dr = pick(t), ev = new Set(JSON.parse(t.claude.evidence ?? "[]"));
  const firstRoutine = ts.findIndex((x, i) => routine(x) && shown(i)), nRoutine = ts.filter(routine).length;
  const back = from && d.groups.find((g: D) => g.id === from), group = t.projects[0];
  // Claude's evidence first.
  const evs = [...t.events].sort((a, b) => +ev.has(b.id) - +ev.has(a.id));
  const kinds = Object.entries(t.events.reduce((a: Record<string, number>, e: D) => (a[kind(e.kind)] = (a[kind(e.kind)] ?? 0) + 1, a), {})).map(([k, n]) => `${n} ${k}`).join(" · ");

  return <section className="view" id="v-review">{head}
    <div className="grid items-start gap-5 min-[821px]:grid-cols-[minmax(220px,300px)_1fr]">
      <ul id="rv-queue" aria-label="Threads of the week" className="m-0 grid max-h-55 list-none content-start overflow-auto rounded-xl border border-line bg-s1 p-1.5 min-[821px]:sticky min-[821px]:top-24 min-[821px]:max-h-[calc(100vh-120px)]">
        {ts.map((x, i) => shown(i) && <li key={x.key}>
          {i === firstRoutine && <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-line px-2.5 pt-3 pb-1.5">
            <span className="lbl">{`Probably routine · ${nRoutine}`}</span>
            <Button variant="dashed" size="xs" className="h-auto py-0.5" onClick={discardAll}>discard all <kbd>⇧0</kbd></Button></div>}
          <button aria-current={i === s.cur} onClick={() => go(i)}
            className="grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] text-ink-2 hover:bg-s2 aria-[current=true]:bg-s3 aria-[current=true]:text-ink">
            <i className="size-2.25 rounded-full" style={{ background: mc(pick(x).mode) }} />
            <span className={cn("truncate", x.human.discard === "yes" && "text-ink-3 line-through")}>{pick(x).title}</span>
            <span className={cn("font-mono text-[11px] font-medium text-ink-3", x.human.discard && "text-(--m-build)")}>{x.human.discard === "yes" ? "✕" : x.human.discard ? "✓" : x.events.length}</span></button></li>)}
      </ul>

      <main ref={cardRef} className="grid min-w-0 gap-5.5 rounded-2xl border border-line bg-card p-[clamp(18px,3vw,32px)] shadow-card">
        <div className="flex gap-0.75" aria-hidden="true">{ts.map((x, i) =>
          <i key={x.key} className={cn("h-1 flex-1 rounded-sm bg-s3", x.human.discard === "yes" ? "bg-(--line-2)" : x.human.discard ? "bg-(--m-build)" : i === s.cur && "bg-brand")} />)}</div>

        <div className="relative flex flex-wrap items-center gap-2">
          {back && <a className={crumb} href={`#/project?id=${encodeURIComponent(back.id)}`}><ArrowLeft className="mr-1 inline size-3" />{back.name}</a>}
          <Button variant="outline" size="xs" className="bg-transparent font-mono text-xs font-medium text-ink-2 hover:border-ink-2 hover:bg-transparent hover:text-ink" aria-haspopup="listbox" aria-expanded={s.pop} title="Change project (P)" onClick={() => s.pop ? gClose() : gOpen()}>
            {t.projects.length ? t.projects.map((g: D, i: number) => <span key={g.id} className="inline-flex items-center gap-1">{g.name}{g.by === "claude" && <Ai title="Claude placed this thread here" />}{i < t.projects.length - 1 && ","}</span>) : "no project"} ▾</Button>
          {t.projects.some((g: D) => g.by === "claude") && <Button variant="dashed" size="xs" className="h-auto py-px text-[11px]" onClick={unassign}>wrong project <X className="size-3" /></Button>}
          {group && group.id !== from && <a className={crumb} href={`#/project?id=${encodeURIComponent(group.id)}`}>across weeks <ArrowRight className="inline size-3" /></a>}
          <Button variant="outline" aria-pressed={t.human.discard === "yes"} title="Not your impact: routine, noise, or someone else's work (0)" onClick={() => decide("discard")}
            className="ml-auto h-auto gap-2 border-dashed bg-transparent py-1.75 pr-2.5 pl-1.75 text-[13px] font-normal text-ink-2 hover:border-ink-2 hover:bg-transparent hover:text-ink aria-pressed:border-solid aria-pressed:border-ink-2 aria-pressed:bg-s3 aria-pressed:text-ink">
            <kbd>0</kbd>discard{routine(t) ? <Ai title="Claude thinks this is routine" /> : null}</Button>
          {s.pop && <div className="absolute top-[calc(100%+6px)] left-0 z-20 grid w-[min(360px,80vw)] gap-1.5 rounded-xl border bg-card p-2 shadow-card">
            <Input autoFocus id="gq" aria-label="Project" placeholder="Find a project, or type a new topic" autoComplete="off" value={s.q} onChange={(e) => { s.q = e.target.value; s.sel = 0; render(); }} />
            <ul role="listbox" aria-label="Projects" className="m-0 max-h-65 list-none overflow-auto p-0">{res.length ? res.map((g, i) =>
              <li key={g.id ?? "new"}><button role="option" aria-selected={i === sel} onClick={() => gChoose(i)}
                className="flex w-full cursor-pointer justify-between gap-2 rounded-lg px-2.5 py-1.75 text-left text-[13.5px] hover:bg-s2 aria-selected:bg-s3">
                <span>{g.create ? `Create “${g.create}”` : g.name}</span>
                <span className="font-mono text-[10px] font-medium tracking-wider text-ink-3 uppercase">{g.create ? "new topic" : g.kind === "topic" ? "topic" : "linear"}</span></button></li>)
              : <li className="lbl px-2.5 py-2">No projects yet. Type a name to create a topic.</li>}</ul></div>}
        </div>

        <div id="rv-goals" role="group" aria-label="Goals this thread serves" className="flex flex-wrap items-center gap-1.5"><span className="lbl mr-1">Serves</span>
          {d.goals.length ? d.goals.map((g: D) => {
            // A goal its project serves is on through the project; change that on the project's page.
            const via = t.goals.project.includes(g.id), on = via || t.goals.direct.includes(g.id);
            return <Button key={g.id} variant="outline" size="xs" aria-pressed={on} disabled={via} title={via ? "Through its project" : undefined} onClick={() => linkGoal(g.id, !on)}
              className="rounded-full border-dashed bg-transparent font-normal text-ink-2 hover:text-ink aria-pressed:border-solid aria-pressed:border-brand/60 aria-pressed:bg-brand/10 aria-pressed:text-ink disabled:opacity-70">{g.title}{via && " · via project"}</Button>; })
            : <a className={crumb} href="#/goals">no goals yet · add one →</a>}</div>

        <div className="grid gap-2.5">
          <input id="rv-title" aria-label="Thread title" value={dr.title} onChange={(e) => { dr.title = e.target.value; render(); }}
            className="w-full rounded-none border-0 border-b border-dashed border-(--line-2) bg-transparent px-0 pt-0.5 pb-1.5 font-num text-[clamp(26px,3vw,34px)] leading-tight font-bold text-ink outline-none focus:border-brand focus-visible:outline-none" />
          <Textarea id="rv-summary" rows={2} aria-label="Summary of what you did" placeholder="No summary yet" value={dr.summary} onChange={(e) => { dr.summary = e.target.value; render(); }}
            className="-mx-2 -mt-1.5 min-h-[2lh] max-w-[72ch] resize-none border-transparent bg-transparent px-2 py-1.5 text-base leading-relaxed text-ink-2 [field-sizing:content] hover:bg-s2 focus-visible:border-(--line-2) focus-visible:bg-s2 focus-visible:text-ink focus-visible:ring-0" /></div>

        <div className="grid gap-2.5">
          <button aria-expanded={s.all} onClick={() => { s.all = !s.all; render(); }}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-transparent px-3 py-2.5 text-left font-mono text-xs font-medium text-ink-3 hover:border-(--line-2) hover:text-ink-2">
            <span>{kinds}</span><span className="lbl inline-flex items-center gap-1">{s.all ? "hide" : "evidence"}{s.all ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}</span></button>
          {s.all && <ul id="rv-events" className="m-0 max-h-75 list-none overflow-auto rounded-xl border border-line p-0">{evs.map((e) =>
            <li key={e.id} data-ev={ev.has(e.id) || undefined} className="grid gap-0.5 border-t border-line px-3 py-2.25 text-[13.5px] first:border-t-0 data-ev:bg-brand/7 sm:grid-cols-[110px_1fr] sm:gap-3">
              <span className="pt-0.5 font-mono text-[11px] font-medium text-ink-3">{kind(e.kind)}</span>
              <span className="min-w-0 [overflow-wrap:anywhere]">{e.url ? <a className="underline underline-offset-2" href={e.url} target="_blank" rel="noopener">{`${e.title ?? e.id} ↗`}</a> : e.title ?? e.id}
                {e.author && e.kind !== "pr_merged" && e.kind !== "pr_open" && <span className="lbl ml-1.5">{e.author}</span>}
                {e.text && <small className="mt-0.5 line-clamp-1 block text-[12.5px] text-ink-3">{e.text}</small>}</span></li>)}</ul>}</div>

        <div className="grid items-center gap-x-4 gap-y-2.5 sm:grid-cols-[64px_minmax(0,1fr)]">
          <span className="lbl">Mode</span><Seg label="Mode" opts={MODES} keys={MODE_KEYS} value={dr.mode} sug={t.claude.mode} color={mc} set={(v) => set("mode", v)} />
          <span className="lbl">Pillar</span><Seg label="Pillar" opts={PILLAR} keys={PILLAR_KEYS} value={dr.pillar} sug={t.claude.pillar} set={(v) => set("pillar", v)} />
          <span className="max-sm:hidden" /><span className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-ink-3"><i className="size-1.5 rounded-full bg-ink-3" /> Claude's pick</span>
        </div>

        <div className="grid gap-3 border-t border-line pt-5"><span className="font-num text-[22px] leading-none font-bold tracking-wide uppercase">Without you?</span>
          <div className="grid gap-2 sm:grid-cols-3">{WM.map(([k, l], i) =>
            <Button key={k} variant="outline" aria-pressed={t.human.discard === "no" && t.human.without_me === k} onClick={() => decide(k)}
              className="h-auto justify-start gap-2.5 rounded-xl border-line bg-s2 p-3 text-left text-sm font-normal hover:border-ink-2 hover:bg-s2 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-background aria-pressed:[&_kbd]:text-ink">
              <kbd>{i + 1}</kbd>{l}</Button>)}</div></div>

        <div hidden={!s.keys} className="flex flex-wrap gap-x-4.5 gap-y-2 text-[12.5px] text-ink-3 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1">
          <span><kbd>A</kbd>–<kbd>H</kbd> mode</span><span><kbd>Z</kbd><kbd>X</kbd><kbd>C</kbd> pillar</span>
          <span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> without you, save</span><span><kbd>0</kbd> discard</span><span><kbd>⇧0</kbd> discard all routine</span><span><kbd>J</kbd><kbd>K</kbd> move</span>
          <span><kbd>T</kbd> edit title</span><span><kbd>E</kbd> edit summary</span><span><kbd>V</kbd> evidence</span><span><kbd>O</kbd> open evidence</span><span><kbd>P</kbd> project</span><span><kbd>L</kbd> goal</span><span><kbd>?</kbd> hide</span></div>
      </main>
    </div>
  </section>;
}

// One segment per value. Yours is filled; Claude's pick has a dot.
function Seg({ label, opts, keys, value, sug, color, set }: { label: string; opts: Record<string, string>; keys: string[]; value: string; sug: string; color?: (k: string) => string; set: (v: string) => void }) {
  return <div role="group" aria-label={label} className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-xl border border-line bg-s2 p-0.75">{Object.keys(opts).map((k, i) =>
    <button key={k} aria-pressed={value === k} title={`${opts[k]} (${keys[i]!.toUpperCase()})${sug === k ? " · Claude's pick" : ""}`} onClick={() => set(k)}
      style={{ "--c": color?.(k) ?? "var(--ink-2)" } as React.CSSProperties}
      className="relative inline-flex cursor-pointer items-center gap-1.75 rounded-[9px] px-3 py-1.75 text-[13.5px] text-ink-2 hover:bg-s3 hover:text-ink aria-pressed:bg-s1 aria-pressed:text-ink aria-pressed:shadow-[inset_0_0_0_1.5px_var(--c),0_0_14px_-6px_var(--c)]">
      {color && <i className="size-2.25 rounded-full" style={{ background: color(k) }} />}{opts[k]}
      <kbd className="h-4 min-w-4 border-b px-0.75 text-[9.5px] opacity-55">{keys[i]!.toUpperCase()}</kbd>
      {sug === k && <i className="absolute top-1 right-1 size-1.5 rounded-full bg-ink-3" />}</button>)}</div>;
}

export const View = ({ p }: { p: URLSearchParams }) => <Review p={p} />;
