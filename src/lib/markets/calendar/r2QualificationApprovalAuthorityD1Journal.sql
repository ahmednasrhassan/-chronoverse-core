-- Inactive schema artifact for one fixed authority, NOT an initialization command.
-- Only the local test harness applies this schema and seeds synthetic history.
-- Production schema application and bootstrap require separate owner approval.
CREATE TABLE calendar_r2_approval_journal_v1 (
  slot INTEGER PRIMARY KEY CHECK (slot = 1),
  authority_id TEXT NOT NULL COLLATE BINARY,
  generation TEXT NOT NULL COLLATE BINARY,
  checkpoint_schema TEXT NOT NULL COLLATE BINARY,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 128),
  head_sha256 TEXT NOT NULL COLLATE BINARY,
  snapshot_json TEXT NOT NULL COLLATE BINARY
    CHECK (length(CAST(snapshot_json AS BLOB)) <= 262144)
) STRICT;
