// The database and what every API area reads from it: weeks, one thread, goal links, projects.
import { open } from "../core/db";
import { LIVE, reviewThreads } from "../core/threads";
import { links } from "../core/goals";

// Collection writes from the host. Over Docker's file share an open connection can keep reading
// old pages, so the server reopens it on each request. A live binding: importers see the new one.
export let db = open();
export const reopen = () => {
  db.close();
  db = open();
};

// Every handler answers a bad request the same way: 400 with a message a person can act on.
export const badRequest = (message: string) => new Response(message, { status: 400 });

export const WEEK = /^\d{4}-W\d{2}$/;
// Weeks with labels, oldest first.
export const labeled = () =>
  (db.query("SELECT DISTINCT week FROM labels ORDER BY 1").all() as any[]).map(
    (row) => row.week as string,
  );
// The thread a request names by week and key, or false.
export const threadOf = (body: any) =>
  WEEK.test(body?.week) && reviewThreads(db, body.week).find((t) => t.key === body.key);
export const goalLinks = () => links(db);

// Projects you can still pick, by name.
export const liveProjects = () =>
  db.query(`SELECT id, name, kind FROM projects WHERE ${LIVE} ORDER BY name`).all() as any[];
export const isLiveProject = (id: string) =>
  !!db.query(`SELECT 1 FROM projects WHERE id = ? AND ${LIVE}`).get(id);
