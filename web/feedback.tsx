// FEEDBACK: how you show up, from your own messages. The experiment first, then each pattern
// with your words and a stronger version.
// Color map: brand = the weak pattern (its phrases, its counts), ink = the stronger rewrite,
// dashed + pulse = next week's count, not measured yet, --m-build = what to keep doing.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Check, ChevronRight, X } from "lucide-react";
import { post, reduced, toast, useNorth } from "./lib";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";
import { Input } from "./ui/input";

type D = any;
const wk = (w: string) => w.slice(5);
const nextWeek = (w: string) => `W${String(+w.slice(6) + 1).padStart(2, "0")}`; // ponytail: W53 and New Year are not handled
const sum = (t: number[]) => t.reduce((a, b) => a + b, 0);
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmtWhen = (t: number) => { const d = new Date(t); return `${DOW[(d.getDay() + 6) % 7]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const when = (e: D) => `${e.channel} · ${wk(e.week)}${e.at ? ` · ${fmtWhen(Date.parse(e.at))}` : ""}`;
const reOf = (markers: string[], f: string) => new RegExp(markers.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), f);
const items = (f: D) => [...f.patterns.map((p: D) => ({ ...p, key: `pattern:${p.name}` })), ...(f.strength ? [{ ...f.strength, keep: true, key: "strength" }] : [])];
const vdOf = (f: D, key: string) => f?.verdicts?.[key]?.v as "accept" | "reject" | undefined;
// What a verdict does, said where you made it.
const NOTE: Record<string, Record<string, string>> = {
  pattern: { accept: "Accepted. Claude keeps tracking it next week, and its count shows there.",
    reject: "Rejected. Next week Claude leaves it out, unless new messages show it clearly. A reason helps it learn what you mean." },
  strength: { accept: "Accepted. Claude keeps it as a strength to build on.", reject: "Rejected. Claude will not call this a strength again without new evidence." },
  experiment: { accept: "Next Monday counts these phrases in {w} and shows before → after here.", reject: "Passed. Next week Claude proposes a different experiment, and nothing is measured for this one." },
};
const say = (msg: string) => toast(msg, 2200);

// Wrap the pattern's phrases in <mark>, so you see which words carry it. The highlight grows in once the card is "on".
function Marked({ text, markers }: { text: string; markers?: string[] }) {
  if (!markers?.length) return <>{text}</>;
  const out: React.ReactNode[] = []; let i = 0;
  for (const m of text.matchAll(reOf(markers, "gi"))) {
    out.push(text.slice(i, m.index), <mark key={m.index} className="rounded-xs bg-transparent bg-[linear-gradient(color-mix(in_srgb,var(--accent)_38%,transparent),color-mix(in_srgb,var(--accent)_38%,transparent))] bg-size-[0%_45%] bg-bottom-left bg-no-repeat px-0.5 text-ink transition-[background-size] duration-550 ease-[cubic-bezier(.16,1,.3,1)] group-data-on:bg-size-[100%_45%]">{m[0]}</mark>);
    i = m.index! + m[0].length;
  }
  return <>{out}{text.slice(i)}</>;
}
const Mk = ({ markers }: { markers: string[] }) => <span className="inline-flex flex-wrap gap-1.25">{markers.map((m) =>
  <code key={m} className="rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,var(--s3))] px-1.75 py-0.75 font-mono text-[11.5px] font-medium text-ink">{m}</code>)}</span>;
const Slack = ({ url }: { url?: string | null }) => url ? <a className="ref ml-auto" href={url} target="_blank" rel="noopener">open in Slack ↗</a> : null;
const Fold = ({ className, children, summary }: { className?: string; summary: React.ReactNode; children: React.ReactNode }) =>
  <details className={cn("group/f", className)}><summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">{summary}
    <ChevronRight className="size-3 text-ink-3 transition-transform group-open/f:rotate-90" aria-hidden="true" /></summary>{children}</details>;

// Count per week, the last bar is this week. `next` adds next week's bar: dashed, not measured yet.
function Bars({ t, weeks, next, h }: { t: number[]; weeks: string[]; next?: string; h: number }) {
  const mx = Math.max(1, ...t), cols = { gridTemplateColumns: `repeat(${t.length + (next ? 1 : 0)}, minmax(0, 1fr))` };
  return <div className="grid gap-2" aria-hidden="true">
    <div className="grid items-end gap-1.5" style={{ ...cols, height: h + 28 }}>{t.map((c, k) =>
      <div key={k} className="flex h-full flex-col items-center justify-end gap-1.25">
        <em className="font-num text-xs font-semibold text-ink-3 not-italic tabular-nums">{c}</em>
        <i data-bar className={cn("block w-full origin-bottom rounded-t-sm rounded-b-xs", k === t.length - 1 ? "bg-brand shadow-[0_0_18px_-4px_var(--accent)]" : "bg-[color-mix(in_srgb,var(--accent)_45%,var(--s3))]")}
          style={{ height: c / mx * h + 3 }} /></div>)}
      {next && <div className="flex h-full flex-col items-center justify-end gap-1.25" title="Measured after the next collection">
        <em className="font-num text-xs font-semibold text-ink-2 not-italic">?</em>
        <i className="block w-full animate-[fb-pulse_2.4s_ease-in-out_infinite] rounded-t-sm rounded-b-xs border-[1.5px] border-dashed border-input motion-reduce:animate-none" style={{ height: h }} /></div>}</div>
    <div className="grid gap-1.5 text-center font-mono text-[10.5px] font-medium text-ink-3" style={cols}>{weeks.map((w) => <span key={w}>{wk(w)}</span>)}
      {next && <span className="text-ink">{next}</span>}</div>
    <style>{"@keyframes fb-pulse{50%{opacity:.45}}"}</style></div>;
}

// Keys A and R judge the pattern in focus, so only its buttons show them.
function Verdict({ v, set, yes = "Accept", no = "Reject", keys = true }: { v?: string; set: (v: "accept" | "reject") => void; yes?: string; no?: string; keys?: boolean }) {
  const b = "bg-secondary font-normal text-ink-2 hover:text-ink";
  return <div className="flex flex-wrap gap-1.5" role="group" aria-label="Your verdict">
    <Button variant="outline" size="sm" aria-pressed={v === "accept"} onClick={() => set("accept")}
      className={cn(b, "aria-pressed:border-(--m-build) aria-pressed:bg-[color-mix(in_srgb,var(--m-build)_15%,var(--s2))] aria-pressed:text-ink")}><Check />{yes}{keys && <kbd className="h-4.5 min-w-4.5 border-b-2 text-[10px]">A</kbd>}</Button>
    <Button variant="outline" size="sm" aria-pressed={v === "reject"} onClick={() => set("reject")}
      className={cn(b, "aria-pressed:border-brand aria-pressed:bg-[color-mix(in_srgb,var(--accent)_13%,var(--s2))] aria-pressed:text-ink")}><X />{no}{keys && <kbd className="h-4.5 min-w-4.5 border-b-2 text-[10px]">R</kbd>}</Button></div>;
}
const Note = ({ children }: { children: string }) => <p className="m-0 rounded-lg border border-line bg-secondary px-3.5 py-2.5 text-[13.5px] leading-normal text-ink-2" role="status">{children}</p>;
function Why({ why, save }: { why?: string | null; save: (why: string) => void }) {
  return <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); save(String(new FormData(e.currentTarget).get("why"))); }}>
    <Input id="fb-why" name="why" maxLength={400} autoComplete="off" defaultValue={why ?? ""} aria-label="Why you rejected it"
      placeholder="What is wrong with it? Claude reads this next week." className="min-w-[min(260px,100%)] flex-1 bg-s1" />
    <Button variant="secondary" className="border border-input bg-s3">Save reason</Button></form>;
}

// Why a pattern counts: its first source, the rest on the References page.
function Source({ cats, it }: { cats: D[]; it: D }) {
  const x = cats.find((c) => c.id === it.category && c.kind === (it.keep ? "strength" : "pattern"))?.refs[0];
  if (!x) return null;
  return <Fold className="fb-a" summary={<span className="font-mono text-xs font-medium text-ink-3 hover:text-ink">{`Why this counts · ${x.who.split(",")[0]}`}</span>}>
    <div className="mt-2 flex max-w-[62ch] flex-wrap gap-x-3.5 gap-y-1 rounded-xl border border-line bg-secondary px-3.5 py-3">
      <p className="m-0 w-full text-sm leading-normal">{x.q ? `“${x.q}”` : x.says}</p>
      <a className="ref" href={x.url} target="_blank" rel="noopener">{x.who} ↗</a>{x.warn && <span className="ref">{x.warn}</span>}<a className="ref" href="#/refs?k=feedback">all sources →</a></div></Fold>;
}

function Quote({ x, it, on }: { x: D; it: D; on: boolean }) {
  return <article data-on={on || undefined} className={cn("group grid gap-3 rounded-xl border border-line bg-secondary px-4.5 py-4", it.keep && "border-[color-mix(in_srgb,var(--m-build)_35%,var(--line))]")}>
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 font-mono text-[11.5px] font-medium text-ink-3"><span>{when(x)}</span><Slack url={x.url} /></div>
    <p className="m-0 text-[15.5px] leading-normal text-ink-2">“<Marked text={x.quote} markers={it.markers} />”</p>
    {x.instead && <div data-now className="grid gap-1 border-t border-dashed border-input pt-3"><span className="font-mono text-[10.5px] font-medium tracking-wider text-ink-3 uppercase">Next time</span>
      <p className="m-0 text-[15.5px] leading-normal font-medium text-ink">{x.instead}</p></div>}</article>;
}

function Focus({ f, it, cats, note, set }: { f: D; it: D; cats: D[]; note: boolean; set: (key: string, v: string | null, why?: string) => void }) {
  const ref = useRef<HTMLDivElement>(null), [on, setOn] = useState(false), v = vdOf(f, it?.key);
  // Diagnosis, then the fix: the card comes in, its weak words get marked, then the stronger version appears.
  useLayoutEffect(() => {
    if (reduced() || !ref.current) { setOn(true); return; }
    const ctx = gsap.context(() => {
      gsap.from("[data-bar]", { scaleY: 0, duration: .6, ease: "expo.out", stagger: .04, clearProps: "transform" });
      gsap.from(".fb-a", { opacity: 0, y: 8, filter: "blur(6px)", duration: .45, ease: "power3.out", stagger: .04, clearProps: "all" });
      gsap.utils.toArray<HTMLElement>("article").forEach((c, k) => {
        gsap.from(c, { opacity: 0, y: 12, duration: .45, ease: "power3.out", delay: .12 + k * .1, clearProps: "all" });
        const now = c.querySelector("[data-now]"); if (now) gsap.from(now, { opacity: 0, x: -8, filter: "blur(4px)", duration: .5, ease: "power3.out", delay: .75 + k * .1, clearProps: "all" });
      });
    }, ref);
    const t = setTimeout(() => setOn(true), 320);
    return () => { ctx.revert(); clearTimeout(t); };
  }, []);
  if (!it) return <p className="m-0 p-6 text-[15px] text-ink-2">No pattern stood out in these weeks.</p>;
  const [first, ...rest] = it.evidence as D[], more: D[] = it.matches ?? [];
  // Two quotes can come from one message: count messages, so the numbers add up to the total.
  const quoted = it.keep ? 0 : new Set(it.evidence.filter((x: D) => reOf(it.markers, "i").test(x.quote)).map((x: D) => x.at + x.channel)).size;
  const label = [rest.length && `${rest.length} more example${rest.length > 1 ? "s" : ""}`, more.length && `${more.length} more message${more.length > 1 ? "s" : ""}`, !it.keep && "8-week count"].filter(Boolean).join(" · ");
  return <div ref={ref} role="tabpanel" className={cn("grid gap-4 px-[clamp(16px,2.6vw,30px)] py-6", v === "reject" && "[&_.fb-q]:opacity-45")}>
    <div className="fb-a flex flex-wrap items-center justify-between gap-2.5"><h2 className="m-0 font-num text-[clamp(24px,2.6vw,34px)] leading-[1.02] font-extrabold text-balance uppercase">{it.name}</h2>
      <Verdict v={v} set={(x) => set(it.key, v === x ? null : x)} /></div>
    {note && v && <Note>{NOTE[it.keep ? "strength" : "pattern"]![v]!}</Note>}
    {v === "reject" && <Why why={f.verdicts[it.key].why} save={(why) => set(it.key, "reject", why)} />}
    <p className="fb-a m-0 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">{it.why}</p>
    <Source cats={cats} it={it} />
    <div className="fb-q grid gap-2.5 transition-opacity">{first && <Quote x={first} it={it} on={on} />}</div>
    {label && <Fold summary={<span className="py-1.5 text-[13.5px] text-ink-2 hover:text-ink">{label}</span>}><div className="mt-2.5 grid gap-3">
      {!it.keep && <div className="grid gap-2"><p className="m-0 text-[13.5px] text-ink-2"><b>{sum(it.trend)}</b> messages with <Mk markers={it.markers} />:
        {` ${quoted} quoted with a stronger version${more.length ? `, ${more.length} more below` : ""}.`}{it.evidence.length > quoted ? ` ${it.evidence.length - quoted} quoted say it in other words, not counted.` : ""}</p>
        <Bars t={it.trend} weeks={f.weeks} h={40} /></div>}
      {rest.length > 0 && <div className="fb-q grid gap-2.5 transition-opacity">{rest.map((x, k) => <Quote key={k} x={x} it={it} on />)}</div>}
      {more.length > 0 && <ol className="m-0 grid list-none gap-2 p-0">{more.map((m, k) => <li key={k} data-on className="group grid gap-1 rounded-xl border border-dashed border-input px-3.5 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2.5 font-mono text-[11.5px] font-medium text-ink-3"><span>{when(m)}</span><Slack url={m.url} /></div>
        <p className="m-0 text-sm leading-normal text-ink-2"><Marked text={m.text} markers={it.markers} /></p></li>)}</ol>}</div></Fold>}
  </div>;
}

// This week's one action, and the count that measures it, with next week still to come.
function Experiment({ f, e, v, note, set }: { f: D; e: D; v?: string; note: boolean; set: (v: string | null, why?: string) => void }) {
  const ref = useRef<HTMLDivElement>(null), t: number[] | undefined = e.trend;
  useLayoutEffect(() => {
    if (reduced() || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-bar]", { scaleY: 0, duration: .7, ease: "expo.out", stagger: .05, clearProps: "transform" });
      gsap.from("[data-do]", { opacity: 0, y: 10, filter: "blur(6px)", duration: .6, ease: "power3.out", clearProps: "all" });
    }, ref);
    return () => ctx.revert();
  }, [f.week]);
  const dim = v === "reject" && "opacity-45";
  return <div ref={ref} className="relative grid gap-x-10 gap-y-7 overflow-hidden rounded-2xl border border-line bg-card px-[clamp(18px,3vw,34px)] py-7 shadow-card min-[861px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
    <div aria-hidden="true" className="pointer-events-none absolute inset-[-40%_-20%_auto_45%] h-[160%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent)_13%,transparent),transparent)]" />
    <div className="relative grid content-start"><span className="lbl">Try this week</span>
      <p data-do className={cn("mt-3 mb-4 text-[clamp(21px,2.3vw,29px)] leading-[1.28] font-semibold tracking-[-.01em] text-balance", dim)}>{e.do}</p>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-ink-3"><span>Measured by</span><Mk markers={e.markers} /></div>
      <div className="mt-4.5 grid gap-3"><Verdict v={v} set={(x) => set(v === x ? null : x)} yes="I'll try it" no="Not this one" keys={false} />
        {note && v && <Note>{NOTE.experiment![v]!.replace("{w}", nextWeek(f.week))}</Note>}
        {v === "reject" && <Why why={f.verdicts.experiment.why} save={(why) => set("reject", why)} />}</div></div>
    {t && <div className={cn("relative grid content-end gap-2", dim)}>
      <span className="text-[13px] text-ink-2"><b className="mr-1.5 font-num text-[34px] leading-none font-extrabold text-ink tabular-nums">{sum(t)}</b>{`messages with these phrases in 8 weeks, ${t.at(-1)} in ${wk(f.week)}`}</span>
      <Bars t={t} weeks={f.weeks} next={nextWeek(f.week)} h={84} /></div>}
  </div>;
}

export function Feedback({ p }: { p: URLSearchParams }) {
  const [d, refresh] = useNorth(), [fb, setFb] = useState<D[] | null>(null);
  const [w, setW] = useState(0), [i, setI] = useState(+(p.get("p") ?? 0) || 0), [just, setJust] = useState<string | null>(null), [ask, setAsk] = useState(0);
  // The server's copy wins each time it comes back; in between, a verdict shows at once.
  useEffect(() => { if (!d) return; const all = d.FEEDBACK ?? [];
    if (!fb) setW(Math.max(0, all.findIndex((f: D) => wk(f.week) === p.get("w")))); setFb(all); }, [d]);
  useEffect(() => { if (ask) document.getElementById("fb-why")?.focus(); }, [ask]);
  const f = fb?.[w], its = f ? items(f) : [], at = Math.min(i, Math.max(0, its.length - 1)), it = its[at];
  useEffect(() => { if (f) history.replaceState(null, "", `#/feedback?w=${wk(f.week)}&p=${at}`); }, [f?.week, at]);

  async function set(key: string, v: string | null, why?: string) {
    const old = f.verdicts?.[key], put = (x: D) => setFb((all) => all!.map((g, k) => {
      if (k !== w) return g; const vs = { ...g.verdicts }; if (x) vs[key] = x; else delete vs[key]; return { ...g, verdicts: vs }; }));
    setJust(key); put(v && { v, why: why ?? null });
    // The example has no server behind it: the verdict lives on this page only.
    if (d!.SAMPLE) return say(v ? (v === "accept" ? "Accepted (example only)" : "Rejected (example only)") : "Taken back");
    const r = await post("/api/feedback", { week: f.week, item: key, verdict: v, why }).catch(() => null);
    if (!r?.ok) { put(old); return say(`Not saved: ${r ? await r.text() : "server not reachable"}`); }
    say(why != null ? "Reason saved. Claude reads it next week." : !v ? "Taken back" : v === "accept" ? "Accepted" : "Rejected. Say why, and Claude learns from it.");
    if (v === "reject" && why == null) setAsk((n) => n + 1);
    refresh();
  }
  // A and R judge the pattern in focus, the way Review takes keys.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest?.("input, textarea, select") || document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase(); if (!it || (k !== "a" && k !== "r")) return;
      const v = k === "a" ? "accept" : "reject"; set(it.key, vdOf(f, it.key) === v ? null : v);
    };
    document.addEventListener("keydown", on); return () => document.removeEventListener("keydown", on);
  });

  const e = f?.experiment, pv = f?.previous;
  const lead = f && (f.messages.at(-1) || f.patterns.length) ? `${sum(f.messages)} of your Slack messages · ${wk(f.weeks[0])}–${wk(f.weeks.at(-1))}` : "";
  let body: React.ReactNode;
  if (!fb) body = <p className="p-10 text-center text-ink-2">Loading feedback…</p>;
  else if (!f) body = <Card className="p-10 text-center text-ink-2 sm:p-10">Your first feedback comes with the next collection, on Monday at 18:00. Claude reads the Slack messages you wrote that week and the 7 before it.</Card>;
  else body = <>
    {fb.length > 1 && <div className="flex flex-wrap gap-1.5" role="group" aria-label="Feedback week">{fb.map((x, k) =>
      <Button key={x.week} variant="outline" size="xs" aria-pressed={k === w} onClick={() => { setW(k); setI(0); setJust(null); }}
        className="rounded-full px-3 font-num text-xs font-semibold tracking-[.08em] text-ink-3 aria-pressed:border-ink-3 aria-pressed:text-ink">{wk(x.week)}</Button>)}</div>}
    {!lead ? <Card className="p-10 text-center text-ink-2 sm:p-10">{`You wrote no Slack messages in ${wk(f.week)}, so there is no feedback for it.`}</Card> : <>
      {pv?.do && <Fold className="rounded-xl border border-dashed border-input px-4.5 py-3 text-sm text-ink-2" summary={<span className="flex items-baseline gap-3.5"><span className="lbl">{`Last experiment · ${wk(pv.week)}`}</span>
          {pv.before != null && pv.after != null && <span className="font-mono text-sm font-semibold text-ink">{`${pv.before} → ${pv.after}`}</span>}</span>}>
        <p className="mt-2 mb-0">{pv.do}</p>{f.last_experiment && <p className="mt-2 mb-0">{f.last_experiment}</p>}</Fold>}
      {e && <Experiment key={f.week} f={f} e={e} v={vdOf(f, "experiment")} note={just === "experiment"} set={(x, why) => set("experiment", x, why)} />}
      <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <div className="flex gap-0.5 overflow-x-auto border-b border-line bg-[color-mix(in_srgb,var(--s2)_60%,transparent)] px-2 pt-2 [scrollbar-width:none]" role="tablist" aria-label="What Claude saw">{its.map((x: D, k: number) => {
          const v = vdOf(f, x.key);
          return <button key={x.key} role="tab" aria-selected={k === at} onClick={() => { setI(k); setJust(null); }}
            className={cn("grid max-w-65 flex-none cursor-pointer gap-0.75 rounded-t-lg border-b-2 border-transparent px-4 pt-2.75 pb-3 text-left text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] aria-selected:bg-s1",
              x.keep ? "aria-selected:border-b-(--m-build)" : "aria-selected:border-b-brand")}>
            <b className={cn("flex items-center gap-1 text-sm leading-tight font-semibold", k === at ? "text-ink" : "text-ink-2", v === "reject" && "line-through decoration-ink-3")}>{x.keep && <Check className="size-3.5 shrink-0" aria-hidden="true" />}{x.name}</b>
            <small className="font-mono text-[11.5px] font-medium text-ink-3">{v === "accept" ? <><span className="text-(--m-build)">accepted</span> · </> : v === "reject" ? "rejected · " : ""}
              {x.keep ? "keep doing" : `${sum(x.trend)} messages`}</small></button>; })}</div>
        <Focus key={`${f.week}:${at}`} f={f} it={it} cats={d?.FB_CATS ?? []} note={just === it?.key} set={set} /></div></>}</>;
  return <section className="view" id="v-feedback">
    {d?.SAMPLE && <a className="block rounded-xl border border-dashed border-input bg-secondary px-3.5 py-2.5 text-[13.5px] text-ink-2 no-underline" href="#/setup">Example feedback, not yours. Yours comes with your first collection.</a>}
    <div className="vhead"><h1>How I <em>show up</em></h1><p>{lead}</p></div>
    <div className="grid gap-3.5">{body}</div>
  </section>;
}

export const View = ({ p }: { p: URLSearchParams }) => <Feedback p={p} />;
