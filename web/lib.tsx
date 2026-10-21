// Shared by the views, like app/js/core.js.
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
