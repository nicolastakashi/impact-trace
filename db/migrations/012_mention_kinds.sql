-- What a Slack mention of you is, by Claude: praise, a request, information, or a bot.
-- Code keeps praise only when its quote is in the message.
CREATE TABLE mention_kinds (
  event_id       TEXT PRIMARY KEY REFERENCES events(id),
  kind           TEXT NOT NULL CHECK (kind IN ('praise', 'ask', 'info', 'automated')),
  about          TEXT,
  quote          TEXT,
  model          TEXT,
  prompt_version TEXT,
  at             TEXT NOT NULL
);
