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
