// One thread, all of it: where it sits (goal ▸ project ▸ week), its labels, its evidence as a
// flame graph, and why the mode counts. Opens from North, Trace and Search with openItem(id).
import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import {
  By,
  CloseButton,
  cnt,
  go,
  goalsOf,
  MODES,
  mc,
  type North,
  PILLAR,
  reviewHref,
  useEvent,
  useNorth,
  WMS,
} from "./lib";
import { REFS } from "./refs-data";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

const Dot = ({ color, className = "" }: { color: string; className?: string }) => (
  <i
    className={`inline-block size-2.25 flex-none rounded-full ${className}`}
    style={{ background: color }}
  />
);
const GoalLabel = ({ goal }: { goal: any }) =>
  goal ? (
    <>
      <Dot color={goal.color} />
      {goal.short}
    </>
  ) : (
    <>no goal</>
  );
const Chevron = () => <ChevronRight className="size-3 text-ink-3" />;
const chipClass = "h-auto gap-1.5 rounded-full px-2.5 py-1 text-[12.5px]";
const blockClass =
  "flex h-7.5 min-w-0 flex-1 items-center truncate rounded-[5px] px-2.5 font-mono text-[11.5px] font-medium no-underline";

export function ThreadSheet() {
  const [north] = useNorth();
  const [id, setId] = useState<string | null>(null);
  useEvent<string>("open-item", setId);
  const thread = north && id ? north.ITEMS.find((thread) => thread.id === id) : null;
  const close = () => setId(null);
  const openReference = (key: string) => {
    close();
    go(`#/refs?k=${key}`);
  };
  if (!north || !thread) return null;
  const mode = thread.mode;
  const goal = north.GOALS.find((candidate) => goalsOf(north, thread).includes(candidate.id));
  const praise = thread.rec != null ? north.REC[thread.rec] : null;
  const quote = thread.quote || (praise && { t: praise.t, who: `${praise.who} · ${praise.where}` });
  const why = REFS[mode]?.items[0];
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      {/* One track that may shrink: long evidence rows truncate instead of widening the sheet past a phone. */}
      <DialogContent aria-describedby={undefined} className="grid-cols-[minmax(0,1fr)]">
        <LinkChain north={north} thread={thread} goal={goal} close={close} />
        <DialogTitle className="m-0 font-num text-[clamp(26px,3.4vw,38px)] leading-none font-extrabold text-balance uppercase">
          {thread.title}
        </DialogTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className={chipClass} onClick={() => openReference(mode)}>
            <Dot color={mc(mode)} />
            {MODES[mode]}
          </Button>
          {thread.wm && (
            <Button
              variant="outline"
              className={chipClass}
              onClick={() => openReference("counterfactual")}
            >
              {WMS[thread.wm]}
            </Button>
          )}
          <Button variant="outline" className={chipClass} onClick={() => openReference("tracking")}>
            {PILLAR[thread.pillar]}
          </Button>
          <Badge variant="soft" className="gap-1.5 rounded-full px-2.5 py-1">
            <GoalLabel goal={goal} />
          </Badge>
        </div>
        <FlameGraph thread={thread} praise={praise} quote={quote} />
        {quote && (
          <figure className="m-0 grid gap-2.5 rounded-xl border border-line bg-secondary px-4.5 py-4">
            <p className="m-0 text-base leading-snug font-medium">{`“${quote.t}”`}</p>
            <figcaption>
              <By>{quote.who}</By>
            </figcaption>
          </figure>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {why && <WhyThisCounts why={why} mode={mode} openReference={openReference} />}
          <div className="grid content-start gap-2.5">
            <span className="lbl">Without you, would it have happened?</span>
            <p className="m-0 text-xl">{thread.wm ? WMS[thread.wm] : "not answered"}</p>
            {!north.SAMPLE && (
              <a className="ref" href={reviewHref(north, thread)} onClick={close}>
                change it in review →
              </a>
            )}
            <Button
              variant="link"
              className="ref h-auto justify-self-start p-0"
              onClick={() => openReference("counterfactual")}
            >
              why this question →
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Goal ▸ project ▸ milestone ▸ thread and week.
function LinkChain({
  north,
  thread,
  goal,
  close,
}: {
  north: North;
  thread: any;
  goal: any;
  close: () => void;
}) {
  const project = north.PROJECTS[thread.s] ?? { name: thread.s };
  return (
    // Not the header's tab pill: base.css styles every nav like it.
    <nav
      className="flex flex-wrap items-center gap-1.5 overflow-visible rounded-none border-0 bg-transparent p-0 font-mono text-[11.5px] text-ink-2"
      aria-label="Item link chain"
    >
      <Badge variant="dashed" className={goal ? "gap-1.5 normal-case" : "normal-case"}>
        <GoalLabel goal={goal} />
      </Badge>
      <Chevron />
      {project.url ? (
        <a href={project.url} target="_blank" rel="noopener">
          {project.name}
          <ExternalLink className="ml-1 inline size-3" />
        </a>
      ) : (
        <b className="font-medium">{project.name}</b>
      )}
      {thread.ms && (
        <>
          <Chevron />
          <b className="font-medium">{thread.ms}</b>
        </>
      )}
      <Chevron />
      <b className="font-medium wrap-anywhere">{`${thread.id} · ${north.WEEKS[thread.w]}`}</b>
      <CloseButton className="ml-auto" onClick={close} />
    </nav>
  );
}

// The flame graph: the thread, then its sources, then each link.
function FlameGraph({ thread, praise, quote }: { thread: any; praise: any; quote: any }) {
  const mode = thread.mode;
  const links = thread.links as string[][];
  const sources = cnt(links, (link) => link[0]!);
  const quoteSource = praise ? "Recognition" : "Slack";
  if (quote) sources[quoteSource] = (sources[quoteSource] ?? 0) + 1;
  const names = Object.keys(sources);
  const tint = (share: number) => ({
    background: `color-mix(in srgb, ${mc(mode)} ${share}%, var(--s3))`,
  });
  // The quote is a block of its own, under its source.
  const quoteBlock = (source: string) =>
    source === "Recognition" || (source === "Slack" && quote && !praise)
      ? [
          <span key={source + "q"} className={`${blockClass} text-ink`} style={tint(38)}>
            {source === "Recognition" ? `★ ${praise.who}` : "quote"}
          </span>,
        ]
      : [];
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
      <span className="lbl">Evidence</span>
      <div
        className="grid grid-cols-[minmax(0,1fr)] gap-0.75"
        aria-label="Item evidence, as a flame graph"
      >
        <div className="flex gap-0.75">
          <span
            className={`${blockClass} text-[#0b0b0b]`}
            style={{ background: mc(mode) }}
          >{`${thread.id} · ${MODES[mode]}`}</span>
        </div>
        {names.length > 0 && (
          <>
            <div className="flex gap-0.75">
              {names.map((source) => (
                <span
                  key={source}
                  className={`${blockClass} text-[#0b0b0b]`}
                  style={{ flex: sources[source], ...tint(62) }}
                >{`${source} · ${sources[source]}`}</span>
              ))}
            </div>
            <div className="flex gap-0.75">
              {names.flatMap((source) => [
                ...links
                  .filter((link) => link[0] === source)
                  .map((link, index) => (
                    <a
                      key={source + index}
                      className={`${blockClass} text-ink hover:brightness-110`}
                      style={tint(38)}
                      href={link[2]}
                      target="_blank"
                      rel="noopener"
                      title={link[1]}
                    >{`${link[1]} ↗`}</a>
                  )),
                ...quoteBlock(source),
              ])}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

const WhyThisCounts = ({
  why,
  mode,
  openReference,
}: {
  why: any;
  mode: string;
  openReference: (key: string) => void;
}) => (
  <div className="grid content-start gap-2 rounded-xl border border-brand/35 bg-brand/5 p-4">
    <span className="lbl">{`Why this counts · ${MODES[mode]}`}</span>
    <DialogDescription className="m-0 text-[14.5px]">{`“${why.q ?? why.says}”`}</DialogDescription>
    <a className="ref" href={why.url} target="_blank" rel="noopener">{`${why.who} ↗`}</a>
    <Button
      variant="link"
      className="ref h-auto justify-self-start p-0"
      onClick={() => openReference(mode)}
    >
      all sources →
    </Button>
  </div>
);
