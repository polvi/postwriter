-- Users self-register on first contact: the login is the tailnet identity the
-- platform vouched for, never something the client typed.
CREATE TABLE users (
  login TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One row per sent note. The note body lives in note_bodies; the row is
-- the inbox entry (listing the inbox never touches the bodies). `delivered_at` flips exactly once, by a conditional UPDATE
-- the recipient's device issues only after the note has been written locally
-- (specs/Inbox.tla): a crash mid-pull leaves the message undelivered so the
-- next pull retries.
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  from_login TEXT NOT NULL,
  to_login TEXT NOT NULL,
  title TEXT NOT NULL,
  pages INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivered_at TEXT
);
CREATE INDEX messages_inbox ON messages (to_login, delivered_at, created_at);
CREATE INDEX messages_sent ON messages (from_login, created_at);

-- The serialised note (JSON, see worker/note-format.ts). Written before the
-- messages row so an inbox entry always has a body to pull.
CREATE TABLE note_bodies (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL
);
