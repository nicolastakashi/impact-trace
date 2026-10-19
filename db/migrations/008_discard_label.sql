-- Discard is its own field: "not your impact" is a different question from "without you?".
-- discard = yes skips the thread downstream; no means you kept it. SQLite cannot alter a CHECK, so rebuild.
CREATE TABLE labels_new (
  thread_key     TEXT NOT NULL,
  week           TEXT NOT NULL,
  field          TEXT NOT NULL CHECK (field IN ('title', 'summary', 'mode', 'pillar', 'without_me', 'discard', 'evidence')),
  value          TEXT NOT NULL,
  source         TEXT NOT NULL CHECK (source IN ('claude', 'human')),
  model          TEXT,
  prompt_version TEXT,
  events         TEXT NOT NULL,
  at             TEXT NOT NULL,
  PRIMARY KEY (thread_key, field, source),
  CHECK (field <> 'without_me' OR value <> 'discard')
);
INSERT INTO labels_new SELECT thread_key, week, CASE WHEN field = 'without_me' AND value = 'discard' THEN 'discard' ELSE field END,
  CASE WHEN field = 'without_me' AND value = 'discard' THEN 'yes' ELSE value END, source, model, prompt_version, events, at FROM labels;
-- You kept these: say so, so the field reads the same on every thread you decided.
INSERT INTO labels_new SELECT thread_key, week, 'discard', 'no', 'human', NULL, NULL, events, at FROM labels
  WHERE field = 'without_me' AND source = 'human' AND value <> 'discard';
DROP TABLE labels;
ALTER TABLE labels_new RENAME TO labels;
