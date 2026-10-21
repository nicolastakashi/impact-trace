// Shared by the views, like app/js/core.js.
import { useEffect, useRef, useState } from "react";

// One JSON POST: the server takes a write only with this exact content-type.
export const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

let say: (msg: string, ms: number) => void = () => {};
export const toast = (msg: string, ms = 1800) => say(msg, ms);
export function Toast() {
  const [msg, setMsg] = useState<string | null>(null), t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => { say = (m, ms) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), ms); }; }, []);
  return <div className="toast" id="toast" hidden={msg == null} role="status">{msg}</div>;
}

// Threads per week, as one row of cells.
export function Strip({ weeks, count, max }: { weeks: string[]; count: (w: string) => number; max: number }) {
  return <div className="strip" style={{ "--n": weeks.length } as React.CSSProperties}>
    {weeks.map((w) => { const c = count(w);
      return <i key={w} className={c ? "on" : ""} style={{ "--v": c / max } as React.CSSProperties} title={`${w}: ${c}`}>{c || ""}</i>; })}
    {weeks.map((w) => <span key={w}>{w.slice(5)}</span>)}
  </div>;
}
