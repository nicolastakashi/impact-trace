// NORTH: four bands, one question each, read top to bottom.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Check, Play } from "lucide-react";
import {
  axis,
  By,
  cnt,
  goalsOf,
  MODES,
  mc,
  type North,
  openItem,
  openStory,
  post,
  reduced,
  toast,
  useNorth,
  WMS,
} from "./lib";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";

type D = North;
const go = (h: string) => {
  location.hash = h;
};
const ini = (s: string) =>
  s
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
const tile =
  "flex min-w-0 flex-col gap-3 overflow-hidden rounded-[18px] border-line p-4.5 sm:p-4.5";
// Card's look on a button: the Feedback and Review tiles are one click each.
const btile = cn(
  "rounded-2xl border bg-card text-card-foreground shadow-card",
  tile,
  "cursor-pointer text-left font-[inherit] hover:border-line-2",
);
const Th = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">{children}</div>
);
const ColH = ({ children }: { children: React.ReactNode }) => (
  <span className="flex justify-between gap-2 text-[13px] text-ink-2">{children}</span>
);
const Sw = ({ c, p }: { c: string; p?: boolean }) => (
  <i
    className="inline-block h-1.5 w-3.5 flex-none rounded-xs"
    style={
      p
        ? {
            background: `repeating-linear-gradient(135deg,${c} 0 2px,transparent 2px 4px)`,
            boxShadow: `inset 0 0 0 1.5px ${c}`,
          }
        : { background: c }
    }
  />
);

type Col = { title: string; parts: { v: number; c: string; p?: boolean; dim?: boolean }[] };
// Columns on a zero baseline, gridlines on round numbers, this week's label in ink.
function Plot({
  d,
  h,
  label,
  cols,
  avg,
}: {
  d: D;
  h: number;
  label: string;
  cols: Col[];
  avg?: number;
}) {
  const { top, ticks } = axis(Math.max(...cols.map((c) => c.parts.reduce((a, x) => a + x.v, 0)))),
    L = d.WEEKS.length - 1;
  const grid = { gridTemplateColumns: `repeat(${d.WEEKS.length}, minmax(0, 1fr))` };
  return (
    <figure className="m-0">
      <div className="relative ml-7.5" style={{ height: h }} role="img" aria-label={label}>
        {ticks.map((v) => (
          <div
            key={v}
            className={cn("absolute inset-x-0 border-t", v ? "border-line" : "border-line-2")}
            style={{ top: `${(1 - v / top) * 100}%` }}
          >
            <span className="absolute right-full mr-2 -translate-y-1/2 font-num text-[11px] leading-none font-semibold text-ink-3 tabular-nums">
              {v}
            </span>
          </div>
        ))}
        <div className="relative grid h-full items-end gap-[clamp(4px,1.4vw,14px)]" style={grid}>
          {cols.map((c, w) => (
            <div
              key={w}
              data-grow="y"
              title={c.title}
              className="flex h-full w-full max-w-14 origin-bottom flex-col-reverse justify-self-center"
            >
              {c.parts
                .filter((x) => x.v)
                .map((x, k, a) => (
                  <i
                    key={k}
                    className={cn(
                      "block flex-none border-t-2 border-s1 transition-opacity",
                      k === a.length - 1 && "rounded-t",
                      x.dim && "opacity-20",
                    )}
                    style={{
                      height: (x.v / top) * h,
                      background: x.p
                        ? `repeating-linear-gradient(135deg,${x.c} 0 4px,color-mix(in srgb,${x.c} 35%,transparent) 4px 7px)`
                        : x.c,
                    }}
                  />
                ))}
            </div>
          ))}
        </div>
        {avg != null && (
          <div
            className="absolute inset-x-0 border-t-[1.5px] border-dashed border-ink-2"
            style={{ top: `${(1 - avg / top) * 100}%` }}
          />
        )}
      </div>
      <div
        className="mt-2 ml-7.5 grid gap-[clamp(4px,1.4vw,14px)] text-center font-num text-[11px] leading-none font-semibold text-ink-3"
        style={grid}
      >
        {d.WEEKS.map((w, i) => (
          <span key={w} className={i === L ? "text-ink" : ""}>
            {w}
          </span>
        ))}
      </div>
    </figure>
  );
}

// Where the work goes: threads per week, stacked by goal. A thread that serves two goals
// counts once, in the goal that is served most, so every bar adds up to its week.
function Where({ d, byGoals }: { d: D; byGoals: boolean }) {
  const [hl, setHl] = useState<string | null>(null),
    I = d.ITEMS,
    n = I.length;
  const served = (g: any) => I.filter((i) => goalsOf(d, i).includes(g.id)).length;
  const GS = [...d.GOALS].sort((a, b) => served(b) - served(a));
  const first = (i: any) => GS.find((g) => goalsOf(d, i).includes(g.id))?.id ?? "none";
  const S = [
    ...GS.map((g) => ({ id: g.id, name: g.title, c: g.color, p: g.kind === "personal" })),
    {
      id: "none",
      name: byGoals ? "Serves no goal" : "Everything else",
      c: "var(--rest)",
      p: false,
    },
  ].map((x) => ({ ...x, its: I.filter((i) => first(i) === x.id) }));
  const fit = S.filter((x) => x.id !== "none").reduce((a, x) => a + x.its.length, 0),
    what = byGoals ? "goal" : "project";
  const cols = d.WEEKS.map((w, k) => {
    const parts = S.map((x) => ({
      v: x.its.filter((i) => i.w === k).length,
      c: x.c,
      p: x.p,
      dim: !!hl && hl !== x.id,
    }));
    return {
      title: `${w}: ${parts.reduce((a, x) => a + x.v, 0)} threads${parts.map((x, j) => (x.v ? `\n${S[j]!.name}: ${x.v}` : "")).join("")}`,
      parts,
    };
  });
  // The weeks a row's threads fall in, for Trace.
  const weeks = (id: string) =>
    [
      ...new Set(
        I.filter((i) => (id === "none" ? !goalsOf(d, i).length : goalsOf(d, i).includes(id))).map(
          (i) => i.w as number,
        ),
      ),
    ]
      .sort((a, b) => a - b)
      .map((w) => d.WEEKS[w])
      .join(",");
  const th =
    "border-b border-line-2 pb-2.5 pl-2.5 text-right font-num text-[11px] leading-none font-semibold tracking-[.12em] text-ink-3 uppercase first:pl-0 first:text-left";
  const td =
    "border-b border-line py-2.5 pl-2.5 text-right font-num text-base leading-none font-semibold tabular-nums transition-opacity first:pl-0 first:text-left";
  return (
    <Card data-tile className={tile}>
      <Th>
        <span className="lbl">Where the work goes</span>
        <span>
          <span className="ref">
            {n ? Math.round((fit / n) * 100) : 0}% serve a {byGoals ? "goal" : "top project"} ·{" "}
          </span>
          <a className="ref" href="#/goals">
            {byGoals ? "goals →" : "add your goals →"}
          </a>
        </span>
      </Th>
      <p className="-mt-1.5 mb-0 text-[13px] text-ink-3">
        Threads you kept each week, by the {what} they serve.
      </p>
      {/* Legend and bars point at each other: hover a row and only its series stays lit. */}
      <div
        className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(260px,360px)]"
        onMouseLeave={() => setHl(null)}
        onBlur={() => setHl(null)}
      >
        <Plot d={d} h={220} label={`Threads per week by ${what}`} cols={cols} />
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>{byGoals ? "Goal" : "Project"}</th>
              <th className={th}>Threads</th>
              <th className={th}>Share</th>
              <th className={th} title="You said it would not happen without you">
                Critical
              </th>
            </tr>
          </thead>
          <tbody>
            {S.map((x) => (
              <tr
                key={x.id}
                className={hl && hl !== x.id ? "[&>td]:opacity-20" : ""}
                onMouseEnter={() => setHl(x.id)}
              >
                <td className={td}>
                  <button
                    className={cn(
                      "flex cursor-pointer items-center gap-2.5 text-left font-sans text-[13.5px] leading-snug font-normal",
                      x.id === "none" ? "text-ink-2" : "text-ink",
                    )}
                    onFocus={() => setHl(x.id)}
                    onClick={() => go(`#/trace?w=${weeks(x.id)}`)}
                  >
                    <Sw c={x.c} p={x.p} />
                    {x.name}
                  </button>
                </td>
                <td className={td}>{x.its.length}</td>
                <td className={td}>{n ? Math.round((x.its.length / n) * 100) : 0}%</td>
                <td className={td}>{x.its.filter((i) => i.wm === "wouldnt").length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Delivered({ d }: { d: D }) {
  const I = d.ITEMS,
    n = I.length,
    L = d.WEEKS.length - 1;
  // By mode: longest first, in the mode colors Trace uses.
  const m = cnt(I, (i) => i.mode),
    mk = Object.keys(MODES).sort((a, b) => (m[b] ?? 0) - (m[a] ?? 0)),
    mx = Math.max(1, ...Object.values(m));
  // Without you: parts of one whole, so one bar. Only "wouldn't happen" gets the accent.
  const wc = cnt(I, (i) => i.wm),
    WC: Record<string, string> = {
      wouldnt: "var(--accent)",
      slower: "var(--ink-2)",
      same: "var(--rest)",
    };
  const wn = Object.keys(WMS).reduce((a, k) => a + (wc[k] ?? 0), 0);
  // Reviews given: the average as a dashed line, this week in ink. Not accent: a quiet week is not an alert.
  const R: number[] = d.REVIEWS,
    avg = R.reduce((a, b) => a + b, 0) / R.length;
  const col =
    "grid content-start gap-2.5 border-line py-4 first:pt-0 last:pb-0 max-md:border-t max-md:first:border-t-0 md:border-l md:px-5 md:py-0 md:first:border-l-0 md:first:pl-0 md:last:pr-0";
  return (
    <Card data-tile className={tile}>
      <Th>
        <span className="lbl">How you delivered</span>
        <a className="ref" href="#/trace">
          trace →
        </a>
      </Th>
      <div className="grid md:grid-cols-3">
        <div className={col}>
          <ColH>By mode</ColH>
          {mk.map((k) => (
            <div key={k} className="grid grid-cols-[76px_minmax(0,1fr)_26px] items-center gap-2.5">
              <a
                className="ref font-sans text-[12.5px] font-normal text-ink-2"
                href={`#/refs?k=${k}`}
              >
                {MODES[k]}
              </a>
              <span className="h-2 rounded-xs bg-s3">
                <i
                  data-grow="x"
                  className="block h-full origin-left rounded-xs"
                  style={{ width: `${((m[k] ?? 0) / mx) * 100}%`, background: mc(k) }}
                />
              </span>
              <span className="text-right font-num text-sm leading-none font-semibold tabular-nums">
                {m[k] ?? 0}
              </span>
            </div>
          ))}
        </div>
        <div className={col}>
          <ColH>
            Without you{" "}
            <a className="ref" href="#/refs?k=counterfactual">
              why →
            </a>
          </ColH>
          <div
            className="flex h-3 gap-0.5 overflow-hidden rounded-[3px]"
            role="img"
            aria-label={Object.keys(WMS)
              .map((k) => `${wc[k] ?? 0} ${WMS[k]}`)
              .join(", ")}
          >
            {Object.keys(WMS).map((k) =>
              wc[k] ? (
                <i
                  key={k}
                  data-grow="x"
                  className="block origin-left"
                  style={{ flex: wc[k], background: WC[k] }}
                />
              ) : null,
            )}
          </div>
          <ul className="m-0 grid list-none gap-2 p-0">
            {Object.keys(WMS).map((k) => (
              <li
                key={k}
                className="grid grid-cols-[14px_34px_1fr] items-center gap-2.5 text-[12.5px] text-ink-2"
              >
                <Sw c={WC[k]!} />
                <b className="text-right font-num text-base leading-none font-semibold text-ink tabular-nums">
                  {wc[k] ?? 0}
                </b>
                <span>
                  {WMS[k]} · {wn ? Math.round(((wc[k] ?? 0) / wn) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
          {n - wn > 0 && <By>{n - wn} not answered yet</By>}
        </div>
        <div className={col}>
          <ColH>
            Reviews given{" "}
            <a className="ref" href="#/refs?k=elevate">
              elevate →
            </a>
          </ColH>
          <div className="flex items-baseline gap-2.5">
            <span
              className="num font-num text-[64px] leading-[.85] font-extrabold"
              data-count={R[L]}
            >
              {R[L]}
            </span>
            <span className="text-[12.5px] text-ink-3">
              in {d.WEEKS[L]} · average {avg.toFixed(0)}
            </span>
          </div>
          <Plot
            d={d}
            h={110}
            label={`Reviews per week: ${R.join(", ")}`}
            avg={avg}
            cols={R.map((v, i) => ({
              title: `${d.WEEKS[i]}: ${v} reviews`,
              parts: [{ v, c: i === L ? "var(--ink)" : "var(--rest)" }],
            }))}
          />
        </div>
      </div>
    </Card>
  );
}

// One value per week. Big number is this week; the bars are the weeks, average dashed.
function Nums({ d }: { d: D }) {
  const N = d.NUMS,
    R: number[] = d.REVIEWS,
    L = d.WEEKS.length - 1;
  // Your time zone comes from this browser, so travel follows you. Work hours are a fixed 09–19.
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  });
  const late = (t: string) => {
    const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return p.weekday === "Sat" || p.weekday === "Sun" || +p.hour! < 9 || +p.hour! >= 19;
  };
  const out = N.slackAt.map((ts: string[]) =>
    ts.length ? Math.round((ts.filter(late).length / ts.length) * 100) : 0,
  );
  // Give vs take: PRs you reviewed per PR you opened. A week with none opened shows 0, not infinity.
  const give = R.map((r, i) => (N.opened[i] ? +(r / N.opened[i]).toFixed(1) : 0));
  const T: { k: string; v: number[]; u?: string; dp?: number; d: string }[] = [
    { k: "Slack messages", v: N.slack, d: `in ${N.channels[L]} channels` },
    { k: "Meetings", v: N.meetings, u: "h", dp: 1, d: "hours accepted or tentative" },
    {
      k: "Outside work hours",
      v: out,
      u: "%",
      d: "of your messages, before 09, after 19 or weekends",
    },
    { k: "People who mention you", v: N.reach, d: "different people in Slack" },
    { k: "Lead time", v: N.lead, u: "h", dp: 1, d: "median, opened to merged" },
    { k: "Give vs take", v: give, u: "×", dp: 1, d: `${R[L]} PRs reviewed, ${N.opened[L]} opened` },
  ];
  return (
    <Card data-tile className={tile}>
      <Th>
        <span className="lbl">Your weeks in numbers</span>
        <span className="ref">times in {tz}</span>
      </Th>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(170px,100%),1fr))]">
        {T.map((t) => {
          const avg = t.v.reduce((a, b) => a + b, 0) / t.v.length,
            mx = Math.max(1, ...t.v),
            v = t.v[L]!;
          return (
            <div
              key={t.k}
              className="flex flex-col gap-2 border-line px-5 py-0.5 first:border-l-0 first:pl-0 max-sm:border-t max-sm:px-0 max-sm:py-3 max-sm:first:border-t-0 sm:border-l"
            >
              <ColH>{t.k}</ColH>
              <span className="font-num text-[40px] leading-[.9] font-extrabold tabular-nums">
                <span data-count={Number.isInteger(v) ? v : undefined}>{v}</span>
                {t.u && <small className="ml-0.5 text-lg text-ink-3">{t.u}</small>}
              </span>
              <span className="text-[12.5px] text-ink-3">
                {t.d} · average {t.dp ? avg.toFixed(1) : Math.round(avg)}
              </span>
              <div
                className="relative mt-auto flex h-9 flex-none items-end gap-0.75"
                role="img"
                aria-label={`${t.k} per week: ${t.v.join(", ")}`}
              >
                {t.v.map((x, i) => (
                  <i
                    key={i}
                    data-grow="y"
                    className={cn(
                      "flex-1 origin-bottom rounded-t-xs",
                      i === L ? "bg-ink" : "bg-(--rest)",
                    )}
                    style={{ height: `${(x / mx) * 100}%` }}
                    title={`${d.WEEKS[i]}: ${x}${t.u ?? ""}`}
                  />
                ))}
                <span
                  className="absolute inset-x-0 border-t-[1.5px] border-dashed border-ink-2"
                  style={{ bottom: `${(avg / mx) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

const chip =
  "h-auto rounded-full border-line bg-secondary px-2.25 py-1.25 font-mono text-[11.5px] font-medium text-ink hover:border-brand hover:bg-secondary";
const Av = ({ c, who }: { c: string; who: string }) => (
  <span
    aria-hidden="true"
    className="grid size-7 flex-none place-items-center rounded-full font-num text-[11px] font-bold tracking-[.04em] text-ink"
    style={{
      background: `color-mix(in srgb, ${c} 22%, var(--s2))`,
      boxShadow: `inset 0 0 0 1.5px ${c}`,
    }}
  >
    {ini(who)}
  </span>
);

// RECOGNITION: praise that names your work, Claude's pick checked by code. One in focus, the rest one click away.
function Rec({ d }: { d: D }) {
  const [rec, setRec] = useState<any[]>(d.REC),
    [undo, setUndo] = useState<any>(null);
  // The highlight is where the praise starts; else the newest.
  const [i, setI] = useState<number>(
    () => d.ITEMS.find((x) => x.id === d.HIGHLIGHT?.item)?.rec ?? Math.max(0, d.REC.length - 1),
  );
  // You correct Claude: the mention becomes information, and Claude sees it as an example next time.
  const mention = async (id: string, kind: string | null) => {
    const r = await post("/api/mention", { id, kind });
    if (!r.ok) toast(await r.text());
    return r.ok;
  };
  async function notRec(r: any) {
    if (!(await mention(r.id, "info"))) return;
    const k = rec.indexOf(r),
      next = rec.filter((x) => x !== r);
    setUndo({ ...r, at: k });
    setRec(next);
    setI(Math.min(i, next.length - 1));
  }
  async function back() {
    const u = undo;
    if (!(await mention(u.id, null))) return;
    setRec([...rec.slice(0, u.at), u, ...rec.slice(u.at)]);
    setI(u.at);
    setUndo(null);
  }
  const head = (
    <Th>
      <span className="lbl">Recognition</span>
      <By>
        {rec.length} in {d.WEEKS.length} weeks
      </By>
    </Th>
  );
  const small = "m-0 text-[13.5px] leading-normal text-ink-2";
  const gone = (full: boolean) =>
    undo && (
      <p className={small}>
        Removed: {undo.who}
        {full ? `, "${(undo.q ?? undo.t).slice(0, 60)}"` : ""}.{" "}
        <Button variant="outline" size="xs" className={chip} onClick={back}>
          Undo
        </Button>
      </p>
    );
  const r = rec[i];
  if (!r)
    return (
      <Card data-tile className={tile}>
        {head}
        <p className={small}>
          No praise yet. Shoutouts and thanks that name your work show up here.
        </p>
        {gone(false)}
      </Card>
    );
  const it = d.ITEMS.find((x) => x.id === r.item),
    url = /^https:\/\//.test(r.url ?? "") ? r.url : null,
    q: string = r.q ?? r.t;
  // A praise takes the color of the goal its work serves, so recognition reads against your goals.
  const goalOf = (x: any) => {
    const t = d.ITEMS.find((y) => y.id === x.item);
    return t && d.GOALS.find((g) => goalsOf(d, t).includes(g.id));
  };
  const gc = (x: any) => goalOf(x)?.color ?? "var(--rest)",
    goal = goalOf(r);
  return (
    <Card data-tile className={tile}>
      {head}
      <p
        className={cn(
          "m-0 leading-[1.28] font-bold tracking-[-.01em] text-balance",
          q.length > 110 ? "text-[clamp(17px,1.6vw,20px)]" : "text-[clamp(19px,2vw,24px)]",
        )}
      >
        <span className="text-brand">“</span>
        {q}
        <span className="text-brand">”</span>
      </p>
      {r.q && r.q.length < r.t.length * 0.7 && <p className={small}>{r.t}</p>}
      <div className="flex min-w-0 items-center gap-2.5">
        <Av c={gc(r)} who={r.who} />
        <div className="grid min-w-0">
          <b className="text-sm">{r.who}</b>
          <By>
            {r.where ?? ""} · {r.when || d.WEEKS[r.w]}
          </By>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {url && (
          <Button asChild variant="outline" size="xs" className={chip}>
            <a href={url} target="_blank" rel="noopener">
              Slack ↗
            </a>
          </Button>
        )}
        {goal && (
          <span className={cn(chip, "inline-flex items-center gap-1.5 border")}>
            <i className="dot" style={{ background: goal.color }} />
            {goal.short}
          </span>
        )}
        {it && (
          <Button variant="outline" size="xs" className={chip} onClick={() => openItem(it.id)}>
            {it.title} →
          </Button>
        )}
        {r.id && (
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto text-[12.5px] font-normal text-ink-3 hover:bg-transparent hover:text-ink"
            onClick={() => notRec(r)}
          >
            Not recognition
          </Button>
        )}
      </div>
      {gone(true)}
      {/* One dot per praise, in its week: the rhythm at a glance, and the way to pick one. */}
      <div
        className="mt-auto grid gap-1 border-t border-line pt-3"
        style={{ gridTemplateColumns: `repeat(${Math.max(8, d.WEEKS.length)}, minmax(0, 1fr))` }}
        role="group"
        aria-label="Praise per week"
      >
        {d.WEEKS.map((w, k) => (
          <div key={w}>
            <div className="flex min-h-3.5 flex-wrap items-end justify-center gap-1.25">
              {rec
                .map((x, j) => [x, j] as const)
                .filter(([x]) => x.w === k)
                .map(([x, j]) => (
                  <button
                    key={x.id ?? j}
                    aria-label={`${x.who}, ${w}${j === i ? ", shown" : ""}`}
                    title={`${x.who} · ${x.about ?? x.where ?? ""}`}
                    className={cn(
                      "size-3 cursor-pointer rounded-full transition-transform hover:scale-125 focus-visible:outline-ink",
                      j === i && "scale-130 shadow-[0_0_0_2px_var(--s1),0_0_0_4px_var(--ink)]",
                    )}
                    style={{ background: gc(x) }}
                    onClick={() => setI(j)}
                  />
                ))}
            </div>
            <span className="mt-1.5 block text-center font-mono text-[10.5px] font-medium text-ink-3">
              {w}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// WHO COMES TO YOU: people who asked you for a review, a decision or an answer in Slack.
function Asks({ d }: { d: D }) {
  const A: any[] = d.ASKS ?? [],
    L = d.WEEKS.length - 1;
  const head = (s: string) => (
    <Th>
      <span className="lbl">Who comes to you</span>
      <By>{s}</By>
    </Th>
  );
  if (!A.length)
    return (
      <Card data-tile className={tile}>
        {head("Slack")}
        <p className="m-0 text-[13.5px] text-ink-2">
          No asks yet. Reviews, decisions and questions people bring you show up here.
        </p>
      </Card>
    );
  const mx = Math.max(1, ...A.flatMap((a) => a.per));
  // One stable color per person, from the name. Hues 40–310 only: red is for what needs you, never for a person.
  const hue = (s: string) => 40 + [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 271, 7);
  return (
    <Card data-tile className={tile}>
      {head(`asks in Slack · ${d.WEEKS[0]}–${d.WEEKS[L]}`)}
      <ol className="m-0 grid list-none p-0">
        {A.map((a) => {
          const p = `oklch(0.72 0.13 ${hue(a.who)})`;
          return (
            <li
              key={a.who}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0"
            >
              <Av c={p} who={a.who} />
              <div className="grid min-w-0 gap-0.5">
                <b className="text-sm">{a.who}</b>
                <span className="truncate text-[12.5px] text-ink-3" title={a.about.join(" · ")}>
                  {a.about.join(" · ")}
                </span>
              </div>
              <span
                className="flex h-5.5 items-end gap-0.5"
                role="img"
                aria-label={`per week: ${a.per.join(", ")}`}
              >
                {a.per.map((n: number, k: number) => (
                  <i
                    key={k}
                    className="min-h-0.5 w-1.25 rounded-[1px]"
                    style={{
                      height: `${n ? (n / mx) * 100 : 0}%`,
                      background: k === L ? p : `color-mix(in srgb, ${p} 45%, transparent)`,
                    }}
                    title={`${d.WEEKS[k]}: ${n}`}
                  />
                ))}
              </span>
              <span className="num min-w-[2ch] text-right font-num text-xl leading-none font-bold">
                {a.n}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// The experiment from your last feedback week, unless you passed on it.
function Fb({ d }: { d: D }) {
  const f = d.FEEDBACK?.[0],
    e = f?.verdicts?.experiment?.v === "reject" ? null : f?.experiment;
  if (!e) return null;
  const t: number[] | undefined = e.trend,
    good = !!t && t.at(-1)! < t.reduce((a, b) => a + b, 0) / t.length,
    mx = Math.max(1, ...(t ?? []));
  return (
    <button
      data-tile
      className={cn(btile, "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2.5")}
      onClick={() => go("#/feedback")}
    >
      <div className="grid min-w-0 gap-2">
        <span className="lbl">Try this week</span>
        <p className="m-0 text-base leading-[1.45] font-semibold text-pretty">{e.do}</p>
        <By>from the pattern “{e.pattern ?? ""}” · open feedback →</By>
      </div>
      {t && (
        <div className="grid gap-1 self-start justify-items-end">
          <span
            className={cn(
              "num font-num text-[40px] leading-[.9] font-extrabold",
              good ? "text-ok" : "text-brand",
            )}
          >
            {t.at(-1)}
          </span>
          <By>times in {f.week.slice(5)}</By>
          <span className="flex h-8.5 items-end gap-0.75" aria-hidden="true">
            {t.map((n, k) => (
              <i
                key={k}
                className={cn(
                  "w-2 rounded-t-xs",
                  k < t.length - 1 ? "bg-(--rest)" : good ? "bg-ok" : "bg-brand",
                )}
                style={{ height: (n / mx) * 30 + 2 }}
              />
            ))}
          </span>
        </div>
      )}
    </button>
  );
}

// PENDING: your undecided threads per week. Red only where something waits for you; done weeks stay quiet.
function Wm({ p }: { p: Record<string, number> }) {
  const ws = Object.keys(p).sort(),
    left = ws.reduce((a, w) => a + p[w]!, 0);
  return (
    <button data-tile className={btile} onClick={() => go("#/review")}>
      <span className="lbl">To review</span>
      <p className="m-0 line-clamp-2 text-[17px] leading-[1.35] font-semibold">
        {left ? (
          <>
            <span className="mr-1 font-num text-[28px] leading-none font-extrabold text-brand">
              {left}
            </span>{" "}
            thread{left > 1 ? "s" : ""} wait for your answer
          </>
        ) : ws.length ? (
          <>
            <Check className="inline size-4 text-ok" aria-hidden="true" /> All caught up
          </>
        ) : (
          "No weeks collected yet"
        )}
      </p>
      <div className="flex gap-0.75">
        {ws.map((w) => (
          <i
            key={w}
            className={cn(
              "h-1 flex-1 rounded-xs",
              p[w] ? "bg-brand" : left ? "bg-ink-2" : "bg-ok/70",
            )}
            title={`${w}: ${p[w] ? `${p[w]} left` : "done"}`}
          />
        ))}
      </div>
      <span className="ref">
        {left
          ? "open review →"
          : ws.length
            ? `${ws.length} weeks reviewed · review again →`
            : "open review →"}
      </span>
    </button>
  );
}

function Home() {
  const [d] = useNorth(),
    [p, setP] = useState<Record<string, number>>({}),
    root = useRef<HTMLElement>(null);
  useEffect(() => {
    fetch("/api/pending")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setP)
      .catch(() => {});
  }, []);
  // Tiles rise in order; bars grow from their baseline, left to right, so the eye reads the weeks in order.
  useLayoutEffect(() => {
    if (!d || reduced()) return;
    const ctx = gsap.context(() => {
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
      root.current!.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        const o = { v: 0 },
          end = +el.dataset.count!;
        gsap.to(o, {
          v: end,
          duration: 1.1,
          ease: "power3.out",
          onUpdate: () => {
            el.textContent = String(Math.round(o.v));
          },
        });
      });
    }, root);
    return () => ctx.revert();
  }, [d]);
  if (!d) return <section className="view" id="v-home" />;
  const W = d.WEEKS,
    ups = d.ITEMS.filter((i) => i.wm === "wouldnt").length;
  const byGoals = d.GOALS_FROM == null || d.GOALS_FROM === "goals";
  return (
    <section className="view" id="v-home" ref={root}>
      {d.SAMPLE && (
        <a
          className="block rounded-xl border border-dashed bg-s2 px-3.5 py-2.5 text-[13.5px] text-ink-2 no-underline"
          href="#/review"
        >
          Example data, not yours. North and Trace show your weeks once you keep a thread in review.{" "}
          <b className="font-semibold text-brand">Open Review →</b>
        </a>
      )}
      <div className="vhead">
        <div>
          <h1>
            {W[0]}–{W.at(-1)} <em>·</em> {W.length} weeks
          </h1>
          <p>
            <b>{d.ITEMS.length}</b> threads you kept, <b>{d.REC.length}</b> times people praised
            your work, <b>{ups}</b> that would not have happened without you.
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
          Recap · {d.PHASES.length + 4} screens
        </Button>
      </div>
      {/* One question per band, read top to bottom. */}
      <div className="grid gap-3">
        <Where d={d} byGoals={byGoals} />
        <Delivered d={d} />
        {d.NUMS && <Nums d={d} />}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] gap-3">
          <Rec d={d} />
          <Asks d={d} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-3">
          <Fb d={d} />
          <Wm p={p} />
        </div>
      </div>
    </section>
  );
}

export const View = (_: { p: URLSearchParams }) => <Home />;
