// PROJECT: one project, all of it. Sources on top; every thread opens to its events.
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight } from "lucide-react";
import { By, post, Strip, toast } from "./lib";
import { small, Src, threads } from "./projects";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";
import { NativeSelect } from "./ui/input";

type D = any;
// Event kinds as people say them, like review does.
const KIND: Record<string, string> = { pr_merged: "PR merged", pr_open: "PR open", issue_completed: "issue done", issue_open: "issue open",
  review_comment: "review received", reviews_given: "reviews given", slack_message: "Slack", slack_mention: "mention",
  meeting: "meeting", doc_created: "doc created", doc_edited: "doc edited" };
const review = (t: D, id: string) => `#/review?week=${t.week}&key=${encodeURIComponent(t.key)}&from=${encodeURIComponent(id)}`;
const crumb = "font-mono text-xs font-medium text-ink-3 no-underline hover:text-brand";
const banner = "flex flex-wrap items-center gap-2.5 rounded-xl border border-line-2 bg-secondary px-3.5 py-2.5 text-[13.5px] text-ink-2";
const Crumb = () => <a className={cn(crumb, "justify-self-start")} href="#/projects">← Projects</a>;

function Project({ pid }: { pid: string }) {
  const [id, setId] = useState(pid), [d, setD] = useState<D>(null), [all, setAll] = useState<D[]>([]), [missing, setMissing] = useState(false);
  const [openT, setOpenT] = useState(new Set<string>()), [showGone, setShowGone] = useState(false);
  const [merging, setMerging] = useState(false), [pick, setPick] = useState(""), [deleting, setDeleting] = useState(false);
  async function load(at: string) {
    const r = await fetch(`/api/project?id=${encodeURIComponent(at)}`);
    if (!r.ok) return setMissing(true);
    const j = await r.json();
    // A merged project lives inside another one now: go there.
    if (j.into) { history.replaceState(null, "", `#/project?id=${encodeURIComponent(j.into)}`); setId(j.into); return load(j.into); }
    setAll((await (await fetch("/api/groups")).json()).groups); setD(j);
  }
  useEffect(() => { setId(pid); setD(null); setMissing(false); setOpenT(new Set()); setShowGone(false); setMerging(false); setDeleting(false); load(pid); }, [pid]);
  async function act(url: string, body: unknown, done: string) {
    const r = await post(url, body);
    if (!r.ok) return toast(await r.text());
    toast(done); setMerging(false); setPick(""); await load(id);
  }
  async function del() {
    const r = await post("/api/delete", { id });
    if (!r.ok) return toast(await r.text());
    toast(`Deleted ${d.project.name}`); location.hash = "#/projects";
  }

  if (missing) return <p className="p-10 text-center text-ink-2">This project does not exist. <a className="underline" href="#/projects">Back to projects</a></p>;
  if (!d) return <p className="p-10 text-center text-ink-2">Loading project…</p>;
  const p = d.project, many = d.sources.length > 1, src = new Map(d.sources.map((s: D) => [s.id, s]));
  const head = (extra?: React.ReactNode) => <div className="vhead -mt-3"><h1 className="text-[clamp(28px,3.6vw,44px)]">{p.name}</h1>{extra}</div>;
  if (d.deleted) return <><Crumb />{head()}
    <div className={banner}>You deleted this project, so its threads have no project. <Button variant="dashed" size="xs" onClick={() => act("/api/restore", { id }, "Restored")}>restore</Button></div></>;
  const live = d.threads.filter((t: D) => !t.discarded), gone = d.threads.length - live.length;
  const ts = showGone ? d.threads : live, next = live.find((t: D) => !t.decided), todo = live.filter((t: D) => !t.decided).length;
  const max = Math.max(1, ...d.weeks.map((w: string) => live.filter((t: D) => t.week === w).length));
  const others = all.filter((g: D) => g.id !== p.id), name = others.find((g: D) => g.id === pick)?.name;
  const facts = [p.status, d.open ? `${d.open} open issues` : "", p.lead ? `lead ${p.lead}` : ""].filter(Boolean).join(" · ");
  const wks = d.weeks.filter((w: string) => ts.some((t: D) => t.week === w));
  const toggle = (k: string) => setOpenT((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return <>
    <Crumb />
    {head(next ? <a href={review(next, id)} className="rounded-lg border border-brand/50 px-3 py-2 font-mono text-[13px] font-medium tracking-wider text-brand uppercase no-underline hover:bg-brand/10">{`${todo} to review →`}</a>
      : <span className="lbl">all reviewed ✓</span>)}
    <Card className="grid-cols-1 gap-x-7 gap-y-4 shadow-none sm:p-5.5 md:grid-cols-2">
      <div className="grid content-start gap-2.5"><span className="lbl">Sources</span>
        <ul className="m-0 grid list-none gap-2 p-0">{d.sources.map((s: D, i: number) => <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span><Src kind={s.kind} />{s.name}</span><span className="lbl">{s.kind === "topic" ? "topic" : "Linear"}</span>
          {s.url && <a href={s.url} target="_blank" rel="noopener" aria-label="Open in Linear" className="text-ink-3 hover:text-brand"><ArrowUpRight className="size-4" /></a>}
          {i > 0 && <Button variant="dashed" size="xs" onClick={() => act("/api/unmerge", { from: s.id }, "Split out again")}>split out</Button>}</li>)}
          {/* Picking a project shows a button that names exactly what will happen; pressing it confirms. */}
          <li className="flex flex-wrap items-center gap-2">{merging ? <>
            <NativeSelect autoFocus aria-label="Project to merge in" className="h-8 w-auto px-2 font-mono text-xs" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Pick a project to merge in…</option>{others.map((g: D) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect>
            {name && <Button variant="dashed" size="xs" onClick={() => act("/api/merge", { from: pick, into: id }, `Merged ${name}`)}>{`merge ${name} in`}</Button>}
            <Button variant="dashed" size="xs" onClick={() => { setMerging(false); setPick(""); }}>cancel</Button></>
            : others.length > 0 && <Button variant="dashed" size="xs" onClick={() => setMerging(true)}>＋ merge another project in</Button>}</li></ul>
        {deleting ? <div className={cn(banner, "border-brand/45")}>{`Delete ${p.name}? ${threads(live.length)} will have no project${many ? ", and the merged projects stand alone again" : ""}. You can restore it from the list.`}
            <span className="flex gap-2"><Button variant="dashed-destructive" size="xs" onClick={del}>delete</Button><Button variant="dashed" size="xs" onClick={() => setDeleting(false)}>cancel</Button></span></div>
          : <Button variant="dashed-destructive" size="xs" className="justify-self-start" onClick={() => setDeleting(true)}>delete project</Button>}</div>
      <div className="grid content-start gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Goals this project serves"><span className="lbl">Serves</span>{d.goals.length
          ? d.goals.map((g: D) => <Button key={g.id} variant="outline" size="xs" aria-pressed={!!g.on_}
              className="rounded-full border-dashed bg-transparent px-2.5 text-xs font-medium text-ink-2 aria-pressed:border-solid aria-pressed:border-ink-2 aria-pressed:bg-s3 aria-pressed:text-ink"
              onClick={() => act("/api/goal-link", { goal_id: g.id, project_id: id, on: !g.on_ }, g.on_ ? `No longer serves ${g.title}` : `Serves ${g.title}`)}>{g.title}</Button>)
          : <a className={crumb} href="#/goals">no goals yet · add one →</a>}</div>
        {facts && <By className="text-xs">{facts}</By>}
        {d.ms.map((m: D) => <div key={m.name} className="grid grid-cols-[1fr_90px_40px] items-center gap-2.5 text-[12.5px] text-ink-2"><span>{m.name}</span>
          <span className="h-1.5 overflow-hidden rounded-sm bg-s3"><i className="block h-full rounded-sm bg-brand" style={{ width: `${m.progress || 0}%` }} /></span>
          <b className="text-right font-num text-[13px] font-bold text-ink">{m.progress == null ? "—" : `${m.progress}%`}</b></div>)}</div>
    </Card>
    <Strip weeks={d.weeks} count={(w) => live.filter((t: D) => t.week === w).length} max={max} />
    <div className="grid gap-3.5">{wks.length ? wks.map((w: string) =>
      <div key={w} className="grid gap-1 md:grid-cols-[44px_1fr] md:gap-3"><span className="lbl pt-3">{w.slice(5)}</span>
        <ul className="m-0 grid list-none gap-1.5 p-0">{ts.filter((t: D) => t.week === w).map((t: D) => { const o = openT.has(t.key);
          return <li key={t.key} className={cn("rounded-xl border border-line bg-card", t.discarded && "opacity-55")}>
            <button aria-expanded={o} onClick={() => toggle(t.key)}
              className="flex w-full cursor-pointer items-baseline gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] focus-visible:outline-2 focus-visible:outline-brand">
              {o ? <ChevronDown className="size-3.5 flex-none self-center text-ink-3" /> : <ChevronRight className="size-3.5 flex-none self-center text-ink-3" />}
              <b className="font-medium">{t.title ?? "Untitled"}</b><By>{t.events.length}</By>
              {t.discarded ? <span className="lbl">discarded</span> : t.decided ? <Check className="size-3.5 flex-none self-center text-ok" aria-label="You decided this" />
                : <span className="font-mono text-[11px] font-medium tracking-wider text-brand uppercase">to review</span>}</button>
            {o && <><ul className="m-0 list-none border-t border-line px-3.5 py-0">{t.events.map((e: D) => { const s: D = src.get(e.source);
              return <li key={e.id} className="grid gap-0.5 border-t border-line py-2 text-[13.5px] first:border-t-0 md:grid-cols-[110px_minmax(0,1fr)_auto] md:gap-3">
                <By className="pt-0.5 text-[11px]">{KIND[e.kind] ?? e.kind}</By>
                <span className="wrap-anywhere">{e.url ? <a href={e.url} target="_blank" rel="noopener" className="hover:text-brand">{e.title ?? e.id}<ArrowUpRight className="ml-0.5 inline size-3.5 text-ink-3" /></a> : e.title ?? e.id}</span>
                {many && s ? <By className="inline-flex items-center whitespace-nowrap text-[11px]"><Src kind={s.kind} />{s.name}</By> : <span />}</li>; })}</ul>
              <div className="flex flex-wrap items-center gap-2.5 border-t border-line px-3.5 py-2.5">
                <Button asChild variant="dashed" size="xs"><a href={review(t, id)} className="no-underline">open in review →</a></Button>
                <NativeSelect className={small} value="" aria-label="Move this thread" onChange={(e) => { const g = others.find((x: D) => x.id === e.target.value);
                  if (g) act("/api/group", { week: t.week, key: t.key, group_id: g.id }, `Moved to ${g.name}`); }}>
                  <option value="">Move to another project…</option>{others.map((g: D) => <option key={g.id} value={g.id}>{g.name}</option>)}</NativeSelect></div></>}</li>; })}</ul></div>)
      : <span className="lbl">No threads yet. Pick this project for a thread in review with P.</span>}</div>
    {gone > 0 && <Button variant="dashed" size="xs" className="justify-self-start" onClick={() => setShowGone(!showGone)}>{`${showGone ? "hide" : "show"} ${gone} discarded`}</Button>}
  </>;
}

export const View = ({ p }: { p: URLSearchParams }) => <section className="view" id="v-project"><div className="grid gap-5"><Project pid={p.get("id") ?? ""} /></div></section>;
