// North, Trace, Feedback and Search read one object, built here from the threads you kept.
import { labelsOf, reviewThreads } from "../ingest/review";
import { goalsOf } from "../ingest/goals";
import { plain } from "../ingest/ingest";
import { db, discard, goalLinks, labeled, pick } from "./data";
import { projects } from "./projects";

// North and Trace: the threads you kept in review, the last 8 weeks. Same shape as sample.json.
const SRC: Record<string, string> = { github: "GitHub", linear: "Linear", slack: "Slack", calendar: "Calendar", drive: "Docs" };
const COLORS = ["var(--g1)", "var(--g2)", "var(--g3)", "var(--g4)", "var(--g5)"];
export function north() {
  const weeks = labeled().slice(-8);
  const meta = db.query("SELECT author, occurred_at, payload FROM events WHERE id = ?");
  const items: any[] = [], rec: any[] = [], L = goalLinks(), inItem = new Map<string, string>();
  weeks.forEach((week, w) => {
    for (const t of reviewThreads(db, week)) {
      const l = labelsOf(db, t);
      const v = pick(l);
      if (discard(l) !== "no") continue;
      const it: any = { id: t.key, w, s: t.projects[0]?.id ?? "none", title: v("title") ?? t.events[0].title, summary: v("summary"),
        mode: v("mode"), pillar: v("pillar"), wm: v("without_me"), g: goalsOf(L, t).map((id) => `g${id}`),
        // Who set each label: facts for another session must say when a value is only Claude's guess.
        by: Object.fromEntries(["title", "mode", "pillar", "without_me"].map((f) => [f, l.some((r) => r.field === f && r.source === "human") ? "you" : "claude"])),
        links: t.events.filter((e) => e.url).map((e) => [SRC[e.id.split(":")[0]] ?? "Other", e.title ?? e.kind, e.url]),
        // Span events for Trace: [kind, when or null, title, url]. Review comments and open issues have no time.
        ev: t.events.map((e) => [e.kind, (meta.get(e.id) as any)?.occurred_at || null, e.title ?? "", e.url ?? null]) };
      // Praise in review: a comment marked praise. Slack praise comes from every mention, below.
      for (const e of t.events) {
        inItem.set(e.id, t.key);
        if (e.kind !== "review_comment") continue;
        const m = meta.get(e.id) as any, text = JSON.parse(m.payload).body ?? "";
        if (/^praise\b/i.test(text.trim())) rec.push({ w, who: m.author ?? "", where: "PR review", t: plain(text).slice(0, 280), when: (m.occurred_at ?? "").slice(0, 10), item: t.key });
      }
      items.push(it);
    }
  });
  if (!items.length) return null;
  // Every mention of you that Claude sorted, kept thread or not: a shoutout in #cheers is rarely in one.
  const sorted = (kind: string) => db.query(`SELECT e.id, e.week, e.author, e.title, e.occurred_at, e.payload, k.about, k.quote FROM mention_kinds k
    JOIN events e ON e.id = k.event_id WHERE COALESCE(k.human_kind, k.kind) = ? AND e.week IN (${weeks.map(() => "?").join(",")}) ORDER BY e.occurred_at`).all(kind, ...weeks) as any[];
  for (const m of sorted("praise")) { const p = JSON.parse(m.payload);
    rec.push({ id: m.id, w: weeks.indexOf(m.week), who: m.author ?? "", where: m.title, t: plain(p.text ?? "").slice(0, 280), q: m.quote, about: m.about, url: p.permalink ?? null,
      when: (m.occurred_at ?? "").slice(0, 10), item: inItem.get(m.id) }); }
  rec.sort((a, b) => a.when.localeCompare(b.when));
  for (const [i, r] of rec.entries()) { const it = items.find((x) => x.id === r.item); if (it) it.rec ??= i; }
  // Who comes to you: people who asked you for something, most first.
  const asks = new Map<string, any>();
  for (const m of sorted("ask")) { const a = asks.get(m.author) ?? { who: m.author, n: 0, per: weeks.map(() => 0), about: [] };
    a.n++; a.per[weeks.indexOf(m.week)]++; a.about.unshift(m.about); asks.set(m.author, a); }
  const all = projects(weeks).projects as any[];
  const count = (s: string) => items.filter((i) => i.s === s).length;
  const used = [...new Set(items.map((i) => i.s))].filter((s) => s !== "none");
  const P: any = { none: { name: "No project", url: null, lead: null, status: "—", ms: [] } };
  for (const id of used) { const a = all.find((x) => x.id === id); P[id] = { name: a?.name ?? id, url: a?.url ?? null, lead: a?.lead ?? null, status: a?.status ?? "", ms: a?.ms ?? [] }; }
  // The rings are your goals, most served first. Before you write any, the three projects with
  // the most threads stand in, and North says so.
  const served = (id: string) => items.filter((i) => i.g.includes(id)).length;
  let goals = (db.query("SELECT id, title, kind FROM goals").all() as any[]).map((g) => ({ id: `g${g.id}`, short: g.title, title: g.title, kind: g.kind }));
  const from = goals.length ? "goals" : "projects";
  if (!goals.length) {
    goals = used.sort((a, b) => count(b) - count(a)).slice(0, 3).map((id) => ({ id, short: P[id].name, title: P[id].name, kind: "team" }));
    for (const i of items) i.g = goals.some((g) => g.id === i.s) ? [i.s] : [];
  }
  goals.sort((a, b) => served(b.id) - served(a.id));
  // null when a week was collected before that number existed, so it never reads as zero.
  const weekly = (kind: string, field = "count") => weeks.map((w) => (db.query("SELECT json_extract(payload, '$.' || ?) n FROM events WHERE kind = ? AND week = ?").get(field, kind, w) as any)?.n ?? (field === "count" ? 0 : null));
  const reviews = weekly("reviews_given");
  const last = items.filter((i) => i.w === weeks.length - 1);
  const big = [...last.filter((i) => i.wm === "wouldnt" && i.rec != null), ...last.filter((i) => i.rec != null), ...last, ...items.slice().reverse()][0];
  const o: any = {}, js = (k: string, v: any) => { o[k] = v; };
  // Numbers: everything collected, not only kept threads. Times go out raw: the browser
  // knows your time zone, the container does not.
  const per = (k: string) => weeks.map((w) => (db.query("SELECT occurred_at t, payload p FROM events WHERE kind = ? AND week = ?").all(k, w) as any[]).map((r) => ({ t: r.t, ...JSON.parse(r.p) })));
  const msgs = per("slack_message"), ments = per("slack_mention");
  // Lead time: median hours from opened to merged. Median, because one PR open for a month would drag a mean.
  const median = (xs: number[]) => { const s = xs.sort((a, b) => a - b), h = s.length >> 1; return s.length ? +(s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2).toFixed(1) : 0; };
  const prs = per("pr_merged");
  const hours = (m: any) => String(m.start).includes("T") ? (Date.parse(m.end) - Date.parse(m.start)) / 36e5 : 0;
  [js("WEEKS", weeks.map((w) => w.slice(5))), js("REVIEWS", reviews), js("PERIOD", `${weeks[0]} – ${weeks.at(-1)}`),
    js("GOALS", goals.map((g, i) => ({ ...g, color: COLORS[i % COLORS.length] }))), js("GOALS_FROM", from),
    js("NUMS", { slack: msgs.map((m) => m.length), channels: msgs.map((m) => new Set(m.map((x) => x.channel_name)).size), slackAt: msgs.map((m) => m.map((x) => x.t)),
      meetings: per("meeting").map((m) => +m.reduce((a, x) => a + hours(x), 0).toFixed(1)), reach: ments.map((m) => new Set(m.map((x) => x.author_name)).size), merged: prs.map((m) => m.length), opened: weekly("prs_opened"),
      asked_direct: weekly("review_requests", "direct"), asked_team: weekly("review_requests", "team"),
      lead: prs.map((m) => median(m.filter((p) => p.opened).map((p) => (Date.parse(p.at) - Date.parse(p.opened)) / 36e5))) }),
    js("PROJECTS", P), js("REC", rec), js("ASKS", [...asks.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((a) => ({ ...a, about: [...new Set(a.about)].slice(0, 3) }))), js("ITEMS", items), js("HIGHLIGHT", { item: big.id, when: big.rec != null ? rec[big.rec].when : "" }),
    // Feedback, newest week first: what the code verified, never the raw Claude output.
    js("FEEDBACK", (db.query("SELECT week, output FROM feedback ORDER BY week DESC").all() as any[]).map((r) => ({ ...JSON.parse(r.output),
      verdicts: Object.fromEntries((db.query("SELECT item, verdict, why FROM feedback_verdicts WHERE week = ?").all(r.week) as any[]).map((v) => [v.item, { v: v.verdict, why: v.why }])) }))),
    // One story screen per week: its threads, then its first praise.
    js("PHASES", weeks.flatMap((wk, w) => { const r = rec.findIndex((x) => x.w === w);
      return items.some((i) => i.w === w) ? [{ k: wk.slice(5), h: `${items.filter((i) => i.w === w).length} threads kept`, from: w, to: w }, ...(r >= 0 ? [{ k: wk.slice(5), rec: r }] : [])] : []; })),
  ];
  return o;
}

// Accept or reject one piece of feedback; verdict null takes it back.
export function verdict(b: any) {
  const row = db.query("SELECT output FROM feedback WHERE week = ?").get(String(b?.week ?? "")) as any;
  if (!row) return new Response("No feedback for that week", { status: 400 });
  const o = JSON.parse(row.output), item = String(b?.item ?? "");
  const items = ["experiment", ...(o.strength ? ["strength"] : []), ...o.patterns.map((p: any) => `pattern:${p.name}`)];
  if (!items.includes(item)) return new Response("Unknown feedback item", { status: 400 });
  if (b.verdict === null) { db.query("DELETE FROM feedback_verdicts WHERE week = ? AND item = ?").run(b.week, item); return Response.json({ ok: true }); }
  if (b.verdict !== "accept" && b.verdict !== "reject") return new Response("Verdict is accept or reject", { status: 400 });
  const why = b.why == null ? null : String(b.why).trim().slice(0, 400) || null;
  db.query(`INSERT INTO feedback_verdicts VALUES (?, ?, ?, ?, ?) ON CONFLICT (week, item) DO UPDATE SET verdict = excluded.verdict, why = excluded.why, at = excluded.at`)
    .run(b.week, item, b.verdict, why, new Date().toISOString());
  return Response.json({ ok: true });
}
