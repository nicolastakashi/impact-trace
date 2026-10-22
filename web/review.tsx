// REVIEW: real threads from SQLite. Claude suggests, you decide: your decisions are the gold set.
import { useEffect, useReducer, useRef } from "react";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, XIcon } from "lucide-react";
import gsap from "gsap";
import { countBy, MODES, modeColor, PILLAR, reduced, toast } from "./lib";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";
import { Input, NativeSelect, Textarea } from "./ui/input";
import { crumbClass, eventKind, NoGoalsLink, send } from "./views-shared";

type Data = any;
type Draft = { title: string; summary: string; mode: string; pillar: string };
// A row of the project picker: an existing project, or a new topic to create.
type PickerRow = Data & { create?: string };
const WITHOUT_ME = [
  ["wouldnt", "wouldn't happen"],
  ["slower", "slower"],
  ["same", "same"],
] as const;
const MODE_KEYS = ["a", "s", "d", "f", "g", "h"];
const PILLAR_KEYS = ["z", "x", "c"];
const isRoutine = (thread: Data) =>
  thread.claude.discard === "yes" && !thread.human.discard ? 1 : 0;
// Your place and your unsaved edits, so leaving the tab and coming back keeps both.
const place: { week?: string; key?: string; draft: Record<string, Draft> } = { draft: {} };
// Your title and labels for a thread: what you typed, else what you saved, else Claude's.
const draftOf = (thread: Data): Draft =>
  (place.draft[thread.key] ??= {
    title: thread.human.title ?? thread.claude.title ?? "",
    summary: thread.human.summary ?? thread.claude.summary ?? "",
    mode: thread.human.mode ?? thread.claude.mode,
    pillar: thread.human.pillar ?? thread.claude.pillar,
  });
const projectLink = (id: string) => `#/project?id=${encodeURIComponent(id)}`;

const ClaudeBadge = ({ title }: { title: string }) => (
  <span
    title={title}
    className="rounded-[5px] border px-1 font-mono text-[10px] font-medium tracking-wider text-ink-3 uppercase"
  >
    Claude
  </span>
);
const selectClass = "h-8.5 w-auto bg-s1 px-2 font-mono text-[13px] font-medium";

export function Review({ params }: { params: URLSearchParams }) {
  // One mutable state, like the old view: the key handler and the async steps always read the latest.
  const state = useRef({
    data: null as Data,
    current: 0,
    evidenceOpen: false,
    keysShown: false,
    show: "pending",
    failed: false,
    pickerOpen: false,
    query: "",
    selected: 0,
  }).current;
  const [, render] = useReducer((count: number) => count + 1, 0);
  const from = params.get("from");
  const cardRef = useRef<HTMLElement>(null);

  async function load(week?: string | null) {
    const response = await fetch("/api/review" + (week ? `?week=${week}` : "")).catch(() => null);
    if (!response?.ok) {
      state.failed = true;
      return;
    }
    const loaded = await response.json();
    // Claude's "probably routine" go last, so the work that needs you comes first.
    loaded.threads.sort((left: Data, right: Data) => isRoutine(left) - isRoutine(right));
    if (loaded.week !== place.week) place.draft = {};
    state.data = loaded;
    state.current = Math.max(
      0,
      loaded.threads.findIndex((thread: Data) => !thread.human.discard),
    );
  }
  useEffect(() => {
    (async () => {
      const week = params.get("week") ?? place.week;
      const key = params.get("key") ?? (week === place.week ? place.key : null);
      await load(week);
      const index =
        key && state.data ? state.data.threads.findIndex((thread: Data) => thread.key === key) : -1;
      if (index >= 0) state.current = index;
      render();
    })();
  }, [params.get("week"), params.get("key")]);

  const data = state.data;
  const list: Data[] = data?.threads ?? [];
  const thread = list[state.current];
  // Pending hides what you decided, but keeps the open thread so the card does not jump away.
  const shown = (index: number) =>
    state.show === "all" || !list[index].human.discard || index === state.current;

  // The address follows the open thread, so reload and back keep your place.
  useEffect(() => {
    if (!data || !thread) return;
    place.week = data.week;
    place.key = thread.key;
    const back = from ? `&from=${encodeURIComponent(from)}` : "";
    history.replaceState(
      null,
      "",
      `#/review?week=${data.week}&key=${encodeURIComponent(thread.key)}${back}`,
    );
    document.querySelector("#rv-queue [aria-current=true]")?.scrollIntoView({ block: "nearest" });
  });
  // The next thread slides in: you see that the decision moved on, not the same card redrawn.
  useEffect(() => {
    if (thread && cardRef.current && !reduced())
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
      );
  }, [thread?.key]);

  const setLabel = (field: "mode" | "pillar", value: string) => {
    draftOf(list[state.current])[field] = value;
    render();
  };
  const go = (index: number) => {
    state.current = Math.min(Math.max(index, 0), state.data.threads.length - 1);
    state.evidenceOpen = false;
    render();
  };
  // J/K step over threads the filter hides.
  const step = (direction: number) => {
    for (
      let index = state.current + direction;
      index >= 0 && index < list.length;
      index += direction
    )
      if (shown(index)) return go(index);
  };
  const toggle = (flag: "evidenceOpen" | "keysShown") => {
    state[flag] = !state[flag];
    render();
  };
  // When a week has nothing left, open the next week that does.
  async function nextWeek() {
    const week = data.weeks.find((other: string) => other !== data.week && data.pending[other] > 0);
    if (!week) {
      toast("All weeks done");
      return render();
    }
    toast(`${data.week} done · opening ${week}`);
    await load(week);
    render();
  }
  function afterDecision() {
    const threads = state.data.threads;
    const next = threads.findIndex(
      (thread: Data, index: number) => index > state.current && !thread.human.discard,
    );
    const anyLeft = threads.findIndex((thread: Data) => !thread.human.discard);
    state.data.pending[state.data.week] = threads.filter(
      (thread: Data) => !thread.human.discard,
    ).length;
    // The header badge counts what is left.
    dispatchEvent(new Event("pending"));
    if (next >= 0) go(next);
    else if (anyLeft >= 0) go(anyLeft);
    else if (state.show === "pending") nextWeek();
    else render();
  }
  const saveLabels = (target: Data, labels: Data, failPrefix: string) =>
    send("/api/labels", { week: data.week, key: target.key, labels }, failPrefix);
  async function decide(withoutMe: string) {
    const target = list[state.current];
    const draft = draftOf(target);
    draft.title = draft.title.trim() || target.human.title || target.claude.title || "";
    draft.summary = draft.summary.trim();
    const labels =
      withoutMe === "discard"
        ? { discard: "yes" }
        : {
            title: draft.title,
            mode: draft.mode,
            pillar: draft.pillar,
            without_me: withoutMe,
            discard: "no",
            ...(draft.summary && { summary: draft.summary }),
          };
    if (!(await saveLabels(target, labels, "Not saved: "))) return;
    Object.assign(target.human, labels);
    toast(withoutMe === "discard" ? "Discarded" : "Saved");
    afterDecision();
  }
  // One decision for every thread Claude marked routine and you have not decided.
  async function discardAllRoutine() {
    const todo = list.filter(isRoutine);
    for (const target of todo) {
      if (!(await saveLabels(target, { discard: "yes" }, "Stopped: "))) break;
      target.human.discard = "yes";
    }
    toast(`Discarded ${todo.filter((thread) => thread.human.discard === "yes").length}`);
    afterDecision();
  }
  // After a regroup the thread's key can change, so find it again by one of its events.
  async function reloadAt(eventId: string) {
    const before = state.current;
    place.draft = {};
    await load(data.week);
    const index = state.data.threads.findIndex((thread: Data) =>
      thread.events.some((event: Data) => event.id === eventId),
    );
    go(index >= 0 ? index : before);
  }

  // Project picker: existing projects first, then "create" for a new topic.
  const query = state.query.trim();
  const lowerQuery = query.toLowerCase();
  const results: PickerRow[] = data
    ? data.projects.filter((project: Data) => project.name.toLowerCase().includes(lowerQuery))
    : [];
  if (query && !data.projects.some((project: Data) => project.name.toLowerCase() === lowerQuery))
    results.push({ create: query });
  const selected = Math.min(state.selected, Math.max(results.length - 1, 0));
  const openPicker = () => {
    state.pickerOpen = true;
    state.query = "";
    state.selected = 0;
    render();
  };
  const closePicker = () => {
    state.pickerOpen = false;
    render();
  };
  async function choose(index: number) {
    const row = results[index];
    if (!row) return;
    const target = list[state.current];
    const body = {
      week: data.week,
      key: target.key,
      ...(row.create ? { name: row.create } : { projectId: row.id }),
    };
    if (!(await send("/api/thread-project", body, "Not moved: "))) return;
    state.pickerOpen = false;
    await reloadAt(target.events[0].id);
    toast(row.create ? `Created ${row.create}` : `Moved to ${row.name}`);
  }
  async function linkGoal(id: number, on: boolean) {
    const target = list[state.current];
    const body = { goal_id: id, week: data.week, key: target.key, on };
    if (!(await send("/api/goal-link", body, "Not linked: "))) return;
    const direct = target.goals.direct;
    target.goals.direct = on ? [...direct, id] : direct.filter((goalId: number) => goalId !== id);
    render();
    toast(on ? "Linked to the goal" : "Unlinked");
  }
  async function unassign() {
    const target = list[state.current];
    const body = { week: data.week, key: target.key };
    if (!(await send("/api/unassign", body, "Not undone: "))) return;
    await reloadAt(target.events[0].id);
    toast("Project removed");
  }

  // Keys inside the project picker. True when the key was used.
  function pickerKey(event: KeyboardEvent) {
    if (event.key === "Escape") closePicker();
    else if (event.key === "ArrowDown") {
      state.selected = Math.min(selected + 1, results.length - 1);
      render();
    } else if (event.key === "ArrowUp") {
      state.selected = Math.max(selected - 1, 0);
      render();
    } else if (event.key === "Enter") choose(selected);
    else return false;
    return true;
  }
  // The single-key shortcuts. True when the key was used.
  function shortcut(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (MODE_KEYS.includes(key)) setLabel("mode", Object.keys(MODES)[MODE_KEYS.indexOf(key)]!);
    else if (PILLAR_KEYS.includes(key))
      setLabel("pillar", Object.keys(PILLAR)[PILLAR_KEYS.indexOf(key)]!);
    else if (["1", "2", "3"].includes(key)) decide(WITHOUT_ME[+key - 1]![0]);
    else if (event.code === "Digit0" && event.shiftKey) discardAllRoutine();
    else if (key === "0") decide("discard");
    else if (key === "j") step(1);
    else if (key === "k") step(-1);
    else if (key === "t") {
      const title = document.getElementById("rv-title") as HTMLInputElement;
      title.focus();
      title.select();
    } else if (key === "e") {
      const summary = document.getElementById("rv-summary") as HTMLTextAreaElement;
      summary.focus();
      summary.setSelectionRange(summary.value.length, summary.value.length);
    } else if (key === "p") openPicker();
    else if (key === "l")
      document.querySelector<HTMLElement>("#rv-goals button:not(:disabled), #rv-goals a")?.focus();
    else if (event.key === "?") toggle("keysShown");
    else if (key === "v") toggle("evidenceOpen");
    else if (key === "o") {
      const link =
        document.querySelector<HTMLAnchorElement>("#rv-events [data-ev] a") ??
        document.querySelector<HTMLAnchorElement>("#rv-events a");
      if (link) open(link.href, "_blank", "noopener");
    } else return false;
    return true;
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      // Only while nothing sits on top of review: the sheet, search and the story are dialogs.
      if (!state.data || document.querySelector("[role=dialog]:not([hidden])")) return;
      if (target.id === "gq") {
        if (pickerKey(event)) event.preventDefault();
        return;
      }
      // In the title or summary, Enter and Escape finish the edit.
      if (target.id === "rv-title" || target.id === "rv-summary") {
        if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
          event.preventDefault();
          target.blur();
        }
        return;
      }
      const typing = target.closest("input,select,textarea");
      if (typing || event.metaKey || event.ctrlKey || event.altKey || !list.length) return;
      if (shortcut(event)) event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const decided = list.filter((thread) => thread.human.discard).length;
  if (data) data.pending[data.week] = list.length - decided;
  const head = (
    <ReviewHead
      data={data}
      decided={decided}
      total={list.length}
      show={state.show}
      pickWeek={async (week) => {
        place.draft = {};
        await load(week);
        render();
      }}
      setShow={(show) => {
        state.show = show;
        render();
      }}
    />
  );
  if (state.failed)
    return (
      <ReviewNote head={head}>
        Review needs the app server. Start it with bun app/server.ts.
      </ReviewNote>
    );
  if (!data) return <ReviewNote head={head}>Loading threads…</ReviewNote>;
  if (!thread)
    return (
      <ReviewNote head={head}>
        No suggested threads yet. Run <code>./run.sh</code> to collect the week and suggest labels.
      </ReviewNote>
    );

  const draft = draftOf(thread);
  const evidence = new Set<string>(JSON.parse(thread.claude.evidence ?? "[]"));
  const back = from && data.projects.find((project: Data) => project.id === from);
  return (
    <section className="view" id="v-review">
      {head}
      <ShortRun sources={data.shortSources ?? []} />
      <div className="grid items-start gap-5 min-[821px]:grid-cols-[minmax(220px,300px)_1fr]">
        <Queue
          list={list}
          current={state.current}
          shown={shown}
          go={go}
          discardAll={discardAllRoutine}
        />
        <main
          ref={cardRef}
          className="grid min-w-0 gap-5.5 rounded-2xl border border-line bg-card p-[clamp(18px,3vw,32px)] shadow-card"
        >
          <Progress list={list} current={state.current} />
          <ProjectBar
            thread={thread}
            back={back}
            from={from}
            pickerOpen={state.pickerOpen}
            togglePicker={() => (state.pickerOpen ? closePicker() : openPicker())}
            unassign={unassign}
            discard={() => decide("discard")}
          >
            {state.pickerOpen && (
              <ProjectPicker
                query={state.query}
                results={results}
                selected={selected}
                setQuery={(value) => {
                  state.query = value;
                  state.selected = 0;
                  render();
                }}
                choose={choose}
              />
            )}
          </ProjectBar>
          <GoalChips goals={data.goals} thread={thread} link={linkGoal} />
          <TitleAndSummary draft={draft} changed={render} />
          <Evidence
            thread={thread}
            evidence={evidence}
            open={state.evidenceOpen}
            toggle={() => toggle("evidenceOpen")}
          />
          <Labels thread={thread} draft={draft} setLabel={setLabel} />
          <WithoutYou thread={thread} decide={decide} />
          <KeyHelp hidden={!state.keysShown} />
        </main>
      </div>
    </section>
  );
}

function ReviewHead({
  data,
  decided,
  total,
  show,
  pickWeek,
  setShow,
}: {
  data: Data;
  decided: number;
  total: number;
  show: string;
  pickWeek: (week: string) => void;
  setShow: (show: string) => void;
}) {
  const weekLabel = (week: string) =>
    `${week} · ${data.pending[week] ? `${data.pending[week]} left` : "done"}`;
  return (
    <div className="vhead">
      <h1>
        Weekly <em>review</em>
      </h1>
      <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
        <label className="grid gap-1.5">
          <span className="lbl">Week</span>
          <NativeSelect
            aria-label="Week"
            className={selectClass}
            value={data?.week ?? ""}
            onChange={(event) => pickWeek(event.target.value)}
          >
            {data?.weeks.map((week: string) => (
              <option key={week} value={week}>
                {weekLabel(week)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1.5">
          <span className="lbl">Show</span>
          <NativeSelect
            aria-label="Show"
            className={selectClass}
            value={show}
            onChange={(event) => setShow(event.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="all">All</option>
          </NativeSelect>
        </label>
        <div className="grid gap-1.5">
          <span className="lbl">Decided</span>
          <b className="font-num text-[28px] leading-none font-bold tabular-nums">
            {data ? `${decided}/${total}` : "–"}
          </b>
        </div>
      </div>
    </div>
  );
}

// The last run of this week had a short count: say which sources, so a thin thread makes sense.
function ShortRun({ sources }: { sources: string[] }) {
  if (!sources.length) return null;
  return (
    <p
      role="status"
      className="mb-5 rounded-xl border border-line-2 bg-s2 px-4 py-3 text-[13px] text-ink-2"
    >
      The last run came back short for <b className="font-medium text-ink">{sources.join(", ")}</b>.
      These threads may miss events from them. The next run collects the week again.
    </p>
  );
}

const ReviewNote = ({ head, children }: { head: React.ReactNode; children: React.ReactNode }) => (
  <section className="view" id="v-review">
    {head}
    <div className="rounded-2xl border border-line bg-card p-10 text-center text-ink-2 shadow-card">
      {children}
    </div>
  </section>
);

// ✕ discarded, ✓ decided, else how many events.
const queueMark = (thread: Data) => {
  if (thread.human.discard === "yes") return "✕";
  if (thread.human.discard) return "✓";
  return thread.events.length;
};

function Queue({
  list,
  current,
  shown,
  go,
  discardAll,
}: {
  list: Data[];
  current: number;
  shown: (index: number) => boolean;
  go: (index: number) => void;
  discardAll: () => void;
}) {
  const firstRoutine = list.findIndex((thread, index) => isRoutine(thread) && shown(index));
  const routineCount = list.filter(isRoutine).length;
  return (
    <ul
      id="rv-queue"
      aria-label="Threads of the week"
      className="m-0 grid max-h-55 list-none content-start overflow-auto rounded-xl border border-line bg-s1 p-1.5 min-[821px]:sticky min-[821px]:top-24 min-[821px]:max-h-[calc(100vh-120px)]"
    >
      {list.map(
        (thread, index) =>
          shown(index) && (
            <li key={thread.key}>
              {index === firstRoutine && (
                <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-line px-2.5 pt-3 pb-1.5">
                  <span className="lbl">{`Probably routine · ${routineCount}`}</span>
                  <Button variant="dashed" size="xs" className="h-auto py-0.5" onClick={discardAll}>
                    discard all <kbd>⇧0</kbd>
                  </Button>
                </div>
              )}
              <button
                aria-current={index === current}
                onClick={() => go(index)}
                className="grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] text-ink-2 hover:bg-s2 aria-[current=true]:bg-s3 aria-[current=true]:text-ink"
              >
                <i
                  className="size-2.25 rounded-full"
                  style={{ background: modeColor(draftOf(thread).mode) }}
                />
                <span
                  className={cn(
                    "truncate",
                    thread.human.discard === "yes" && "text-ink-3 line-through",
                  )}
                >
                  {draftOf(thread).title}
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px] font-medium text-ink-3",
                    thread.human.discard && "text-(--m-build)",
                  )}
                >
                  {queueMark(thread)}
                </span>
              </button>
            </li>
          ),
      )}
    </ul>
  );
}

// One tick per thread: grey discarded, green decided, red the open one.
function progressClass(thread: Data, isCurrent: boolean) {
  if (thread.human.discard === "yes") return "bg-line-2";
  if (thread.human.discard) return "bg-(--m-build)";
  return isCurrent && "bg-brand";
}
const Progress = ({ list, current }: { list: Data[]; current: number }) => (
  <div className="flex gap-0.75" aria-hidden="true">
    {list.map((thread, index) => (
      <i
        key={thread.key}
        className={cn("h-1 flex-1 rounded-sm bg-s3", progressClass(thread, index === current))}
      />
    ))}
  </div>
);

function ProjectBar({
  thread,
  back,
  from,
  pickerOpen,
  togglePicker,
  unassign,
  discard,
  children,
}: {
  thread: Data;
  back: Data;
  from: string | null;
  pickerOpen: boolean;
  togglePicker: () => void;
  unassign: () => void;
  discard: () => void;
  children: React.ReactNode;
}) {
  const projects = thread.projects;
  const first = projects[0];
  return (
    <div className="relative flex flex-wrap items-center gap-2">
      {back && (
        <a className={crumbClass} href={projectLink(back.id)}>
          <ArrowLeft className="mr-1 inline size-3" />
          {back.name}
        </a>
      )}
      <Button
        variant="outline"
        size="xs"
        className="bg-transparent font-mono text-xs font-medium text-ink-2 hover:border-ink-2 hover:bg-transparent hover:text-ink"
        aria-haspopup="listbox"
        aria-expanded={pickerOpen}
        title="Change project (P)"
        onClick={togglePicker}
      >
        {projects.length
          ? projects.map((project: Data, index: number) => (
              <span key={project.id} className="inline-flex items-center gap-1">
                {project.name}
                {project.by === "claude" && <ClaudeBadge title="Claude placed this thread here" />}
                {index < projects.length - 1 && ","}
              </span>
            ))
          : "no project"}{" "}
        ▾
      </Button>
      {projects.some((project: Data) => project.by === "claude") && (
        <Button variant="dashed" size="xs" className="h-auto py-px text-[11px]" onClick={unassign}>
          wrong project <XIcon className="size-3" />
        </Button>
      )}
      {first && first.id !== from && (
        <a className={crumbClass} href={projectLink(first.id)}>
          across weeks <ArrowRight className="inline size-3" />
        </a>
      )}
      <Button
        variant="outline"
        aria-pressed={thread.human.discard === "yes"}
        title="Not your impact: routine, noise, or someone else's work (0)"
        onClick={discard}
        className="ml-auto h-auto gap-2 border-dashed bg-transparent py-1.75 pr-2.5 pl-1.75 text-[13px] font-normal text-ink-2 hover:border-ink-2 hover:bg-transparent hover:text-ink aria-pressed:border-solid aria-pressed:border-ink-2 aria-pressed:bg-s3 aria-pressed:text-ink"
      >
        <kbd>0</kbd>discard
        {isRoutine(thread) ? <ClaudeBadge title="Claude thinks this is routine" /> : null}
      </Button>
      {children}
    </div>
  );
}

function pickerTag(row: PickerRow) {
  if (row.create) return "new topic";
  return row.kind === "topic" ? "topic" : "linear";
}

function ProjectPicker({
  query,
  results,
  selected,
  setQuery,
  choose,
}: {
  query: string;
  results: PickerRow[];
  selected: number;
  setQuery: (value: string) => void;
  choose: (index: number) => void;
}) {
  return (
    <div className="absolute top-[calc(100%+6px)] left-0 z-20 grid w-[min(360px,80vw)] gap-1.5 rounded-xl border bg-card p-2 shadow-card">
      <Input
        autoFocus
        id="gq"
        aria-label="Project"
        placeholder="Find a project, or type a new topic"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul role="listbox" aria-label="Projects" className="m-0 max-h-65 list-none overflow-auto p-0">
        {results.length ? (
          results.map((row, index) => (
            <li key={row.id ?? "new"}>
              <button
                role="option"
                aria-selected={index === selected}
                onClick={() => choose(index)}
                className="flex w-full cursor-pointer justify-between gap-2 rounded-lg px-2.5 py-1.75 text-left text-[13.5px] hover:bg-s2 aria-selected:bg-s3"
              >
                <span>{row.create ? `Create “${row.create}”` : row.name}</span>
                <span className="font-mono text-[10px] font-medium tracking-wider text-ink-3 uppercase">
                  {pickerTag(row)}
                </span>
              </button>
            </li>
          ))
        ) : (
          <li className="lbl px-2.5 py-2">No projects yet. Type a name to create a topic.</li>
        )}
      </ul>
    </div>
  );
}

function GoalChips({
  goals,
  thread,
  link,
}: {
  goals: Data[];
  thread: Data;
  link: (id: number, on: boolean) => void;
}) {
  return (
    <div
      id="rv-goals"
      role="group"
      aria-label="Goals this thread serves"
      className="flex flex-wrap items-center gap-1.5"
    >
      <span className="lbl mr-1">Serves</span>
      {goals.length ? (
        goals.map((goal: Data) => {
          // A goal its project serves is on through the project; change that on the project's page.
          const viaProject = thread.goals.project.includes(goal.id);
          const on = viaProject || thread.goals.direct.includes(goal.id);
          return (
            <Button
              key={goal.id}
              variant="outline"
              size="xs"
              aria-pressed={on}
              disabled={viaProject}
              title={viaProject ? "Through its project" : undefined}
              onClick={() => link(goal.id, !on)}
              className="rounded-full border-dashed bg-transparent font-normal text-ink-2 hover:text-ink aria-pressed:border-solid aria-pressed:border-brand/60 aria-pressed:bg-brand/10 aria-pressed:text-ink disabled:opacity-70"
            >
              {goal.title}
              {viaProject && " · via project"}
            </Button>
          );
        })
      ) : (
        <NoGoalsLink />
      )}
    </div>
  );
}

// The draft is plain mutable state: edit it, then redraw.
function TitleAndSummary({ draft, changed }: { draft: Draft; changed: () => void }) {
  return (
    <div className="grid gap-2.5">
      <input
        id="rv-title"
        aria-label="Thread title"
        value={draft.title}
        onChange={(event) => {
          draft.title = event.target.value;
          changed();
        }}
        className="w-full rounded-none border-0 border-b border-dashed border-line-2 bg-transparent px-0 pt-0.5 pb-1.5 font-num text-[clamp(26px,3vw,34px)] leading-tight font-bold text-ink outline-none focus:border-brand focus-visible:outline-none"
      />
      <Textarea
        id="rv-summary"
        rows={2}
        aria-label="Summary of what you did"
        placeholder="No summary yet"
        value={draft.summary}
        onChange={(event) => {
          draft.summary = event.target.value;
          changed();
        }}
        className="-mx-2 -mt-1.5 min-h-[2lh] max-w-[72ch] resize-none border-transparent bg-transparent px-2 py-1.5 text-base leading-relaxed text-ink-2 [field-sizing:content] hover:bg-s2 focus-visible:border-line-2 focus-visible:bg-s2 focus-visible:text-ink focus-visible:ring-0"
      />
    </div>
  );
}

function EvidenceRow({ event, isEvidence }: { event: Data; isEvidence: boolean }) {
  // A PR's author is you; other events say who wrote them.
  const showAuthor = event.author && event.kind !== "pr_merged" && event.kind !== "pr_open";
  return (
    <li
      data-ev={isEvidence || undefined}
      className="grid gap-0.5 border-t border-line px-3 py-2.25 text-[13.5px] first:border-t-0 data-ev:bg-brand/7 sm:grid-cols-[110px_1fr] sm:gap-3"
    >
      <span className="pt-0.5 font-mono text-[11px] font-medium text-ink-3">
        {eventKind(event.kind)}
      </span>
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {event.url ? (
          <a
            className="underline underline-offset-2"
            href={event.url}
            target="_blank"
            rel="noopener"
          >{`${event.title ?? event.id} ↗`}</a>
        ) : (
          (event.title ?? event.id)
        )}
        {showAuthor && <span className="lbl ml-1.5">{event.author}</span>}
        {event.text && (
          <small className="mt-0.5 line-clamp-1 block text-[12.5px] text-ink-3">{event.text}</small>
        )}
      </span>
    </li>
  );
}

function Evidence({
  thread,
  evidence,
  open,
  toggle,
}: {
  thread: Data;
  evidence: Set<string>;
  open: boolean;
  toggle: () => void;
}) {
  // Claude's evidence first.
  const events = [...thread.events].sort(
    (left, right) => +evidence.has(right.id) - +evidence.has(left.id),
  );
  const kinds = Object.entries(countBy(thread.events, (event: Data) => eventKind(event.kind)))
    .map(([kind, count]) => `${count} ${kind}`)
    .join(" · ");
  return (
    <div className="grid gap-2.5">
      <button
        aria-expanded={open}
        onClick={toggle}
        className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-transparent px-3 py-2.5 text-left font-mono text-xs font-medium text-ink-3 hover:border-line-2 hover:text-ink-2"
      >
        <span>{kinds}</span>
        <span className="lbl inline-flex items-center gap-1">
          {open ? "hide" : "evidence"}
          {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </span>
      </button>
      {open && (
        <ul
          id="rv-events"
          className="m-0 max-h-75 list-none overflow-auto rounded-xl border border-line p-0"
        >
          {events.map((event) => (
            <EvidenceRow key={event.id} event={event} isEvidence={evidence.has(event.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Labels({
  thread,
  draft,
  setLabel,
}: {
  thread: Data;
  draft: Draft;
  setLabel: (field: "mode" | "pillar", value: string) => void;
}) {
  return (
    <div className="grid items-center gap-x-4 gap-y-2.5 sm:grid-cols-[64px_minmax(0,1fr)]">
      <span className="lbl">Mode</span>
      <Segments
        label="Mode"
        options={MODES}
        keys={MODE_KEYS}
        value={draft.mode}
        suggested={thread.claude.mode}
        color={modeColor}
        set={(value) => setLabel("mode", value)}
      />
      <span className="lbl">Pillar</span>
      <Segments
        label="Pillar"
        options={PILLAR}
        keys={PILLAR_KEYS}
        value={draft.pillar}
        suggested={thread.claude.pillar}
        set={(value) => setLabel("pillar", value)}
      />
      <span className="max-sm:hidden" />
      <span className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-ink-3">
        <i className="size-1.5 rounded-full bg-ink-3" /> Claude's pick
      </span>
    </div>
  );
}

function WithoutYou({ thread, decide }: { thread: Data; decide: (withoutMe: string) => void }) {
  return (
    <div className="grid gap-3 border-t border-line pt-5">
      <span className="font-num text-[22px] leading-none font-bold tracking-wide uppercase">
        Without you?
      </span>
      <div className="grid gap-2 sm:grid-cols-3">
        {WITHOUT_ME.map(([key, label], index) => (
          <Button
            key={key}
            variant="outline"
            aria-pressed={thread.human.discard === "no" && thread.human.without_me === key}
            onClick={() => decide(key)}
            className="h-auto justify-start gap-2.5 rounded-xl border-line bg-s2 p-3 text-left text-sm font-normal hover:border-ink-2 hover:bg-s2 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-background aria-pressed:[&_kbd]:text-ink"
          >
            <kbd>{index + 1}</kbd>
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

const KeyHelp = ({ hidden }: { hidden: boolean }) => (
  <div
    hidden={hidden}
    className="flex flex-wrap gap-x-4.5 gap-y-2 text-[12.5px] text-ink-3 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1"
  >
    <span>
      <kbd>A</kbd>–<kbd>H</kbd> mode
    </span>
    <span>
      <kbd>Z</kbd>
      <kbd>X</kbd>
      <kbd>C</kbd> pillar
    </span>
    <span>
      <kbd>1</kbd>
      <kbd>2</kbd>
      <kbd>3</kbd> without you, save
    </span>
    <span>
      <kbd>0</kbd> discard
    </span>
    <span>
      <kbd>⇧0</kbd> discard all routine
    </span>
    <span>
      <kbd>J</kbd>
      <kbd>K</kbd> move
    </span>
    <span>
      <kbd>T</kbd> edit title
    </span>
    <span>
      <kbd>E</kbd> edit summary
    </span>
    <span>
      <kbd>V</kbd> evidence
    </span>
    <span>
      <kbd>O</kbd> open evidence
    </span>
    <span>
      <kbd>P</kbd> project
    </span>
    <span>
      <kbd>L</kbd> goal
    </span>
    <span>
      <kbd>?</kbd> hide
    </span>
  </div>
);

// One segment per value. Yours is filled; Claude's pick has a dot.
function Segments({
  label,
  options,
  keys,
  value,
  suggested,
  color,
  set,
}: {
  label: string;
  options: Record<string, string>;
  keys: string[];
  value: string;
  suggested: string;
  color?: (key: string) => string;
  set: (value: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-xl border border-line bg-s2 p-0.75"
    >
      {Object.keys(options).map((key, index) => {
        const shortcut = keys[index]!.toUpperCase();
        const isSuggested = suggested === key;
        return (
          <button
            key={key}
            aria-pressed={value === key}
            title={`${options[key]} (${shortcut})${isSuggested ? " · Claude's pick" : ""}`}
            onClick={() => set(key)}
            style={{ "--c": color?.(key) ?? "var(--ink-2)" } as React.CSSProperties}
            className="relative inline-flex cursor-pointer items-center gap-1.75 rounded-[9px] px-3 py-1.75 text-[13.5px] text-ink-2 hover:bg-s3 hover:text-ink aria-pressed:bg-s1 aria-pressed:text-ink aria-pressed:shadow-[inset_0_0_0_1.5px_var(--c),0_0_14px_-6px_var(--c)]"
          >
            {color && <i className="size-2.25 rounded-full" style={{ background: color(key) }} />}
            {options[key]}
            <kbd className="h-4 min-w-4 border-b px-0.75 text-[9.5px] opacity-55">{shortcut}</kbd>
            {isSuggested && <i className="absolute top-1 right-1 size-1.5 rounded-full bg-ink-3" />}
          </button>
        );
      })}
    </div>
  );
}

// The router passes the address parameters as `p`.
export const View = ({ params }: { params: URLSearchParams }) => <Review params={params} />;
