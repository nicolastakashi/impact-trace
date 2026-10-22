import { expect, test } from "bun:test";
import { facts } from "./facts";

const APP_FACTS = {
  period: "2026-W41 – 2026-W42",
  weeks: ["W41", "W42"],
  reviewsGiven: [4, 1],
  goals: [{ id: "g1", title: "Exports GA" }],
  projects: { none: { name: "No project" }, p1: { name: "Exports" } },
  numbers: {
    opened: [2, 0],
    reviewRequestsDirect: [3, null],
    reviewRequestsTeam: [5, null],
    merged: [2, 3],
    leadTimeHours: [5, 7],
    slackMessages: [2, 1],
    slackChannels: [1, 1],
    meetingHours: [1, 2],
    reach: [3, 4],
    // Monday 10:00 and 21:00 Lisbon; Saturday noon.
    slackAt: [["2026-10-05T09:00:00Z", "2026-10-05T20:00:00Z"], ["2026-10-17T11:00:00Z"]],
  },
  threads: [
    {
      id: "a",
      weekIndex: 0,
      projectId: "p1",
      title: "A",
      mode: "build",
      pillar: "exec",
      withoutMe: "wouldnt",
      goalIds: ["g1"],
      labelsBy: { mode: "you" },
      links: [["GitHub", "PR", "https://x/1"]],
      events: [["pr_merged"], ["pr_merged"], ["slack_mention"]],
    },
    {
      id: "b",
      weekIndex: 1,
      projectId: "none",
      title: "B",
      mode: "elevate",
      pillar: "level",
      withoutMe: "slower",
      goalIds: [],
      labelsBy: { mode: "claude" },
      links: [],
      events: [],
    },
  ],
  goalDetails: [
    {
      title: "Exports GA",
      kind: "team",
      type: "committed",
      quarter: "2026-Q4",
      checkins: [{ week: "2026-W42", confidence: 6 }],
      keyResults: [
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
  praise: [{ weekIndex: 1, who: "Ana", where: "#eng", when: "2026-10-14", text: "thanks" }],
  feedback: [
    {
      week: "2026-W42",
      weeks: ["2026-W35"],
      patterns: [{ name: "Leaving a decision open", trend: [1], evidence: [] }],
      verdicts: { "pattern:Leaving a decision open": { verdict: "accept" } },
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
