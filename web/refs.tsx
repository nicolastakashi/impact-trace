// REFERENCES: why each mode counts, with sources. One topic in focus, the others one click away.
import { useEffect, useState } from "react";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { MODES, mc } from "./lib";
import { REFS } from "./refs-data";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

const Dot = ({ c, className = "size-2.25" }: { c: string; className?: string }) => <i className={`inline-block flex-none rounded-full ${className}`} style={{ background: c }} />;
const name = (id: string) => MODES[id] ? MODES[id][0]!.toUpperCase() + MODES[id].slice(1) : REFS[id]!.title;

export function Refs({ k: asked }: { k: string | null }) {
  // The address says which topic; a tab rewrites it in place, with no history step.
  const [k, setK] = useState(asked);
  useEffect(() => setK(asked), [asked]);
  const id = k && REFS[k] ? k : "clarify", r = REFS[id]!, c = MODES[id] ? mc(id) : "var(--ink-3)";
  const pickK = (t: string) => { history.replaceState(null, "", `#/refs?k=${t}`); setK(t); };
  const all = Object.keys(REFS);
  const tab = (t: string) => <button key={t} aria-pressed={t === id} onClick={() => pickK(t)} style={{ "--c": MODES[t] ? mc(t) : "var(--ink-2)" } as React.CSSProperties}
    className="flex cursor-pointer items-center gap-2.5 rounded-r-[10px] border-0 border-l-2 border-transparent bg-transparent px-3 py-2 text-left text-sm font-medium text-ink-2 hover:bg-s1 hover:text-ink aria-pressed:border-(--c) aria-pressed:bg-s2 aria-pressed:text-ink max-[760px]:rounded-full max-[760px]:border max-[760px]:border-line max-[760px]:px-3 max-[760px]:py-1.5">
    {MODES[t] && <Dot c={mc(t)} />}{name(t)}<span className="ml-auto font-mono text-[11px] font-medium text-ink-3 max-[760px]:hidden">{REFS[t]!.items.length}</span></button>;
  const group = (label: string, ids: string[]) => <div className="grid gap-0.5 max-[760px]:flex max-[760px]:flex-wrap max-[760px]:gap-1.5">
    <span className="lbl px-3 pb-1.5 max-[760px]:w-full max-[760px]:p-0">{label}</span>{ids.map(tab)}</div>;
  return <section className="view" id="v-refs">
    <div className="vhead"><h1>Why <em>this counts</em></h1><p>Quotes checked on 2026-10-18. ⚠ is a secondary source.</p></div>
    <div className="grid items-start gap-4.5 min-[761px]:grid-cols-[230px_1fr]">
      <div role="group" aria-label="Topics" className="grid gap-4.5 min-[761px]:sticky min-[761px]:top-[calc(env(safe-area-inset-top,0px)+96px)]">
        {group("Modes", all.filter((t) => MODES[t]))}{group("How it is judged", all.filter((t) => !MODES[t]))}</div>
      <Card key={id} className="animate-in gap-6" style={{ "--c": c } as React.CSSProperties}>
        <h3 className="m-0 flex items-center gap-3 font-num text-[clamp(28px,4vw,44px)] leading-none font-extrabold text-balance uppercase">
          {MODES[id] && <Dot c={c} className="size-3.5" />}{r.title}</h3>
        <div className="-mt-2.5 grid gap-3">
          <p className="m-0 max-w-[60ch] text-[17px] leading-[1.45] text-ink-2">{r.d}</p>
          <div className="flex flex-wrap items-center gap-1.5"><span className="lbl">Looks like</span>
            {r.ex.map((x) => <Badge key={x} variant="soft" className="rounded-md font-mono text-xs">{x}</Badge>)}</div>
        </div>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3.5 p-0">
          {r.items.map((x) => <li key={x.url + (x.q ?? x.says)} className="grid grid-rows-[auto_1fr_auto] gap-2.5 rounded-xl border border-line bg-s2 px-5 py-4.5">
            {x.q ? <span aria-hidden="true" className="h-5.5 font-num text-[54px] leading-[.6] font-extrabold text-(--c)">“</span>
              : <span className="font-mono text-[10.5px] leading-5.5 tracking-[.06em] text-ink-3 uppercase">In our words</span>}
            {x.q ? <q className="text-[clamp(17px,1.8vw,20px)] leading-[1.4] text-pretty [quotes:none]">{x.q}</q>
              : <p className="m-0 text-[clamp(16px,1.6vw,18px)] leading-[1.45] text-pretty text-ink-2">{x.says}</p>}
            <span className="grid gap-1 self-end">
              <a className="ref inline-flex items-center gap-0.5" href={x.url} target="_blank" rel="noopener">{x.who}<ArrowUpRight className="size-3" /></a>
              {x.warn && <span className="ref inline-flex items-center gap-1 text-(--m-solve)"><TriangleAlert className="size-3" />{x.warn}</span>}</span>
          </li>)}</ul>
      </Card>
    </div>
  </section>;
}

export const ready = true;
export const View = ({ p }: { p: URLSearchParams }) => <Refs k={p.get("k")} />;
