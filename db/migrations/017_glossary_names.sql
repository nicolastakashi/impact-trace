-- Names in glossary words (docs/glossary.md). Only names change; every row stays.
ALTER TABLE key_results RENAME COLUMN pos TO position;
ALTER TABLE goal_drafts RENAME COLUMN krs TO key_results;
ALTER TABLE feedback_verdicts RENAME COLUMN item TO piece;
ALTER TABLE links RENAME COLUMN rel TO relation;
-- 014 moved goals.krs into key_results; since then the app only cleared it.
ALTER TABLE goals DROP COLUMN krs;
UPDATE key_results SET metric = 'praise' WHERE metric = 'recognition';
UPDATE key_results SET metric = 'lead_time_hours' WHERE metric = 'lead_time_h';
-- Drafts keep their key results as JSON.stringify output, so the text match is exact.
UPDATE goal_drafts SET key_results = replace(replace(key_results,
  '"metric":"recognition"', '"metric":"praise"'), '"metric":"lead_time_h"', '"metric":"lead_time_hours"');
