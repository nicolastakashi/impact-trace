-- Weekly feedback on how you show up, from your own messages. One row per week; a re-run replaces it.
-- output holds only what the code verified: quotes found in your messages, counts made by code.
CREATE TABLE feedback (
  week           TEXT PRIMARY KEY,
  output         TEXT NOT NULL,
  model          TEXT,
  prompt_version TEXT,
  cost_usd       REAL,
  at             TEXT NOT NULL
);
