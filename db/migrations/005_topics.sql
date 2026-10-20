-- A group is a Linear project or a topic: work Linear does not track, like a customer
-- (#internal-acme) or a group you create in review. Both span weeks.
ALTER TABLE projects ADD COLUMN kind TEXT NOT NULL DEFAULT 'linear' CHECK (kind IN ('linear', 'topic'));
