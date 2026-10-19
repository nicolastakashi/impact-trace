-- Judgments on which Linear project an event belongs to, for events Linear does not place:
-- PRs that cite no issue, issues with no project, mentions. A human row wins over Claude's;
-- a NULL project_id means "no project".
CREATE TABLE assignments (
  event_id       TEXT NOT NULL REFERENCES events(id),
  project_id     TEXT REFERENCES projects(id),
  source         TEXT NOT NULL CHECK (source IN ('claude', 'human')),
  model          TEXT,                   -- claude rows only
  prompt_version TEXT,                   -- claude rows only: hash of the skill file
  why            TEXT,                   -- claude rows only: the words that place it
  at             TEXT NOT NULL,
  PRIMARY KEY (event_id, source)
);
