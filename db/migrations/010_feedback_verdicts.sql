-- Your verdict on each piece of feedback. item is "experiment", "strength" or "pattern:<name>".
-- Next week's run reads these, so Claude does not repeat what you rejected.
CREATE TABLE feedback_verdicts (
  week    TEXT NOT NULL,
  item    TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('accept', 'reject')),
  why     TEXT,
  at      TEXT NOT NULL,
  PRIMARY KEY (week, item)
);
