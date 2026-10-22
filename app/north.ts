// North, Trace, Feedback and Search read one object, built here from the threads you kept.
import { discardOf, labelsOf, labelValue, reviewThreads, setByYou } from "../core/threads";
import { goalsOf } from "../core/goals";
import { placeholders, plain } from "../core/db";
import { leadTimeHours, median } from "../core/metrics";
import { badRequest, db, goalLinks, labeled } from "./data";
import { projects } from "./projects";

// North and Trace: the threads you kept in review, the last 8 weeks. Same shape as sample.json.
const SOURCE_NAMES: Record<string, string> = {
  github: "GitHub",
  linear: "Linear",
  slack: "Slack",
  calendar: "Calendar",
  drive: "Docs",
};
const COLORS = ["var(--g1)", "var(--g2)", "var(--g3)", "var(--g4)", "var(--g5)"];

export function north() {
  const weeks = labeled().slice(-8);
  const { threads, reviewPraise, threadOfEvent } = keptThreads(weeks);
  if (!threads.length) return null;
  const allPraise = [...reviewPraise, ...mentionPraise(weeks, threadOfEvent)];
  allPraise.sort((left, right) => left.when.localeCompare(right.when));
  // Each thread points at its first praise.
  for (const [index, praise] of allPraise.entries()) {
    const thread = threads.find((candidate) => candidate.id === praise.threadId);
    if (thread) thread.praiseIndex ??= index;
  }
  const { byId, used } = projectsOf(threads, weeks);
  const { goals, from } = rings(threads, used, byId);
  return {
    weeks: weeks.map((week) => week.slice(5)),
    reviewsGiven: weekly(weeks, "reviews_given"),
    period: `${weeks[0]} – ${weeks.at(-1)}`,
    goals: goals.map((goal, index) => ({ ...goal, color: COLORS[index % COLORS.length] })),
    goalsFrom: from,
    numbers: numbers(weeks),
    projects: byId,
    praise: allPraise,
    asks: asks(weeks),
    threads,
    highlight: highlight(threads, weeks, allPraise),
    feedback: feedback(),
    phases: phases(weeks, threads, allPraise),
  };
}

// The threads you kept, in North's shape, and the praise in their review comments.
function keptThreads(weeks: string[]) {
  const detailsOf = db.query("SELECT author, occurred_at, payload FROM events WHERE id = ?");
  const links = goalLinks();
  const threads: any[] = [];
  const reviewPraise: any[] = [];
  const threadOfEvent = new Map<string, string>(); // event id → key of its kept thread
  weeks.forEach((week, weekIndex) => {
    for (const thread of reviewThreads(db, week)) {
      const labels = labelsOf(db, thread);
      if (discardOf(labels) !== "no") continue;
      const value = (field: string) => labelValue(labels, field);
      const kept: any = {
        id: thread.key,
        weekIndex,
        projectId: thread.projects[0]?.id ?? "none",
        title: value("title") ?? thread.events[0].title,
        summary: value("summary"),
        mode: value("mode"),
        pillar: value("pillar"),
        withoutMe: value("without_me"),
        goalIds: goalsOf(links, thread).map((id) => `g${id}`),
        // Who set each label: facts for another session must say when a value is only Claude's guess.
        labelsBy: Object.fromEntries(
          ["title", "mode", "pillar", "without_me"].map((field) => [
            field,
            setByYou(labels, field) ? "you" : "claude",
          ]),
        ),
        links: thread.events
          .filter((event) => event.url)
          .map((event) => [
            SOURCE_NAMES[event.id.split(":")[0]] ?? "Other",
            event.title ?? event.kind,
            event.url,
          ]),
        // Span events for Trace: [kind, when or null, title, url]. Review comments and open issues have no time.
        events: thread.events.map((event) => [
          event.kind,
          (detailsOf.get(event.id) as any)?.occurred_at || null,
          event.title ?? "",
          event.url ?? null,
        ]),
      };
      // Praise in review: a comment marked praise. Slack praise comes from every mention, below.
      for (const event of thread.events) {
        threadOfEvent.set(event.id, thread.key);
        if (event.kind !== "review_comment") continue;
        const details = detailsOf.get(event.id) as any;
        const text = JSON.parse(details.payload).body ?? "";
        if (/^praise\b/i.test(text.trim()))
          reviewPraise.push({
            weekIndex,
            who: details.author ?? "",
            where: "PR review",
            text: plain(text).slice(0, 280),
            when: (details.occurred_at ?? "").slice(0, 10),
            threadId: thread.key,
          });
      }
      threads.push(kept);
    }
  });
  return { threads, reviewPraise, threadOfEvent };
}

// Every mention of you that Claude sorted, kept thread or not: a shoutout in #cheers is rarely in one.
const mentionsOfKind = (kind: string, weeks: string[]) =>
  db
    .query(
      `SELECT e.id, e.week, e.author, e.title, e.occurred_at, e.payload, k.about, k.quote FROM mention_kinds k
    JOIN events e ON e.id = k.event_id WHERE COALESCE(k.human_kind, k.kind) = ? AND e.week IN (${placeholders(weeks)}) ORDER BY e.occurred_at`,
    )
    .all(kind, ...weeks) as any[];

function mentionPraise(weeks: string[], threadOfEvent: Map<string, string>) {
  return mentionsOfKind("praise", weeks).map((mention) => {
    const payload = JSON.parse(mention.payload);
    return {
      id: mention.id,
      weekIndex: weeks.indexOf(mention.week),
      who: mention.author ?? "",
      where: mention.title,
      text: plain(payload.text ?? "").slice(0, 280),
      quote: mention.quote,
      about: mention.about,
      url: payload.permalink ?? null,
      when: (mention.occurred_at ?? "").slice(0, 10),
      threadId: threadOfEvent.get(mention.id),
    };
  });
}

// Who comes to you: people who asked you for something, most first.
function asks(weeks: string[]) {
  const byAuthor = new Map<string, any>();
  for (const mention of mentionsOfKind("ask", weeks)) {
    const ask = byAuthor.get(mention.author) ?? {
      who: mention.author,
      count: 0,
      perWeek: weeks.map(() => 0),
      about: [],
    };
    ask.count++;
    ask.perWeek[weeks.indexOf(mention.week)]++;
    ask.about.unshift(mention.about);
    byAuthor.set(mention.author, ask);
  }
  return [...byAuthor.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, 6)
    .map((ask) => ({ ...ask, about: [...new Set(ask.about)].slice(0, 3) }));
}

// The projects your kept threads are in, by id. "none" holds the threads without one.
function projectsOf(threads: any[], weeks: string[]) {
  const all = projects(weeks).projects as any[];
  const used = [...new Set(threads.map((thread) => thread.projectId as string))].filter(
    (id) => id !== "none",
  );
  const byId: any = {
    none: { name: "No project", url: null, lead: null, status: "—", milestones: [] },
  };
  for (const id of used) {
    const project = all.find((candidate) => candidate.id === id);
    byId[id] = {
      name: project?.name ?? id,
      url: project?.url ?? null,
      lead: project?.lead ?? null,
      status: project?.status ?? "",
      milestones: project?.milestones ?? [],
    };
  }
  return { byId, used };
}

// The rings are your goals, most served first. Before you write any, the three projects with
// the most threads stand in, and North says so.
function rings(threads: any[], used: string[], projectsById: any) {
  const threadsIn = (project: string) =>
    threads.filter((thread) => thread.projectId === project).length;
  const served = (id: string) => threads.filter((thread) => thread.goalIds.includes(id)).length;
  let goals = (db.query("SELECT id, title, kind FROM goals").all() as any[]).map((goal) => ({
    id: `g${goal.id}`,
    short: goal.title,
    title: goal.title,
    kind: goal.kind,
  }));
  const from = goals.length ? "goals" : "projects";
  if (!goals.length) {
    goals = [...used]
      .sort((left, right) => threadsIn(right) - threadsIn(left))
      .slice(0, 3)
      .map((id) => ({
        id,
        short: projectsById[id].name,
        title: projectsById[id].name,
        kind: "team",
      }));
    for (const thread of threads)
      thread.goalIds = goals.some((goal) => goal.id === thread.projectId) ? [thread.projectId] : [];
  }
  goals.sort((left, right) => served(right.id) - served(left.id));
  return { goals, from };
}

// One number a week from the events' payload. null when a week was collected before that
// number existed, so it never reads as zero.
const weekly = (weeks: string[], kind: string, field = "count") =>
  weeks.map((week) => {
    const row = db
      .query(
        "SELECT json_extract(payload, '$.' || ?) value FROM events WHERE kind = ? AND week = ?",
      )
      .get(field, kind, week) as any;
    return row?.value ?? (field === "count" ? 0 : null);
  });

// The events of a kind, week by week: their time and payload.
const eventsPerWeek = (weeks: string[], kind: string) =>
  weeks.map((week) =>
    (
      db
        .query("SELECT occurred_at, payload FROM events WHERE kind = ? AND week = ?")
        .all(kind, week) as any[]
    ).map((row) => ({ occurredAt: row.occurred_at, ...JSON.parse(row.payload) })),
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
    slackMessages: messages.map((week) => week.length),
    slackChannels: messages.map(
      (week) => new Set(week.map((message) => message.channel_name)).size,
    ),
    slackAt: messages.map((week) => week.map((message) => message.occurredAt)),
    meetingHours: meetings.map(
      (week) => +week.reduce((total, meeting) => total + meetingHours(meeting), 0).toFixed(1),
    ),
    reach: mentions.map((week) => new Set(week.map((mention) => mention.author_name)).size),
    merged: merged.map((week) => week.length),
    opened: weekly(weeks, "prs_opened"),
    reviewRequestsDirect: weekly(weeks, "review_requests", "direct"),
    reviewRequestsTeam: weekly(weeks, "review_requests", "team"),
    // Lead time: median hours from opened to merged, 0 for a week without merges.
    leadTimeHours: merged.map((week) => median(leadTimeHours(week)) ?? 0),
  };
}

// The thread North opens on, from the last week: a "wouldnt" (without you) with praise,
// else one with praise, else any. No thread last week: the newest kept.
function highlight(threads: any[], weeks: string[], allPraise: any[]) {
  const lastWeek = threads.filter((thread) => thread.weekIndex === weeks.length - 1);
  const best = [
    ...lastWeek.filter((thread) => thread.withoutMe === "wouldnt" && thread.praiseIndex != null),
    ...lastWeek.filter((thread) => thread.praiseIndex != null),
    ...lastWeek,
    ...threads.slice().reverse(),
  ][0];
  return {
    threadId: best.id,
    when: best.praiseIndex != null ? allPraise[best.praiseIndex].when : "",
  };
}

// Feedback, newest week first: what the code verified, never the raw Claude output.
function feedback() {
  const verdictsOf = db.query("SELECT item, verdict, why FROM feedback_verdicts WHERE week = ?");
  const rows = db.query("SELECT week, output FROM feedback ORDER BY week DESC").all() as any[];
  return rows.map((row) => ({
    ...JSON.parse(row.output),
    verdicts: Object.fromEntries(
      (verdictsOf.all(row.week) as any[]).map((saved) => [
        saved.item,
        { verdict: saved.verdict, why: saved.why },
      ]),
    ),
  }));
}

// One story screen per week: its threads, then its first praise.
function phases(weeks: string[], threads: any[], allPraise: any[]) {
  return weeks.flatMap((week, weekIndex) => {
    const kept = threads.filter((thread) => thread.weekIndex === weekIndex).length;
    if (!kept) return [];
    const label = week.slice(5);
    const firstPraise = allPraise.findIndex((praise) => praise.weekIndex === weekIndex);
    const screens: any[] = [
      { label, headline: `${kept} threads kept`, from: weekIndex, to: weekIndex },
    ];
    if (firstPraise >= 0) screens.push({ label, praiseIndex: firstPraise });
    return screens;
  });
}

// The pieces of one week's feedback you can accept or reject.
function feedbackPieces(output: any) {
  return [
    "experiment",
    ...(output.strength ? ["strength"] : []),
    ...output.patterns.map((pattern: any) => `pattern:${pattern.name}`),
  ];
}

// Accept or reject one piece of feedback; verdict null takes it back.
export function verdict(body: any) {
  const row = db
    .query("SELECT output FROM feedback WHERE week = ?")
    .get(String(body?.week ?? "")) as any;
  if (!row) return badRequest("No feedback for that week");
  const piece = String(body?.piece ?? "");
  if (!feedbackPieces(JSON.parse(row.output)).includes(piece))
    return badRequest("Unknown feedback item");
  if (body.verdict === null) {
    db.query("DELETE FROM feedback_verdicts WHERE week = ? AND item = ?").run(body.week, piece);
    return Response.json({ ok: true });
  }
  if (body.verdict !== "accept" && body.verdict !== "reject")
    return badRequest("Verdict is accept or reject");
  const why = body.why == null ? null : String(body.why).trim().slice(0, 400) || null;
  db.query(
    `INSERT INTO feedback_verdicts VALUES (?, ?, ?, ?, ?) ON CONFLICT (week, item) DO UPDATE SET verdict = excluded.verdict, why = excluded.why, at = excluded.at`,
  ).run(body.week, piece, body.verdict, why, new Date().toISOString());
  return Response.json({ ok: true });
}
