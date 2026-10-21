// A fictional impact-trace database for QA, built through the real ingest code.
// Usage: bun qa/fixture.ts   →   qa/.data/fixture.db and fixture-config.json
// Weeks are the last 4 up to today, so "this week" and "this quarter" always exist.
// Claude's labels on every thread; you decided all weeks but this one, so Review has work and
// North and Trace show these threads, not the sample.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestWeek, isoWeek, open } from "../ingest/ingest";
import { saveDrafts } from "../ingest/drafts";
import { reviewThreads, saveSuggestions } from "../ingest/review";
import { saveMentions } from "../ingest/mentions";
import { verify } from "../ingest/feedback";

export const OUT = join(import.meta.dir, ".data");
export const ME = { name: "Riley Chen", github: "rchen", orgs: ["acme"], level: "Senior Engineer" };

const wrap = (o: object) => JSON.stringify({ is_error: false, session_id: "qa", total_cost_usd: 0, num_turns: 1, structured_output: o });
const DAY = 864e5;
const monday = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)));
const iso = (t: number) => new Date(t).toISOString();

export function build(now = new Date()) {
  rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
  const db = open(join(OUT, "fixture.db"));
  const m0 = monday(now).getTime();
  for (let k = 3; k >= 0; k--) {
    const mon = m0 - k * 7 * DAY, week = isoWeek(iso(mon)), dir = mkdtempSync(join(tmpdir(), "qa-"));
    const at = (d: number, h = 10) => iso(mon + d * DAY + h * 36e5);
    writeFileSync(join(dir, "linear.run.json"), wrap({ week, pages_read: 1,
      projects: [
        { id: "P-EXP", name: "Exports API", url: "https://linear.app/acme/project/exports", status: "Started", lead: null,
          milestones: [{ id: "ms-batch", name: "Batch exports", progress: 60, target_date: null }] },
        { id: "P-ALR", name: "Alert routing", url: "https://linear.app/acme/project/alerts", status: "Started", lead: null, milestones: [] }],
      issues: [{ id: `ACME-${100 + k}`, title: `Retry exports on timeout, part ${4 - k}`, url: `https://linear.app/acme/issue/ACME-${100 + k}`,
        status_type: "completed", completed_at: at(1), project_name: "Exports API", milestone_name: "Batch exports" }],
      attachments: [{ id: `ACME-${100 + k}`, urls: [0, 1].map((i) => `https://github.com/acme/api/pull/${200 + k * 10 + i}`) }] }));
    const prs = [0, 1].map((i) => ({ repo: "acme/api", number: 200 + k * 10 + i, title: `feat: export step ${k}.${i}`,
      url: `https://github.com/acme/api/pull/${200 + k * 10 + i}`, at: at(2 + i), opened: at(1 + i, 8), linear_refs: [`ACME-${100 + k}`] }));
    writeFileSync(join(dir, "github.run.json"), wrap({ week, reviews_given: 0, review_comments_received: [], prs_open: [],
      prs_merged: prs, prs_opened: prs.map((p) => ({ url: p.url })) }));
    writeFileSync(join(dir, "reviews.run.json"), wrap({ from: iso(mon).slice(0, 10), prs_read: 3,
      reviews: [1, 2, 3].map((i) => ({ repo: "acme/web", number: 300 + k * 10 + i, author: "blair", state: "APPROVED", submitted_at: at(i) })) }));
    // Your Slack messages (Feedback reads them) and two mentions of you: praise and an ask.
    const ts = (d: number, h: number) => ((mon + d * DAY + h * 36e5) / 1000).toFixed(6);
    const msg = (pass: string, d: number, h: number, author: string, text: string) => ({ pass, channel_id: "C1", channel_name: "acme-eng", ts: ts(d, h),
      permalink: `https://acme.slack.com/archives/C1/p${ts(d, h).replace(".", "")}`, author_id: author === ME.name ? "U1" : "U2", author_name: author, text });
    writeFileSync(join(dir, "slack_own_2.run.json"), wrap({ week, self_user_id: "U1", pages_read: 1, exhausted: true, messages: [
      msg("own", 1, 11, ME.name, `Is it ok if I merge the export retry today? PR ${prs[0]!.url}`),
      msg("own", 1, 15, ME.name, "Is it ok if I change the timeout default to 30s for exports?"),
      msg("own", 1, 16, ME.name, "Decision: batch exports ship behind a flag, written in the doc.")] }));
    writeFileSync(join(dir, "slack_mention_3.run.json"), wrap({ week, self_user_id: "U1", pages_read: 1, exhausted: true, messages: [
      msg("mention", 2, 10, "Blair Ito", `Thanks @Riley Chen, the review on exports step ${k} taught me a lot`),
      msg("mention", 2, 14, "Sam Rivera", "@Riley Chen can you look at the alert routing proposal?")] }));
    ingestWeek(db, dir, week, ME);
    rmSync(dir, { recursive: true });
    const threads = reviewThreads(db, week), modes = ["build", "elevate", "solve", "clarify"];
    saveSuggestions(db, week, { is_error: false, structured_output: { week, labels: threads.map((t, i) => ({ key: t.key, title: t.events[0]!.title ?? `Thread ${i}`,
      summary: `What happened in ${t.events[0]!.title ?? "this thread"}.`, mode: modes[i % modes.length], pillar: i % 2 ? "level" : "exec", routine: false, evidence: [] })) } }, "qa");
    const mention = db.query("SELECT id, author FROM events WHERE kind = 'slack_mention' AND week = ?").all(week) as any[];
    saveMentions(db, week, { is_error: false, structured_output: { week, mentions: mention.map((m) => m.author === "Blair Ito"
      ? { id: m.id, kind: "praise", about: "a review", quote: "the review on exports" } : { id: m.id, kind: "ask", about: "alert routing", quote: null }) } }, "qa");
    // You kept every thread of the closed weeks. This week waits for you in Review.
    if (k > 0) for (const [i, t] of threads.entries()) for (const [f, v] of [["discard", "no"], ["without_me", i % 2 ? "slower" : "wouldnt"]])
      db.query("INSERT INTO labels (thread_key, week, field, value, source, events, at) VALUES (?, ?, ?, ?, 'human', ?, ?)").run(t.key, week, f, v, JSON.stringify(t.events.map((e) => e.id)), iso(mon));
    // Feedback on the last closed week, with quotes code checks against your messages.
    if (k === 1) db.query("INSERT INTO feedback VALUES (?, ?, 'qa', 'qa', 0, ?)").run(week, JSON.stringify(verify(db, week, {
      patterns: [{ category: "permission", markers: ["is it ok if i"], summary: "You ask before acting on what you own.",
        evidence: [{ quote: "Is it ok if I merge the export retry today?" }, { quote: "Is it ok if I change the timeout default to 30s for exports?" }] }],
      strength: { category: "closing", summary: "You close with a written decision.", evidence: [{ quote: "Decision: batch exports ship behind a flag, written in the doc." }] },
      experiment: { pattern: "permission", try: "Say what you will do and when, then do it." }, last_experiment: null })), iso(mon));
  }
  // Two drafts, as Claude would leave them: one on a milestone, one measured.
  const input = { facts: { projects: ["Exports API", "Alert routing"], threads: [{ title: "Retry exports on timeout, part 4" }] } };
  saveDrafts(db, { is_error: false, structured_output: { objectives: [
    { title: "Exports reach general availability", kind: "team", type: "committed", why: "Batch exports is open and most of your work sits in Exports API.",
      based_on: ["Exports API"], key_results: [{ text: "Batch exports milestone done", metric: "milestone:ms-batch", start: null, target: 100 },
        { text: "PRs you review each week", metric: "reviews_given", start: null, target: 5 }] },
    { title: "Alerts reach the right team", kind: "team", type: "aspirational", why: "Alert routing has no milestone yet.",
      based_on: ["Alert routing"], key_results: [{ text: "Teams on the new routing", metric: null, start: null, target: 4 }] },
  ] } }, input, "qa", now);
  db.close();
  writeFileSync(join(OUT, "fixture-config.json"), JSON.stringify(ME, null, 2) + "\n");
}

if (import.meta.main) { build(); console.log(`fixture in ${OUT}`); }
