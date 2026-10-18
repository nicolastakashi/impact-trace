-- Judgments, kept apart from facts. Claude suggests, you decide; your rows are the gold set.
CREATE TABLE labels (
  thread_key     TEXT NOT NULL,          -- <week>:<smallest event id in the thread>
  week           TEXT NOT NULL,
  field          TEXT NOT NULL CHECK (field IN ('title', 'mode', 'pillar', 'without_me', 'evidence')),
  value          TEXT NOT NULL,          -- evidence: JSON event ids
  source         TEXT NOT NULL CHECK (source IN ('claude', 'human')),
  model          TEXT,                   -- claude rows only
  prompt_version TEXT,                   -- claude rows only: hash of the skill file
  events         TEXT NOT NULL,          -- JSON event ids the label was made on; threads grow
  at             TEXT NOT NULL,
  PRIMARY KEY (thread_key, field, source)
);
