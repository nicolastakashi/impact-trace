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
function outsideHours(tz: string) {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
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

function weekRows(data: any, tz: string) {
  const late = outsideHours(tz);
  const nums = data.NUMS;
  const year = data.PERIOD.slice(0, 4);
  // ponytail: an 8-week window across New Year labels the old weeks with the new year; fine until January.
  return data.WEEKS.map((w: string, i: number) => {
    const kept = data.ITEMS.filter((item: any) => item.w === i);
    const slackTimes = nums.slackAt[i];
    return {
      week: `${year}-${w}`,
      kept: kept.length,
      mode: tally(kept.map((x: any) => x.mode)),
      pillar: tally(kept.map((x: any) => x.pillar)),
      without_me: tally(kept.map((x: any) => x.wm)),
      prs_reviewed: data.REVIEWS[i],
      prs_opened: nums.opened[i],
      prs_merged: nums.merged[i],
      review_requests_direct: nums.asked_direct?.[i] ?? null,
      review_requests_team: nums.asked_team?.[i] ?? null,
      give_vs_take: nums.opened[i] ? +(data.REVIEWS[i] / nums.opened[i]).toFixed(2) : null,
      lead_time_h: nums.lead[i],
      slack_messages: nums.slack[i],
      slack_channels: nums.channels[i],
      outside_hours_pct: slackTimes.length
        ? Math.round((slackTimes.filter(late).length / slackTimes.length) * 100)
        : null,
      meeting_h: nums.meetings[i],
      people_mentioning: nums.reach[i],
      praise: data.REC.filter((r: any) => r.w === i).length,
    };
  });
}

function totals(data: any) {
  const items = data.ITEMS;
  return {
    kept: items.length,
    mode: tally(items.map((x: any) => x.mode)),
    pillar: tally(items.map((x: any) => x.pillar)),
    without_me: tally(items.map((x: any) => x.wm)),
    goals: Object.fromEntries(
      data.GOALS.map((g: any) => [g.title, items.filter((x: any) => x.g.includes(g.id)).length]),
    ),
    no_goal: items.filter((x: any) => !x.g.length).length,
    project: tally(items.map((x: any) => data.PROJECTS[x.s]?.name ?? x.s)),
  };
}

// One thread in full, as Trace shows it.
function threadOf(data: any, weeks: any[]) {
  const goalTitle = Object.fromEntries(data.GOALS.map((g: any) => [g.id, g.title]));
  return (x: any) => ({
    id: x.id,
    week: weeks[x.w].week,
    title: x.title,
    summary: x.summary,
    mode: x.mode,
    pillar: x.pillar,
    without_me: x.wm,
    labels_by: x.by,
    events: tally(x.ev.map((e: any) => e[0])),
    project: data.PROJECTS[x.s]?.name ?? x.s,
    goals: x.g.map((g: string) => goalTitle[g] ?? g),
    links: x.links.map(([source, title, url]: string[]) => ({ source, title, url })),
  });
}

// Your goals with their key results. "now" is code's: a rate over the last 4 closed weeks, or what you typed.
const objectives = (data: any) =>
  (data.OBJECTIVES ?? []).map((g: any) => ({
    title: g.title,
    description: g.description ?? null,
    kind: g.kind,
    type: g.type,
    quarter: g.quarter,
    key_results: g.krs.map((k: any) => ({
      text: k.text,
      measured_by: k.metric ?? "you",
      start: k.start,
      target: k.target,
      now: k.value,
      progress: k.progress,
    })),
    confidence: g.checkins.map((c: any) => ({ week: c.week, value: c.confidence })),
  }));

// Feedback has its own 8 weeks (it ends with the last closed week): per_week follows `weeks`.
function feedback(data: any) {
  const latest = data.FEEDBACK[0];
  if (!latest) return null;
  return {
    week: latest.week,
    weeks: latest.weeks,
    patterns: latest.patterns.map((p: any) => ({
      name: p.name,
      per_week: p.trend,
      your_verdict: latest.verdicts?.[`pattern:${p.name}`]?.v ?? null,
      examples: p.evidence.map((e: any) => ({ week: e.week, quote: e.quote, url: e.url })),
    })),
    strength: latest.strength
      ? { name: latest.strength.name, your_verdict: latest.verdicts?.strength?.v ?? null }
      : null,
  };
}

export function facts(data: any, tz: string, week?: string) {
  const weeks = weekRows(data, tz);
  const thread = threadOf(data, weeks);
  const out: any = {
    period: data.PERIOD,
    time_zone: tz,
    rules: RULES,
    totals: totals(data),
    weeks,
    objectives: objectives(data),
    // Praise Claude found and code checked (the quote is in the message), and who asks you for things.
    recognition: data.REC.map((r: any) => ({
      week: weeks[r.w]?.week,
      who: r.who,
      where: r.where,
      about: r.about ?? null,
      quote: r.q ?? r.t,
      url: r.url ?? null,
    })),
    who_comes_to_you: (data.ASKS ?? []).map((a: any) => ({
      who: a.who,
      asks: a.n,
      per_week: a.per,
      about: a.about,
    })),
    wouldnt_happen_without_you: data.ITEMS.filter((x: any) => x.wm === "wouldnt").map(thread),
    feedback: feedback(data),
  };
  if (week) {
    const i = weeks.findIndex((w: any) => w.week === week);
    if (i < 0) throw new Error(`${week} is not in ${data.PERIOD}`);
    out.threads = data.ITEMS.filter((x: any) => x.w === i).map(thread);
    out.praise = data.REC.filter((r: any) => r.w === i).map((r: any) => ({
      who: r.who,
      where: r.where,
      when: r.when,
      text: r.t,
    }));
  }
  return out;
}

if (import.meta.main) {
  const week = process.argv[2];
  if (week && !/^\d{4}-W\d{2}$/.test(week)) throw new Error("usage: bun jobs/facts.ts [2026-W42]");
  console.log(JSON.stringify(facts(await fetchAppFacts(), localTimeZone(), week), null, 1));
}
