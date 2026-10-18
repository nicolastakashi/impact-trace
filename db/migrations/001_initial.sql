-- Facts only. Raw collector output in data/raw/ is the immutable layer;
-- these tables hold the latest view of it and can be rebuilt from raw.

CREATE TABLE runs (
  id          TEXT PRIMARY KEY,          -- <week>:<source>:<session id>
  week        TEXT NOT NULL,             -- ISO week, e.g. 2026-W42
  source      TEXT NOT NULL,             -- linear | github
  cost_usd    REAL,
  num_turns   INTEGER,
  expected    INTEGER,                   -- count from a cheap independent check, NULL if none
  got         INTEGER,
  status      TEXT NOT NULL,             -- ok | count_mismatch | error
  ingested_at TEXT NOT NULL
);

CREATE TABLE events (
  id           TEXT PRIMARY KEY,         -- linear:ACME-41, github:acme/api#101, ...
  source       TEXT NOT NULL,
  kind         TEXT NOT NULL,            -- issue_completed | issue_open | pr_merged | pr_open | review_comment | reviews_given
  week         TEXT NOT NULL,
  occurred_at  TEXT,
  title        TEXT,
  url          TEXT,
  author       TEXT,
  project_id   TEXT REFERENCES projects(id),
  milestone_id TEXT REFERENCES milestones(id),
  payload      TEXT NOT NULL,            -- the collector's JSON for this row
  run_id       TEXT NOT NULL REFERENCES runs(id)
);
CREATE INDEX events_week ON events(week, kind);

CREATE TABLE links (
  from_id TEXT NOT NULL,
  to_ref  TEXT NOT NULL,                 -- another event id or a URL
  rel     TEXT NOT NULL,                 -- attachment | mentions
  PRIMARY KEY (from_id, to_ref, rel)
);

CREATE TABLE goals (
  id    TEXT PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE projects (
  id         TEXT PRIMARY KEY,           -- Linear identifier, e.g. P-ACME-1
  name       TEXT NOT NULL UNIQUE,
  url        TEXT,
  lead       TEXT,
  status     TEXT,
  goal_id    TEXT REFERENCES goals(id),  -- the one manual link: project -> goal
  updated_at TEXT NOT NULL
);

CREATE TABLE milestones (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  name        TEXT NOT NULL,
  progress    REAL,
  target_date TEXT,
  updated_at  TEXT NOT NULL
);
