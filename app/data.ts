// The database and what every API area reads from it: weeks, one thread, its labels, goal links.
import { open } from "../ingest/ingest";
import { labelsOf, reviewThreads } from "../ingest/review";
import { links } from "../ingest/goals";

// Collection writes from the host. Over Docker's file share an open connection can keep reading
// old pages, so the server reopens it on each request. A live binding: importers see the new one.
export let db = open();
export const reopen = () => { db.close(); db = open(); };

export const WEEK = /^\d{4}-W\d{2}$/;
// Weeks with labels, oldest first.
export const labeled = () => (db.query("SELECT DISTINCT week FROM labels ORDER BY 1").all() as any[]).map((r) => r.week as string);
// The thread a request names by week and key, or false.
export const thread = (b: any) => WEEK.test(b?.week) && reviewThreads(db, b.week).find((x) => x.key === b.key);
// A label's value: yours, else Claude's.
export const pick = (l: ReturnType<typeof labelsOf>) => (f: string) => (l.find((r) => r.field === f && r.source === "human") ?? l.find((r) => r.field === f && r.source === "claude"))?.value;
// Your keep (no) or discard (yes); undefined while you have not decided.
export const discard = (l: ReturnType<typeof labelsOf>) => l.find((r) => r.field === "discard" && r.source === "human")?.value;
export const goalLinks = () => links(db);
