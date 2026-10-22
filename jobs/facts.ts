// Facts for a Claude session: the numbers North shows, counted by code, as one JSON.
// Usage: bun jobs/facts.ts [week]   (the app must run: docker compose up -d)
// Without a week: totals and every week. With one (2026-W42): that week's threads in full.

const RULES =
  "Counts are code's. Kept threads are the ones you kept in review; labels_by says if you set a label or it is still Claude's. Slack, GitHub and calendar numbers count everything collected, kept or not. review_requests_* are PRs that named you (direct) or one of your teams (team) that week; null means not collected.";

// What North shows, from the running app.
export async function fetchAppFacts() {
  const response = await fetch("http://127.0.0.1:4317/api/facts").catch(() => null);
  if (!response?.ok)
    throw new Error(
      response ? await response.text() : "The app is not running: docker compose up -d",
    );
  return response.json();
}

// Your time zone comes from this machine, like the browser does for North.
export const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// How many of each value, e.g. { build: 3, unset: 1 }.
const tally = (values: (string | undefined)[]) =>
  values.reduce(
    (counts, value) => ({ ...counts, [value ?? "unset"]: (counts[value ?? "unset"] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

// A weekend, or before 9 or from 19 on a weekday, in your time zone.
function outsideHours(timeZone: string) {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  });
  return (time: string) => {
    const parts = Object.fromEntries(
      format.formatToParts(new Date(time)).map((part) => [part.type, part.value]),
    );
    const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
    return weekend || +parts.hour < 9 || +parts.hour >= 19;
  };
}

function weekRows(data: any, timeZone: string) {
  const late = outsideHours(timeZone);
  const numbers = data.NUMS;
  const year = data.PERIOD.slice(0, 4);
  // ponytail: an 8-week window across New Year labels the old weeks with the new year; fine until January.
  return data.WEEKS.map((weekName: string, weekIndex: number) => {
    const kept = data.ITEMS.filter((thread: any) => thread.w === weekIndex);
    const slackTimes = numbers.slackAt[weekIndex];
    return {
      week: `${year}-${weekName}`,
      kept: kept.length,
      mode: tally(kept.map((thread: any) => thread.mode)),
      pillar: tally(kept.map((thread: any) => thread.pillar)),
      without_me: tally(kept.map((thread: any) => thread.wm)),
      prs_reviewed: data.REVIEWS[weekIndex],
      prs_opened: numbers.opened[weekIndex],
      prs_merged: numbers.merged[weekIndex],
      review_requests_direct: numbers.asked_direct?.[weekIndex] ?? null,
      review_requests_team: numbers.asked_team?.[weekIndex] ?? null,
      give_vs_take: numbers.opened[weekIndex]
        ? +(data.REVIEWS[weekIndex] / numbers.opened[weekIndex]).toFixed(2)
        : null,
      lead_time_h: numbers.lead[weekIndex],
      slack_messages: numbers.slack[weekIndex],
      slack_channels: numbers.channels[weekIndex],
      outside_hours_pct: slackTimes.length
        ? Math.round((slackTimes.filter(late).length / slackTimes.length) * 100)
        : null,
      meeting_h: numbers.meetings[weekIndex],
      people_mentioning: numbers.reach[weekIndex],
      praise: data.REC.filter((praise: any) => praise.w === weekIndex).length,
    };
  });
}

function totals(data: any) {
  const threads = data.ITEMS;
  return {
    kept: threads.length,
    mode: tally(threads.map((thread: any) => thread.mode)),
    pillar: tally(threads.map((thread: any) => thread.pillar)),
    without_me: tally(threads.map((thread: any) => thread.wm)),
    goals: Object.fromEntries(
      data.GOALS.map((goal: any) => [
        goal.title,
        threads.filter((thread: any) => thread.g.includes(goal.id)).length,
      ]),
    ),
    no_goal: threads.filter((thread: any) => !thread.g.length).length,
    project: tally(threads.map((thread: any) => data.PROJECTS[thread.s]?.name ?? thread.s)),
  };
}

// One thread in full, as Trace shows it.
function threadOf(data: any, weeks: any[]) {
  const goalTitle = Object.fromEntries(data.GOALS.map((goal: any) => [goal.id, goal.title]));
  return (thread: any) => ({
    id: thread.id,
    week: weeks[thread.w].week,
    title: thread.title,
    summary: thread.summary,
    mode: thread.mode,
    pillar: thread.pillar,
    without_me: thread.wm,
    labels_by: thread.by,
    events: tally(thread.ev.map((event: any) => event[0])),
    project: data.PROJECTS[thread.s]?.name ?? thread.s,
    goals: thread.g.map((goalId: string) => goalTitle[goalId] ?? goalId),
    links: thread.links.map(([source, title, url]: string[]) => ({ source, title, url })),
  });
}

// Your goals with their key results. "now" is code's: a rate over the last 4 closed weeks, or what you typed.
const goals = (data: any) =>
  (data.OBJECTIVES ?? []).map((goal: any) => ({
    title: goal.title,
    description: goal.description ?? null,
    kind: goal.kind,
    type: goal.type,
    quarter: goal.quarter,
    key_results: goal.krs.map((keyResult: any) => ({
      text: keyResult.text,
      measured_by: keyResult.metric ?? "you",
      start: keyResult.start,
      target: keyResult.target,
      now: keyResult.value,
      progress: keyResult.progress,
    })),
    confidence: goal.checkins.map((checkIn: any) => ({
      week: checkIn.week,
      value: checkIn.confidence,
    })),
  }));

// Feedback has its own 8 weeks (it ends with the last closed week): per_week follows `weeks`.
function feedback(data: any) {
  const latest = data.FEEDBACK[0];
  if (!latest) return null;
  return {
    week: latest.week,
    weeks: latest.weeks,
    patterns: latest.patterns.map((pattern: any) => ({
      name: pattern.name,
      per_week: pattern.trend,
      your_verdict: latest.verdicts?.[`pattern:${pattern.name}`]?.v ?? null,
      examples: pattern.evidence.map((example: any) => ({
        week: example.week,
        quote: example.quote,
        url: example.url,
      })),
    })),
    strength: latest.strength
      ? { name: latest.strength.name, your_verdict: latest.verdicts?.strength?.v ?? null }
      : null,
  };
}

export function facts(data: any, timeZone: string, week?: string) {
  const weeks = weekRows(data, timeZone);
  const threadOfWeek = threadOf(data, weeks);
  const out: any = {
    period: data.PERIOD,
    time_zone: timeZone,
    rules: RULES,
    totals: totals(data),
    weeks,
    objectives: goals(data),
    // Praise Claude found and code checked (the quote is in the message), and who asks you for things.
    recognition: data.REC.map((praise: any) => ({
      week: weeks[praise.w]?.week,
      who: praise.who,
      where: praise.where,
      about: praise.about ?? null,
      quote: praise.q ?? praise.t,
      url: praise.url ?? null,
    })),
    who_comes_to_you: (data.ASKS ?? []).map((ask: any) => ({
      who: ask.who,
      asks: ask.n,
      per_week: ask.per,
      about: ask.about,
    })),
    wouldnt_happen_without_you: data.ITEMS.filter((thread: any) => thread.wm === "wouldnt").map(
      threadOfWeek,
    ),
    feedback: feedback(data),
  };
  if (week) {
    const weekIndex = weeks.findIndex((row: any) => row.week === week);
    if (weekIndex < 0) throw new Error(`${week} is not in ${data.PERIOD}`);
    out.threads = data.ITEMS.filter((thread: any) => thread.w === weekIndex).map(threadOfWeek);
    out.praise = data.REC.filter((praise: any) => praise.w === weekIndex).map((praise: any) => ({
      who: praise.who,
      where: praise.where,
      when: praise.when,
      text: praise.t,
    }));
  }
  return out;
}

if (import.meta.main) {
  const week = process.argv[2];
  if (week && !/^\d{4}-W\d{2}$/.test(week)) throw new Error("usage: bun jobs/facts.ts [2026-W42]");
  console.log(JSON.stringify(facts(await fetchAppFacts(), localTimeZone(), week), null, 1));
}
