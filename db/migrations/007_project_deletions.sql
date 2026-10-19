-- Projects you deleted. A mark, not a row delete: Linear and #internal-* channels would bring
-- the project back on the next collection. Its events count as no project; restore removes the mark.
CREATE TABLE project_deletions (
  id TEXT PRIMARY KEY REFERENCES projects(id),
  at TEXT NOT NULL
);
