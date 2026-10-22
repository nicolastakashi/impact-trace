// One thread, all of it: where it sits (goal ▸ project ▸ week), its labels, its evidence as a
// flame graph, and why the mode counts. Opens from North, Trace and Search with openItem(id).
import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { By, cnt, goalsOf, MODES, mc, PILLAR, useEvent, useNorth, WMS, yearOf } from "./lib";
import { REFS } from "./refs-data";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

const Dot = ({ c, className = "" }: { c: string; className?: string }) => (
  <i
    className={`inline-block size-2.25 flex-none rounded-full ${className}`}
    style={{ background: c }}
  />
);

export function ItemSheet() {
  const [d] = useNorth(),
    [id, setId] = useState<string | null>(null);
  useEvent<string>("open-item", setId);
  const it = d && id ? d.ITEMS.find((i) => i.id === id) : null;
  const ref = (k: string) => {
    setId(null);
    location.hash = `#/refs?k=${k}`;
  };
  if (!d || !it) return null;
  const m = it.mode,
    st = d.PROJECTS[it.s] ?? { name: it.s },
    g = d.GOALS.find((x) => goalsOf(d, it).includes(x.id));
  const r = it.rec != null ? d.REC[it.rec] : null,
    q = it.quote || (r && { t: r.t, who: `${r.who} · ${r.where}` });
  const why = REFS[m]?.items[0];
  // The flame graph: the thread, then its sources, then each link.
  const srcs = cnt(it.links as string[][], (l) => l[0]!);
  if (q) srcs[r ? "Recognition" : "Slack"] = (srcs[r ? "Recognition" : "Slack"] ?? 0) + 1;
  const lv2 = Object.keys(srcs),
    span =
      "flex h-7.5 min-w-0 flex-1 items-center truncate rounded-[5px] px-2.5 font-mono text-[11.5px] font-medium no-underline";
  const tint = (p: number) => ({ background: `color-mix(in srgb, ${mc(m)} ${p}%, var(--s3))` });
  const chip = "h-auto gap-1.5 rounded-full px-2.5 py-1 text-[12.5px]";
  return (
    <Dialog open onOpenChange={(o) => !o && setId(null)}>
      {/* One track that may shrink: long evidence rows truncate instead of widening the sheet past a phone. */}
      <DialogContent aria-describedby={undefined} className="grid-cols-[minmax(0,1fr)]">
        {/* Not the header's tab pill: base.css styles every nav like it. */}
        <nav
          className="flex flex-wrap items-center gap-1.5 overflow-visible rounded-none border-0 bg-transparent p-0 font-mono text-[11.5px] text-ink-2"
          aria-label="Item link chain"
        >
          {g ? (
            <Badge variant="dashed" className="gap-1.5 normal-case">
              <Dot c={g.color} />
              {g.short}
            </Badge>
          ) : (
            <Badge variant="dashed" className="normal-case">
              no goal
            </Badge>
          )}
          <ChevronRight className="size-3 text-ink-3" />
          {st.url ? (
            <a href={st.url} target="_blank" rel="noopener">
              {st.name}
              <ExternalLink className="ml-1 inline size-3" />
            </a>
          ) : (
            <b className="font-medium">{st.name}</b>
          )}
          {it.ms && (
            <>
              <ChevronRight className="size-3 text-ink-3" />
              <b className="font-medium">{it.ms}</b>
            </>
          )}
          <ChevronRight className="size-3 text-ink-3" />
          <b className="font-medium wrap-anywhere">{`${it.id} · ${d.WEEKS[it.w]}`}</b>
          <Button
            variant="outline"
            size="xs"
            className="ml-auto rounded-full font-mono text-xs text-ink-2"
            onClick={() => setId(null)}
          >
            close <kbd>esc</kbd>
          </Button>
        </nav>
        <DialogTitle className="m-0 font-num text-[clamp(26px,3.4vw,38px)] leading-none font-extrabold text-balance uppercase">
          {it.title}
        </DialogTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className={chip} onClick={() => ref(m)}>
            <Dot c={mc(m)} />
            {MODES[m]}
          </Button>
          {it.wm && (
            <Button variant="outline" className={chip} onClick={() => ref("counterfactual")}>
              {WMS[it.wm]}
            </Button>
          )}
          <Button variant="outline" className={chip} onClick={() => ref("tracking")}>
            {PILLAR[it.pillar]}
          </Button>
          <Badge variant="soft" className="gap-1.5 rounded-full px-2.5 py-1">
            {g ? (
              <>
                <Dot c={g.color} />
                {g.short}
              </>
            ) : (
              "no goal"
            )}
          </Badge>
        </div>
        <section className="grid grid-cols-[minmax(0,1fr)] gap-2.5">
          <span className="lbl">Evidence</span>
          <div
            className="grid grid-cols-[minmax(0,1fr)] gap-0.75"
            aria-label="Item evidence, as a flame graph"
          >
            <div className="flex gap-0.75">
              <span
                className={`${span} text-[#0b0b0b]`}
                style={{ background: mc(m) }}
              >{`${it.id} · ${MODES[m]}`}</span>
            </div>
            {lv2.length > 0 && (
              <>
                <div className="flex gap-0.75">
                  {lv2.map((s) => (
                    <span
                      key={s}
                      className={`${span} text-[#0b0b0b]`}
                      style={{ flex: srcs[s], ...tint(62) }}
                    >{`${s} · ${srcs[s]}`}</span>
                  ))}
                </div>
                <div className="flex gap-0.75">
                  {lv2.flatMap((s) => [
                    ...(it.links as string[][])
                      .filter((l) => l[0] === s)
                      .map((l, i) => (
                        <a
                          key={s + i}
                          className={`${span} text-ink hover:brightness-110`}
                          style={tint(38)}
                          href={l[2]}
                          target="_blank"
                          rel="noopener"
                          title={l[1]}
                        >{`${l[1]} ↗`}</a>
                      )),
                    ...(s === "Recognition" || (s === "Slack" && q && !r)
                      ? [
                          <span key={s + "q"} className={`${span} text-ink`} style={tint(38)}>
                            {s === "Recognition" ? `★ ${r.who}` : "quote"}
                          </span>,
                        ]
                      : []),
                  ])}
                </div>
              </>
            )}
          </div>
        </section>
        {q && (
          <figure className="m-0 grid gap-2.5 rounded-xl border border-line bg-secondary px-4.5 py-4">
            <p className="m-0 text-base leading-snug font-medium">{`“${q.t}”`}</p>
            <figcaption>
              <By>{q.who}</By>
            </figcaption>
          </figure>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {why && (
            <div className="grid content-start gap-2 rounded-xl border border-brand/35 bg-brand/5 p-4">
              <span className="lbl">{`Why this counts · ${MODES[m]}`}</span>
              <DialogDescription className="m-0 text-[14.5px]">{`“${why.q ?? why.says}”`}</DialogDescription>
              <a className="ref" href={why.url} target="_blank" rel="noopener">{`${why.who} ↗`}</a>
              <Button
                variant="link"
                className="ref h-auto justify-self-start p-0"
                onClick={() => ref(m)}
              >
                all sources →
              </Button>
            </div>
          )}
          <div className="grid content-start gap-2.5">
            <span className="lbl">Without you, would it have happened?</span>
            <p className="m-0 text-xl">{it.wm ? WMS[it.wm] : "not answered"}</p>
            {!d.SAMPLE && (
              <a
                className="ref"
                href={`#/review?week=${yearOf(d, it.w)}-${d.WEEKS[it.w]}&key=${encodeURIComponent(it.id)}`}
                onClick={() => setId(null)}
              >
                change it in review →
              </a>
            )}
            <Button
              variant="link"
              className="ref h-auto justify-self-start p-0"
              onClick={() => ref("counterfactual")}
            >
              why this question →
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
