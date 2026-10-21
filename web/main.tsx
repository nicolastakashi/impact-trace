// The shell: header, hash routes, toast. Views not built here yet open in the old app.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Toast } from "./lib";
import { Goals } from "./goals";
import { Setup } from "./setup";

const TABS = [["home", "North"], ["goals", "Goals"], ["projects", "Projects"], ["trace", "Trace"], ["feedback", "Feedback"], ["review", "Review"], ["refs", "References"]];
const HERE = new Set(["goals", "setup"]);
const parse = () => { const [path, qs] = location.hash.replace(/^#\/?/, "").split("?"); return { v: path || "home", p: new URLSearchParams(qs) }; };

function App() {
  const [r, setR] = useState(parse), [left, setLeft] = useState(0), [sample, setSample] = useState(false);
  useEffect(() => { const on = () => setR(parse()); addEventListener("hashchange", on); return () => removeEventListener("hashchange", on); }, []);
  useEffect(() => { fetch("/api/pending").then((x) => x.ok ? x.json() : {}).then((p) => setLeft(Object.values(p as Record<string, number>).reduce((a, n) => a + n, 0))).catch(() => {}); }, []);
  // Before you keep a thread, North and Trace show the fictional sample: its tabs say so.
  useEffect(() => { fetch("/data.js").then((x) => x.text()).then((t) => setSample(/^const SAMPLE = true;/m.test(t))).catch(() => {}); }, []);
  // The old app has the same addresses, so a link keeps its week and thread.
  useEffect(() => { if (HERE.has(r.v)) scrollTo(0, 0); else location.replace("/" + (location.hash || "#/home")); }, [r.v]);
  const go = (v: string) => { location.hash = "#/" + v; };
  return <>
    <div className="wrap">
      <header>
        <div className="brand"><span className="mark" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M1 8h3l2-5 4 10 2-5h3" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span><b>Impact Trace</b></div>
        <nav role="tablist" aria-label="Views">
          {TABS.map(([v, l]) => <button key={v} role="tab" id={`t-${v}`} data-v={v} aria-selected={r.v === v} onClick={() => go(v!)}>{l}
            {(v === "trace" || v === "feedback") && <> <span className="rounded border border-dashed px-1 py-0.5 font-mono text-[8.5px] leading-none tracking-wider text-ink-3 uppercase" hidden={!sample}>example</span></>}
            {v === "review" && <> <span className="badge" id="badge" hidden={!left}>{left}</span></>}</button>)}
        </nav>
        <div className="hright">
          <button className="cmdk-btn" id="setup-btn" data-v="setup" title="Who you are, and your tools" aria-current={r.v === "setup" ? "page" : "false"} onClick={() => go("setup")}>Setup</button>
          {/* ponytail: search opens the old app until the search box moves here. */}
          <button className="cmdk-btn" id="cmdk-open" onClick={() => location.assign("/" + location.hash)}>Search <kbd>⌘</kbd><kbd>K</kbd></button>
        </div>
      </header>
      {r.v === "goals" && <Goals focus={r.p.get("id")} />}
      {r.v === "setup" && <Setup />}
    </div>
    <Toast />
  </>;
}

createRoot(document.getElementById("root")!).render(<App />);
