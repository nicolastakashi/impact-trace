-- Phase 0 left a goals table and projects.goal_id that nothing ever wrote. SQLite cannot drop a
-- column in a foreign key, so the old table moves aside and goal_id stays unused.
ALTER TABLE goals RENAME TO goals_v0;

-- Goals you write yourself: a team or company goal, or a personal one. Key results are text;
-- nothing measures them yet.
CREATE TABLE goals (
  id      INTEGER PRIMARY KEY,
  title   TEXT NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN ('team', 'personal')),
  quarter TEXT,                          -- e.g. 2026-Q4, or NULL for no end
  krs     TEXT,
  at      TEXT NOT NULL
);
-- A project serves a goal: every thread in it does, every week.
CREATE TABLE goal_projects (
  goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id),
  PRIMARY KEY (goal_id, project_id)
);
-- One thread serves a goal, by its events: a thread's key can change, its events do not.
CREATE TABLE goal_events (
  goal_id  INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id),
  PRIMARY KEY (goal_id, event_id)
);
