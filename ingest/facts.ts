// Facts for a Claude session: the numbers North shows, counted by code, as one JSON.
// Usage: bun ingest/facts.ts [week]   (the app must run: docker compose up -d)
// Without a week: totals and every week. With one (2026-W42): that week's threads in full.

const tally = (xs: (string | undefined)[]) => xs.reduce((m, x) => ({ ...m, [x ?? "unset"]: (m[x ?? "unset"] ?? 0) + 1 }), {} as Record<string, number>);

export function facts(d: any, tz: string, week?: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "numeric", hourCycle: "h23" });
  const late = (t: string) => { const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value])); return p.weekday === "Sat" || p.weekday === "Sun" || +p.hour < 9 || +p.hour >= 19; };
  const goal = Object.fromEntries(d.GOALS.map((g: any) => [g.id, g.title]));
  const N = d.NUMS, year = d.PERIOD.slice(0, 4);
  // ponytail: an 8-week window across New Year labels the old weeks with the new year; fine until January.
  const weeks = d.WEEKS.map((w: string, i: number) => {
    const kept = d.ITEMS.filter((it: any) => it.w === i);
    return { week: `${year}-${w}`, kept: kept.length, mode: tally(kept.map((x: any) => x.mode)), pillar: tally(kept.map((x: any) => x.pillar)),
      without_me: tally(kept.map((x: any) => x.wm)), prs_reviewed: d.REVIEWS[i], prs_opened: N.opened[i], prs_merged: N.merged[i],
      review_requests_direct: N.asked_direct?.[i] ?? null, review_requests_team: N.asked_team?.[i] ?? null,
      give_vs_take: N.opened[i] ? +(d.REVIEWS[i] / N.opened[i]).toFixed(2) : null, lead_time_h: N.lead[i], slack_messages: N.slack[i],
      slack_channels: N.channels[i], outside_hours_pct: N.slackAt[i].length ? Math.round(N.slackAt[i].filter(late).length / N.slackAt[i].length * 100) : null,
      meeting_h: N.meetings[i], people_mentioning: N.reach[i], praise: d.REC.filter((r: any) => r.w === i).length };
  });
  const item = (x: any) => ({ id: x.id, week: weeks[x.w].week, title: x.title, summary: x.summary, mode: x.mode, pillar: x.pillar, without_me: x.wm,
    labels_by: x.by, events: tally(x.ev.map((e: any) => e[0])), project: d.PROJECTS[x.s]?.name ?? x.s, goals: x.g.map((g: string) => goal[g] ?? g), links: x.links.map(([source, title, url]: string[]) => ({ source, title, url })) });
  const fb = d.FEEDBACK[0];
  const out: any = {
    period: d.PERIOD, time_zone: tz,
    rules: "Counts are code's. Kept threads are the ones you kept in review; labels_by says if you set a label or it is still Claude's. Slack, GitHub and calendar numbers count everything collected, kept or not. review_requests_* are PRs that named you (direct) or one of your teams (team) that week; null means not collected.",
    totals: { kept: d.ITEMS.length, mode: tally(d.ITEMS.map((x: any) => x.mode)), pillar: tally(d.ITEMS.map((x: any) => x.pillar)),
      without_me: tally(d.ITEMS.map((x: any) => x.wm)), goals: Object.fromEntries(d.GOALS.map((g: any) => [g.title, d.ITEMS.filter((x: any) => x.g.includes(g.id)).length])),
      no_goal: d.ITEMS.filter((x: any) => !x.g.length).length, project: tally(d.ITEMS.map((x: any) => d.PROJECTS[x.s]?.name ?? x.s)) },
    weeks,
    // Praise Claude found and code checked (the quote is in the message), and who asks you for things.
    recognition: d.REC.map((r: any) => ({ week: weeks[r.w]?.week, who: r.who, where: r.where, about: r.about ?? null, quote: r.q ?? r.t, url: r.url ?? null })),
    who_comes_to_you: (d.ASKS ?? []).map((a: any) => ({ who: a.who, asks: a.n, per_week: a.per, about: a.about })),
    wouldnt_happen_without_you: d.ITEMS.filter((x: any) => x.wm === "wouldnt").map(item),
    // Feedback has its own 8 weeks (it ends with the last closed week): per_week follows `weeks`.
    feedback: fb ? { week: fb.week, weeks: fb.weeks, patterns: fb.patterns.map((p: any) => ({ name: p.name, per_week: p.trend, your_verdict: fb.verdicts?.[`pattern:${p.name}`]?.v ?? null,
      examples: p.evidence.map((e: any) => ({ week: e.week, quote: e.quote, url: e.url })) })),
      strength: fb.strength ? { name: fb.strength.name, your_verdict: fb.verdicts?.strength?.v ?? null } : null } : null,
  };
  if (week) {
    const i = weeks.findIndex((w: any) => w.week === week);
    if (i < 0) throw new Error(`${week} is not in ${d.PERIOD}`);
    out.threads = d.ITEMS.filter((x: any) => x.w === i).map(item);
    out.praise = d.REC.filter((r: any) => r.w === i).map((r: any) => ({ who: r.who, where: r.where, when: r.when, text: r.t }));
  }
  return out;
}

if (import.meta.main) {
  const week = process.argv[2];
  if (week && !/^\d{4}-W\d{2}$/.test(week)) throw new Error("usage: bun ingest/facts.ts [2026-W42]");
  const r = await fetch("http://127.0.0.1:4317/api/facts").catch(() => null);
  if (!r?.ok) throw new Error(r ? await r.text() : "The app is not running: docker compose up -d");
  // Your time zone comes from this machine, like the browser does for North.
  console.log(JSON.stringify(facts(await r.json(), Intl.DateTimeFormat().resolvedOptions().timeZone, week), null, 1));
}
