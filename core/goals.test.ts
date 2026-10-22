import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { migrate } from "./db";
import { goalsOf, links } from "./goals";

test("a thread serves a goal through its project, a merged project, or a direct link", () => {
  const db = new Database(":memory:", { strict: true });
  migrate(db);
  for (const id of ["p1", "p2", "p3"])
    db.query("INSERT INTO projects (id, name, kind, updated_at) VALUES (?, ?, 'topic', 'now')").run(
      id,
      id,
    );
  db.query(
    "INSERT INTO goals (id, title, kind, at) VALUES (1, 'GA', 'team', 'now'), (2, 'Mentor', 'personal', 'now')",
  ).run();
  db.query("INSERT INTO goal_projects VALUES (1, 'p1')").run();
  db.query("INSERT INTO goal_events VALUES (2, 'e1')").run();
  // You merged p1 into p2 after linking p1: p2's threads serve goal 1 now.
  db.query("INSERT INTO project_merges VALUES ('p1', 'p2', 'now')").run();
  const L = links(db);
  expect(
    goalsOf(L, { projects: [{ id: "p2" }], events: [{ id: "e1" }, { id: "e2" }] }).sort(),
  ).toEqual([1, 2]);
  expect(goalsOf(L, { projects: [], events: [{ id: "e1" }] })).toEqual([2]);
  expect(goalsOf(L, { projects: [{ id: "p3" }], events: [{ id: "e9" }] })).toEqual([]);
  // Deleting a goal removes its links, not the project.
  db.exec("PRAGMA foreign_keys = ON");
  db.query("DELETE FROM goals WHERE id = 1").run();
  expect(db.query("SELECT count(*) n FROM goal_projects").get()).toEqual({ n: 0 });
  expect(db.query("SELECT count(*) n FROM projects").get()).toEqual({ n: 3 });
});
