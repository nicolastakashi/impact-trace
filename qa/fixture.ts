// A fictional owntrace database for QA, built through the real ingest code.
// Usage: bun qa/fixture.ts   →   qa/.data/fixture.db and fixture-config.json
// Weeks are the last 4 up to today, so "this week" and "this quarter" always exist.
// Claude's labels on every thread; you decided all weeks but this one, so Review has work and
// North and Trace show these threads, not the sample.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestWeek } from "../jobs/ingest";
import { isoWeek, open } from "../core/db";
import { saveDrafts } from "../jobs/drafts";
import { reviewThreads } from "../core/threads";
import { saveSuggestions } from "../jobs/review";
import { saveMentions } from "../jobs/mentions";
import { verify } from "../jobs/feedback";

export const OUT = join(import.meta.dir, ".data");
export const ME = { name: "Riley Chen", github: "rchen", orgs: ["acme"], level: "Senior Engineer" };

const wrap = (output: object) =>
  JSON.stringify({
    is_error: false,
    session_id: "qa",
    total_cost_usd: 0,
    num_turns: 1,
    structured_output: output,
  });
const DAY = 864e5;
const monday = (date: Date) =>
  new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - ((date.getUTCDay() + 6) % 7),
    ),
  );
const iso = (time: number) => new Date(time).toISOString();

export function build(now = new Date()) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const db = open(join(OUT, "fixture.db"));
  const thisMonday = monday(now).getTime();
  for (let weeksAgo = 3; weeksAgo >= 0; weeksAgo--) {
    const weekStart = thisMonday - weeksAgo * 7 * DAY,
      week = isoWeek(iso(weekStart)),
      directory = mkdtempSync(join(tmpdir(), "qa-"));
    const at = (day: number, hour = 10) => iso(weekStart + day * DAY + hour * 36e5);
    writeFileSync(
      join(directory, "linear.run.json"),
      wrap({
        week,
        pages_read: 1,
        projects: [
          {
            id: "P-EXP",
            name: "Exports API",
            url: "https://linear.app/acme/project/exports",
            status: "Started",
            lead: null,
            milestones: [
              { id: "ms-batch", name: "Batch exports", progress: 60, target_date: null },
            ],
          },
          {
            id: "P-ALR",
            name: "Alert routing",
            url: "https://linear.app/acme/project/alerts",
            status: "Started",
            lead: null,
            milestones: [],
          },
        ],
        issues: [
          {
            id: `ACME-${100 + weeksAgo}`,
            title: `Retry exports on timeout, part ${4 - weeksAgo}`,
            url: `https://linear.app/acme/issue/ACME-${100 + weeksAgo}`,
            status_type: "completed",
            completed_at: at(1),
            project_name: "Exports API",
            milestone_name: "Batch exports",
          },
        ],
        attachments: [
          {
            id: `ACME-${100 + weeksAgo}`,
            urls: [0, 1].map(
              (index) => `https://github.com/acme/api/pull/${200 + weeksAgo * 10 + index}`,
            ),
          },
        ],
      }),
    );
    const prs = [0, 1].map((index) => ({
      repo: "acme/api",
      number: 200 + weeksAgo * 10 + index,
      title: `feat: export step ${weeksAgo}.${index}`,
      url: `https://github.com/acme/api/pull/${200 + weeksAgo * 10 + index}`,
      at: at(2 + index),
      opened: at(1 + index, 8),
      linear_refs: [`ACME-${100 + weeksAgo}`],
    }));
    writeFileSync(
      join(directory, "github.run.json"),
      wrap({
        week,
        reviews_given: 0,
        review_comments_received: [],
        prs_open: [],
        prs_merged: prs,
        prs_opened: prs.map((pr) => ({ url: pr.url })),
      }),
    );
    writeFileSync(
      join(directory, "reviews.run.json"),
      wrap({
        from: iso(weekStart).slice(0, 10),
        prs_read: 3,
        reviews: [1, 2, 3].map((day) => ({
          repo: "acme/web",
          number: 300 + weeksAgo * 10 + day,
          author: "blair",
          state: "APPROVED",
          submitted_at: at(day),
        })),
      }),
    );
    // Your Slack messages (Feedback reads them) and two mentions of you: praise and an ask.
    const slackTimestamp = (day: number, hour: number) =>
      ((weekStart + day * DAY + hour * 36e5) / 1000).toFixed(6);
    const slackMessage = (
      pass: string,
      day: number,
      hour: number,
      author: string,
      text: string,
    ) => ({
      pass,
      channel_id: "C1",
      channel_name: "acme-eng",
      ts: slackTimestamp(day, hour),
      permalink: `https://acme.slack.com/archives/C1/p${slackTimestamp(day, hour).replace(".", "")}`,
      author_id: author === ME.name ? "U1" : "U2",
      author_name: author,
      text,
    });
    writeFileSync(
      join(directory, "slack_own_2.run.json"),
      wrap({
        week,
        self_user_id: "U1",
        pages_read: 1,
        exhausted: true,
        messages: [
          slackMessage(
            "own",
            1,
            11,
            ME.name,
            `Is it ok if I merge the export retry today? PR ${prs[0]!.url}`,
          ),
          slackMessage(
            "own",
            1,
            15,
            ME.name,
            "Is it ok if I change the timeout default to 30s for exports?",
          ),
          slackMessage(
            "own",
            1,
            16,
            ME.name,
            "Decision: batch exports ship behind a flag, written in the doc.",
          ),
        ],
      }),
    );
    writeFileSync(
      join(directory, "slack_mention_3.run.json"),
      wrap({
        week,
        self_user_id: "U1",
        pages_read: 1,
        exhausted: true,
        messages: [
          slackMessage(
            "mention",
            2,
            10,
            "Blair Ito",
            `Thanks @Riley Chen, the review on exports step ${weeksAgo} taught me a lot`,
          ),
          slackMessage(
            "mention",
            2,
            14,
            "Sam Rivera",
            "@Riley Chen can you look at the alert routing proposal?",
          ),
        ],
      }),
    );
    ingestWeek(db, directory, week, ME);
    rmSync(directory, { recursive: true });
    const threads = reviewThreads(db, week),
      modes = ["build", "elevate", "solve", "clarify"];
    saveSuggestions(
      db,
      week,
      {
        is_error: false,
        structured_output: {
          week,
          labels: threads.map((thread, index) => ({
            key: thread.key,
            title: thread.events[0]!.title ?? `Thread ${index}`,
            summary: `What happened in ${thread.events[0]!.title ?? "this thread"}.`,
            mode: modes[index % modes.length],
            pillar: index % 2 ? "level" : "exec",
            routine: false,
            evidence: [],
          })),
        },
      },
      "qa",
    );
    const mentionRows = db
      .query("SELECT id, author FROM events WHERE kind = 'slack_mention' AND week = ?")
      .all(week) as any[];
    saveMentions(
      db,
      week,
      {
        is_error: false,
        structured_output: {
          week,
          mentions: mentionRows.map((mention) =>
            mention.author === "Blair Ito"
              ? {
                  id: mention.id,
                  kind: "praise",
                  about: "a review",
                  quote: "the review on exports",
                }
              : { id: mention.id, kind: "ask", about: "alert routing", quote: null },
          ),
        },
      },
      "qa",
    );
    // You kept every thread of the closed weeks. This week waits for you in Review.
    if (weeksAgo > 0)
      for (const [index, thread] of threads.entries())
        for (const [field, value] of [
          ["discard", "no"],
          ["without_me", index % 2 ? "slower" : "wouldnt"],
        ])
          db.query(
            "INSERT INTO labels (thread_key, week, field, value, source, events, at) VALUES (?, ?, ?, ?, 'human', ?, ?)",
          ).run(
            thread.key,
            week,
            field,
            value,
            JSON.stringify(thread.events.map((event) => event.id)),
            iso(weekStart),
          );

    // Feedback on the last closed week, shaped like schemas/feedback.json, with quotes code checks against your messages.
    if (weeksAgo === 1)
      db.query("INSERT INTO feedback VALUES (?, ?, 'qa', 'qa', 0, ?)").run(
        week,
        JSON.stringify(
          verify(db, week, {
            patterns: [
              {
                category: "permission",
                markers: ["is it ok if i"],
                why: "You ask before acting on what you own.",
                evidence: [
                  {
                    quote: "Is it ok if I merge the export retry today?",
                    instead: "I merge the export retry today.",
                  },
                  {
                    quote: "Is it ok if I change the timeout default to 30s for exports?",
                    instead: "I change the exports timeout default to 30s.",
                  },
                ],
              },
            ],
            strength: {
              category: "closing",
              why: "You close with a written decision.",
              evidence: [
                { quote: "Decision: batch exports ship behind a flag, written in the doc." },
              ],
            },
            experiment: { pattern: "permission", do: "Say what you will do and when, then do it." },
            last_experiment: null,
          }),
        ),
        iso(weekStart),
      );
  }
  // Two drafts, as Claude would leave them: one on a milestone, one measured.
  const input = {
    facts: {
      projects: ["Exports API", "Alert routing"],
      threads: [{ title: "Retry exports on timeout, part 4" }],
    },
  };
  saveDrafts(
    db,
    {
      is_error: false,
      structured_output: {
        objectives: [
          {
            title: "Exports reach general availability",
            kind: "team",
            type: "committed",
            why: "Batch exports is open and most of your work sits in Exports API.",
            based_on: ["Exports API"],
            key_results: [
              {
                text: "Batch exports milestone done",
                metric: "milestone:ms-batch",
                start: null,
                target: 100,
              },
              { text: "PRs you review each week", metric: "reviews_given", start: null, target: 5 },
            ],
          },
          {
            title: "Alerts reach the right team",
            kind: "team",
            type: "aspirational",
            why: "Alert routing has no milestone yet.",
            based_on: ["Alert routing"],
            key_results: [
              { text: "Teams on the new routing", metric: null, start: null, target: 4 },
            ],
          },
        ],
      },
    },
    input,
    "qa",
    now,
  );
  db.close();
  writeFileSync(join(OUT, "fixture-config.json"), JSON.stringify(ME, null, 2) + "\n");
}

if (import.meta.main) {
  build();
  console.log(`fixture in ${OUT}`);
}
