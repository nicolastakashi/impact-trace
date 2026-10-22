import { expect, test } from "bun:test";
import { facts } from "./facts";

const APP_FACTS = {
  PERIOD: "2026-W41 – 2026-W42",
  WEEKS: ["W41", "W42"],
  REVIEWS: [4, 1],
  GOALS: [{ id: "g1", title: "Exports GA" }],
  PROJECTS: { none: { name: "No project" }, p1: { name: "Exports" } },
  NUMS: {
    opened: [2, 0],
    asked_direct: [3, null],
    asked_team: [5, null],
    merged: [2, 3],
    lead: [5, 7],
    slack: [2, 1],
    channels: [1, 1],
    meetings: [1, 2],
    reach: [3, 4],
    // Monday 10:00 and 21:00 Lisbon; Saturday noon.
    slackAt: [["2026-10-05T09:00:00Z", "2026-10-05T20:00:00Z"], ["2026-10-17T11:00:00Z"]],
  },
  ITEMS: [
    {
      id: "a",
      w: 0,
      s: "p1",
      title: "A",
      mode: "build",
      pillar: "exec",
      wm: "wouldnt",
      g: ["g1"],
      by: { mode: "you" },
      links: [["GitHub", "PR", "https://x/1"]],
      ev: [["pr_merged"], ["pr_merged"], ["slack_mention"]],
    },
    {
      id: "b",
      w: 1,
      s: "none",
      title: "B",
      mode: "elevate",
      pillar: "level",
      wm: "slower",
      g: [],
      by: { mode: "claude" },
      links: [],
      ev: [],
    },
  ],
  OBJECTIVES: [
    {
      title: "Exports GA",
      kind: "team",
      type: "committed",
      quarter: "2026-Q4",
      checkins: [{ week: "2026-W42", confidence: 6 }],
      krs: [
        {
          text: "Lead time under a day",
          metric: "lead_time_h",
          start: 30,
          target: 20,
          value: 25,
          progress: 0.5,
        },
        { text: "Two customers", metric: null, start: 0, target: 2, value: 1, progress: 0.5 },
      ],
    },
  ],
  REC: [{ w: 1, who: "Ana", where: "#eng", when: "2026-10-14", t: "thanks" }],
  FEEDBACK: [
    {
      week: "2026-W42",
      weeks: ["2026-W35"],
      patterns: [{ name: "Leaving a decision open", trend: [1], evidence: [] }],
      verdicts: { "pattern:Leaving a decision open": { v: "accept" } },
    },
  ],
};

test("facts count what North shows, in your time zone", () => {
  const result = facts(APP_FACTS, "Europe/Lisbon");
  expect(result.totals).toMatchObject({
    kept: 2,
    no_goal: 1,
    goals: { "Exports GA": 1 },
    mode: { build: 1, elevate: 1 },
  });
  expect(
    result.weeks.map((week: any) => [
      week.week,
      week.give_vs_take,
      week.outside_hours_pct,
      week.praise,
    ]),
  ).toEqual([
    ["2026-W41", 2, 50, 0],
    ["2026-W42", null, 100, 1],
  ]);
  expect(
    result.wouldnt_happen_without_you.map((thread: any) => [
      thread.title,
      thread.project,
      thread.goals,
      thread.events,
    ]),
  ).toEqual([["A", "Exports", ["Exports GA"], { pr_merged: 2, slack_mention: 1 }]]);
  expect(result.feedback.patterns[0].your_verdict).toBe("accept");
  expect(
    result.weeks.map((week: any) => [week.review_requests_direct, week.review_requests_team]),
  ).toEqual([
    [3, 5],
    [null, null],
  ]);
  expect(result.recognition).toEqual([
    { week: "2026-W42", who: "Ana", where: "#eng", about: null, quote: "thanks", url: null },
  ]);
  expect(
    result.objectives[0].key_results.map((keyResult: any) => [
      keyResult.measured_by,
      keyResult.now,
      keyResult.progress,
    ]),
  ).toEqual([
    ["lead_time_h", 25, 0.5],
    ["you", 1, 0.5],
  ]);
  expect(result.objectives[0].confidence).toEqual([{ week: "2026-W42", value: 6 }]);
  expect(result.threads).toBeUndefined();
});

test("one week adds its threads, with who set each label", () => {
  const result = facts(APP_FACTS, "Europe/Lisbon", "2026-W42");
  expect(result.threads.map((thread: any) => [thread.title, thread.labels_by.mode])).toEqual([
    ["B", "claude"],
  ]);
  expect(result.praise).toEqual([
    { who: "Ana", where: "#eng", when: "2026-10-14", text: "thanks" },
  ]);
  expect(() => facts(APP_FACTS, "Europe/Lisbon", "2026-W30")).toThrow("not in");
});
