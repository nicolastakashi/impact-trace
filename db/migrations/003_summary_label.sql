-- Add 'summary' to the allowed label fields. SQLite cannot alter a CHECK, so rebuild the table.
CREATE TABLE labels_new (
  thread_key     TEXT NOT NULL,
  week           TEXT NOT NULL,
  field          TEXT NOT NULL CHECK (field IN ('title', 'summary', 'mode', 'pillar', 'without_me', 'evidence')),
  value          TEXT NOT NULL,
  source         TEXT NOT NULL CHECK (source IN ('claude', 'human')),
  model          TEXT,
  prompt_version TEXT,
  events         TEXT NOT NULL,
  at             TEXT NOT NULL,
  PRIMARY KEY (thread_key, field, source)
);
INSERT INTO labels_new SELECT * FROM labels;
DROP TABLE labels;
ALTER TABLE labels_new RENAME TO labels;
