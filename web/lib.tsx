// Shared by the views.
import { useEffect, useRef, useState } from "react";

// One JSON POST: the server takes a write only with this exact content-type.
export const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let say: (msg: string, ms: number) => void = () => {};
export const toast = (msg: string, ms = 1800) => say(msg, ms);
export function Toast() {
  const [msg, setMsg] = useState<string | null>(null), t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { say = (m, ms) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), ms); }; }, []);
  return <div role="status" hidden={msg == null}
    className="fixed bottom-[calc(20px+env(safe-area-inset-bottom,0px))] left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-3.5 py-2 font-mono text-[13px] font-medium text-background shadow-card">{msg}</div>;
}

// Threads per week, one cell each: the more threads, the redder.
export function Strip({ weeks, count, max }: { weeks: string[]; count: (w: string) => number; max: number }) {
  return <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(26px, 1fr))` }}>
    {weeks.map((w) => { const c = count(w);
      return <i key={w} title={`${w}: ${c}`} className="grid h-6.5 place-items-center rounded-md bg-s3 font-mono text-[11px] text-ink-3 not-italic tabular-nums data-[on]:text-ink"
        data-on={c ? "" : undefined} style={c ? { background: `color-mix(in srgb, var(--accent) ${25 + c / max * 60}%, var(--s3))` } : undefined}>{c || ""}</i>; })}
    {weeks.map((w) => <span key={w} className="text-center font-mono text-[10px] text-ink-3">{w.slice(5)}</span>)}
  </div>;
}

// A small mono caption: units, sources, "measured: …".
export const By = ({ className = "", ...p }: React.ComponentProps<"span">) => <span className={`font-mono text-[11.5px] font-medium text-ink-3 ${className}`} {...p} />;

// North, Trace, Feedback and Search read one object: your kept threads, or the sample.
// Same shape as app/sample.json; SAMPLE is true only for the sample.
export type North = Record<string, any> & { WEEKS: string[]; ITEMS: any[]; GOALS: any[]; PROJECTS: Record<string, any>; REC: any[]; FEEDBACK: any[]; SAMPLE?: boolean };
let north: Promise<North> | null = null;
export const loadNorth = (fresh = false) => (!fresh && north) || (north = fetch("/api/north").then((r) => r.json()));
export function useNorth(): [North | null, () => void] {
  const [d, setD] = useState<North | null>(null);
  useEffect(() => { loadNorth().then(setD); }, []);
  return [d, () => loadNorth(true).then(setD)];
}

export const MODES: Record<string, string> = { clarify: "clarify", prevent: "prevent", solve: "solve", build: "build", elevate: "elevate", external: "external" };
export const PILLAR: Record<string, string> = { big: "big-picture", exec: "execution", level: "leveling-up" };
export const WMS: Record<string, string> = { wouldnt: "wouldn't happen", slower: "slower", same: "same" };
export const mc = (m: string) => `var(--m-${m})`;
export const cnt = <T,>(xs: T[], f: (x: T) => string) => xs.reduce((o, x) => { const k = f(x); o[k] = (o[k] ?? 0) + 1; return o; }, {} as Record<string, number>);
// The goals a thread serves. The sample names one goal per project instead.
export const goalsOf = (d: North, it: any): string[] => it.g ?? (d.PROJECTS[it.s]?.goal ? [d.PROJECTS[it.s].goal] : []);
// The ISO year of week index w: a window across New Year starts in the old year.
export const yearOf = (d: North, w: number) => +d.PERIOD.slice(0, 4) + (+d.WEEKS[w]!.slice(1) < +d.WEEKS[0]!.slice(1) ? 1 : 0);
// Count axis: a step of 1, 2 or 5 times a power of ten, at most 5 gridlines above zero.
export const axis = (max: number) => { const r = Math.max(1, max) / 5, p = 10 ** Math.floor(Math.log10(r)), f = r / p;
  const st = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p), top = Math.ceil(Math.max(1, max) / st) * st;
  return { top, ticks: Array.from({ length: top / st + 1 }, (_, i) => i * st) }; };
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Overlays any view can open: one thread's sheet, the Wrapped story, search.
export const openItem = (id: string) => dispatchEvent(new CustomEvent("open-item", { detail: id }));
export const openStory = () => dispatchEvent(new Event("open-story"));
export const openSearch = () => dispatchEvent(new Event("open-search"));
export function useEvent<T = unknown>(name: string, on: (detail: T) => void) {
  useEffect(() => { const h = (e: Event) => on((e as CustomEvent).detail); addEventListener(name, h); return () => removeEventListener(name, h); });
}
