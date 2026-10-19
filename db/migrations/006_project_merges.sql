-- Two projects that are one piece of work, e.g. a topic you made and the Linear project
-- that came later. Every event of from_id counts as into_id, including future weeks.
CREATE TABLE project_merges (
  from_id TEXT PRIMARY KEY REFERENCES projects(id),
  into_id TEXT NOT NULL REFERENCES projects(id),
  at      TEXT NOT NULL,
  CHECK (from_id <> into_id)
);
