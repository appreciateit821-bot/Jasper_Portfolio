CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  brand TEXT NOT NULL,
  message TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sender_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS applications_sender_date ON applications(sender_hash, created_at);

-- Additive and safe to re-run on an existing applications database.
-- Legacy rows need no backfill; the API supplies explicit defaults on read.
CREATE TABLE IF NOT EXISTS application_details (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  interests TEXT NOT NULL DEFAULT '[]',
  profile_url TEXT NOT NULL DEFAULT '',
  source_context TEXT NOT NULL DEFAULT '',
  consent_version TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','connected','archived')),
  owner_note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS applications_created_id ON applications(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS application_details_status ON application_details(status);

CREATE TABLE IF NOT EXISTS application_attachments (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content BLOB NOT NULL CHECK (length(content) BETWEEN 1 AND 1048576)
);
