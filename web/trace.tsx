// TRACE: your weeks as traces. A week is a trace, a kept thread is a span, its PRs, issues and
// messages are span events. Explorer heatmap on top (drag to brush weeks), waterfall, side panel.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ChevronDown, ChevronRight, Maximize2, Play } from "lucide-react";
import { cnt, MODES, mc, openItem, PILLAR, reduced, useNorth, WMS, yearOf, type North } from "./lib";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";

type D = any;
const DAY = 864e5, DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EVK: Record<string, string> = { pr_merged: "PR merged", pr_open: "PR opened", issue_completed: "issue done", issue_open: "issue open", review_comment: "review received",
  reviews_given: "reviews given", slack_message: "Slack", slack_mention: "mention", meeting: "meeting", doc_created: "doc created", doc_edited: "doc edited" };
// Heatmap rows, longest on top like a duration axis: label and lower bound in hours.
const BUCKETS: [string, number][] = [["3d +", 72], ["1–3 d", 24], ["< 1 d", .25], ["instant", 0]];
const monday = (d: North, w: number) => { const y = yearOf(d, w), j = new Date(y, 0, 4); return new Date(y, 0, 4 - (j.getDay() + 6) % 7 + (+d.WEEKS[w]!.slice(1) - 1) * 7).getTime(); };
const fmtDay = (t: number) => new Date(t).toLocaleDateString("en", { month: "short", day: "numeric" });
const fmtWhen = (t: number) => { const d = new Date(t); return `${DOW[(d.getDay() + 6) % 7]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fmtDur = (i: D) => { const h = i.hrs; if (h == null) return "no time"; if (h < 1 / 60) return "instant"; if (h < 1) return `${Math.round(h * 60)}m`;
  return h < 24 ? `${Math.floor(h)}h ${Math.round(h % 1 * 60)}m` : `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`; };
const pctOf = <T,>(xs: T[], f: (x: T) => boolean) => xs.length ? xs.filter(f).length / xs.length : 0;
const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const posIn = (d: North, w: number) => { const m0 = monday(d, w); return (t: number) => Math.min(100, Math.max(0, (t - m0) / (7 * DAY) * 100)); };
const swatch = "inline-block h-1.5 w-3.5 flex-none rounded-[2px] bg-(--c)";
const rule = "border-b border-[color-mix(in_srgb,var(--line)_55%,transparent)]";
const cvar = (c: string) => ({ "--c": c }) as React.CSSProperties;

// Each thread's start, end and duration, from its timed events.
function spans(d: North) {
  return d.ITEMS.map((it: D) => {
    const ev = it.ev ?? [], ts = ev.filter((e: D) => e[1]).map((e: D) => Date.parse(e[1]));
    const t0 = ts.length ? Math.min(...ts) : null, t1 = ts.length ? Math.max(...ts) : null, hrs = t0 == null ? null : (t1! - t0) / 36e5;
    const day = t0 == null ? 0 : Math.min(6, Math.max(0, Math.floor((t0 - monday(d, it.w)) / DAY)));
    return { ...it, ev, t0, t1, hrs, day, b: hrs == null ? 3 : BUCKETS.findIndex(([, lo]) => hrs >= lo) };
  });
}

export function Trace({ p }: { p: URLSearchParams }) {
  const [d] = useNorth();
  const items = useMemo(() => d ? spans(d) : [], [d]);
  const [sel, setSel] = useState<Set<number> | null>(null), [span, setSpan] = useState<string | null>(null), [roots, setRoots] = useState(new Set<number>());
  const [tf, setTf] = useState<{ mode: string | null; crit: boolean }>({ mode: null, crit: false });
  const [preview, setPreview] = useState<Set<number> | null>(null), [hover, setHover] = useState<D>(null), [playN, setPlayN] = useState(0);
  const brush = useRef<{ a: number; b: number; add: boolean; before: Set<number> } | null>(null), root = useRef<HTMLElement>(null), side = useRef<HTMLDivElement>(null);
  const replay = () => setPlayN((n) => n + 1);

  // New weeks open their newest trace (two or fewer open all) and keep the span only if its week stays.
  const pick = (next: Set<number>, s = span) => {
    const ws = sorted(next), sw = items.find((i) => i.id === s)?.w, r = new Set(ws.length <= 2 ? ws : [ws.at(-1)!]);
    if (next.has(sw)) r.add(sw); else s = null;
    setSel(next); setRoots(r); setSpan(s); replay();
  };
  // The address picks weeks and the span; no known week means this week.
  const qs = p.toString();
  useEffect(() => { if (!d) return;
    const ws = (p.get("w") ?? "").split(",").map((w) => d.WEEKS.indexOf(w)).filter((i) => i >= 0);
    pick(new Set(ws.length ? ws : [d.WEEKS.length - 1]), p.get("s")); }, [d, qs]);
  // It also keeps them, so reload and a shared link show the same thing.
  useEffect(() => { if (!d || !sel) return;
    history.replaceState(null, "", `#/trace?w=${sorted(sel).map((i) => d.WEEKS[i]).join(",")}${span ? `&s=${encodeURIComponent(span)}` : ""}`); }, [sel, span]);
  // Esc lets go of the span, unless it closes the thread sheet. Capture: the sheet is still there.
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("[role=dialog]")) setSpan(null); };
    addEventListener("keydown", k, true); return () => removeEventListener("keydown", k, true); }, []);

  const ctx = useRef<gsap.Context>(undefined), tl = useRef<gsap.core.Timeline>(undefined), shown = useRef(false);
  useEffect(() => () => ctx.current?.revert(), []);
  const anim = (f: () => void) => { if (reduced() || !root.current) return; (ctx.current ??= gsap.context(() => {}, root.current)).add(f); };
  // Time sweeps left to right: each heatmap column lands a beat after the one before. Once.
  useLayoutEffect(() => { if (!sel || shown.current) return; shown.current = true;
    anim(() => gsap.from("[data-n]", { opacity: 0, scale: .3, duration: .5, ease: "expo.out", stagger: (_: number, el: Element) => +(el as HTMLElement).dataset.d! * .012, clearProps: "opacity,transform" })); }, [sel]);
  // The playhead sweeps Monday to Sunday; each span grows from its start as the playhead reaches it.
  useLayoutEffect(() => { if (!sel) return;
    // A replay during a replay would start from half-drawn bars: finish the old one first.
    tl.current?.progress(1).kill();
    anim(() => { const D = 1.4, t = tl.current = gsap.timeline();
      t.from("[data-row]", { opacity: 0, x: -8, duration: .35, ease: "power3.out", stagger: .02, clearProps: "opacity,transform" }, 0);
      t.fromTo("[data-ph]", { left: "0%", opacity: 1 }, { left: "100%", duration: D, ease: "none" }, 0).to("[data-ph]", { opacity: 0, duration: .3 });
      gsap.utils.toArray<HTMLElement>("[data-at]").forEach((b) => t.from(b, { scaleX: b.dataset.bar ? 0 : 1, opacity: 0, duration: .5, ease: "expo.out", clearProps: "opacity,transform" }, +b.dataset.at! / 100 * D)); }); }, [playN]);
  useLayoutEffect(() => { const el = side.current; if (!el) return;
    anim(() => { gsap.from(el.children, { y: 8, opacity: 0, filter: "blur(6px)", duration: .4, ease: "power3.out", stagger: .03, clearProps: "filter,transform,opacity" });
      gsap.from(el.querySelectorAll("[data-mix]"), { scaleX: 0, duration: .6, ease: "expo.out", stagger: .04, clearProps: "transform" }); }); }, [span, sel, tf]);

  const head = (lead: React.ReactNode) => <>
    {d?.SAMPLE && <a className="block rounded-xl border border-dashed border-(--line-2) bg-s2 px-3.5 py-2.5 text-[13.5px] text-ink-2 no-underline" href="#/review">Example data, not yours. <b className="font-semibold text-brand">Open Review →</b></a>}
    <div className="vhead"><h1>How I deliver, <em>week by week</em></h1><p>{lead}</p></div></>;
  if (!d) return <section className="view" id="v-trace">{head("Loading your traces…")}</section>;
  if (!items.length) return <section className="view" id="v-trace">{head("No threads kept yet. Keep one in Review and it shows here.")}</section>;
  if (!sel) return null;

  const passes = (i: D) => (!tf.mode || i.mode === tf.mode) && (!tf.crit || i.wm === "wouldnt");
  const label = (ws: number[]) => ws.length > 1 && ws.at(-1)! - ws[0]! === ws.length - 1 ? `${d.WEEKS[ws[0]!]}–${d.WEEKS[ws.at(-1)!]}` : ws.map((i) => d.WEEKS[i]).join(", ");
  const by = cnt(items, (i: D) => i.mode), top = Object.keys(by).sort((a, b) => by[b]! - by[a]!)[0]!, crit = items.filter((i) => i.wm === "wouldnt").length;
  const ws = sorted(sel), N = d.WEEKS.length, filter = (f: Partial<typeof tf>) => { setTf({ ...tf, ...f }); replay(); };
  const toggle = (id: string) => setSpan(span === id ? null : id), open = span ? items.find((i) => i.id === span) : null;

  // Brush: drag across weeks selects them; shift-click adds or removes one week.
  const weekAt = (e: React.PointerEvent) => { const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-w]"); return el ? +el.dataset.w! : null; };
  const brushed = (b = brush.current!) => { const s = new Set(b.add ? b.before : []); for (let w = Math.min(b.a, b.b); w <= Math.max(b.a, b.b); w++) s.add(w); return s; };
  const hm = {
    onPointerDown: (e: React.PointerEvent) => { const w = weekAt(e); if (w == null) return; e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId); brush.current = { a: w, b: w, add: e.shiftKey || e.metaKey, before: new Set(sel) }; setPreview(brushed()); },
    onPointerMove: (e: React.PointerEvent) => { const b = brush.current, w = b && weekAt(e); if (!b || w == null || w === b.b) return; b.b = w; setPreview(brushed()); },
    onPointerUp: () => { const b = brush.current; if (!b) return; brush.current = null; setPreview(null);
      if (b.add && b.a === b.b && b.before.has(b.a) && b.before.size > 1) { const s = new Set(b.before); s.delete(b.a); pick(s); } else pick(brushed(b)); },
  };
  const hs = preview ?? sel, xs = items.filter(passes), c: Record<string, number> = {};
  xs.forEach((i) => { const k = `${i.w * 7 + i.day}:${i.b}`; c[k] = (c[k] ?? 0) + 1; });
  const max = Math.max(1, ...Object.values(c)), col = tf.mode ? mc(tf.mode) : "var(--accent)";

  return <section className="view" id="v-trace" ref={root}>
    {head(<>{`${items.length} threads you kept, drawn as spans. Most are `}<b>{MODES[top]}</b>{` (${Math.round(by[top]! / items.length * 100)}%). `}<b>{crit}</b>{" are on your critical path: without you, they would not happen."}</>)}
    <Card className="gap-3.5 p-4.5 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2"><span className="lbl">Explorer · when each thread started, and how long it ran</span>
        <span className="text-[13px] text-ink-2"><b>{label(sorted(hs))}</b>{` · ${xs.filter((i) => hs.has(i.w)).length} spans`}<small className="ml-2 text-xs text-ink-3">drag across weeks to compare · shift-click adds a week</small></span></div>
      <div className="overflow-x-auto px-0.5 pt-1.5 pb-0.5">
        <div {...hm} className="grid min-w-190 cursor-crosshair touch-none gap-x-0.5 gap-y-0.75 select-none" style={{ gridTemplateColumns: `64px repeat(${N * 7}, minmax(9px, 1fr))`, gridTemplateRows: "repeat(4, 22px) auto" }}>
          {[...hs].map((w) => <i key={`b${w}`} className="z-0 -mx-0.5 -my-1.25 rounded-[7px] bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_34%,transparent)]" style={{ gridColumn: `${2 + w * 7} / span 7`, gridRow: "1 / span 4" }} />)}
          {BUCKETS.map(([lab], b) => [<span key={lab} className="col-start-1 flex items-center font-mono text-[11px] font-medium text-ink-3" style={{ gridRow: b + 1 }}>{lab}</span>,
            ...Array.from({ length: N * 7 }, (_, dd) => { const n = c[`${dd}:${b}`] ?? 0, w = Math.floor(dd / 7), on = hs.has(w), ping = hover && hover.w * 7 + hover.day === dd && hover.b === b;
              return <i key={`${dd}:${b}`} data-w={w} data-d={dd} data-n={n || undefined} title={n ? `${plural(n, "span")} · ${d.WEEKS[w]} ${DOW[dd % 7]} · ${lab}` : undefined}
                className={cn("relative z-1 rounded-[3px] transition-opacity", dd % 7 > 4 ? "bg-[color-mix(in_srgb,var(--s2)_45%,transparent)]" : "bg-s2", !on && !ping && "opacity-50", ping && "z-2 outline-2 outline-offset-1 outline-ink")}
                style={{ gridColumn: dd + 2, gridRow: b + 1, ...(n ? { background: `color-mix(in srgb, ${col} ${Math.round(45 + 55 * n / max)}%, var(--s3))`, boxShadow: `0 0 ${on ? "16px -3px" : "14px -5px"} ${col}` } : {}) }} />; })])}
          {/* Week labels are buttons, so the keyboard can pick a week too. Pointer picks go through the brush. */}
          {d.WEEKS.map((wk, w) => <button key={wk} data-w={w} onClick={(e) => { if (e.detail === 0) pick(new Set([w])); }}
            className={cn("row-start-5 flex cursor-pointer items-baseline gap-1.5 border-0 bg-transparent pt-2.25 pl-0.5 text-left font-num text-xs font-semibold tracking-[.08em] whitespace-nowrap hover:text-ink", hs.has(w) ? "text-ink" : "text-ink-3")}
            style={{ gridColumn: `${2 + w * 7} / span 7` }}>{wk}<small className="font-mono text-[10.5px] font-medium tracking-normal">{fmtDay(monday(d, w))}</small></button>)}
        </div></div>
      <div className="flex flex-wrap items-center justify-between gap-x-4.5 gap-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter spans">
          {Object.keys(MODES).filter((m) => by[m]).sort((a, b) => by[b]! - by[a]!).map((m) =>
            <Chip key={m} c={mc(m)} on={tf.mode === m} dim={!!tf.mode && tf.mode !== m} n={by[m]!} click={() => filter({ mode: tf.mode === m ? null : m })}><i className={swatch} />{MODES[m]}</Chip>)}
          <span className="mx-1 h-4.5 w-px bg-line" aria-hidden="true" />
          <Chip c="var(--ink)" on={tf.crit} n={crit} click={() => filter({ crit: !tf.crit })} title="Spans where, without you, it would not happen"><i className={cn(swatch, "bg-transparent shadow-[inset_0_0_0_1.5px_var(--ink)]")} />critical path</Chip>
        </div>
        <span className="flex items-center gap-2 font-mono text-[11px] font-medium text-ink-3">1<i className="h-2 w-18 rounded-sm" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${col} 25%, var(--s3)), ${col})` }} />{`${plural(max, "span")} per day`}</span>
      </div>
    </Card>
    <div className="grid items-start gap-3 min-[980px]:grid-cols-[minmax(0,1fr)_360px]">
      <Waterfall d={d} items={items} ws={[...ws].reverse()} passes={passes} label={label} span={span} toggle={toggle} hover={setHover}
        roots={roots} setRoots={(r) => { setRoots(r); replay(); }} replay={replay} />
      <Card ref={side} role="complementary" aria-live="polite" className="content-start gap-3.5 p-4.5 sm:p-5 min-[980px]:sticky min-[980px]:top-[calc(env(safe-area-inset-top,0px)+84px)] min-[980px]:max-h-[calc(100vh-104px)] min-[980px]:overflow-y-auto">
        {open ? <Span d={d} i={open} items={items} close={() => setSpan(null)} />
          : <Summary xs={xs.filter((x) => sel.has(x.w))} rest={xs.filter((x) => !sel.has(x.w))} label={label(ws)} toggle={toggle} />}
      </Card>
    </div>
  </section>;
}

function Chip({ c, on, dim, n, click, title, children }: { c: string; on: boolean; dim?: boolean; n: number; click: () => void; title?: string; children: React.ReactNode }) {
  return <Button variant="outline" size="xs" aria-pressed={on} title={title} onClick={click} style={cvar(c)}
    className={cn("h-auto gap-2 rounded-full border-line bg-s2 py-1.25 pr-2.75 pl-2.5 text-[12.5px] font-normal text-ink-2 hover:border-(--line-2) hover:bg-s2 hover:text-ink",
      "aria-pressed:border-(--c) aria-pressed:bg-[color-mix(in_srgb,var(--c)_14%,var(--s2))] aria-pressed:text-ink", dim && "opacity-45")}>
    {children}<b className="font-mono text-[11.5px] font-semibold text-ink-3">{n}</b></Button>;
}

type WF = { d: North; items: D[]; ws: number[]; passes: (i: D) => boolean; label: (ws: number[]) => string; span: string | null; toggle: (id: string) => void;
  hover: (i: D) => void; roots: Set<number>; setRoots: (r: Set<number>) => void; replay: () => void };
const row = "relative z-1 grid grid-cols-[var(--lc)_minmax(0,1fr)] max-sm:grid-cols-1";
const name = "flex min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent py-1.75 pr-3.5 text-left";
function Waterfall({ d, items, ws, passes, label, span, toggle, hover, roots, setRoots, replay }: WF) {
  const shown = items.filter((i) => ws.includes(i.w) && passes(i));
  const ctl = "border-line bg-s2 font-mono text-xs font-medium text-ink-2 hover:border-(--line-2) hover:bg-s2 hover:text-ink";
  return <Card className="gap-0 overflow-hidden p-0 sm:p-0">
    <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4.5 pb-3.5">
      <div><span className="lbl">Trace view</span>
        <h2 className="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-num text-[28px] leading-none font-extrabold uppercase">{ws.length === 1 ? d.WEEKS[ws[0]!] : label([...ws].reverse())}
          <small className="font-mono text-xs font-medium text-ink-3 normal-case">{`${plural(shown.length, "span")} · ${plural(ws.length, "trace")}`}</small></h2></div>
      <div className="flex gap-1.5">
        {ws.length > 1 && <Button variant="outline" size="xs" className={ctl} onClick={() => setRoots(new Set(roots.size === ws.length ? [] : ws))}>{roots.size === ws.length ? "collapse all" : "expand all"}</Button>}
        <Button variant="outline" size="xs" className={ctl} title="Play the week again" onClick={replay}><Play className="size-3" />replay</Button></div>
    </div>
    <div className="relative [--lc:clamp(220px,38%,380px)] max-sm:[--lc:0px]">
      <div className="pointer-events-none absolute inset-y-0 right-0 left-(--lc)" style={{ background: "linear-gradient(90deg, transparent calc(500% / 7), color-mix(in srgb, var(--ink) 3%, transparent) 0), repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px calc(100% / 7))" }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 left-(--lc) z-3"><i data-ph className="absolute inset-y-0 left-0 -ml-px w-0.5 bg-ink opacity-0 shadow-[0_0_16px_2px_color-mix(in_srgb,var(--ink)_40%,transparent)]" /></div>
      <div className={cn(row, "h-7.5 items-center border-y border-line bg-[color-mix(in_srgb,var(--s2)_70%,transparent)]")}><span className="lbl pl-5 max-sm:hidden">Span</span>
        <div className="relative h-full">{DOW.map((dw, k) => <span key={dw} className="absolute inset-y-0 flex items-center pl-1.75 font-mono text-[10.5px] font-medium tracking-[.06em] text-ink-3 uppercase" style={{ left: `${k / 7 * 100}%` }}>{dw}</span>)}</div></div>
      {/* Linked views: hovering a span lights its heatmap cell. */}
      <div onPointerLeave={() => hover(null)}>{ws.map((w) => {
        const pos = posIn(d, w), m0 = monday(d, w), open = roots.has(w), t = items.filter((i) => i.w === w && passes(i)).sort((a, b) => (a.t0 ?? 0) - (b.t0 ?? 0));
        const timed = t.filter((i) => i.t0 != null), a = timed.length ? pos(Math.min(...timed.map((i) => i.t0))) : 0, b = timed.length ? pos(Math.max(...timed.map((i) => i.t1))) : 0;
        const fold = () => { const r = new Set(roots); open ? r.delete(w) : r.add(w); setRoots(r); };
        return <div key={w}>
          <div className={cn(row, rule, "min-h-9.5 bg-[color-mix(in_srgb,var(--s2)_65%,transparent)]")}>
            <button data-row aria-expanded={open} onClick={fold} className={cn(name, "pl-5 font-num text-sm font-bold tracking-[.06em] text-ink max-sm:pl-4")}>
              {open ? <ChevronDown className="size-3 text-ink-3" /> : <ChevronRight className="size-3 text-ink-3" />}{d.WEEKS[w]}
              <span className="flex-1 font-mono text-[11.5px] font-medium tracking-normal text-ink-3">{`${fmtDay(m0)} – ${fmtDay(m0 + 6 * DAY)}`}</span>
              <span className="font-mono text-[11.5px] font-medium tracking-normal text-ink-3 tabular-nums">{plural(t.length, "span")}</span></button>
            <div className="relative min-h-8">{timed.length > 0 && <span data-at={a} data-bar="1" className="absolute top-1/2 -mt-px h-0.5 origin-left rounded-[1px] bg-(--line-2)" style={{ left: `${a}%`, width: `${b - a}%` }} />}
              {timed.map((i) => <i key={i.id} data-at={pos(i.t0)} className="absolute top-1/2 -mt-1.5 -ml-[1.5px] h-3 w-0.75 rounded-[2px]" style={{ left: `${pos(i.t0)}%`, background: mc(i.mode) }} />)}</div>
          </div>
          {open && (t.length ? t.map((i) => <SpanRow key={i.id} i={i} pos={pos} on={span === i.id} toggle={toggle} hover={hover} />)
            : <div className={cn(rule, "py-3 pr-5 pl-10.5 text-[13px] text-ink-3")}>{`No spans in ${d.WEEKS[w]} match the filter.`}</div>)}
        </div>; })}</div>
    </div>
  </Card>;
}

function SpanRow({ i, pos, on, toggle, hover }: { i: D; pos: (t: number) => number; on: boolean; toggle: (id: string) => void; hover: (i: D) => void }) {
  const L = i.t0 == null ? 0 : pos(i.t0), W = i.t0 == null ? 100 : pos(i.t1) - L;
  return <div onClick={() => toggle(i.id)} onPointerEnter={() => hover(i)} style={cvar(mc(i.mode))}
    className={cn(row, rule, "group min-h-8.5 cursor-pointer", on ? "bg-[color-mix(in_srgb,var(--c)_11%,transparent)]" : "hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]")}>
    <button data-row aria-pressed={on} onClick={(e) => { e.stopPropagation(); toggle(i.id); }} className={cn(name, "pl-10.5 text-[13.5px] group-hover:text-ink max-sm:pl-4", on ? "text-ink" : "text-ink-2")}>
      <i className={swatch} /><span className="min-w-0 flex-1 truncate">{i.title}</span><span className="font-mono text-[11.5px] font-medium whitespace-nowrap text-ink-3 tabular-nums">{fmtDur(i)}</span></button>
    <div className="relative min-h-8 max-sm:min-h-6"><span data-at={L} data-bar="1" title={`${i.title} · ${fmtDur(i)} · ${i.ev.length} events`} style={{ left: `${L}%`, width: `${W}%` }}
      className={cn("absolute top-1/2 -mt-1.75 h-3.5 min-w-2 origin-left rounded-sm", i.t0 == null ? "border border-dashed border-(--line-2)"
        : cn("bg-[color-mix(in_srgb,var(--c)_88%,transparent)]", i.wm === "wouldnt" ? "shadow-[0_0_0_1.5px_var(--ink),0_0_18px_-4px_var(--c)]" : "shadow-[0_0_0_1px_color-mix(in_srgb,var(--c)_45%,transparent),0_0_18px_-6px_var(--c)]"))}>
      {/* An instant span is its one event: no ticks inside. */}
      {W >= .4 && i.ev.filter((e: D) => e[1]).map((e: D, k: number) => <i key={k} className="absolute inset-y-0.75 -ml-px w-0.5 rounded-[1px] bg-[color-mix(in_srgb,var(--ground)_72%,transparent)]" style={{ left: `${(pos(Date.parse(e[1])) - L) / W * 100}%` }} />)}
    </span></div>
  </div>;
}

const note = "m-0 text-[12.5px] leading-normal text-ink-3", kv = "grid grid-cols-[auto_1fr] items-baseline gap-3 border-t border-line pt-3 text-[13.5px]", key = "font-mono text-xs font-medium text-ink-3";
function Summary({ xs, rest, label, toggle }: { xs: D[]; rest: D[]; label: string; toggle: (id: string) => void }) {
  const by = cnt(xs, (x: D) => x.mode), order = Object.keys(MODES).filter((m) => by[m]).sort((a, b) => by[b]! - by[a]!);
  const long = xs.filter((x) => x.hrs != null).sort((a, b) => b.hrs - a.hrs)[0], crit = xs.filter((x) => x.wm === "wouldnt");
  return <><span className="lbl">Trace summary</span>
    <div className="flex items-baseline gap-2.5"><b className="font-num text-[56px] leading-none font-extrabold tabular-nums">{xs.length}</b><span className="text-sm text-ink-2">{`span${xs.length === 1 ? "" : "s"} in ${label}`}</span></div>
    {xs.length ? <>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]" aria-hidden="true">{order.map((m) => <i key={m} data-mix className="origin-left" style={{ flex: by[m], background: mc(m) }} title={`${MODES[m]}: ${by[m]}`} />)}</div>
      {/* pp: how this selection's mode mix differs from the weeks outside it. */}
      <ul className="m-0 grid list-none p-0">{order.map((m) => { const dd = rest.length ? Math.round((pctOf(xs, (x) => x.mode === m) - pctOf(rest, (x) => x.mode === m)) * 100) : 0;
        return <li key={m} className="grid grid-cols-[auto_1fr_auto_64px] items-center gap-2.5 border-t border-line py-1.75 text-[13.5px] first:border-t-0">
          <i className={swatch} style={cvar(mc(m))} /><span>{MODES[m]}</span><b className="font-mono text-[13px] font-semibold">{by[m]}</b>
          <small className="text-right font-mono text-[11.5px] font-medium text-ink-3">{dd ? `${dd > 0 ? "+" : "−"}${Math.abs(dd)} pp` : ""}</small></li>; })}</ul>
      {rest.length > 0 && <p className={note}>pp: how much bigger or smaller the share of each mode is than in the other weeks.</p>}
      <div className={kv}><span className={key}>critical path</span><b>{`${crit.length} of ${xs.length}`}</b></div>
      {long && <div className={kv}><span className={key}>longest</span><button onClick={() => toggle(long.id)} className="cursor-pointer border-0 bg-transparent p-0 text-left text-ink underline decoration-ink-3 underline-offset-3">{`${long.title} · ${fmtDur(long)}`}</button></div>}
      <p className={note}>Click a span to see its events.</p></> : <p className={note}>No spans match the filter.</p>}</>;
}

function Span({ d, i, items, close }: { d: North; i: D; items: D[]; close: () => void }) {
  const pr = d.PROJECTS[i.s], pct = Math.round(pctOf(items, (x) => (x.hrs ?? 0) < (i.hrs ?? 0)) * 100);
  const ev = [...i.ev.filter((e: D) => e[1]).sort((a: D, b: D) => Date.parse(a[1]) - Date.parse(b[1])), ...i.ev.filter((e: D) => !e[1])];
  const link = "text-ink no-underline hover:underline";
  return <>
    <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-2 text-[12.5px] text-ink-2"><i className={swatch} style={cvar(mc(i.mode))} />{`${MODES[i.mode]} · ${d.WEEKS[i.w]}`}</span>
      <Button variant="outline" size="xs" className="rounded-full font-mono text-xs text-ink-2" onClick={close}>close <kbd>esc</kbd></Button></div>
    <h3 className="m-0 text-lg leading-snug font-semibold text-balance">{i.title}</h3>
    <div className="flex flex-wrap items-baseline gap-2.5"><b className="font-mono text-[28px] leading-none font-semibold">{fmtDur(i)}</b><span className="text-[13px] text-ink-3">{i.hrs ? `longer than ${pct}% of your spans` : "one moment, one event"}</span></div>
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.75 text-[13px] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:wrap-anywhere [&_dt]:font-mono [&_dt]:text-xs [&_dt]:font-medium [&_dt]:text-ink-3">
      <dt>mode</dt><dd>{MODES[i.mode]}</dd><dt>without_you</dt><dd>{i.wm ? WMS[i.wm] : "not answered"}</dd>
      <dt>project</dt><dd>{pr && i.s !== "none" ? (pr.url ? <a className="text-ink underline underline-offset-3" href={pr.url} target="_blank" rel="noopener">{`${pr.name} ↗`}</a> : pr.name) : "none"}</dd>
      <dt>pillar</dt><dd>{PILLAR[i.pillar] ?? "none"}</dd><dt>started</dt><dd>{i.t0 ? `${fmtWhen(i.t0)}, ${fmtDay(i.t0)}` : "no time"}</dd></dl>
    {i.summary && <p className="m-0 text-sm leading-normal text-ink-2">{i.summary}</p>}
    <span className="lbl">{`Span events · ${i.ev.length}`}</span>
    <ol className="m-0 grid max-h-80 list-none overflow-y-auto p-0">{ev.map((e: D, k: number) =>
      <li key={k} className="grid grid-cols-[78px_104px_minmax(0,1fr)] items-baseline gap-2 border-t border-line py-1.75 text-[12.5px] max-sm:grid-cols-[70px_minmax(0,1fr)]">
        <time className="font-mono text-[11.5px] font-medium text-ink-3">{e[1] ? fmtWhen(Date.parse(e[1])) : "no time"}</time><span className="font-mono text-[11.5px] font-medium text-ink-2 max-sm:hidden">{EVK[e[0]] ?? e[0]}</span>
        {e[3] ? <a className={cn(link, "truncate")} href={e[3]} target="_blank" rel="noopener">{`${e[2] || e[3]} ↗`}</a> : <span className="truncate text-ink">{e[2]}</span>}</li>)}</ol>
    {/* The old Trace had no way to the thread sheet: here it is one click from the span. */}
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button variant="outline" size="xs" className="font-mono text-xs text-ink-2" onClick={() => openItem(i.id)}><Maximize2 className="size-3" />open thread</Button>
      {!d.SAMPLE && <a className="ref" href={`#/review?week=${yearOf(d, i.w)}-${d.WEEKS[i.w]}&key=${encodeURIComponent(i.id)}`}>change it in review →</a>}</div>
  </>;
}

export const ready = true;
export const View = ({ p }: { p: URLSearchParams }) => <Trace p={p} />;
