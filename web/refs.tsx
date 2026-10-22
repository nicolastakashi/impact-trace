// REFERENCES: why each mode counts, with sources. One topic in focus, the others one click away.
import { useEffect, useState } from "react";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { MODES, mc as modeColor } from "./lib";
import { REFS, type Reference } from "./refs-data";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

const Dot = ({ color, className = "size-2.25" }: { color: string; className?: string }) => (
  <i className={`inline-block flex-none rounded-full ${className}`} style={{ background: color }} />
);
// A mode's name, else the topic's title.
const topicName = (id: string) =>
  MODES[id] ? MODES[id][0]!.toUpperCase() + MODES[id].slice(1) : REFS[id]!.title;
const topicColor = (id: string, fallback: string) => (MODES[id] ? modeColor(id) : fallback);

export function Refs({ topic: asked }: { topic: string | null }) {
  // The address says which topic; a tab rewrites it in place, with no history step.
  const [topic, setTopic] = useState(asked);
  useEffect(() => setTopic(asked), [asked]);
  const id = topic && REFS[topic] ? topic : "clarify";
  const pickTopic = (next: string) => {
    history.replaceState(null, "", `#/refs?k=${next}`);
    setTopic(next);
  };
  const all = Object.keys(REFS);
  return (
    <section className="view" id="v-refs">
      <div className="vhead">
        <h1>
          Why <em>this counts</em>
        </h1>
        <p>Quotes checked on 2026-10-18. ⚠ is a secondary source.</p>
      </div>
      <div className="grid items-start gap-4.5 min-[761px]:grid-cols-[230px_1fr]">
        <div
          role="group"
          aria-label="Topics"
          className="grid gap-4.5 min-[761px]:sticky min-[761px]:top-[calc(env(safe-area-inset-top,0px)+96px)]"
        >
          <TopicGroup
            label="Modes"
            ids={all.filter((other) => MODES[other])}
            current={id}
            pick={pickTopic}
          />
          <TopicGroup
            label="How it is judged"
            ids={all.filter((other) => !MODES[other])}
            current={id}
            pick={pickTopic}
          />
        </div>
        <TopicCard key={id} id={id} />
      </div>
    </section>
  );
}

function TopicGroup({
  label,
  ids,
  current,
  pick,
}: {
  label: string;
  ids: string[];
  current: string;
  pick: (id: string) => void;
}) {
  return (
    <div className="grid gap-0.5 max-[760px]:flex max-[760px]:flex-wrap max-[760px]:gap-1.5">
      <span className="lbl px-3 pb-1.5 max-[760px]:w-full max-[760px]:p-0">{label}</span>
      {ids.map((id) => (
        <button
          key={id}
          aria-pressed={id === current}
          onClick={() => pick(id)}
          style={{ "--c": topicColor(id, "var(--ink-2)") } as React.CSSProperties}
          className="flex cursor-pointer items-center gap-2.5 rounded-r-[10px] border-0 border-l-2 border-transparent bg-transparent px-3 py-2 text-left text-sm font-medium text-ink-2 hover:bg-s1 hover:text-ink aria-pressed:border-(--c) aria-pressed:bg-s2 aria-pressed:text-ink max-[760px]:rounded-full max-[760px]:border max-[760px]:border-line max-[760px]:px-3 max-[760px]:py-1.5"
        >
          {MODES[id] && <Dot color={modeColor(id)} />}
          {topicName(id)}
          <span className="ml-auto font-mono text-[11px] font-medium text-ink-3 max-[760px]:hidden">
            {REFS[id]!.items.length}
          </span>
        </button>
      ))}
    </div>
  );
}

function TopicCard({ id }: { id: string }) {
  const topic = REFS[id]!;
  const color = topicColor(id, "var(--ink-3)");
  return (
    <Card className="animate-in gap-6" style={{ "--c": color } as React.CSSProperties}>
      <h3 className="m-0 flex items-center gap-3 font-num text-[clamp(28px,4vw,44px)] leading-none font-extrabold text-balance uppercase">
        {MODES[id] && <Dot color={color} className="size-3.5" />}
        {topic.title}
      </h3>
      <div className="-mt-2.5 grid gap-3">
        <p className="m-0 max-w-[60ch] text-[17px] leading-[1.45] text-ink-2">
          {topic.description}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="lbl">Looks like</span>
          {topic.examples.map((example) => (
            <Badge key={example} variant="soft" className="rounded-md font-mono text-xs">
              {example}
            </Badge>
          ))}
        </div>
      </div>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-3.5 p-0">
        {topic.items.map((reference) => (
          <SourceCard key={reference.url + (reference.q ?? reference.says)} reference={reference} />
        ))}
      </ul>
    </Card>
  );
}

// A quote, or the idea in our words when there is no quote to give.
function SourceCard({ reference }: { reference: Reference }) {
  const quote = reference.q;
  return (
    <li className="grid grid-rows-[auto_1fr_auto] gap-2.5 rounded-xl border border-line bg-s2 px-5 py-4.5">
      {quote && (
        <>
          <span
            aria-hidden="true"
            className="h-5.5 font-num text-[54px] leading-[.6] font-extrabold text-(--c)"
          >
            “
          </span>
          <q className="text-[clamp(17px,1.8vw,20px)] leading-[1.4] text-pretty [quotes:none]">
            {quote}
          </q>
        </>
      )}
      {!quote && (
        <>
          <span className="font-mono text-[10.5px] leading-5.5 tracking-[.06em] text-ink-3 uppercase">
            In our words
          </span>
          <p className="m-0 text-[clamp(16px,1.6vw,18px)] leading-[1.45] text-pretty text-ink-2">
            {reference.says}
          </p>
        </>
      )}
      <span className="grid gap-1 self-end">
        <a
          className="ref inline-flex items-center gap-0.5"
          href={reference.url}
          target="_blank"
          rel="noopener"
        >
          {reference.who}
          <ArrowUpRight className="size-3" />
        </a>
        {reference.warn && (
          <span className="ref inline-flex items-center gap-1 text-(--m-solve)">
            <TriangleAlert className="size-3" />
            {reference.warn}
          </span>
        )}
      </span>
    </li>
  );
}

// The router passes the address parameters as `p`; `k` is the topic.
export const View = ({ p: params }: { p: URLSearchParams }) => <Refs topic={params.get("k")} />;
