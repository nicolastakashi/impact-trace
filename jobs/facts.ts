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
  const numbers = data.numbers;
  const year = data.period.slice(0, 4);
  // ponytail: an 8-week window across New Year labels the old weeks with the new year; fine until January.
  return data.weeks.map((weekName: string, weekIndex: number) => {
    const kept = data.threads.filter((thread: any) => thread.weekIndex === weekIndex);
    const slackTimes = numbers.slackAt[weekIndex];
    return {
      week: `${year}-${weekName}`,
      kept: kept.length,
      mode: tally(kept.map((thread: any) => thread.mode)),
      pillar: tally(kept.map((thread: any) => thread.pillar)),
      without_me: tally(kept.map((thread: any) => thread.withoutMe)),
      prs_reviewed: data.reviewsGiven[weekIndex],
      prs_opened: numbers.opened[weekIndex],
      prs_merged: numbers.merged[weekIndex],
      review_requests_direct: numbers.reviewRequestsDirect?.[weekIndex] ?? null,
      review_requests_team: numbers.reviewRequestsTeam?.[weekIndex] ?? null,
      give_vs_take: numbers.opened[weekIndex]
        ? +(data.reviewsGiven[weekIndex] / numbers.opened[weekIndex]).toFixed(2)
        : null,
      lead_time_h: numbers.leadTimeHours[weekIndex],
      slack_messages: numbers.slackMessages[weekIndex],
      slack_channels: numbers.slackChannels[weekIndex],
      outside_hours_pct: slackTimes.length
        ? Math.round((slackTimes.filter(late).length / slackTimes.length) * 100)
        : null,
      meeting_h: numbers.meetingHours[weekIndex],
      people_mentioning: numbers.reach[weekIndex],
      praise: data.praise.filter((praise: any) => praise.weekIndex === weekIndex).length,
    };
  });
}

function totals(data: any) {
  const threads = data.threads;
  return {
    kept: threads.length,
    mode: tally(threads.map((thread: any) => thread.mode)),
    pillar: tally(threads.map((thread: any) => thread.pillar)),
    without_me: tally(threads.map((thread: any) => thread.withoutMe)),
    goals: Object.fromEntries(
      data.goals.map((goal: any) => [
        goal.title,
        threads.filter((thread: any) => thread.goalIds.includes(goal.id)).length,
      ]),
    ),
    no_goal: threads.filter((thread: any) => !thread.goalIds.length).length,
    project: tally(
      threads.map((thread: any) => data.projects[thread.projectId]?.name ?? thread.projectId),
    ),
  };
}

// One thread in full, as Trace shows it.
function threadOf(data: any, weeks: any[]) {
  const goalTitle = Object.fromEntries(data.goals.map((goal: any) => [goal.id, goal.title]));
  return (thread: any) => ({
    id: thread.id,
    week: weeks[thread.weekIndex].week,
    title: thread.title,
    summary: thread.summary,
    mode: thread.mode,
    pillar: thread.pillar,
    without_me: thread.withoutMe,
    labels_by: thread.labelsBy,
    events: tally(thread.events.map((event: any) => event[0])),
    project: data.projects[thread.projectId]?.name ?? thread.projectId,
    goals: thread.goalIds.map((goalId: string) => goalTitle[goalId] ?? goalId),
    links: thread.links.map(([source, title, url]: string[]) => ({ source, title, url })),
  });
}

// Your goals with their key results. "now" is code's: a rate over the last 4 closed weeks, or what you typed.
const goals = (data: any) =>
  (data.goalDetails ?? []).map((goal: any) => ({
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
  const latest = data.feedback[0];
  if (!latest) return null;
  return {
    week: latest.week,
    weeks: latest.weeks,
    patterns: latest.patterns.map((pattern: any) => ({
      name: pattern.name,
      per_week: pattern.trend,
      your_verdict: latest.verdicts?.[`pattern:${pattern.name}`]?.verdict ?? null,
      examples: pattern.evidence.map((example: any) => ({
        week: example.week,
        quote: example.quote,
        url: example.url,
      })),
    })),
    strength: latest.strength
      ? { name: latest.strength.name, your_verdict: latest.verdicts?.strength?.verdict ?? null }
      : null,
  };
}

export function facts(data: any, timeZone: string, week?: string) {
  const weeks = weekRows(data, timeZone);
  const threadOfWeek = threadOf(data, weeks);
  const out: any = {
    period: data.period,
    time_zone: timeZone,
    rules: RULES,
    totals: totals(data),
    weeks,
    objectives: goals(data),
    // Praise Claude found and code checked (the quote is in the message), and who asks you for things.
    recognition: data.praise.map((praise: any) => ({
      week: weeks[praise.weekIndex]?.week,
      who: praise.who,
      where: praise.where,
      about: praise.about ?? null,
      quote: praise.quote ?? praise.text,
      url: praise.url ?? null,
    })),
    who_comes_to_you: (data.asks ?? []).map((ask: any) => ({
      who: ask.who,
      asks: ask.count,
      per_week: ask.perWeek,
      about: ask.about,
    })),
    wouldnt_happen_without_you: data.threads
      .filter((thread: any) => thread.withoutMe === "wouldnt")
      .map(threadOfWeek),
    feedback: feedback(data),
  };
  if (week) {
    const weekIndex = weeks.findIndex((row: any) => row.week === week);
    if (weekIndex < 0) throw new Error(`${week} is not in ${data.period}`);
    out.threads = data.threads
      .filter((thread: any) => thread.weekIndex === weekIndex)
      .map(threadOfWeek);
    out.praise = data.praise
      .filter((praise: any) => praise.weekIndex === weekIndex)
      .map((praise: any) => ({
        who: praise.who,
        where: praise.where,
        when: praise.when,
        text: praise.text,
      }));
  }
  return out;
}

if (import.meta.main) {
  const week = process.argv[2];
  if (week && !/^\d{4}-W\d{2}$/.test(week)) throw new Error("usage: bun jobs/facts.ts [2026-W42]");
  console.log(JSON.stringify(facts(await fetchAppFacts(), localTimeZone(), week), null, 1));
}
