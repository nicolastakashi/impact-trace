-- Objectives Claude drafts from your data. Nothing here is a goal until you use one; a new
-- draft run replaces the drafts you have not used.
CREATE TABLE goal_drafts (
  id             INTEGER PRIMARY KEY,
  title          TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('team', 'personal')),
  type           TEXT NOT NULL CHECK (type IN ('committed', 'aspirational')),
  quarter        TEXT,
  why            TEXT NOT NULL,
  based_on       TEXT NOT NULL,   -- JSON: exact strings from the input, checked by code
  krs            TEXT NOT NULL,   -- JSON: [{text, metric, start, target}]
  model          TEXT,
  prompt_version TEXT,
  at             TEXT NOT NULL
);
