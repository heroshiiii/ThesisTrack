CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'student'
    CHECK (role IN ('student', 'adviser', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  course VARCHAR(120) NOT NULL,
  adviser VARCHAR(120) NOT NULL,
  adviser_id UUID REFERENCES users(id) ON DELETE SET NULL,
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status VARCHAR(32) NOT NULL DEFAULT 'In progress'
    CHECK (status IN ('In progress', 'Needs attention', 'Completed')),
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS adviser_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS projects_created_by_updated_at_idx
  ON projects (created_by, updated_at DESC);

CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'In progress', 'Submitted', 'Approved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  document_url TEXT,
  document_key TEXT,
  document_name VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Reviewed', 'Revision Required', 'Approved')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS document_name VARCHAR(255);
ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS document_key TEXT;

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  adviser_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS milestones_project_due_date_idx
  ON milestones (project_id, due_date);
CREATE INDEX IF NOT EXISTS submissions_project_submitted_at_idx
  ON submissions (project_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS feedback_submission_created_at_idx
  ON feedback (submission_id, created_at DESC);