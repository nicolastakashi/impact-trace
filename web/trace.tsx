// TRACE: your weeks as traces. A week is a trace, a kept thread is a span, its PRs, issues and
// messages are span events. Explorer heatmap on top (drag to brush weeks), waterfall, side panel.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { ChevronDown, ChevronRight, Maximize2, Play } from "lucide-react";
import {
  CloseButton,
  cnt,
  DOW,
  fmtWhen,
  MODES,
  mc,
  openItem,
  percent,
  PILLAR,
  plural,
  reduced,
  reviewHref,
  SampleNote,
  useNorth,
  WMS,
  yearOf,
  type North,
} from "./lib";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";

// A kept thread with its timing (see spans()). An event is [kind, time, label, url].
type Thread = any;
type SpanEvent = any;
type Filter = { mode: string | null; critical: boolean };

const DAY = 864e5;
const EVENT_KIND: Record<string, string> = {
  pr_merged: "PR merged",
  pr_open: "PR opened",
  issue_completed: "issue done",
  issue_open: "issue open",
  review_comment: "review received",
  reviews_given: "reviews given",
  slack_message: "Slack",
  slack_mention: "mention",
  meeting: "meeting",
  doc_created: "doc created",
  doc_edited: "doc edited",
};
// Heatmap rows, longest on top like a duration axis: label and lower bound in hours.
const BUCKETS: [string, number][] = [
  ["3d +", 72],
  ["1–3 d", 24],
  ["< 1 d", 0.25],
  ["instant", 0],
];
const mondayOf = (north: North, week: number) => {
  const year = yearOf(north, week);
  const jan4 = new Date(year, 0, 4);
  const weekNumber = +north.WEEKS[week]!.slice(1);
  return new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7) + (weekNumber - 1) * 7).getTime();
};
const formatDay = (time: number) =>
  new Date(time).toLocaleDateString("en", { month: "short", day: "numeric" });
function formatDuration(thread: Thread) {
  const hours = thread.hours;
  if (hours == null) return "no time";
  if (hours < 1 / 60) return "instant";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
  return `${Math.floor(hours / 24)}d ${Math.round(hours % 24)}h`;
}
const shareOf = <T,>(values: T[], test: (value: T) => boolean) =>
  values.length ? values.filter(test).length / values.length : 0;
const sorted = (weeks: Set<number>) => [...weeks].sort((first, second) => first - second);
// Modes that occur, most first.
const modesByCount = (byMode: Record<string, number>) =>
  Object.keys(MODES)
    .filter((mode) => byMode[mode])
    .sort((first, second) => byMode[second]! - byMode[first]!);
// Where a time falls in a week, as a percent from Monday 00:00.
const positionIn = (north: North, week: number) => {
  const monday = mondayOf(north, week);
  return (time: number) => Math.min(100, Math.max(0, ((time - monday) / (7 * DAY)) * 100));
};
const timedEvents = (thread: Thread) => thread.ev.filter((event: SpanEvent) => event[1]);
const isCritical = (thread: Thread) => thread.wm === "wouldnt";
const swatch = "inline-block h-1.5 w-3.5 flex-none rounded-[2px] bg-(--c)";
const rule = "border-b border-[color-mix(in_srgb,var(--line)_55%,transparent)]";
const colorVar = (color: string) => ({ "--c": color }) as React.CSSProperties;

// Each thread's start, end and duration, from its timed events.
function spans(north: North) {
  return north.ITEMS.map((thread: Thread) => {
    const events = thread.ev ?? [];
    const times = events
      .filter((event: SpanEvent) => event[1])
      .map((event: SpanEvent) => Date.parse(event[1]));
    const start = times.length ? Math.min(...times) : null;
    const end = times.length ? Math.max(...times) : null;
    const hours = start == null ? null : (end! - start) / 36e5;
    const dayIndex = start == null ? 0 : Math.floor((start - mondayOf(north, thread.w)) / DAY);
    return {
      ...thread,
      ev: events,
      start,
      end,
      hours,
      day: Math.min(6, Math.max(0, dayIndex)),
      bucket: hours == null ? 3 : BUCKETS.findIndex(([, lowerBound]) => hours >= lowerBound),
    };
  });
}

// "W40–W43" for a run of weeks, else "W40, W42".
const weeksLabel = (north: North, weeks: number[]) =>
  weeks.length > 1 && weeks.at(-1)! - weeks[0]! === weeks.length - 1
    ? `${north.WEEKS[weeks[0]!]}–${north.WEEKS[weeks.at(-1)!]}`
    : weeks.map((week) => north.WEEKS[week]).join(", ");

// The animations share one gsap context, reverted when Trace goes.
function useTraceMotion(
  root: React.RefObject<HTMLElement | null>,
  side: React.RefObject<HTMLDivElement | null>,
  {
    selection,
    plays,
    span,
    filter,
  }: { selection: Set<number> | null; plays: number; span: unknown; filter: Filter },
) {
  const context = useRef<gsap.Context>(undefined);
  const timeline = useRef<gsap.core.Timeline>(undefined);
  const shown = useRef(false);
  useEffect(() => () => context.current?.revert(), []);
  const animate = (run: () => void) => {
    if (reduced() || !root.current) return;
    (context.current ??= gsap.context(() => {}, root.current)).add(run);
  };
  // Time sweeps left to right: each heatmap column lands a beat after the one before. Once.
  useLayoutEffect(() => {
    if (!selection || shown.current) return;
    shown.current = true;
    animate(() =>
      gsap.from("[data-n]", {
        opacity: 0,
        scale: 0.3,
        duration: 0.5,
        ease: "expo.out",
        stagger: (_: number, element: Element) => +(element as HTMLElement).dataset.d! * 0.012,
        clearProps: "opacity,transform",
      }),
    );
  }, [selection]);
  // The playhead sweeps Monday to Sunday; each span grows from its start as the playhead reaches it.
  useLayoutEffect(() => {
    if (!selection) return;
    // A replay during a replay would start from half-drawn bars: finish the old one first.
    timeline.current?.progress(1).kill();
    animate(() => {
      const sweep = 1.4;
      const playback = (timeline.current = gsap.timeline());
      playback.from(
        "[data-row]",
        {
          opacity: 0,
          x: -8,
          duration: 0.35,
          ease: "power3.out",
          stagger: 0.02,
          clearProps: "opacity,transform",
        },
        0,
      );
      playback
        .fromTo(
          "[data-ph]",
          { left: "0%", opacity: 1 },
          { left: "100%", duration: sweep, ease: "none" },
          0,
        )
        .to("[data-ph]", { opacity: 0, duration: 0.3 });
      for (const bar of gsap.utils.toArray<HTMLElement>("[data-at]"))
        playback.from(
          bar,
          {
            scaleX: bar.dataset.bar ? 0 : 1,
            opacity: 0,
            duration: 0.5,
            ease: "expo.out",
            clearProps: "opacity,transform",
          },
          (+bar.dataset.at! / 100) * sweep,
        );
    });
  }, [plays]);
  useLayoutEffect(() => {
    const panel = side.current;
    if (!panel) return;
    animate(() => {
      gsap.from(panel.children, {
        y: 8,
        opacity: 0,
        filter: "blur(6px)",
        duration: 0.4,
        ease: "power3.out",
        stagger: 0.03,
        clearProps: "filter,transform,opacity",
      });
      gsap.from(panel.querySelectorAll("[data-mix]"), {
        scaleX: 0,
        duration: 0.6,
        ease: "expo.out",
        stagger: 0.04,
        clearProps: "transform",
      });
    });
  }, [span, selection, filter]);
}

// Brush: drag across weeks selects them; shift-click adds or removes one week.
function useBrush(selection: Set<number> | null, pick: (weeks: Set<number>) => void) {
  const brush = useRef<{ from: number; to: number; add: boolean; before: Set<number> } | null>(
    null,
  );
  const [preview, setPreview] = useState<Set<number> | null>(null);
  const weekAt = (event: React.PointerEvent) => {
    const cell = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-w]");
    return cell ? +cell.dataset.w! : null;
  };
  const brushed = (drag = brush.current!) => {
    const weeks = new Set(drag.add ? drag.before : []);
    for (let week = Math.min(drag.from, drag.to); week <= Math.max(drag.from, drag.to); week++)
      weeks.add(week);
    return weeks;
  };
  const handlers = {
    onPointerDown: (event: React.PointerEvent) => {
      const week = weekAt(event);
      if (week == null) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      brush.current = {
        from: week,
        to: week,
        add: event.shiftKey || event.metaKey,
        before: new Set(selection),
      };
      setPreview(brushed());
    },
    onPointerMove: (event: React.PointerEvent) => {
      const drag = brush.current;
      const week = drag && weekAt(event);
      if (!drag || week == null || week === drag.to) return;
      drag.to = week;
      setPreview(brushed());
    },
    onPointerUp: () => {
      const drag = brush.current;
      if (!drag) return;
      brush.current = null;
      setPreview(null);
      const removesOne =
        drag.add && drag.from === drag.to && drag.before.has(drag.from) && drag.before.size > 1;
      if (!removesOne) return pick(brushed(drag));
      const weeks = new Set(drag.before);
      weeks.delete(drag.from);
      pick(weeks);
    },
  };
  return { preview, handlers };
}

function TraceHead({ north, children }: { north: North | null; children: React.ReactNode }) {
  return (
    <>
      {north?.SAMPLE && (
        <SampleNote href="#/review">
          Example data, not yours. <b className="font-semibold text-brand">Open Review →</b>
        </SampleNote>
      )}
      <div className="vhead">
        <h1>
          How I deliver, <em>week by week</em>
        </h1>
        <p>{children}</p>
      </div>
    </>
  );
}

export function Trace({ params }: { params: URLSearchParams }) {
  const [north] = useNorth();
  const threads = useMemo(() => (north ? spans(north) : []), [north]);
  const [selection, setSelection] = useState<Set<number> | null>(null);
  const [span, setSpan] = useState<string | null>(null);
  const [roots, setRoots] = useState(new Set<number>());
  const [filter, setFilter] = useState<Filter>({ mode: null, critical: false });
  const [hover, setHover] = useState<Thread>(null);
  const [plays, setPlays] = useState(0);
  const root = useRef<HTMLElement>(null);
  const side = useRef<HTMLDivElement>(null);
  const replay = () => setPlays((count) => count + 1);

  // New weeks open their newest trace (two or fewer open all) and keep the span only if its week stays.
  const pick = (next: Set<number>, keep = span) => {
    const weeks = sorted(next);
    const spanWeek = threads.find((thread) => thread.id === keep)?.w;
    const open = new Set(weeks.length <= 2 ? weeks : [weeks.at(-1)!]);
    if (next.has(spanWeek)) open.add(spanWeek);
    else keep = null;
    setSelection(next);
    setRoots(open);
    setSpan(keep);
    replay();
  };
  // The address picks weeks and the span; no known week means this week.
  const query = params.toString();
  useEffect(() => {
    if (!north) return;
    const weeks = (params.get("w") ?? "")
      .split(",")
      .map((week) => north.WEEKS.indexOf(week))
      .filter((index) => index >= 0);
    pick(new Set(weeks.length ? weeks : [north.WEEKS.length - 1]), params.get("s"));
  }, [north, query]);
  // It also keeps them, so reload and a shared link show the same thing.
  useEffect(() => {
    if (!north || !selection) return;
    const weeks = sorted(selection)
      .map((index) => north.WEEKS[index])
      .join(",");
    history.replaceState(
      null,
      "",
      `#/trace?w=${weeks}${span ? `&s=${encodeURIComponent(span)}` : ""}`,
    );
  }, [selection, span]);
  // Esc lets go of the span, unless it closes the thread sheet. Capture: the sheet is still there.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("[role=dialog]")) setSpan(null);
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, []);
  useTraceMotion(root, side, { selection, plays, span, filter });
  const { preview, handlers } = useBrush(selection, pick);

  if (!north)
    return (
      <section className="view" id="v-trace">
        <TraceHead north={north}>Loading your traces…</TraceHead>
      </section>
    );
  if (!threads.length)
    return (
      <section className="view" id="v-trace">
        <TraceHead north={north}>
          No threads kept yet. Keep one in Review and it shows here.
        </TraceHead>
      </section>
    );
  if (!selection) return null;

  const passes = (thread: Thread) =>
    (!filter.mode || thread.mode === filter.mode) && (!filter.critical || isCritical(thread));
  const byMode = cnt(threads, (thread: Thread) => thread.mode);
  // Ties go to the mode seen first, not MODES order.
  const topMode = Object.keys(byMode).sort((first, second) => byMode[second]! - byMode[first]!)[0]!;
  const critical = threads.filter(isCritical).length;
  const weeks = sorted(selection);
  const changeFilter = (change: Partial<Filter>) => {
    setFilter({ ...filter, ...change });
    replay();
  };
  const toggle = (id: string) => setSpan(span === id ? null : id);
  const open = span ? threads.find((thread) => thread.id === span) : null;
  const passing = threads.filter(passes);

  return (
    <section className="view" id="v-trace" ref={root}>
      <TraceHead north={north}>
        {`${threads.length} threads you kept, drawn as spans. Most are `}
        <b>{MODES[topMode]}</b>
        {` (${percent(byMode[topMode]!, threads.length)}%). `}
        <b>{critical}</b>
        {" are on your critical path: without you, they would not happen."}
      </TraceHead>
      <Explorer
        north={north}
        passing={passing}
        shown={preview ?? selection}
        hover={hover}
        brush={handlers}
        pick={(week) => pick(new Set([week]))}
        color={heatColor(filter.mode)}
      >
        <Filters byMode={byMode} critical={critical} filter={filter} change={changeFilter} />
      </Explorer>
      <div className="grid items-start gap-3 min-[980px]:grid-cols-[minmax(0,1fr)_360px]">
        <Waterfall
          north={north}
          threads={threads}
          weeks={[...weeks].reverse()}
          passes={passes}
          span={span}
          toggle={toggle}
          hover={setHover}
          roots={roots}
          setRoots={(next) => {
            setRoots(next);
            replay();
          }}
          replay={replay}
        />
        <Card
          ref={side}
          role="complementary"
          aria-live="polite"
          className="content-start gap-3.5 p-4.5 sm:p-5 min-[980px]:sticky min-[980px]:top-[calc(env(safe-area-inset-top,0px)+84px)] min-[980px]:max-h-[calc(100vh-104px)] min-[980px]:overflow-y-auto"
        >
          {open ? (
            <SpanDetail north={north} thread={open} threads={threads} close={() => setSpan(null)} />
          ) : (
            <Summary
              selected={passing.filter((thread) => selection.has(thread.w))}
              rest={passing.filter((thread) => !selection.has(thread.w))}
              label={weeksLabel(north, weeks)}
              toggle={toggle}
            />
          )}
        </Card>
      </div>
    </section>
  );
}

// The heatmap's color: the filtered mode's, else the accent.
const heatColor = (mode: string | null) => (mode ? mc(mode) : "var(--accent)");

function Explorer({
  north,
  passing,
  shown,
  hover,
  brush,
  pick,
  color,
  children,
}: {
  north: North;
  passing: Thread[];
  shown: Set<number>;
  hover: Thread;
  brush: React.HTMLAttributes<HTMLDivElement>;
  pick: (week: number) => void;
  color: string;
  children: React.ReactNode;
}) {
  const days = north.WEEKS.length * 7;
  // Spans per day and duration bucket.
  const cells: Record<string, number> = {};
  for (const thread of passing) {
    const key = `${thread.w * 7 + thread.day}:${thread.bucket}`;
    cells[key] = (cells[key] ?? 0) + 1;
  }
  const max = Math.max(1, ...Object.values(cells));
  return (
    <Card className="gap-3.5 p-4.5 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <span className="lbl">Explorer · when each thread started, and how long it ran</span>
        <span className="text-[13px] text-ink-2">
          <b>{weeksLabel(north, sorted(shown))}</b>
          {` · ${passing.filter((thread) => shown.has(thread.w)).length} spans`}
          <small className="ml-2 text-xs text-ink-3">
            drag across weeks to compare · shift-click adds a week
          </small>
        </span>
      </div>
      <div className="overflow-x-auto px-0.5 pt-1.5 pb-0.5">
        <div
          {...brush}
          className="grid min-w-190 cursor-crosshair touch-none gap-x-0.5 gap-y-0.75 select-none"
          style={{
            gridTemplateColumns: `64px repeat(${days}, minmax(9px, 1fr))`,
            gridTemplateRows: "repeat(4, 22px) auto",
          }}
        >
          {[...shown].map((week) => (
            <i
              key={`b${week}`}
              className="z-0 -mx-0.5 -my-1.25 rounded-[7px] bg-[color-mix(in_srgb,var(--ink)_5%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--ink)_34%,transparent)]"
              style={{ gridColumn: `${2 + week * 7} / span 7`, gridRow: "1 / span 4" }}
            />
          ))}
          {BUCKETS.map(([label], bucket) => [
            <span
              key={label}
              className="col-start-1 flex items-center font-mono text-[11px] font-medium text-ink-3"
              style={{ gridRow: bucket + 1 }}
            >
              {label}
            </span>,
            ...Array.from({ length: days }, (_, day) => (
              <HeatCell
                key={`${day}:${bucket}`}
                north={north}
                day={day}
                bucket={bucket}
                count={cells[`${day}:${bucket}`] ?? 0}
                max={max}
                color={color}
                on={shown.has(Math.floor(day / 7))}
                ping={!!hover && hover.w * 7 + hover.day === day && hover.bucket === bucket}
              />
            )),
          ])}
          {/* Week labels are buttons, so the keyboard can pick a week too. Pointer picks go through the brush. */}
          {north.WEEKS.map((week, weekIndex) => (
            <button
              key={week}
              data-w={weekIndex}
              onClick={(event) => {
                if (event.detail === 0) pick(weekIndex);
              }}
              className={cn(
                "row-start-5 flex cursor-pointer items-baseline gap-1.5 border-0 bg-transparent pt-2.25 pl-0.5 text-left font-num text-xs font-semibold tracking-[.08em] whitespace-nowrap hover:text-ink",
                shown.has(weekIndex) ? "text-ink" : "text-ink-3",
              )}
              style={{ gridColumn: `${2 + weekIndex * 7} / span 7` }}
            >
              {week}
              <small className="font-mono text-[10.5px] font-medium tracking-normal">
                {formatDay(mondayOf(north, weekIndex))}
              </small>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4.5 gap-y-2.5">
        {children}
        <span className="flex items-center gap-2 font-mono text-[11px] font-medium text-ink-3">
          1
          <i
            className="h-2 w-18 rounded-sm"
            style={{
              background: `linear-gradient(90deg, color-mix(in srgb, ${color} 25%, var(--s3)), ${color})`,
            }}
          />
          {`${plural(max, "span")} per day`}
        </span>
      </div>
    </Card>
  );
}

function HeatCell({
  north,
  day,
  bucket,
  count,
  max,
  color,
  on,
  ping,
}: {
  north: North;
  day: number;
  bucket: number;
  count: number;
  max: number;
  color: string;
  on: boolean;
  ping: boolean;
}) {
  const week = Math.floor(day / 7);
  const weekend = day % 7 > 4;
  return (
    <i
      data-w={week}
      data-d={day}
      data-n={count || undefined}
      title={
        count
          ? `${plural(count, "span")} · ${north.WEEKS[week]} ${DOW[day % 7]} · ${BUCKETS[bucket]![0]}`
          : undefined
      }
      className={cn(
        "relative z-1 rounded-[3px] transition-opacity",
        weekend ? "bg-[color-mix(in_srgb,var(--s2)_45%,transparent)]" : "bg-s2",
        !on && !ping && "opacity-50",
        ping && "z-2 outline-2 outline-offset-1 outline-ink",
      )}
      style={{
        gridColumn: day + 2,
        gridRow: bucket + 1,
        ...(count
          ? {
              background: `color-mix(in srgb, ${color} ${Math.round(45 + (55 * count) / max)}%, var(--s3))`,
              boxShadow: `0 0 ${on ? "16px -3px" : "14px -5px"} ${color}`,
            }
          : {}),
      }}
    />
  );
}

function Filters({
  byMode,
  critical,
  filter,
  change,
}: {
  byMode: Record<string, number>;
  critical: number;
  filter: Filter;
  change: (change: Partial<Filter>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter spans">
      {modesByCount(byMode).map((mode) => (
        <Chip
          key={mode}
          color={mc(mode)}
          on={filter.mode === mode}
          dim={!!filter.mode && filter.mode !== mode}
          count={byMode[mode]!}
          click={() => change({ mode: filter.mode === mode ? null : mode })}
        >
          <i className={swatch} />
          {MODES[mode]}
        </Chip>
      ))}
      <span className="mx-1 h-4.5 w-px bg-line" aria-hidden="true" />
      <Chip
        color="var(--ink)"
        on={filter.critical}
        count={critical}
        click={() => change({ critical: !filter.critical })}
        title="Spans where, without you, it would not happen"
      >
        <i className={cn(swatch, "bg-transparent shadow-[inset_0_0_0_1.5px_var(--ink)]")} />
        critical path
      </Chip>
    </div>
  );
}

function Chip({
  color,
  on,
  dim,
  count,
  click,
  title,
  children,
}: {
  color: string;
  on: boolean;
  dim?: boolean;
  count: number;
  click: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      size="xs"
      aria-pressed={on}
      title={title}
      onClick={click}
      style={colorVar(color)}
      className={cn(
        "h-auto gap-2 rounded-full border-line bg-s2 py-1.25 pr-2.75 pl-2.5 text-[12.5px] font-normal text-ink-2 hover:border-line-2 hover:bg-s2 hover:text-ink",
        "aria-pressed:border-(--c) aria-pressed:bg-[color-mix(in_srgb,var(--c)_14%,var(--s2))] aria-pressed:text-ink",
        dim && "opacity-45",
      )}
    >
      {children}
      <b className="font-mono text-[11.5px] font-semibold text-ink-3">{count}</b>
    </Button>
  );
}

type WaterfallProps = {
  north: North;
  threads: Thread[];
  weeks: number[];
  passes: (thread: Thread) => boolean;
  span: string | null;
  toggle: (id: string) => void;
  hover: (thread: Thread) => void;
  roots: Set<number>;
  setRoots: (roots: Set<number>) => void;
  replay: () => void;
};
const row = "relative z-1 grid grid-cols-[var(--lc)_minmax(0,1fr)] max-sm:grid-cols-1";
const rowName =
  "flex min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent py-1.75 pr-3.5 text-left";
const controlClass =
  "border-line bg-s2 font-mono text-xs font-medium text-ink-2 hover:border-line-2 hover:bg-s2 hover:text-ink";

function Waterfall({
  north,
  threads,
  weeks,
  passes,
  span,
  toggle,
  hover,
  roots,
  setRoots,
  replay,
}: WaterfallProps) {
  const shown = threads.filter((thread) => weeks.includes(thread.w) && passes(thread));
  const allOpen = roots.size === weeks.length;
  return (
    <Card className="gap-0 overflow-hidden p-0 sm:p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-4.5 pb-3.5">
        <div>
          <span className="lbl">Trace view</span>
          <h2 className="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-num text-[28px] leading-none font-extrabold uppercase">
            {weeks.length === 1 ? north.WEEKS[weeks[0]!] : weeksLabel(north, [...weeks].reverse())}
            <small className="font-mono text-xs font-medium text-ink-3 normal-case">{`${plural(shown.length, "span")} · ${plural(weeks.length, "trace")}`}</small>
          </h2>
        </div>
        <div className="flex gap-1.5">
          {weeks.length > 1 && (
            <Button
              variant="outline"
              size="xs"
              className={controlClass}
              onClick={() => setRoots(new Set(allOpen ? [] : weeks))}
            >
              {allOpen ? "collapse all" : "expand all"}
            </Button>
          )}
          <Button
            variant="outline"
            size="xs"
            className={controlClass}
            title="Play the week again"
            onClick={replay}
          >
            <Play className="size-3" />
            replay
          </Button>
        </div>
      </div>
      <div className="relative [--lc:clamp(220px,38%,380px)] max-sm:[--lc:0px]">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 left-(--lc)"
          style={{
            background:
              "linear-gradient(90deg, transparent calc(500% / 7), color-mix(in srgb, var(--ink) 3%, transparent) 0), repeating-linear-gradient(90deg, var(--line) 0 1px, transparent 1px calc(100% / 7))",
          }}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 left-(--lc) z-3">
          <i
            data-ph
            className="absolute inset-y-0 left-0 -ml-px w-0.5 bg-ink opacity-0 shadow-[0_0_16px_2px_color-mix(in_srgb,var(--ink)_40%,transparent)]"
          />
        </div>
        <div
          className={cn(
            row,
            "h-7.5 items-center border-y border-line bg-[color-mix(in_srgb,var(--s2)_70%,transparent)]",
          )}
        >
          <span className="lbl pl-5 max-sm:hidden">Span</span>
          <div className="relative h-full">
            {DOW.map((day, index) => (
              <span
                key={day}
                className="absolute inset-y-0 flex items-center pl-1.75 font-mono text-[10.5px] font-medium tracking-[.06em] text-ink-3 uppercase"
                style={{ left: `${(index / 7) * 100}%` }}
              >
                {day}
              </span>
            ))}
          </div>
        </div>
        {/* Linked views: hovering a span lights its heatmap cell. */}
        <div onPointerLeave={() => hover(null)}>
          {weeks.map((week) => (
            <WeekTrace
              key={week}
              north={north}
              week={week}
              threads={threads
                .filter((thread) => thread.w === week && passes(thread))
                .sort((first, second) => (first.start ?? 0) - (second.start ?? 0))}
              open={roots.has(week)}
              fold={() => {
                const next = new Set(roots);
                if (roots.has(week)) next.delete(week);
                else next.add(week);
                setRoots(next);
              }}
              span={span}
              toggle={toggle}
              hover={hover}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

// One week: its row, with a tick per span start, and when open, its spans.
function WeekTrace({
  north,
  week,
  threads,
  open,
  fold,
  span,
  toggle,
  hover,
}: {
  north: North;
  week: number;
  threads: Thread[];
  open: boolean;
  fold: () => void;
  span: string | null;
  toggle: (id: string) => void;
  hover: (thread: Thread) => void;
}) {
  const position = positionIn(north, week);
  const monday = mondayOf(north, week);
  const timed = threads.filter((thread) => thread.start != null);
  const start = timed.length ? position(Math.min(...timed.map((thread) => thread.start))) : 0;
  const end = timed.length ? position(Math.max(...timed.map((thread) => thread.end))) : 0;
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <div className={cn(row, rule, "min-h-9.5 bg-[color-mix(in_srgb,var(--s2)_65%,transparent)]")}>
        <button
          data-row
          aria-expanded={open}
          onClick={fold}
          className={cn(
            rowName,
            "pl-5 font-num text-sm font-bold tracking-[.06em] text-ink max-sm:pl-4",
          )}
        >
          <Chevron className="size-3 text-ink-3" />
          {north.WEEKS[week]}
          <span className="flex-1 font-mono text-[11.5px] font-medium tracking-normal text-ink-3">{`${formatDay(monday)} – ${formatDay(monday + 6 * DAY)}`}</span>
          <span className="font-mono text-[11.5px] font-medium tracking-normal text-ink-3 tabular-nums">
            {plural(threads.length, "span")}
          </span>
        </button>
        <div className="relative min-h-8">
          {timed.length > 0 && (
            <span
              data-at={start}
              data-bar="1"
              className="absolute top-1/2 -mt-px h-0.5 origin-left rounded-[1px] bg-line-2"
              style={{ left: `${start}%`, width: `${end - start}%` }}
            />
          )}
          {timed.map((thread) => (
            <i
              key={thread.id}
              data-at={position(thread.start)}
              className="absolute top-1/2 -mt-1.5 -ml-[1.5px] h-3 w-0.75 rounded-[2px]"
              style={{ left: `${position(thread.start)}%`, background: mc(thread.mode) }}
            />
          ))}
        </div>
      </div>
      {open &&
        threads.map((thread) => (
          <SpanRow
            key={thread.id}
            thread={thread}
            position={position}
            on={span === thread.id}
            toggle={toggle}
            hover={hover}
          />
        ))}
      {open && !threads.length && (
        <div
          className={cn(rule, "py-3 pr-5 pl-10.5 text-[13px] text-ink-3")}
        >{`No spans in ${north.WEEKS[week]} match the filter.`}</div>
      )}
    </div>
  );
}

// A critical span gets an ink ring; an untimed one is a dashed outline across the week.
const barLook = (thread: Thread) => {
  if (thread.start == null) return "border border-dashed border-line-2";
  return cn(
    "bg-[color-mix(in_srgb,var(--c)_88%,transparent)]",
    isCritical(thread)
      ? "shadow-[0_0_0_1.5px_var(--ink),0_0_18px_-4px_var(--c)]"
      : "shadow-[0_0_0_1px_color-mix(in_srgb,var(--c)_45%,transparent),0_0_18px_-6px_var(--c)]",
  );
};

function SpanRow({
  thread,
  position,
  on,
  toggle,
  hover,
}: {
  thread: Thread;
  position: (time: number) => number;
  on: boolean;
  toggle: (id: string) => void;
  hover: (thread: Thread) => void;
}) {
  const left = thread.start == null ? 0 : position(thread.start);
  const width = thread.start == null ? 100 : position(thread.end) - left;
  return (
    <div
      onClick={() => toggle(thread.id)}
      onPointerEnter={() => hover(thread)}
      style={colorVar(mc(thread.mode))}
      className={cn(
        row,
        rule,
        "group min-h-8.5 cursor-pointer",
        on
          ? "bg-[color-mix(in_srgb,var(--c)_11%,transparent)]"
          : "hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]",
      )}
    >
      <button
        data-row
        aria-pressed={on}
        onClick={(event) => {
          event.stopPropagation();
          toggle(thread.id);
        }}
        className={cn(
          rowName,
          "pl-10.5 text-[13.5px] group-hover:text-ink max-sm:pl-4",
          on ? "text-ink" : "text-ink-2",
        )}
      >
        <i className={swatch} />
        <span className="min-w-0 flex-1 truncate">{thread.title}</span>
        <span className="font-mono text-[11.5px] font-medium whitespace-nowrap text-ink-3 tabular-nums">
          {formatDuration(thread)}
        </span>
      </button>
      <div className="relative min-h-8 max-sm:min-h-6">
        <span
          data-at={left}
          data-bar="1"
          title={`${thread.title} · ${formatDuration(thread)} · ${thread.ev.length} events`}
          style={{ left: `${left}%`, width: `${width}%` }}
          className={cn(
            "absolute top-1/2 -mt-1.75 h-3.5 min-w-2 origin-left rounded-sm",
            barLook(thread),
          )}
        >
          {/* An instant span is its one event: no ticks inside. */}
          {width >= 0.4 &&
            timedEvents(thread).map((event: SpanEvent, index: number) => (
              <i
                key={index}
                className="absolute inset-y-0.75 -ml-px w-0.5 rounded-[1px] bg-[color-mix(in_srgb,var(--ground)_72%,transparent)]"
                style={{ left: `${((position(Date.parse(event[1])) - left) / width) * 100}%` }}
              />
            ))}
        </span>
      </div>
    </div>
  );
}

const note = "m-0 text-[12.5px] leading-normal text-ink-3";
const keyValue =
  "grid grid-cols-[auto_1fr] items-baseline gap-3 border-t border-line pt-3 text-[13.5px]";
const keyClass = "font-mono text-xs font-medium text-ink-3";

// pp, percentage points: how this selection's mode share differs from the weeks outside it.
function pointsChange(selected: Thread[], rest: Thread[], mode: string) {
  if (!rest.length) return "";
  const isMode = (thread: Thread) => thread.mode === mode;
  const points = Math.round((shareOf(selected, isMode) - shareOf(rest, isMode)) * 100);
  if (!points) return "";
  return `${points > 0 ? "+" : "−"}${Math.abs(points)} pp`;
}

function Summary({
  selected,
  rest,
  label,
  toggle,
}: {
  selected: Thread[];
  rest: Thread[];
  label: string;
  toggle: (id: string) => void;
}) {
  return (
    <>
      <span className="lbl">Trace summary</span>
      <div className="flex items-baseline gap-2.5">
        <b className="font-num text-[56px] leading-none font-extrabold tabular-nums">
          {selected.length}
        </b>
        <span className="text-sm text-ink-2">{`span${selected.length === 1 ? "" : "s"} in ${label}`}</span>
      </div>
      {selected.length ? (
        <SummaryBody selected={selected} rest={rest} toggle={toggle} />
      ) : (
        <p className={note}>No spans match the filter.</p>
      )}
    </>
  );
}

function SummaryBody({
  selected,
  rest,
  toggle,
}: {
  selected: Thread[];
  rest: Thread[];
  toggle: (id: string) => void;
}) {
  const byMode = cnt(selected, (thread: Thread) => thread.mode);
  const modes = modesByCount(byMode);
  const longest = selected
    .filter((thread) => thread.hours != null)
    .sort((first, second) => second.hours - first.hours)[0];
  const critical = selected.filter(isCritical);
  return (
    <>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]" aria-hidden="true">
        {modes.map((mode) => (
          <i
            key={mode}
            data-mix
            className="origin-left"
            style={{ flex: byMode[mode], background: mc(mode) }}
            title={`${MODES[mode]}: ${byMode[mode]}`}
          />
        ))}
      </div>
      <ul className="m-0 grid list-none p-0">
        {modes.map((mode) => (
          <li
            key={mode}
            className="grid grid-cols-[auto_1fr_auto_64px] items-center gap-2.5 border-t border-line py-1.75 text-[13.5px] first:border-t-0"
          >
            <i className={swatch} style={colorVar(mc(mode))} />
            <span>{MODES[mode]}</span>
            <b className="font-mono text-[13px] font-semibold">{byMode[mode]}</b>
            <small className="text-right font-mono text-[11.5px] font-medium text-ink-3">
              {pointsChange(selected, rest, mode)}
            </small>
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <p className={note}>
          pp: how much bigger or smaller the share of each mode is than in the other weeks.
        </p>
      )}
      <div className={keyValue}>
        <span className={keyClass}>critical path</span>
        <b>{`${critical.length} of ${selected.length}`}</b>
      </div>
      {longest && (
        <div className={keyValue}>
          <span className={keyClass}>longest</span>
          <button
            onClick={() => toggle(longest.id)}
            className="cursor-pointer border-0 bg-transparent p-0 text-left text-ink underline decoration-ink-3 underline-offset-3"
          >{`${longest.title} · ${formatDuration(longest)}`}</button>
        </div>
      )}
      <p className={note}>Click a span to see its events.</p>
    </>
  );
}

function ProjectName({ thread, north }: { thread: Thread; north: North }) {
  const project = north.PROJECTS[thread.s];
  if (!project || thread.s === "none") return <>none</>;
  if (!project.url) return <>{project.name}</>;
  return (
    <a
      className="text-ink underline underline-offset-3"
      href={project.url}
      target="_blank"
      rel="noopener"
    >{`${project.name} ↗`}</a>
  );
}

// Timed events in order, then the untimed ones.
const eventsInOrder = (thread: Thread) => [
  ...timedEvents(thread).sort(
    (first: SpanEvent, second: SpanEvent) => Date.parse(first[1]) - Date.parse(second[1]),
  ),
  ...thread.ev.filter((event: SpanEvent) => !event[1]),
];

function SpanDetail({
  north,
  thread,
  threads,
  close,
}: {
  north: North;
  thread: Thread;
  threads: Thread[];
  close: () => void;
}) {
  const shorter = Math.round(
    shareOf(threads, (other) => (other.hours ?? 0) < (thread.hours ?? 0)) * 100,
  );
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
          <i className={swatch} style={colorVar(mc(thread.mode))} />
          {`${MODES[thread.mode]} · ${north.WEEKS[thread.w]}`}
        </span>
        <CloseButton onClick={close} />
      </div>
      <h3 className="m-0 text-lg leading-snug font-semibold text-balance">{thread.title}</h3>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <b className="font-mono text-[28px] leading-none font-semibold">{formatDuration(thread)}</b>
        <span className="text-[13px] text-ink-3">
          {thread.hours ? `longer than ${shorter}% of your spans` : "one moment, one event"}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.75 text-[13px] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:wrap-anywhere [&_dt]:font-mono [&_dt]:text-xs [&_dt]:font-medium [&_dt]:text-ink-3">
        <dt>mode</dt>
        <dd>{MODES[thread.mode]}</dd>
        <dt>without_you</dt>
        <dd>{thread.wm ? WMS[thread.wm] : "not answered"}</dd>
        <dt>project</dt>
        <dd>
          <ProjectName thread={thread} north={north} />
        </dd>
        <dt>pillar</dt>
        <dd>{PILLAR[thread.pillar] ?? "none"}</dd>
        <dt>started</dt>
        <dd>{thread.start ? `${fmtWhen(thread.start)}, ${formatDay(thread.start)}` : "no time"}</dd>
      </dl>
      {thread.summary && <p className="m-0 text-sm leading-normal text-ink-2">{thread.summary}</p>}
      <span className="lbl">{`Span events · ${thread.ev.length}`}</span>
      <ol className="m-0 grid max-h-80 list-none overflow-y-auto p-0">
        {eventsInOrder(thread).map((event: SpanEvent, index: number) => (
          <EventRow key={index} event={event} />
        ))}
      </ol>
      {/* The old Trace had no way to the thread sheet: here it is one click from the span. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          variant="outline"
          size="xs"
          className="font-mono text-xs text-ink-2"
          onClick={() => openItem(thread.id)}
        >
          <Maximize2 className="size-3" />
          open thread
        </Button>
        {!north.SAMPLE && (
          <a className="ref" href={reviewHref(north, thread)}>
            change it in review →
          </a>
        )}
      </div>
    </>
  );
}

function EventRow({ event }: { event: SpanEvent }) {
  const [kind, time, label, url] = event;
  return (
    <li className="grid grid-cols-[78px_104px_minmax(0,1fr)] items-baseline gap-2 border-t border-line py-1.75 text-[12.5px] max-sm:grid-cols-[70px_minmax(0,1fr)]">
      <time className="font-mono text-[11.5px] font-medium text-ink-3">
        {time ? fmtWhen(Date.parse(time)) : "no time"}
      </time>
      <span className="font-mono text-[11.5px] font-medium text-ink-2 max-sm:hidden">
        {EVENT_KIND[kind] ?? kind}
      </span>
      {url ? (
        <a
          className="text-ink no-underline hover:underline truncate"
          href={url}
          target="_blank"
          rel="noopener"
        >{`${label || url} ↗`}</a>
      ) : (
        <span className="truncate text-ink">{label}</span>
      )}
    </li>
  );
}

export const View = ({ p: params }: { p: URLSearchParams }) => <Trace params={params} />;
