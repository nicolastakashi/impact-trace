-- Goals you can measure. Committed goals must reach 1.0; aspirational ones are on track at 0.7.
ALTER TABLE goals ADD COLUMN type TEXT NOT NULL DEFAULT 'aspirational' CHECK (type IN ('committed', 'aspirational'));

-- A key result: a number with a start and a target. metric names what the app measures for you
-- (see ingest/metrics.ts); NULL means you update current yourself.
CREATE TABLE key_results (
  id      INTEGER PRIMARY KEY,
  goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  pos     INTEGER NOT NULL,
  text    TEXT NOT NULL,
  metric  TEXT,
  start   REAL,
  target  REAL,
  current REAL,
  at      TEXT NOT NULL
);

-- How sure you are, once a week: 1 is "will not happen", 10 is "done".
CREATE TABLE goal_checkins (
  goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  week       TEXT NOT NULL,
  confidence INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 10),
  at         TEXT NOT NULL,
  PRIMARY KEY (goal_id, week)
);

-- Key results written as text, one per line, become key results with no numbers yet.
WITH RECURSIVE s(goal_id, rest, line, pos) AS (
  SELECT id, krs || char(10), '', 0 FROM goals WHERE trim(coalesce(krs, '')) <> ''
  UNION ALL
  SELECT goal_id, substr(rest, instr(rest, char(10)) + 1), trim(substr(rest, 1, instr(rest, char(10)) - 1)), pos + 1 FROM s WHERE rest <> ''
)
INSERT INTO key_results (goal_id, pos, text, at) SELECT goal_id, pos, line, datetime('now') FROM s WHERE line <> '';
