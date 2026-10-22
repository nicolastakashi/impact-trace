// The shell: header, hash routes, toast and overlays. Each view is one file that exports `View`.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { go, loadNorth, loadPending, openSearch, sum, Toast, useEvent } from "./lib";
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

type ViewModule = { View: (props: { p: URLSearchParams }) => React.ReactNode };
const VIEWS: Record<string, ViewModule> = {
  home,
  goals,
  projects,
  project,
  trace,
  feedback,
  review,
  refs,
  setup,
};
const TABS = [
  ["home", "North"],
  ["goals", "Goals"],
  ["projects", "Projects"],
  ["trace", "Trace"],
  ["feedback", "Feedback"],
  ["review", "Review"],
  ["refs", "References"],
] as const;
const parseHash = () => {
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  return { view: path || "home", params: new URLSearchParams(query) };
};
const pendingTotal = () => loadPending().then((perWeek) => sum(Object.values(perWeek)));

function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    scrollTo(0, 0);
  }, [route.view]);
  return route;
}

function usePendingTotal() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    pendingTotal().then(setLeft);
  }, []);
  // Review fires "pending" after each decision, so the badge counts down.
  useEvent("pending", () => {
    pendingTotal().then(setLeft);
  });
  return left;
}

// Before you keep a thread, North and Trace show the fictional sample: its tabs say so.
function useIsSample() {
  const [sample, setSample] = useState(false);
  useEffect(() => {
    loadNorth()
      .then((north) => setSample(!!north.SAMPLE))
      .catch(() => {});
  }, []);
  return sample;
}

function useSearchShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openSearch();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
}

const Brand = () => (
  <div className="brand">
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 16 16">
        <path
          d="M1 8h3l2-5 4 10 2-5h3"
          fill="none"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
    <b>Impact Trace</b>
  </div>
);

function Tabs({ current }: { current: string }) {
  const left = usePendingTotal();
  const sample = useIsSample();
  // A project page belongs to the Projects tab.
  const selected = current === "project" ? "projects" : current;
  return (
    <nav role="tablist" aria-label="Views">
      {TABS.map(([view, label]) => (
        <button
          key={view}
          role="tab"
          id={`t-${view}`}
          data-v={view}
          aria-selected={selected === view}
          onClick={() => go("#/" + view)}
        >
          {label}
          {(view === "trace" || view === "feedback") && (
            <>
              {" "}
              <span
                className="rounded border border-dashed px-1 py-0.5 font-mono text-[8.5px] leading-none tracking-wider text-ink-3 uppercase"
                hidden={!sample}
              >
                example
              </span>
            </>
          )}
          {view === "review" && (
            <>
              {" "}
              <span className="badge" id="badge" hidden={!left}>
                {left}
              </span>
            </>
          )}
        </button>
      ))}
    </nav>
  );
}

const Header = ({ current }: { current: string }) => (
  <header>
    <Brand />
    <Tabs current={current} />
    <div className="hright">
      <button
        className="cmdk-btn"
        id="setup-btn"
        data-v="setup"
        title="Who you are, and your tools"
        aria-current={current === "setup" ? "page" : "false"}
        onClick={() => go("#/setup")}
      >
        Setup
      </button>
      <button className="cmdk-btn" id="cmdk-open" onClick={openSearch}>
        Search <kbd>⌘</kbd>
        <kbd>K</kbd>
      </button>
    </div>
  </header>
);

function App() {
  const route = useRoute();
  useSearchShortcut();
  const Current = (VIEWS[route.view] ?? VIEWS.home!).View;
  return (
    <>
      <div className="wrap">
        <Header current={route.view} />
        <Current key={route.view} p={route.params} />
      </div>
      <ItemSheet />
      <story.View p={route.params} />
      <search.View p={route.params} />
      <Toast />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
