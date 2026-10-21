-- Your correction of Claude's kind ("this is not recognition"). Claude's runs never touch it.
ALTER TABLE mention_kinds ADD COLUMN human_kind TEXT CHECK (human_kind IN ('praise', 'ask', 'info', 'automated'));
