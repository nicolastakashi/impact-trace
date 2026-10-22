// North, Trace, Feedback and Search read one object, built here from the threads you kept.
import { discardOf, labelsOf, labelValue, reviewThreads, setByYou } from "../core/threads";
import { goalsOf } from "../core/goals";
import { placeholders, plain } from "../core/db";
import { leadTimeHours, median } from "../core/metrics";
import { badRequest, db, goalLinks, labeled } from "./data";
import { projects } from "./projects";

// North and Trace: the threads you kept in review, the last 8 weeks. Same shape as sample.json.
const SRC: Record<string, string> = {
  github: "GitHub",
  linear: "Linear",
  slack: "Slack",
  calendar: "Calendar",
  drive: "Docs",
};
const COLORS = ["var(--g1)", "var(--g2)", "var(--g3)", "var(--g4)", "var(--g5)"];

export function north() {
  const weeks = labeled().slice(-8);
  const { items, reviewPraise, itemOfEvent } = keptThreads(weeks);
  if (!items.length) return null;
  const rec = [...reviewPraise, ...mentionPraise(weeks, itemOfEvent)];
  rec.sort((a, b) => a.when.localeCompare(b.when));
  // Each item points at its first praise.
  for (const [i, praise] of rec.entries()) {
    const item = items.find((x) => x.id === praise.item);
    if (item) item.rec ??= i;
  }
  const { byId, used } = projectsOf(items, weeks);
  const { goals, from } = rings(items, used, byId);
  return {
    WEEKS: weeks.map((week) => week.slice(5)),
    REVIEWS: weekly(weeks, "reviews_given"),
    PERIOD: `${weeks[0]} – ${weeks.at(-1)}`,
    GOALS: goals.map((goal, i) => ({ ...goal, color: COLORS[i % COLORS.length] })),
    GOALS_FROM: from,
    NUMS: numbers(weeks),
    PROJECTS: byId,
    REC: rec,
    ASKS: asks(weeks),
    ITEMS: items,
    HIGHLIGHT: highlight(items, weeks, rec),
    FEEDBACK: feedback(),
    PHASES: phases(weeks, items, rec),
  };
}

// The threads you kept, as items, and the praise in their review comments.
function keptThreads(weeks: string[]) {
  const meta = db.query("SELECT author, occurred_at, payload FROM events WHERE id = ?");
  const links = goalLinks();
  const items: any[] = [];
  const reviewPraise: any[] = [];
  const itemOfEvent = new Map<string, string>(); // event id → key of its kept thread
  weeks.forEach((week, w) => {
    for (const thread of reviewThreads(db, week)) {
      const labels = labelsOf(db, thread);
      if (discardOf(labels) !== "no") continue;
      const value = (field: string) => labelValue(labels, field);
      const item: any = {
        id: thread.key,
        w,
        s: thread.projects[0]?.id ?? "none",
        title: value("title") ?? thread.events[0].title,
        summary: value("summary"),
        mode: value("mode"),
        pillar: value("pillar"),
        wm: value("without_me"),
        g: goalsOf(links, thread).map((id) => `g${id}`),
        // Who set each label: facts for another session must say when a value is only Claude's guess.
        by: Object.fromEntries(
          ["title", "mode", "pillar", "without_me"].map((field) => [
            field,
            setByYou(labels, field) ? "you" : "claude",
          ]),
        ),
        links: thread.events
          .filter((e) => e.url)
          .map((e) => [SRC[e.id.split(":")[0]] ?? "Other", e.title ?? e.kind, e.url]),
        // Span events for Trace: [kind, when or null, title, url]. Review comments and open issues have no time.
        ev: thread.events.map((e) => [
          e.kind,
          (meta.get(e.id) as any)?.occurred_at || null,
          e.title ?? "",
          e.url ?? null,
        ]),
      };
      // Praise in review: a comment marked praise. Slack praise comes from every mention, below.
      for (const e of thread.events) {
        itemOfEvent.set(e.id, thread.key);
        if (e.kind !== "review_comment") continue;
        const event = meta.get(e.id) as any;
        const text = JSON.parse(event.payload).body ?? "";
        if (/^praise\b/i.test(text.trim()))
          reviewPraise.push({
            w,
            who: event.author ?? "",
            where: "PR review",
            t: plain(text).slice(0, 280),
            when: (event.occurred_at ?? "").slice(0, 10),
            item: thread.key,
          });
      }
      items.push(item);
    }
  });
  return { items, reviewPraise, itemOfEvent };
}

// Every mention of you that Claude sorted, kept thread or not: a shoutout in #cheers is rarely in one.
const mentionsOfKind = (kind: string, weeks: string[]) =>
  db
    .query(
      `SELECT e.id, e.week, e.author, e.title, e.occurred_at, e.payload, k.about, k.quote FROM mention_kinds k
    JOIN events e ON e.id = k.event_id WHERE COALESCE(k.human_kind, k.kind) = ? AND e.week IN (${placeholders(weeks)}) ORDER BY e.occurred_at`,
    )
    .all(kind, ...weeks) as any[];

function mentionPraise(weeks: string[], itemOfEvent: Map<string, string>) {
  return mentionsOfKind("praise", weeks).map((mention) => {
    const payload = JSON.parse(mention.payload);
    return {
      id: mention.id,
      w: weeks.indexOf(mention.week),
      who: mention.author ?? "",
      where: mention.title,
      t: plain(payload.text ?? "").slice(0, 280),
      q: mention.quote,
      about: mention.about,
      url: payload.permalink ?? null,
      when: (mention.occurred_at ?? "").slice(0, 10),
      item: itemOfEvent.get(mention.id),
    };
  });
}

// Who comes to you: people who asked you for something, most first.
function asks(weeks: string[]) {
  const byAuthor = new Map<string, any>();
  for (const mention of mentionsOfKind("ask", weeks)) {
    const ask = byAuthor.get(mention.author) ?? {
      who: mention.author,
      n: 0,
      per: weeks.map(() => 0),
      about: [],
    };
    ask.n++;
    ask.per[weeks.indexOf(mention.week)]++;
    ask.about.unshift(mention.about);
    byAuthor.set(mention.author, ask);
  }
  return [...byAuthor.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((ask) => ({ ...ask, about: [...new Set(ask.about)].slice(0, 3) }));
}

// The projects your kept threads are in, by id. "none" holds the threads without one.
function projectsOf(items: any[], weeks: string[]) {
  const all = projects(weeks).projects as any[];
  const used = [...new Set(items.map((i) => i.s as string))].filter((s) => s !== "none");
  const byId: any = { none: { name: "No project", url: null, lead: null, status: "—", ms: [] } };
  for (const id of used) {
    const project = all.find((x) => x.id === id);
    byId[id] = {
      name: project?.name ?? id,
      url: project?.url ?? null,
      lead: project?.lead ?? null,
      status: project?.status ?? "",
      ms: project?.ms ?? [],
    };
  }
  return { byId, used };
}

// The rings are your goals, most served first. Before you write any, the three projects with
// the most threads stand in, and North says so.
function rings(items: any[], used: string[], projectsById: any) {
  const threadsIn = (project: string) => items.filter((i) => i.s === project).length;
  const served = (id: string) => items.filter((i) => i.g.includes(id)).length;
  let goals = (db.query("SELECT id, title, kind FROM goals").all() as any[]).map((goal) => ({
    id: `g${goal.id}`,
    short: goal.title,
    title: goal.title,
    kind: goal.kind,
  }));
  const from = goals.length ? "goals" : "projects";
  if (!goals.length) {
    goals = [...used]
      .sort((a, b) => threadsIn(b) - threadsIn(a))
      .slice(0, 3)
      .map((id) => ({
        id,
        short: projectsById[id].name,
        title: projectsById[id].name,
        kind: "team",
      }));
    for (const item of items) item.g = goals.some((goal) => goal.id === item.s) ? [item.s] : [];
  }
  goals.sort((a, b) => served(b.id) - served(a.id));
  return { goals, from };
}

// One number a week from the events' payload. null when a week was collected before that
// number existed, so it never reads as zero.
const weekly = (weeks: string[], kind: string, field = "count") =>
  weeks.map((week) => {
    const row = db
      .query("SELECT json_extract(payload, '$.' || ?) n FROM events WHERE kind = ? AND week = ?")
      .get(field, kind, week) as any;
    return row?.n ?? (field === "count" ? 0 : null);
  });

// The events of a kind, week by week: their time and payload.
const eventsPerWeek = (weeks: string[], kind: string) =>
  weeks.map((week) =>
    (
      db
        .query("SELECT occurred_at t, payload p FROM events WHERE kind = ? AND week = ?")
        .all(kind, week) as any[]
    ).map((row) => ({ t: row.t, ...JSON.parse(row.p) })),
  );

// A meeting's length in hours. A start with no time of day counts as 0.
const meetingHours = (meeting: any) =>
  String(meeting.start).includes("T")
    ? (Date.parse(meeting.end) - Date.parse(meeting.start)) / 36e5
    : 0;

// Numbers: everything collected, not only kept threads. Times go out raw: the browser
// knows your time zone, the container does not.
function numbers(weeks: string[]) {
  const messages = eventsPerWeek(weeks, "slack_message");
  const mentions = eventsPerWeek(weeks, "slack_mention");
  const merged = eventsPerWeek(weeks, "pr_merged");
  const meetings = eventsPerWeek(weeks, "meeting");
  return {
    slack: messages.map((week) => week.length),
    channels: messages.map((week) => new Set(week.map((m) => m.channel_name)).size),
    slackAt: messages.map((week) => week.map((m) => m.t)),
    meetings: meetings.map(
      (week) => +week.reduce((total, m) => total + meetingHours(m), 0).toFixed(1),
    ),
    reach: mentions.map((week) => new Set(week.map((m) => m.author_name)).size),
    merged: merged.map((week) => week.length),
    opened: weekly(weeks, "prs_opened"),
    asked_direct: weekly(weeks, "review_requests", "direct"),
    asked_team: weekly(weeks, "review_requests", "team"),
    // Lead time: median hours from opened to merged, 0 for a week without merges.
    lead: merged.map((week) => median(leadTimeHours(week)) ?? 0),
  };
}

// The thread North opens on, from the last week: a "wouldnt" (without you) with praise,
// else one with praise, else any. No thread last week: the newest kept.
function highlight(items: any[], weeks: string[], rec: any[]) {
  const lastWeek = items.filter((i) => i.w === weeks.length - 1);
  const best = [
    ...lastWeek.filter((i) => i.wm === "wouldnt" && i.rec != null),
    ...lastWeek.filter((i) => i.rec != null),
    ...lastWeek,
    ...items.slice().reverse(),
  ][0];
  return { item: best.id, when: best.rec != null ? rec[best.rec].when : "" };
}

// Feedback, newest week first: what the code verified, never the raw Claude output.
function feedback() {
  const verdictsOf = db.query("SELECT item, verdict, why FROM feedback_verdicts WHERE week = ?");
  const rows = db.query("SELECT week, output FROM feedback ORDER BY week DESC").all() as any[];
  return rows.map((row) => ({
    ...JSON.parse(row.output),
    verdicts: Object.fromEntries(
      (verdictsOf.all(row.week) as any[]).map((v) => [v.item, { v: v.verdict, why: v.why }]),
    ),
  }));
}

// One story screen per week: its threads, then its first praise.
function phases(weeks: string[], items: any[], rec: any[]) {
  return weeks.flatMap((week, w) => {
    const kept = items.filter((i) => i.w === w).length;
    if (!kept) return [];
    const label = week.slice(5);
    const firstPraise = rec.findIndex((x) => x.w === w);
    const screens: any[] = [{ k: label, h: `${kept} threads kept`, from: w, to: w }];
    if (firstPraise >= 0) screens.push({ k: label, rec: firstPraise });
    return screens;
  });
}

// The pieces of one week's feedback you can accept or reject.
function feedbackItems(output: any) {
  return [
    "experiment",
    ...(output.strength ? ["strength"] : []),
    ...output.patterns.map((p: any) => `pattern:${p.name}`),
  ];
}

// Accept or reject one piece of feedback; verdict null takes it back.
export function verdict(body: any) {
  const row = db
    .query("SELECT output FROM feedback WHERE week = ?")
    .get(String(body?.week ?? "")) as any;
  if (!row) return badRequest("No feedback for that week");
  const item = String(body?.item ?? "");
  if (!feedbackItems(JSON.parse(row.output)).includes(item))
    return badRequest("Unknown feedback item");
  if (body.verdict === null) {
    db.query("DELETE FROM feedback_verdicts WHERE week = ? AND item = ?").run(body.week, item);
    return Response.json({ ok: true });
  }
  if (body.verdict !== "accept" && body.verdict !== "reject")
    return badRequest("Verdict is accept or reject");
  const why = body.why == null ? null : String(body.why).trim().slice(0, 400) || null;
  db.query(
    `INSERT INTO feedback_verdicts VALUES (?, ?, ?, ?, ?) ON CONFLICT (week, item) DO UPDATE SET verdict = excluded.verdict, why = excluded.why, at = excluded.at`,
  ).run(body.week, item, body.verdict, why, new Date().toISOString());
  return Response.json({ ok: true });
}
