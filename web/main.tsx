// The shell: header, hash routes, toast and overlays. Each view is one file that exports `View`.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadNorth, openSearch, Toast, useEvent } from "./lib";
import { ItemSheet } from "./sheet";
import * as goals from "./goals";
import * as setup from "./setup";
import * as home from "./north";
import * as projects from "./projects";
import * as project from "./project";
import * as trace from "./trace";
import * as feedback from "./feedback";
import * as review from "./review";
import * as refs from "./refs";
import * as story from "./story";
import * as search from "./search";

type V = { View: (p: { p: URLSearchParams }) => React.ReactNode };
const VIEWS: Record<string, V> = { home, goals, projects, project, trace, feedback, review, refs, setup };
const TABS = [["home", "North"], ["goals", "Goals"], ["projects", "Projects"], ["trace", "Trace"], ["feedback", "Feedback"], ["review", "Review"], ["refs", "References"]];
const parse = () => { const [path, qs] = location.hash.replace(/^#\/?/, "").split("?"); return { v: path || "home", p: new URLSearchParams(qs) }; };
const pending = () => fetch("/api/pending").then((x) => x.ok ? x.json() : {}).then((p) => Object.values(p as Record<string, number>).reduce((a, n) => a + n, 0)).catch(() => 0);

function App() {
  const [r, setR] = useState(parse), [left, setLeft] = useState(0), [sample, setSample] = useState(false);
  useEffect(() => { const on = () => setR(parse()); addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  useEffect(() => { pending().then(setLeft); }, []);
  // Review fires "pending" after each decision, so the badge counts down.
  useEvent("pending", () => { pending().then(setLeft); });
  // Before you keep a thread, North and Trace show the fictional sample: its tabs say so.
  useEffect(() => { loadNorth().then((d) => setSample(!!d.SAMPLE)).catch(() => {}); }, []);
  const view = VIEWS[r.v] ?? VIEWS.home!;
  useEffect(() => { scrollTo(0, 0); }, [r.v]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);
  const go = (v: string) => { location.hash = "#/" + v; };
  const tab = r.v === "project" ? "projects" : r.v;
  return <>
    <div className="wrap">
      <header>
        <div className="brand"><span className="mark" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M1 8h3l2-5 4 10 2-5h3" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span><b>Impact Trace</b></div>
        <nav role="tablist" aria-label="Views">
          {TABS.map(([v, l]) => <button key={v} role="tab" id={`t-${v}`} data-v={v} aria-selected={tab === v} onClick={() => go(v!)}>{l}
            {(v === "trace" || v === "feedback") && <> <span className="rounded border border-dashed px-1 py-0.5 font-mono text-[8.5px] leading-none tracking-wider text-ink-3 uppercase" hidden={!sample}>example</span></>}
            {v === "review" && <> <span className="badge" id="badge" hidden={!left}>{left}</span></>}</button>)}
        </nav>
        <div className="hright">
          <button className="cmdk-btn" id="setup-btn" data-v="setup" title="Who you are, and your tools" aria-current={r.v === "setup" ? "page" : "false"} onClick={() => go("setup")}>Setup</button>
          <button className="cmdk-btn" id="cmdk-open" onClick={openSearch}>Search <kbd>⌘</kbd><kbd>K</kbd></button>
        </div>
      </header>
      <view.View key={r.v} p={r.p} />
    </div>
    <ItemSheet />
    <story.View p={r.p} />
    <search.View p={r.p} />
    <Toast />
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);
