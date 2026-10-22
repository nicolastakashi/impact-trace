// FEEDBACK: how you show up, from your own messages. The experiment first, then each pattern
// with your words and a stronger version.
// Color map: brand = the weak pattern (its phrases, its counts), ink = the stronger rewrite,
// dashed + pulse = next week's count, not measured yet, --m-build = what to keep doing.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Check, ChevronRight, X } from "lucide-react";
import {
  fmtWhen,
  type North,
  plural,
  post,
  reduced,
  SampleNote,
  shortWeek,
  sum,
  toast,
  useMotion,
  useNorth,
} from "./lib";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";
import { Input } from "./ui/input";

// One collected week of feedback, a pattern (or the strength) in it, and a Slack message it quotes.
type FeedbackWeek = any;
type Pattern = any;
type Message = any;
type Verdict = "accept" | "reject";
type SaveVerdict = (key: string, verdict: string | null, why?: string) => void;

const nextWeek = (week: string) => `W${String(+week.slice(6) + 1).padStart(2, "0")}`; // ponytail: W53 and New Year are not handled
const whereSaid = (message: Message) =>
  `${message.channel} · ${shortWeek(message.week)}${message.at ? ` · ${fmtWhen(Date.parse(message.at))}` : ""}`;
const markerPattern = (markers: string[], flags: string) =>
  new RegExp(
    markers.map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
    flags,
  );
// The tabs: each pattern, then the strength to keep.
const patternsOf = (week: FeedbackWeek): Pattern[] => [
  ...week.patterns.map((pattern: Pattern) => ({ ...pattern, key: `pattern:${pattern.name}` })),
  ...(week.strength ? [{ ...week.strength, keep: true, key: "strength" }] : []),
];
const verdictOf = (week: FeedbackWeek, key: string) =>
  week?.verdicts?.[key]?.verdict as Verdict | undefined;
// What a verdict does, said where you made it.
const NOTE: Record<string, Record<string, string>> = {
  pattern: {
    accept: "Accepted. Claude keeps tracking it next week, and its count shows there.",
    reject:
      "Rejected. Next week Claude leaves it out, unless new messages show it clearly. A reason helps it learn what you mean.",
  },
  strength: {
    accept: "Accepted. Claude keeps it as a strength to build on.",
    reject: "Rejected. Claude will not call this a strength again without new evidence.",
  },
  experiment: {
    accept: "Next Monday counts these phrases in {w} and shows before → after here.",
    reject:
      "Passed. Next week Claude proposes a different experiment, and nothing is measured for this one.",
  },
};
const say = (message: string) => toast(message, 2200);
function savedMessage(verdict: string | null, why?: string) {
  if (why != null) return "Reason saved. Claude reads it next week.";
  if (!verdict) return "Taken back";
  if (verdict === "accept") return "Accepted";
  return "Rejected. Say why, and Claude learns from it.";
}
// The example has no server behind it: the verdict lives on this page only.
function sampleMessage(verdict: string | null) {
  if (!verdict) return "Taken back";
  return verdict === "accept" ? "Accepted (example only)" : "Rejected (example only)";
}

// Wrap the pattern's phrases in <mark>, so you see which words carry it. The highlight grows in once the card is "on".
function Marked({ text, markers }: { text: string; markers?: string[] }) {
  if (!markers?.length) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let from = 0;
  for (const match of text.matchAll(markerPattern(markers, "gi"))) {
    out.push(
      text.slice(from, match.index),
      <mark
        key={match.index}
        className="rounded-xs bg-transparent bg-[linear-gradient(color-mix(in_srgb,var(--accent)_38%,transparent),color-mix(in_srgb,var(--accent)_38%,transparent))] bg-size-[0%_45%] bg-bottom-left bg-no-repeat px-0.5 text-ink transition-[background-size] duration-550 ease-[cubic-bezier(.16,1,.3,1)] group-data-on:bg-size-[100%_45%]"
      >
        {match[0]}
      </mark>,
    );
    from = match.index! + match[0].length;
  }
  return (
    <>
      {out}
      {text.slice(from)}
    </>
  );
}
const Markers = ({ markers }: { markers: string[] }) => (
  <span className="inline-flex flex-wrap gap-1.25">
    {markers.map((marker) => (
      <code
        key={marker}
        className="rounded-md bg-[color-mix(in_srgb,var(--accent)_12%,var(--s3))] px-1.75 py-0.75 font-mono text-[11.5px] font-medium text-ink"
      >
        {marker}
      </code>
    ))}
  </span>
);
const SlackLink = ({ url }: { url?: string | null }) =>
  url ? (
    <a className="ref ml-auto" href={url} target="_blank" rel="noopener">
      open in Slack ↗
    </a>
  ) : null;
const Fold = ({
  className,
  children,
  summary,
}: {
  className?: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) => (
  <details className={cn("group/f", className)}>
    <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
      {summary}
      <ChevronRight
        className="size-3 text-ink-3 transition-transform group-open/f:rotate-90"
        aria-hidden="true"
      />
    </summary>
    {children}
  </details>
);

// Count per week, the last bar is this week. `next` adds next week's bar: dashed, not measured yet.
function Bars({
  trend,
  weeks,
  next,
  height,
}: {
  trend: number[];
  weeks: string[];
  next?: string;
  height: number;
}) {
  const max = Math.max(1, ...trend);
  const columns = {
    gridTemplateColumns: `repeat(${trend.length + (next ? 1 : 0)}, minmax(0, 1fr))`,
  };
  return (
    <div className="grid gap-2" aria-hidden="true">
      <div className="grid items-end gap-1.5" style={{ ...columns, height: height + 28 }}>
        {trend.map((count, index) => (
          <div key={index} className="flex h-full flex-col items-center justify-end gap-1.25">
            <em className="font-num text-xs font-semibold text-ink-3 not-italic tabular-nums">
              {count}
            </em>
            <i
              data-bar
              className={cn(
                "block w-full origin-bottom rounded-t-sm rounded-b-xs",
                index === trend.length - 1
                  ? "bg-brand shadow-[0_0_18px_-4px_var(--accent)]"
                  : "bg-[color-mix(in_srgb,var(--accent)_45%,var(--s3))]",
              )}
              style={{ height: (count / max) * height + 3 }}
            />
          </div>
        ))}
        {next && (
          <div
            className="flex h-full flex-col items-center justify-end gap-1.25"
            title="Measured after the next collection"
          >
            <em className="font-num text-xs font-semibold text-ink-2 not-italic">?</em>
            <i
              className="block w-full animate-[fb-pulse_2.4s_ease-in-out_infinite] rounded-t-sm rounded-b-xs border-[1.5px] border-dashed border-input motion-reduce:animate-none"
              style={{ height }}
            />
          </div>
        )}
      </div>
      <div
        className="grid gap-1.5 text-center font-mono text-[10.5px] font-medium text-ink-3"
        style={columns}
      >
        {weeks.map((week) => (
          <span key={week}>{shortWeek(week)}</span>
        ))}
        {next && <span className="text-ink">{next}</span>}
      </div>
      <style>{"@keyframes fb-pulse{50%{opacity:.45}}"}</style>
    </div>
  );
}

const verdictButton = "bg-secondary font-normal text-ink-2 hover:text-ink";
const keyHint = "h-4.5 min-w-4.5 border-b-2 text-[10px]";
// Keys A and R judge the pattern in focus, so only its buttons show them.
function VerdictButtons({
  verdict,
  set,
  yes = "Accept",
  no = "Reject",
  keys = true,
}: {
  verdict?: string;
  set: (verdict: Verdict) => void;
  yes?: string;
  no?: string;
  keys?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Your verdict">
      <Button
        variant="outline"
        size="sm"
        aria-pressed={verdict === "accept"}
        onClick={() => set("accept")}
        className={cn(
          verdictButton,
          "aria-pressed:border-(--m-build) aria-pressed:bg-[color-mix(in_srgb,var(--m-build)_15%,var(--s2))] aria-pressed:text-ink",
        )}
      >
        <Check />
        {yes}
        {keys && <kbd className={keyHint}>A</kbd>}
      </Button>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={verdict === "reject"}
        onClick={() => set("reject")}
        className={cn(
          verdictButton,
          "aria-pressed:border-brand aria-pressed:bg-[color-mix(in_srgb,var(--accent)_13%,var(--s2))] aria-pressed:text-ink",
        )}
      >
        <X />
        {no}
        {keys && <kbd className={keyHint}>R</kbd>}
      </Button>
    </div>
  );
}
const Note = ({ children }: { children: string }) => (
  <p
    className="m-0 rounded-lg border border-line bg-secondary px-3.5 py-2.5 text-[13.5px] leading-normal text-ink-2"
    role="status"
  >
    {children}
  </p>
);
function WhyForm({ why, save }: { why?: string | null; save: (why: string) => void }) {
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save(String(new FormData(event.currentTarget).get("why")));
      }}
    >
      <Input
        id="fb-why"
        name="why"
        maxLength={400}
        autoComplete="off"
        defaultValue={why ?? ""}
        aria-label="Why you rejected it"
        placeholder="What is wrong with it? Claude reads this next week."
        className="min-w-[min(260px,100%)] flex-1 bg-s1"
      />
      <Button variant="secondary" className="border border-input bg-s3">
        Save reason
      </Button>
    </form>
  );
}

// Why a pattern counts: its first source, the rest on the References page.
function Source({ categories, pattern }: { categories: any[]; pattern: Pattern }) {
  const kind = pattern.keep ? "strength" : "pattern";
  const source = categories.find(
    (category) => category.id === pattern.category && category.kind === kind,
  )?.refs[0];
  if (!source) return null;
  return (
    <Fold
      className="fb-a"
      summary={
        <span className="font-mono text-xs font-medium text-ink-3 hover:text-ink">{`Why this counts · ${source.who.split(",")[0]}`}</span>
      }
    >
      <div className="mt-2 flex max-w-[62ch] flex-wrap gap-x-3.5 gap-y-1 rounded-xl border border-line bg-secondary px-3.5 py-3">
        <p className="m-0 w-full text-sm leading-normal">
          {source.q ? `“${source.q}”` : source.says}
        </p>
        <a className="ref" href={source.url} target="_blank" rel="noopener">
          {source.who} ↗
        </a>
        {source.warn && <span className="ref">{source.warn}</span>}
        <a className="ref" href="#/refs?k=feedback">
          all sources →
        </a>
      </div>
    </Fold>
  );
}

function Quote({ message, pattern, on }: { message: Message; pattern: Pattern; on: boolean }) {
  return (
    <article
      data-on={on || undefined}
      className={cn(
        "group grid gap-3 rounded-xl border border-line bg-secondary px-4.5 py-4",
        pattern.keep && "border-[color-mix(in_srgb,var(--m-build)_35%,var(--line))]",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 font-mono text-[11.5px] font-medium text-ink-3">
        <span>{whereSaid(message)}</span>
        <SlackLink url={message.url} />
      </div>
      <p className="m-0 text-[15.5px] leading-normal text-ink-2">
        “<Marked text={message.quote} markers={pattern.markers} />”
      </p>
      {message.instead && (
        <div data-now className="grid gap-1 border-t border-dashed border-input pt-3">
          <span className="font-mono text-[10.5px] font-medium tracking-wider text-ink-3 uppercase">
            Next time
          </span>
          <p className="m-0 text-[15.5px] leading-normal font-medium text-ink">{message.instead}</p>
        </div>
      )}
    </article>
  );
}

// Diagnosis, then the fix: the card comes in, its weak words get marked, then the stronger version appears.
function animateFocus() {
  gsap.from("[data-bar]", {
    scaleY: 0,
    duration: 0.6,
    ease: "expo.out",
    stagger: 0.04,
    clearProps: "transform",
  });
  gsap.from(".fb-a", {
    opacity: 0,
    y: 8,
    filter: "blur(6px)",
    duration: 0.45,
    ease: "power3.out",
    stagger: 0.04,
    clearProps: "all",
  });
  gsap.utils.toArray<HTMLElement>("article").forEach((card, index) => {
    gsap.from(card, {
      opacity: 0,
      y: 12,
      duration: 0.45,
      ease: "power3.out",
      delay: 0.12 + index * 0.1,
      clearProps: "all",
    });
    const rewrite = card.querySelector("[data-now]");
    if (rewrite)
      gsap.from(rewrite, {
        opacity: 0,
        x: -8,
        filter: "blur(4px)",
        duration: 0.5,
        ease: "power3.out",
        delay: 0.75 + index * 0.1,
        clearProps: "all",
      });
  });
}

// The card's marks grow in a beat after it lands; reduced motion shows them at once.
function useMarksOn(ref: React.RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  useLayoutEffect(() => {
    if (reduced() || !ref.current) {
      setOn(true);
      return;
    }
    const context = gsap.context(animateFocus, ref);
    const timer = setTimeout(() => setOn(true), 320);
    return () => {
      context.revert();
      clearTimeout(timer);
    };
  }, []);
  return on;
}

function Focus({
  week,
  pattern,
  categories,
  note,
  set,
}: {
  week: FeedbackWeek;
  pattern: Pattern;
  categories: any[];
  note: boolean;
  set: SaveVerdict;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const on = useMarksOn(ref);
  const verdict = verdictOf(week, pattern?.key);
  if (!pattern)
    return <p className="m-0 p-6 text-[15px] text-ink-2">No pattern stood out in these weeks.</p>;
  const [first, ...rest] = pattern.evidence as Message[];
  const more: Message[] = pattern.matches ?? [];
  const label = [
    rest.length && plural(rest.length, "more example"),
    more.length && plural(more.length, "more message"),
    !pattern.keep && "8-week count",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      ref={ref}
      role="tabpanel"
      className={cn(
        "grid gap-4 px-[clamp(16px,2.6vw,30px)] py-6",
        verdict === "reject" && "[&_.fb-q]:opacity-45",
      )}
    >
      <div className="fb-a flex flex-wrap items-center justify-between gap-2.5">
        <h2 className="m-0 font-num text-[clamp(24px,2.6vw,34px)] leading-[1.02] font-extrabold text-balance uppercase">
          {pattern.name}
        </h2>
        <VerdictButtons
          verdict={verdict}
          set={(choice) => set(pattern.key, verdict === choice ? null : choice)}
        />
      </div>
      {note && verdict && <Note>{NOTE[pattern.keep ? "strength" : "pattern"]![verdict]!}</Note>}
      {verdict === "reject" && (
        <WhyForm
          why={week.verdicts[pattern.key].why}
          save={(why) => set(pattern.key, "reject", why)}
        />
      )}
      <p className="fb-a m-0 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">{pattern.why}</p>
      <Source categories={categories} pattern={pattern} />
      <div className="fb-q grid gap-2.5 transition-opacity">
        {first && <Quote message={first} pattern={pattern} on={on} />}
      </div>
      {label && (
        <Fold
          summary={<span className="py-1.5 text-[13.5px] text-ink-2 hover:text-ink">{label}</span>}
        >
          <div className="mt-2.5 grid gap-3">
            {!pattern.keep && <PatternCount week={week} pattern={pattern} more={more.length} />}
            {rest.length > 0 && (
              <div className="fb-q grid gap-2.5 transition-opacity">
                {rest.map((message, index) => (
                  <Quote key={index} message={message} pattern={pattern} on />
                ))}
              </div>
            )}
            {more.length > 0 && <MoreMessages messages={more} markers={pattern.markers} />}
          </div>
        </Fold>
      )}
    </div>
  );
}

// Two quotes can come from one message: count messages, so the numbers add up to the total.
function PatternCount({
  week,
  pattern,
  more,
}: {
  week: FeedbackWeek;
  pattern: Pattern;
  more: number;
}) {
  const hasMarker = markerPattern(pattern.markers, "i");
  const quoted = new Set(
    pattern.evidence
      .filter((message: Message) => hasMarker.test(message.quote))
      .map((message: Message) => message.at + message.channel),
  ).size;
  const unmarked = pattern.evidence.length - quoted;
  return (
    <div className="grid gap-2">
      <p className="m-0 text-[13.5px] text-ink-2">
        <b>{sum(pattern.trend)}</b> messages with <Markers markers={pattern.markers} />:
        {` ${quoted} quoted with a stronger version${more ? `, ${more} more below` : ""}.`}
        {unmarked > 0 ? ` ${unmarked} quoted say it in other words, not counted.` : ""}
      </p>
      <Bars trend={pattern.trend} weeks={week.weeks} height={40} />
    </div>
  );
}

const MoreMessages = ({ messages, markers }: { messages: Message[]; markers: string[] }) => (
  <ol className="m-0 grid list-none gap-2 p-0">
    {messages.map((message, index) => (
      <li
        key={index}
        data-on
        className="group grid gap-1 rounded-xl border border-dashed border-input px-3.5 py-3"
      >
        <div className="flex flex-wrap items-baseline gap-x-2.5 font-mono text-[11.5px] font-medium text-ink-3">
          <span>{whereSaid(message)}</span>
          <SlackLink url={message.url} />
        </div>
        <p className="m-0 text-sm leading-normal text-ink-2">
          <Marked text={message.text} markers={markers} />
        </p>
      </li>
    ))}
  </ol>
);

// This week's one action, and the count that measures it, with next week still to come.
function Experiment({
  week,
  experiment,
  verdict,
  note,
  set,
}: {
  week: FeedbackWeek;
  experiment: any;
  verdict?: string;
  note: boolean;
  set: (verdict: string | null, why?: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const trend: number[] | undefined = experiment.trend;
  useMotion(ref, () => {
    gsap.from("[data-bar]", {
      scaleY: 0,
      duration: 0.7,
      ease: "expo.out",
      stagger: 0.05,
      clearProps: "transform",
    });
    gsap.from("[data-do]", {
      opacity: 0,
      y: 10,
      filter: "blur(6px)",
      duration: 0.6,
      ease: "power3.out",
      clearProps: "all",
    });
  }, [week.week]);
  const dim = verdict === "reject" && "opacity-45";
  return (
    <div
      ref={ref}
      className="relative grid gap-x-10 gap-y-7 overflow-hidden rounded-2xl border border-line bg-card px-[clamp(18px,3vw,34px)] py-7 shadow-card min-[861px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-[-40%_-20%_auto_45%] h-[160%] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent)_13%,transparent),transparent)]"
      />
      <div className="relative grid content-start">
        <span className="lbl">Try this week</span>
        <p
          data-do
          className={cn(
            "mt-3 mb-4 text-[clamp(21px,2.3vw,29px)] leading-[1.28] font-semibold tracking-[-.01em] text-balance",
            dim,
          )}
        >
          {experiment.do}
        </p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-ink-3">
          <span>Measured by</span>
          <Markers markers={experiment.markers} />
        </div>
        <div className="mt-4.5 grid gap-3">
          <VerdictButtons
            verdict={verdict}
            set={(choice) => set(verdict === choice ? null : choice)}
            yes="I'll try it"
            no="Not this one"
            keys={false}
          />
          {note && verdict && (
            <Note>{NOTE.experiment![verdict]!.replace("{w}", nextWeek(week.week))}</Note>
          )}
          {verdict === "reject" && (
            <WhyForm why={week.verdicts.experiment.why} save={(why) => set("reject", why)} />
          )}
        </div>
      </div>
      {trend && (
        <div className={cn("relative grid content-end gap-2", dim)}>
          <span className="text-[13px] text-ink-2">
            <b className="mr-1.5 font-num text-[34px] leading-none font-extrabold text-ink tabular-nums">
              {sum(trend)}
            </b>
            {`messages with these phrases in 8 weeks, ${trend.at(-1)} in ${shortWeek(week.week)}`}
          </span>
          <Bars trend={trend} weeks={week.weeks} next={nextWeek(week.week)} height={84} />
        </div>
      )}
    </div>
  );
}

function WeekPicker({
  weeks,
  current,
  pick,
}: {
  weeks: FeedbackWeek[];
  current: number;
  pick: (index: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Feedback week">
      {weeks.map((feedbackWeek, index) => (
        <Button
          key={feedbackWeek.week}
          variant="outline"
          size="xs"
          aria-pressed={index === current}
          onClick={() => pick(index)}
          className="rounded-full px-3 font-num text-xs font-semibold tracking-[.08em] text-ink-3 aria-pressed:border-ink-3 aria-pressed:text-ink"
        >
          {shortWeek(feedbackWeek.week)}
        </Button>
      ))}
    </div>
  );
}

function LastExperiment({ week }: { week: FeedbackWeek }) {
  const previous = week.previous;
  return (
    <Fold
      className="rounded-xl border border-dashed border-input px-4.5 py-3 text-sm text-ink-2"
      summary={
        <span className="flex items-baseline gap-3.5">
          <span className="lbl">{`Last experiment · ${shortWeek(previous.week)}`}</span>
          {previous.before != null && previous.after != null && (
            <span className="font-mono text-sm font-semibold text-ink">{`${previous.before} → ${previous.after}`}</span>
          )}
        </span>
      }
    >
      <p className="mt-2 mb-0">{previous.do}</p>
      {week.last_experiment && <p className="mt-2 mb-0">{week.last_experiment}</p>}
    </Fold>
  );
}

function VerdictTag({ verdict }: { verdict?: Verdict }) {
  if (verdict === "accept")
    return (
      <>
        <span className="text-(--m-build)">accepted</span> ·{" "}
      </>
    );
  if (verdict === "reject") return <>rejected · </>;
  return null;
}

function PatternTabs({
  week,
  patterns,
  current,
  pick,
}: {
  week: FeedbackWeek;
  patterns: Pattern[];
  current: number;
  pick: (index: number) => void;
}) {
  return (
    <div
      className="flex gap-0.5 overflow-x-auto border-b border-line bg-[color-mix(in_srgb,var(--s2)_60%,transparent)] px-2 pt-2 [scrollbar-width:none]"
      role="tablist"
      aria-label="What Claude saw"
    >
      {patterns.map((tabPattern, index) => {
        const verdict = verdictOf(week, tabPattern.key);
        return (
          <button
            key={tabPattern.key}
            role="tab"
            aria-selected={index === current}
            onClick={() => pick(index)}
            className={cn(
              "grid max-w-65 flex-none cursor-pointer gap-0.75 rounded-t-lg border-b-2 border-transparent px-4 pt-2.75 pb-3 text-left text-ink-2 hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] aria-selected:bg-s1",
              tabPattern.keep
                ? "aria-selected:border-b-(--m-build)"
                : "aria-selected:border-b-brand",
            )}
          >
            <b
              className={cn(
                "flex items-center gap-1 text-sm leading-tight font-semibold",
                index === current ? "text-ink" : "text-ink-2",
                verdict === "reject" && "line-through decoration-ink-3",
              )}
            >
              {tabPattern.keep && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
              {tabPattern.name}
            </b>
            <small className="font-mono text-[11.5px] font-medium text-ink-3">
              <VerdictTag verdict={verdict} />
              {tabPattern.keep ? "keep doing" : `${sum(tabPattern.trend)} messages`}
            </small>
          </button>
        );
      })}
    </div>
  );
}

// A and R judge the pattern in focus, the way Review takes keys.
function useVerdictKeys(judge: (verdict: Verdict) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement).closest?.("input, textarea, select");
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        typing ||
        document.querySelector("[role=dialog]")
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "a") judge("accept");
      if (key === "r") judge("reject");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
}

const leadOf = (week: FeedbackWeek | undefined) =>
  week && (week.messages.at(-1) || week.patterns.length)
    ? `${sum(week.messages)} of your Slack messages · ${shortWeek(week.weeks[0])}–${shortWeek(week.weeks.at(-1))}`
    : "";

export function Feedback({ params }: { params: URLSearchParams }) {
  const [north, refresh] = useNorth();
  const [weeks, setWeeks] = useState<FeedbackWeek[] | null>(null);
  const [weekAt, setWeekAt] = useState(0);
  const [tab, setTab] = useState(+(params.get("p") ?? 0) || 0);
  const [justJudged, setJustJudged] = useState<string | null>(null);
  const [askWhy, setAskWhy] = useState(0);
  // The server's copy wins each time it comes back; in between, a verdict shows at once.
  useEffect(() => {
    if (!north) return;
    const all = north.feedback ?? [];
    if (!weeks)
      setWeekAt(
        Math.max(
          0,
          all.findIndex(
            (feedbackWeek: FeedbackWeek) => shortWeek(feedbackWeek.week) === params.get("w"),
          ),
        ),
      );
    setWeeks(all);
  }, [north]);
  useEffect(() => {
    if (askWhy) document.getElementById("fb-why")?.focus();
  }, [askWhy]);
  const week = weeks?.[weekAt];
  const patterns = week ? patternsOf(week) : [];
  const current = Math.min(tab, Math.max(0, patterns.length - 1));
  const pattern = patterns[current];
  useEffect(() => {
    if (week) history.replaceState(null, "", `#/feedback?w=${shortWeek(week.week)}&p=${current}`);
  }, [week?.week, current]);

  async function saveVerdict(key: string, verdict: string | null, why?: string) {
    const old = week.verdicts?.[key];
    const put = (value: any) =>
      setWeeks((all) =>
        all!.map((feedbackWeek, index) => {
          if (index !== weekAt) return feedbackWeek;
          const verdicts = { ...feedbackWeek.verdicts };
          if (value) verdicts[key] = value;
          else delete verdicts[key];
          return { ...feedbackWeek, verdicts };
        }),
      );
    setJustJudged(key);
    put(verdict && { verdict, why: why ?? null });
    if (north!.sample) return say(sampleMessage(verdict));
    const response = await post("/api/feedback", {
      week: week.week,
      piece: key,
      verdict,
      why,
    }).catch(() => null);
    if (!response?.ok) {
      put(old);
      return say(`Not saved: ${response ? await response.text() : "server not reachable"}`);
    }
    say(savedMessage(verdict, why));
    if (verdict === "reject" && why == null) setAskWhy((count) => count + 1);
    refresh();
  }
  useVerdictKeys((verdict) => {
    if (!pattern) return;
    saveVerdict(pattern.key, verdictOf(week, pattern.key) === verdict ? null : verdict);
  });

  const lead = leadOf(week);
  return (
    <section className="view" id="v-feedback">
      {north?.sample && (
        <SampleNote href="#/setup">
          Example feedback, not yours. Yours comes with your first collection.
        </SampleNote>
      )}
      <div className="vhead">
        <h1>
          How I <em>show up</em>
        </h1>
        <p>{lead}</p>
      </div>
      <div className="grid gap-3.5">
        {!weeks && <p className="p-10 text-center text-ink-2">Loading feedback…</p>}
        {weeks && !week && (
          <Card className="p-10 text-center text-ink-2 sm:p-10">
            Your first feedback comes with the next collection, on Monday at 18:00. Claude reads the
            Slack messages you wrote that week and the 7 before it.
          </Card>
        )}
        {weeks && week && (
          <>
            {weeks.length > 1 && (
              <WeekPicker
                weeks={weeks}
                current={weekAt}
                pick={(index) => {
                  setWeekAt(index);
                  setTab(0);
                  setJustJudged(null);
                }}
              />
            )}
            {lead ? (
              <WeekFeedback
                north={north!}
                week={week}
                patterns={patterns}
                current={current}
                justJudged={justJudged}
                pickTab={(index) => {
                  setTab(index);
                  setJustJudged(null);
                }}
                save={saveVerdict}
              />
            ) : (
              <Card className="p-10 text-center text-ink-2 sm:p-10">{`You wrote no Slack messages in ${shortWeek(week.week)}, so there is no feedback for it.`}</Card>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function WeekFeedback({
  north,
  week,
  patterns,
  current,
  justJudged,
  pickTab,
  save,
}: {
  north: North;
  week: FeedbackWeek;
  patterns: Pattern[];
  current: number;
  justJudged: string | null;
  pickTab: (index: number) => void;
  save: SaveVerdict;
}) {
  const pattern = patterns[current];
  return (
    <>
      {week.previous?.do && <LastExperiment week={week} />}
      {week.experiment && (
        <Experiment
          key={week.week}
          week={week}
          experiment={week.experiment}
          verdict={verdictOf(week, "experiment")}
          note={justJudged === "experiment"}
          set={(choice, why) => save("experiment", choice, why)}
        />
      )}
      <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <PatternTabs week={week} patterns={patterns} current={current} pick={pickTab} />
        <Focus
          key={`${week.week}:${current}`}
          week={week}
          pattern={pattern}
          categories={north.feedbackCategories ?? []}
          note={justJudged === pattern?.key}
          set={save}
        />
      </div>
    </>
  );
}

export const View = ({ p: params }: { p: URLSearchParams }) => <Feedback params={params} />;
