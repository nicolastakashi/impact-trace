// Serve the app and its data. Usage: bun app/server.ts  →  http://localhost:4317
// The routes only: each API area is its own file in app/.
import { CATEGORIES } from "../jobs/feedback";
import { correct } from "../jobs/mentions";
import { badRequest, db, reopen, WEEK } from "./data";
import { decide, pending, review, unassign } from "./review";
import {
  assignThread,
  deleteProject,
  merge,
  project,
  projects,
  projectThreads,
  restore,
  unmerge,
} from "./projects";
import { checkin, dismissDraft, goalList, linkGoal, saveGoal } from "./goals";
import { north, verdict } from "./north";
import { saveSetup, setup } from "./setup";
// The app (web/). Bun bundles it from the HTML.
import page from "../web/index.html";
// Fictional example data for North, Trace and Feedback, before you keep a thread.
import SAMPLE_DATA from "./sample.json";

// You correct the kind Claude gave a mention.
const mention = (body: any) =>
  typeof body?.id === "string" && correct(db, body.id, body.kind ?? null)
    ? Response.json({ ok: true })
    : badRequest("Unknown mention or kind");
// Writes take a JSON body. Each handler checks its own fields.
const POST: Record<string, (body: any) => Response> = {
  "/api/setup": saveSetup,
  "/api/mention": mention,
  "/api/labels": decide,
  "/api/unassign": unassign,
  "/api/group": assignThread,
  "/api/merge": merge,
  "/api/delete": deleteProject,
  "/api/restore": restore,
  "/api/unmerge": unmerge,
  "/api/feedback": verdict,
  "/api/goal": saveGoal,
  "/api/draft-dismiss": dismissDraft,
  "/api/checkin": checkin,
  "/api/goal-link": linkGoal,
};
const GET: Record<string, (params: URLSearchParams) => Response> = {
  "/api/setup": (params) => setup(params.has("guess")),
  "/api/groups": () => Response.json(projectThreads()),
  "/api/pending": () => Response.json(pending()),
  "/api/project": (params) => project(params.get("id") ?? ""),
  "/api/review": (params) => {
    // No week asked: the latest with undecided threads, else the latest labeled.
    const undecided = Object.entries(pending()).find(([, count]) => count > 0);
    const week =
      params.get("week") ??
      undecided?.[0] ??
      (db.query("SELECT max(week) latest FROM labels").get() as any).latest;
    return WEEK.test(week ?? "")
      ? Response.json(review(week))
      : Response.json({ week: null, weeks: [], threads: [] });
  },
  // Same data as North, as JSON, for jobs/facts.ts. No sample: facts are only ever yours.
  "/api/facts": () => {
    const data = north();
    return data
      ? Response.json({ ...data, goalDetails: goalList().goals })
      : new Response("No kept threads yet", { status: 404 });
  },
  // North, Trace, Feedback and Search: your kept threads, or the sample with sample: true.
  // The feedback categories and their sources come with the data, the example too.
  "/api/north": () =>
    Response.json({ feedbackCategories: CATEGORIES, ...(north() ?? SAMPLE_DATA) }),
  "/api/goals": () => Response.json(goalList()),
  "/api/projects": (params) =>
    Response.json(
      projects((params.get("weeks") ?? "").split(",").filter((week) => WEEK.test(week))),
    ),
};

const server = Bun.serve({
  // PORT lets a second copy, with its own data/, run next to yours.
  port: Number(process.env.PORT ?? 4317),
  // Your work data and a write endpoint: never reachable from the network. In the container
  // HOST is 0.0.0.0 and compose publishes the port on 127.0.0.1 only.
  hostname: process.env.HOST ?? "127.0.0.1",
  // Bundled once, without the dev reloader: the app runs the same in Docker and in QA.
  development: false,
  // /next/ was the app while it moved to React: old links land on the app.
  routes: { "/": page, "/next/": Response.redirect("/", 301) },
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    reopen();
    // Old addresses: review and groups now live inside the one page.
    if (path === "/review" || path === "/groups")
      return new Response(null, {
        status: 302,
        headers: { location: `/#${path === "/groups" ? "/projects" : path}${url.search}` },
      });
    if (request.method === "GET" && GET[path]) return GET[path](url.searchParams);
    // A JSON content type forces a CORS preflight, so other sites cannot post here.
    if (
      request.method === "POST" &&
      request.headers.get("content-type") === "application/json" &&
      POST[path]
    )
      return POST[path](await request.json().catch(() => null));
    return new Response("Not found", { status: 404 });
  },
});
console.log(`impact-trace on ${server.url}`);
