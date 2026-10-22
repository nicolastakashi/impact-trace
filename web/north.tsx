// NORTH: four bands, one question each, read top to bottom.
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Check, Play } from "lucide-react";
import {
  axis,
  By,
  cnt,
  countUp,
  go,
  goalsOf,
  loadPending,
  mean,
  MODES,
  mc,
  type North,
  openItem,
  openStory,
  percent,
  post,
  SampleNote,
  shortWeek,
  sum,
  toast,
  useMotion,
  useNorth,
  WMS,
} from "./lib";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
const lastWeekOf = (north: North) => north.weeks.length - 1;

const tileClass =
  "flex min-w-0 flex-col gap-3 overflow-hidden rounded-[18px] border-line p-4.5 sm:p-4.5";
// Card's look on a button: the Feedback and Review tiles are one click each.
const buttonTileClass = cn(
  "rounded-2xl border bg-card text-card-foreground shadow-card",
  tileClass,
  "cursor-pointer text-left font-[inherit] hover:border-line-2",
);
const Tile = ({ children }: { children: React.ReactNode }) => (
  <Card data-tile className={tileClass}>
    {children}
  </Card>
);
const TileHead = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">{children}</div>
);
const ColumnHead = ({ children }: { children: React.ReactNode }) => (
  <span className="flex justify-between gap-2 text-[13px] text-ink-2">{children}</span>
);
// A legend key. Personal goals are striped.
const Swatch = ({ color, striped }: { color: string; striped?: boolean }) => (
  <i
    className="inline-block h-1.5 w-3.5 flex-none rounded-xs"
    style={
      striped
        ? {
            background: `repeating-linear-gradient(135deg,${color} 0 2px,transparent 2px 4px)`,
            boxShadow: `inset 0 0 0 1.5px ${color}`,
          }
        : { background: color }
    }
  />
);

type BarPart = { value: number; color: string; striped?: boolean; dim?: boolean };
type Column = { title: string; parts: BarPart[] };
// Columns on a zero baseline, gridlines on round numbers, this week's label in ink.
function Plot({
  weeks,
  height,
  label,
  columns,
  average,
}: {
  weeks: string[];
  height: number;
  label: string;
  columns: Column[];
  average?: number;
}) {
  const { top, ticks } = axis(
    Math.max(...columns.map((column) => sum(column.parts.map((part) => part.value)))),
  );
  const lastWeek = weeks.length - 1;
  const grid = { gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` };
  return (
    <figure className="m-0">
      <div className="relative ml-7.5" style={{ height }} role="img" aria-label={label}>
        {ticks.map((tick) => (
          <div
            key={tick}
            className={cn("absolute inset-x-0 border-t", tick ? "border-line" : "border-line-2")}
            style={{ top: `${(1 - tick / top) * 100}%` }}
          >
            <span className="absolute right-full mr-2 -translate-y-1/2 font-num text-[11px] leading-none font-semibold text-ink-3 tabular-nums">
              {tick}
            </span>
          </div>
        ))}
        <div className="relative grid h-full items-end gap-[clamp(4px,1.4vw,14px)]" style={grid}>
          {columns.map((column, week) => (
            <div
              key={week}
              data-grow="y"
              title={column.title}
              className="flex h-full w-full max-w-14 origin-bottom flex-col-reverse justify-self-center"
            >
              <Stack parts={column.parts.filter((part) => part.value)} top={top} height={height} />
            </div>
          ))}
        </div>
        {average != null && (
          <div
            className="absolute inset-x-0 border-t-[1.5px] border-dashed border-ink-2"
            style={{ top: `${(1 - average / top) * 100}%` }}
          />
        )}
      </div>
      <div
        className="mt-2 ml-7.5 grid gap-[clamp(4px,1.4vw,14px)] text-center font-num text-[11px] leading-none font-semibold text-ink-3"
        style={grid}
      >
        {weeks.map((week, index) => (
          <span key={week} className={index === lastWeek ? "text-ink" : ""}>
            {week}
          </span>
        ))}
      </div>
    </figure>
  );
}

// One column's parts, bottom up; the top part gets the rounded corners.
const Stack = ({ parts, top, height }: { parts: BarPart[]; top: number; height: number }) =>
  parts.map((part, index) => (
    <i
      key={index}
      className={cn(
        "block flex-none border-t-2 border-s1 transition-opacity",
        index === parts.length - 1 && "rounded-t",
        part.dim && "opacity-20",
      )}
      style={{
        height: (part.value / top) * height,
        background: part.striped
          ? `repeating-linear-gradient(135deg,${part.color} 0 4px,color-mix(in srgb,${part.color} 35%,transparent) 4px 7px)`
          : part.color,
      }}
    />
  ));

type Series = { id: string; name: string; color: string; striped: boolean; threads: any[] };
// One row per goal, and one for the rest. A thread that serves two goals goes to the goal
// served most, so every thread is in exactly one row.
function seriesOf(north: North, byGoals: boolean): Series[] {
  const threads = north.threads;
  const served = (goal: any) =>
    threads.filter((thread) => goalsOf(north, thread).includes(goal.id)).length;
  const goals = [...north.goals].sort((first, second) => served(second) - served(first));
  const mainGoal = (thread: any) =>
    goals.find((goal) => goalsOf(north, thread).includes(goal.id))?.id ?? "none";
  return [
    ...goals.map((goal) => ({
      id: goal.id,
      name: goal.title,
      color: goal.color,
      striped: goal.kind === "personal",
    })),
    {
      id: "none",
      name: byGoals ? "Serves no goal" : "Everything else",
      color: "var(--rest)",
      striped: false,
    },
  ].map((row) => ({ ...row, threads: threads.filter((thread) => mainGoal(thread) === row.id) }));
}

// The weeks a row's threads fall in, for Trace.
function weeksOf(north: North, id: string) {
  const inRow = (thread: any) =>
    id === "none" ? !goalsOf(north, thread).length : goalsOf(north, thread).includes(id);
  const weeks = new Set(north.threads.filter(inRow).map((thread) => thread.weekIndex as number));
  return [...weeks]
    .sort((first, second) => first - second)
    .map((week) => north.weeks[week])
    .join(",");
}

// Where the work goes: threads per week, stacked by goal. Every bar adds up to its week.
function Where({ north, byGoals }: { north: North; byGoals: boolean }) {
  const [highlight, setHighlight] = useState<string | null>(null);
  const total = north.threads.length;
  const series = seriesOf(north, byGoals);
  const fit = sum(series.filter((row) => row.id !== "none").map((row) => row.threads.length));
  const what = byGoals ? "goal" : "project";
  const columns = north.weeks.map((week, weekIndex) => {
    const parts = series.map((row) => ({
      value: row.threads.filter((thread) => thread.weekIndex === weekIndex).length,
      color: row.color,
      striped: row.striped,
      dim: !!highlight && highlight !== row.id,
    }));
    const lines = parts
      .map((part, index) => (part.value ? `\n${series[index]!.name}: ${part.value}` : ""))
      .join("");
    return { title: `${week}: ${sum(parts.map((part) => part.value))} threads${lines}`, parts };
  });
  return (
    <Tile>
      <TileHead>
        <span className="lbl">Where the work goes</span>
        <span>
          <span className="ref">
            {percent(fit, total)}% serve a {byGoals ? "goal" : "top project"} ·{" "}
          </span>
          <a className="ref" href="#/goals">
            {byGoals ? "goals →" : "add your goals →"}
          </a>
        </span>
      </TileHead>
      <p className="-mt-1.5 mb-0 text-[13px] text-ink-3">
        Threads you kept each week, by the {what} they serve.
      </p>
      {/* Legend and bars point at each other: hover a row and only its series stays lit. */}
      <div
        className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]"
        onMouseLeave={() => setHighlight(null)}
        onBlur={() => setHighlight(null)}
      >
        <Plot
          weeks={north.weeks}
          height={220}
          label={`Threads per week by ${what}`}
          columns={columns}
        />
        <WhereTable
          north={north}
          series={series}
          heading={byGoals ? "Goal" : "Project"}
          highlight={highlight}
          setHighlight={setHighlight}
        />
      </div>
    </Tile>
  );
}

const thClass =
  "border-b border-line-2 pb-2.5 pl-2.5 text-right font-num text-[11px] leading-none font-semibold tracking-[.12em] text-ink-3 uppercase first:pl-0 first:text-left";
const tdClass =
  "border-b border-line py-2.5 pl-2.5 text-right font-num text-base leading-none font-semibold tabular-nums transition-opacity first:pl-0 first:text-left";
function WhereTable({
  north,
  series,
  heading,
  highlight,
  setHighlight,
}: {
  north: North;
  series: Series[];
  heading: string;
  highlight: string | null;
  setHighlight: (id: string) => void;
}) {
  const total = north.threads.length;
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={thClass}>{heading}</th>
          <th className={thClass}>Threads</th>
          <th className={thClass}>Share</th>
          <th className={thClass} title="You said it would not happen without you">
            Critical
          </th>
        </tr>
      </thead>
      <tbody>
        {series.map((row) => (
          <tr
            key={row.id}
            className={highlight && highlight !== row.id ? "[&>td]:opacity-20" : ""}
            onMouseEnter={() => setHighlight(row.id)}
          >
            <td className={tdClass}>
              <button
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 text-left font-sans text-[13.5px] leading-snug font-normal",
                  row.id === "none" ? "text-ink-2" : "text-ink",
                )}
                onFocus={() => setHighlight(row.id)}
                onClick={() => go(`#/trace?w=${weeksOf(north, row.id)}`)}
              >
                <Swatch color={row.color} striped={row.striped} />
                {row.name}
              </button>
            </td>
            <td className={tdClass}>{row.threads.length}</td>
            <td className={tdClass}>{percent(row.threads.length, total)}%</td>
            <td className={tdClass}>
              {row.threads.filter((thread) => thread.withoutMe === "wouldnt").length}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const deliveredColumn =
  "grid content-start gap-2.5 border-line py-4 first:pt-0 last:pb-0 max-md:border-t max-md:first:border-t-0 md:border-l md:px-5 md:py-0 md:first:border-l-0 md:first:pl-0 md:last:pr-0";

const Delivered = ({ north }: { north: North }) => (
  <Tile>
    <TileHead>
      <span className="lbl">How you delivered</span>
      <a className="ref" href="#/trace">
        trace →
      </a>
    </TileHead>
    <div className="grid md:grid-cols-3">
      <ByMode threads={north.threads} />
      <WithoutYou threads={north.threads} />
      <ReviewsGiven north={north} />
    </div>
  </Tile>
);

// By mode: longest first, in the mode colors Trace uses.
function ByMode({ threads }: { threads: any[] }) {
  const byMode = cnt(threads, (thread) => thread.mode);
  const modes = Object.keys(MODES).sort(
    (first, second) => (byMode[second] ?? 0) - (byMode[first] ?? 0),
  );
  const longest = Math.max(1, ...Object.values(byMode));
  return (
    <div className={deliveredColumn}>
      <ColumnHead>By mode</ColumnHead>
      {modes.map((mode) => (
        <div key={mode} className="grid grid-cols-[76px_minmax(0,1fr)_26px] items-center gap-2.5">
          <a
            className="ref font-sans text-[12.5px] font-normal text-ink-2"
            href={`#/refs?k=${mode}`}
          >
            {MODES[mode]}
          </a>
          <span className="h-2 rounded-xs bg-s3">
            <i
              data-grow="x"
              className="block h-full origin-left rounded-xs"
              style={{ width: `${((byMode[mode] ?? 0) / longest) * 100}%`, background: mc(mode) }}
            />
          </span>
          <span className="text-right font-num text-sm leading-none font-semibold tabular-nums">
            {byMode[mode] ?? 0}
          </span>
        </div>
      ))}
    </div>
  );
}

// Without you: parts of one whole, so one bar. Only "wouldn't happen" gets the accent.
const ANSWER_COLOR: Record<string, string> = {
  wouldnt: "var(--accent)",
  slower: "var(--ink-2)",
  same: "var(--rest)",
};
function WithoutYou({ threads }: { threads: any[] }) {
  const byAnswer = cnt(threads, (thread) => thread.withoutMe);
  const answers = Object.keys(WMS);
  const answered = sum(answers.map((answer) => byAnswer[answer] ?? 0));
  return (
    <div className={deliveredColumn}>
      <ColumnHead>
        Without you{" "}
        <a className="ref" href="#/refs?k=counterfactual">
          why →
        </a>
      </ColumnHead>
      <div
        className="flex h-3 gap-0.5 overflow-hidden rounded-[3px]"
        role="img"
        aria-label={answers.map((answer) => `${byAnswer[answer] ?? 0} ${WMS[answer]}`).join(", ")}
      >
        {answers
          .filter((answer) => byAnswer[answer])
          .map((answer) => (
            <i
              key={answer}
              data-grow="x"
              className="block origin-left"
              style={{ flex: byAnswer[answer], background: ANSWER_COLOR[answer] }}
            />
          ))}
      </div>
      <ul className="m-0 grid list-none gap-2 p-0">
        {answers.map((answer) => (
          <li
            key={answer}
            className="grid grid-cols-[14px_34px_1fr] items-center gap-2.5 text-[12.5px] text-ink-2"
          >
            <Swatch color={ANSWER_COLOR[answer]!} />
            <b className="text-right font-num text-base leading-none font-semibold text-ink tabular-nums">
              {byAnswer[answer] ?? 0}
            </b>
            <span>
              {WMS[answer]} · {percent(byAnswer[answer] ?? 0, answered)}%
            </span>
          </li>
        ))}
      </ul>
      {threads.length - answered > 0 && <By>{threads.length - answered} not answered yet</By>}
    </div>
  );
}

// Reviews given: the average as a dashed line, this week in ink. Not accent: a quiet week is not an alert.
function ReviewsGiven({ north }: { north: North }) {
  const reviews: number[] = north.reviewsGiven;
  const lastWeek = lastWeekOf(north);
  const average = mean(reviews);
  return (
    <div className={deliveredColumn}>
      <ColumnHead>
        Reviews given{" "}
        <a className="ref" href="#/refs?k=elevate">
          elevate →
        </a>
      </ColumnHead>
      <div className="flex items-baseline gap-2.5">
        <span
          className="num font-num text-[64px] leading-[.85] font-extrabold"
          data-count={reviews[lastWeek]}
        >
          {reviews[lastWeek]}
        </span>
        <span className="text-[12.5px] text-ink-3">
          in {north.weeks[lastWeek]} · average {average.toFixed(0)}
        </span>
      </div>
      <Plot
        weeks={north.weeks}
        height={110}
        label={`Reviews per week: ${reviews.join(", ")}`}
        average={average}
        columns={reviews.map((count, week) => ({
          title: `${north.weeks[week]}: ${count} reviews`,
          parts: [{ value: count, color: week === lastWeek ? "var(--ink)" : "var(--rest)" }],
        }))}
      />
    </div>
  );
}

type WeekNumber = {
  name: string;
  values: number[];
  unit?: string;
  decimals?: number;
  detail: string;
};
// Your time zone comes from this browser, so travel follows you. Work hours are a fixed 09–19.
function outsideWorkHours(timeZone: string) {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  });
  return (time: string) => {
    const part = Object.fromEntries(
      format.formatToParts(new Date(time)).map((piece) => [piece.type, piece.value]),
    );
    return part.weekday === "Sat" || part.weekday === "Sun" || +part.hour! < 9 || +part.hour! >= 19;
  };
}

// One value per week. Big number is this week; the bars are the weeks, average dashed.
function Numbers({ north }: { north: North }) {
  const numbers = north.numbers;
  const reviews: number[] = north.reviewsGiven;
  const lastWeek = lastWeekOf(north);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isLate = outsideWorkHours(timeZone);
  const outside = numbers.slackAt.map((times: string[]) =>
    percent(times.filter(isLate).length, times.length),
  );
  // Give vs take: PRs you reviewed per PR you opened. A week with none opened shows 0, not infinity.
  const give = reviews.map((reviewed, week) =>
    numbers.opened[week] ? +(reviewed / numbers.opened[week]).toFixed(1) : 0,
  );
  const tiles: WeekNumber[] = [
    {
      name: "Slack messages",
      values: numbers.slackMessages,
      detail: `in ${numbers.slackChannels[lastWeek]} channels`,
    },
    {
      name: "Meetings",
      values: numbers.meetingHours,
      unit: "h",
      decimals: 1,
      detail: "hours accepted or tentative",
    },
    {
      name: "Outside work hours",
      values: outside,
      unit: "%",
      detail: "of your messages, before 09, after 19 or weekends",
    },
    { name: "People who mention you", values: numbers.reach, detail: "different people in Slack" },
    {
      name: "Lead time",
      values: numbers.leadTimeHours,
      unit: "h",
      decimals: 1,
      detail: "median, opened to merged",
    },
    {
      name: "Give vs take",
      values: give,
      unit: "×",
      decimals: 1,
      detail: `${reviews[lastWeek]} PRs reviewed, ${numbers.opened[lastWeek]} opened`,
    },
  ];
  return (
    <Tile>
      <TileHead>
        <span className="lbl">Your weeks in numbers</span>
        <span className="ref">times in {timeZone}</span>
      </TileHead>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))]">
        {tiles.map((tile) => (
          <NumberTile key={tile.name} tile={tile} weeks={north.weeks} />
        ))}
      </div>
    </Tile>
  );
}

function NumberTile({ tile, weeks }: { tile: WeekNumber; weeks: string[] }) {
  const lastWeek = weeks.length - 1;
  const average = mean(tile.values);
  const max = Math.max(1, ...tile.values);
  const now = tile.values[lastWeek]!;
  return (
    <div className="flex flex-col gap-2 border-line px-5 py-0.5 first:border-l-0 first:pl-0 max-sm:border-t max-sm:px-0 max-sm:py-3 max-sm:first:border-t-0 sm:border-l">
      <ColumnHead>{tile.name}</ColumnHead>
      <span className="font-num text-[40px] leading-[.9] font-extrabold tabular-nums">
        <span data-count={Number.isInteger(now) ? now : undefined}>{now}</span>
        {tile.unit && <small className="ml-0.5 text-lg text-ink-3">{tile.unit}</small>}
      </span>
      <span className="text-[12.5px] text-ink-3">
        {tile.detail} · average {tile.decimals ? average.toFixed(1) : Math.round(average)}
      </span>
      <div
        className="relative mt-auto flex h-9 flex-none items-end gap-0.75"
        role="img"
        aria-label={`${tile.name} per week: ${tile.values.join(", ")}`}
      >
        {tile.values.map((value, week) => (
          <i
            key={week}
            data-grow="y"
            className={cn(
              "flex-1 origin-bottom rounded-t-xs",
              week === lastWeek ? "bg-ink" : "bg-(--rest)",
            )}
            style={{ height: `${(value / max) * 100}%` }}
            title={`${weeks[week]}: ${value}${tile.unit ?? ""}`}
          />
        ))}
        <span
          className="absolute inset-x-0 border-t-[1.5px] border-dashed border-ink-2"
          style={{ bottom: `${(average / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

const chipClass =
  "h-auto rounded-full border-line bg-secondary px-2.25 py-1.25 font-mono text-[11.5px] font-medium text-ink hover:border-brand hover:bg-secondary";
const smallText = "m-0 text-[13.5px] leading-normal text-ink-2";
const Avatar = ({ color, who }: { color: string; who: string }) => (
  <span
    aria-hidden="true"
    className="grid size-7 flex-none place-items-center rounded-full font-num text-[11px] font-bold tracking-[.04em] text-ink"
    style={{
      background: `color-mix(in srgb, ${color} 22%, var(--s2))`,
      boxShadow: `inset 0 0 0 1.5px ${color}`,
    }}
  >
    {initials(who)}
  </span>
);

// You correct Claude: the mention becomes information, and Claude sees it as an example next time.
async function markMention(id: string, kind: string | null) {
  const response = await post("/api/mention", { id, kind });
  if (!response.ok) toast(await response.text());
  return response.ok;
}

// RECOGNITION: praise that names your work, Claude's pick checked by code. One in focus, the rest one click away.
function PraiseBand({ north }: { north: North }) {
  const [praiseList, setPraiseList] = useState<any[]>(north.praise);
  const [removed, setRemoved] = useState<any>(null);
  // The highlight is where the praise starts; else the newest.
  const [shown, setShown] = useState<number>(
    () =>
      north.threads.find((thread) => thread.id === north.highlight?.threadId)?.praiseIndex ??
      Math.max(0, north.praise.length - 1),
  );
  async function notPraise(praise: any) {
    if (!(await markMention(praise.id, "info"))) return;
    const at = praiseList.indexOf(praise);
    const next = praiseList.filter((other) => other !== praise);
    setRemoved({ ...praise, at });
    setPraiseList(next);
    setShown(Math.min(shown, next.length - 1));
  }
  async function undo() {
    if (!(await markMention(removed.id, null))) return;
    setPraiseList([...praiseList.slice(0, removed.at), removed, ...praiseList.slice(removed.at)]);
    setShown(removed.at);
    setRemoved(null);
  }
  // A praise takes the color of the goal its work serves, so recognition reads against your goals.
  const goalOf = (praise: any) => {
    const thread = north.threads.find((candidate) => candidate.id === praise.threadId);
    return thread && north.goals.find((goal) => goalsOf(north, thread).includes(goal.id));
  };
  const colorOf = (praise: any) => goalOf(praise)?.color ?? "var(--rest)";
  const current = praiseList[shown];
  return (
    <Tile>
      <TileHead>
        <span className="lbl">Recognition</span>
        <By>
          {praiseList.length} in {north.weeks.length} weeks
        </By>
      </TileHead>
      {current ? (
        <Praise
          north={north}
          praise={current}
          goal={goalOf(current)}
          color={colorOf(current)}
          remove={notPraise}
        />
      ) : (
        <p className={smallText}>
          No praise yet. Shoutouts and thanks that name your work show up here.
        </p>
      )}
      {removed && <Removed praise={removed} quoted={!!current} undo={undo} />}
      {current && (
        <PraiseDots
          weeks={north.weeks}
          praiseList={praiseList}
          shown={shown}
          show={setShown}
          colorOf={colorOf}
        />
      )}
    </Tile>
  );
}

const Removed = ({ praise, quoted, undo }: { praise: any; quoted: boolean; undo: () => void }) => (
  <p className={smallText}>
    Removed: {praise.who}
    {quoted ? `, "${(praise.quote ?? praise.text).slice(0, 60)}"` : ""}.{" "}
    <Button variant="outline" size="xs" className={chipClass} onClick={undo}>
      Undo
    </Button>
  </p>
);

function Praise({
  north,
  praise,
  goal,
  color,
  remove,
}: {
  north: North;
  praise: any;
  goal: any;
  color: string;
  remove: (praise: any) => void;
}) {
  const thread = north.threads.find((candidate) => candidate.id === praise.threadId);
  const url = /^https:\/\//.test(praise.url ?? "") ? praise.url : null;
  const quote: string = praise.quote ?? praise.text;
  return (
    <>
      <p
        className={cn(
          "m-0 leading-[1.28] font-bold tracking-[-.01em] text-balance",
          quote.length > 110 ? "text-[clamp(17px,1.6vw,20px)]" : "text-[clamp(19px,2vw,24px)]",
        )}
      >
        <span className="text-brand">“</span>
        {quote}
        <span className="text-brand">”</span>
      </p>
      {praise.quote && praise.quote.length < praise.text.length * 0.7 && (
        <p className={smallText}>{praise.text}</p>
      )}
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar color={color} who={praise.who} />
        <div className="grid min-w-0">
          <b className="text-sm">{praise.who}</b>
          <By>
            {praise.where ?? ""} · {praise.when || north.weeks[praise.weekIndex]}
          </By>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {url && (
          <Button asChild variant="outline" size="xs" className={chipClass}>
            <a href={url} target="_blank" rel="noopener">
              Slack ↗
            </a>
          </Button>
        )}
        {goal && (
          <span className={cn(chipClass, "inline-flex items-center gap-1.5 border")}>
            <i className="dot" style={{ background: goal.color }} />
            {goal.short}
          </span>
        )}
        {thread && (
          <Button
            variant="outline"
            size="xs"
            className={chipClass}
            onClick={() => openItem(thread.id)}
          >
            {thread.title} →
          </Button>
        )}
        {praise.id && (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-[12.5px] font-normal text-ink-3 hover:bg-transparent hover:text-ink"
            onClick={() => remove(praise)}
          >
            Not recognition
          </Button>
        )}
      </div>
    </>
  );
}

// One dot per praise, in its week: the rhythm at a glance, and the way to pick one.
function PraiseDots({
  weeks,
  praiseList,
  shown,
  show,
  colorOf,
}: {
  weeks: string[];
  praiseList: any[];
  shown: number;
  show: (index: number) => void;
  colorOf: (praise: any) => string;
}) {
  return (
    <div
      className="mt-auto grid gap-1 border-t border-line pt-3"
      style={{ gridTemplateColumns: `repeat(${Math.max(8, weeks.length)}, minmax(0, 1fr))` }}
      role="group"
      aria-label="Praise per week"
    >
      {weeks.map((week, weekIndex) => (
        <div key={week}>
          <div className="flex min-h-3.5 flex-wrap items-end justify-center gap-1.25">
            {praiseList.map((praise, index) =>
              praise.weekIndex === weekIndex ? (
                <button
                  key={praise.id ?? index}
                  aria-label={`${praise.who}, ${week}${index === shown ? ", shown" : ""}`}
                  title={`${praise.who} · ${praise.about ?? praise.where ?? ""}`}
                  className={cn(
                    "size-3 cursor-pointer rounded-full transition-transform hover:scale-125 focus-visible:outline-ink",
                    index === shown &&
                      "scale-130 shadow-[0_0_0_2px_var(--s1),0_0_0_4px_var(--ink)]",
                  )}
                  style={{ background: colorOf(praise) }}
                  onClick={() => show(index)}
                />
              ) : null,
            )}
          </div>
          <span className="mt-1.5 block text-center font-mono text-[10.5px] font-medium text-ink-3">
            {week}
          </span>
        </div>
      ))}
    </div>
  );
}

// One stable color per person, from the name. Hues 40–310 only: red is for what needs you, never for a person.
const personHue = (name: string) =>
  40 + [...name].reduce((hue, character) => (hue * 31 + character.charCodeAt(0)) % 271, 7);

// WHO COMES TO YOU: people who asked you for a review, a decision or an answer in Slack.
function Asks({ north }: { north: North }) {
  const asks: any[] = north.asks ?? [];
  const head = (caption: string) => (
    <TileHead>
      <span className="lbl">Who comes to you</span>
      <By>{caption}</By>
    </TileHead>
  );
  if (!asks.length)
    return (
      <Tile>
        {head("Slack")}
        <p className="m-0 text-[13.5px] text-ink-2">
          No asks yet. Reviews, decisions and questions people bring you show up here.
        </p>
      </Tile>
    );
  const max = Math.max(1, ...asks.flatMap((ask) => ask.perWeek));
  return (
    <Tile>
      {head(`asks in Slack · ${north.weeks[0]}–${north.weeks[lastWeekOf(north)]}`)}
      <ol className="m-0 grid list-none p-0">
        {asks.map((ask) => (
          <AskRow key={ask.who} ask={ask} weeks={north.weeks} max={max} />
        ))}
      </ol>
    </Tile>
  );
}

function AskRow({ ask, weeks, max }: { ask: any; weeks: string[]; max: number }) {
  const color = `oklch(0.72 0.13 ${personHue(ask.who)})`;
  const lastWeek = weeks.length - 1;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
      <Avatar color={color} who={ask.who} />
      <div className="grid min-w-0 gap-0.5">
        <b className="text-sm">{ask.who}</b>
        <span className="truncate text-[12.5px] text-ink-3" title={ask.about.join(" · ")}>
          {ask.about.join(" · ")}
        </span>
      </div>
      <span
        className="flex h-5.5 items-end gap-0.5"
        role="img"
        aria-label={`per week: ${ask.perWeek.join(", ")}`}
      >
        {ask.perWeek.map((count: number, week: number) => (
          <i
            key={week}
            className="min-h-0.5 w-1.25 rounded-[1px]"
            style={{
              height: `${count ? (count / max) * 100 : 0}%`,
              background:
                week === lastWeek ? color : `color-mix(in srgb, ${color} 45%, transparent)`,
            }}
            title={`${weeks[week]}: ${count}`}
          />
        ))}
      </span>
      <span className="num min-w-[2ch] text-right font-num text-xl leading-none font-bold">
        {ask.count}
      </span>
    </li>
  );
}

// The experiment from your last feedback week, unless you passed on it.
function TryThisWeek({ north }: { north: North }) {
  const week = north.feedback?.[0];
  const experiment = week?.verdicts?.experiment?.verdict === "reject" ? null : week?.experiment;
  if (!experiment) return null;
  const trend: number[] | undefined = experiment.trend;
  return (
    <button
      data-tile
      className={cn(
        buttonTileClass,
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2.5",
      )}
      onClick={() => go("#/feedback")}
    >
      <div className="grid min-w-0 gap-2">
        <span className="lbl">Try this week</span>
        <p className="m-0 text-base leading-[1.45] font-semibold text-pretty">{experiment.do}</p>
        <By>from the pattern “{experiment.pattern ?? ""}” · open feedback →</By>
      </div>
      {trend && <ExperimentTrend trend={trend} week={week.week} />}
    </button>
  );
}

// Fewer than average this week is good: green. Else red.
function ExperimentTrend({ trend, week }: { trend: number[]; week: string }) {
  const now = trend.at(-1)!;
  const good = now < mean(trend);
  const max = Math.max(1, ...trend);
  const nowColor = good ? "bg-ok" : "bg-brand";
  return (
    <div className="grid gap-1 self-start justify-items-end">
      <span
        className={cn(
          "num font-num text-[40px] leading-[.9] font-extrabold",
          good ? "text-ok" : "text-brand",
        )}
      >
        {now}
      </span>
      <By>times in {shortWeek(week)}</By>
      <span className="flex h-8.5 items-end gap-0.75" aria-hidden="true">
        {trend.map((count, index) => (
          <i
            key={index}
            className={cn("w-2 rounded-t-xs", index < trend.length - 1 ? "bg-(--rest)" : nowColor)}
            style={{ height: (count / max) * 30 + 2 }}
          />
        ))}
      </span>
    </div>
  );
}

function ReviewStatus({ left, weeks }: { left: number; weeks: number }) {
  if (left)
    return (
      <>
        <span className="mr-1 font-num text-[28px] leading-none font-extrabold text-brand">
          {left}
        </span>{" "}
        thread{left > 1 ? "s" : ""} wait for your answer
      </>
    );
  if (weeks)
    return (
      <>
        <Check className="inline size-4 text-ok" aria-hidden="true" /> All caught up
      </>
    );
  return <>No weeks collected yet</>;
}

// PENDING: your undecided threads per week. Red only where something waits for you; done weeks stay quiet.
function ToReview({ pending }: { pending: Record<string, number> }) {
  const weeks = Object.keys(pending).sort();
  const left = sum(weeks.map((week) => pending[week]!));
  const doneColor = left ? "bg-ink-2" : "bg-ok/70";
  return (
    <button data-tile className={buttonTileClass} onClick={() => go("#/review")}>
      <span className="lbl">To review</span>
      <p className="m-0 line-clamp-2 text-[17px] leading-[1.35] font-semibold">
        <ReviewStatus left={left} weeks={weeks.length} />
      </p>
      <div className="flex gap-0.75">
        {weeks.map((week) => (
          <i
            key={week}
            className={cn("h-1 flex-1 rounded-xs", pending[week] ? "bg-brand" : doneColor)}
            title={`${week}: ${pending[week] ? `${pending[week]} left` : "done"}`}
          />
        ))}
      </div>
      <span className="ref">
        {left || !weeks.length
          ? "open review →"
          : `${weeks.length} weeks reviewed · review again →`}
      </span>
    </button>
  );
}

// Tiles rise in order; bars grow from their baseline, left to right, so the eye reads the weeks in order.
function animateHome(root: HTMLElement) {
  gsap.fromTo(
    "[data-tile]",
    { y: 14, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.5, stagger: 0.05, ease: "power2.out", clearProps: "all" },
  );
  gsap.fromTo(
    "[data-grow=y]",
    { scaleY: 0 },
    { scaleY: 1, duration: 0.8, stagger: 0.04, ease: "expo.out", delay: 0.2 },
  );
  gsap.fromTo(
    "[data-grow=x]",
    { scaleX: 0 },
    { scaleX: 1, duration: 0.8, stagger: 0.04, ease: "expo.out", delay: 0.3 },
  );
  root.querySelectorAll<HTMLElement>("[data-count]").forEach((element) => {
    countUp(element, +element.dataset.count!, 1.1);
  });
}

function Heading({ north }: { north: North }) {
  const weeks = north.weeks;
  const critical = north.threads.filter((thread) => thread.withoutMe === "wouldnt").length;
  return (
    <div className="vhead">
      <div>
        <h1>
          {weeks[0]}–{weeks.at(-1)} <em>·</em> {weeks.length} weeks
        </h1>
        <p>
          <b>{north.threads.length}</b> threads you kept, <b>{north.praise.length}</b> times people
          praised your work, <b>{critical}</b> that would not have happened without you.
        </p>
      </div>
      <Button
        variant="outline"
        className="h-auto gap-2.5 rounded-full bg-s2 py-2 pr-4 pl-2 text-[13px] hover:border-brand hover:bg-s2"
        onClick={openStory}
      >
        <span
          className="grid size-7 place-items-center rounded-full bg-brand text-[#111]"
          aria-hidden="true"
        >
          <Play className="size-3 fill-current" />
        </span>
        Recap · {north.phases.length + 4} screens
      </Button>
    </div>
  );
}

function Home() {
  const [north] = useNorth();
  const [pending, setPending] = useState<Record<string, number>>({});
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    loadPending().then(setPending);
  }, []);
  useMotion(root, () => animateHome(root.current!), [north]);
  if (!north) return <section className="view" id="v-home" />;
  const byGoals = north.goalsFrom == null || north.goalsFrom === "goals";
  return (
    <section className="view" id="v-home" ref={root}>
      {north.sample && (
        <SampleNote href="#/review">
          Example data, not yours. North and Trace show your weeks once you keep a thread in review.{" "}
          <b className="font-semibold text-brand">Open Review →</b>
        </SampleNote>
      )}
      <Heading north={north} />
      {/* One question per band, read top to bottom. */}
      <div className="grid gap-3">
        <Where north={north} byGoals={byGoals} />
        <Delivered north={north} />
        {north.numbers && <Numbers north={north} />}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-3">
          <PraiseBand north={north} />
          <Asks north={north} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-3">
          <TryThisWeek north={north} />
          <ToReview pending={pending} />
        </div>
      </div>
    </section>
  );
}

export const View = (_: { p: URLSearchParams }) => <Home />;
