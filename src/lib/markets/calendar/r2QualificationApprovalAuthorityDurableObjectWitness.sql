-- Inactive schema artifact. Applied/seeded only by local offline tests.
-- Bootstrap, schema application and activation need separate owner approval.
CREATE TABLE calendar_r2_approval_witness_v1 (
  slot INTEGER PRIMARY KEY CHECK (slot = 1),
  witness_id TEXT NOT NULL COLLATE BINARY,
  authority_id TEXT NOT NULL COLLATE BINARY,
  generation TEXT NOT NULL COLLATE BINARY,
  checkpoint_schema TEXT NOT NULL COLLATE BINARY,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 0 AND 128),
  head_sha256 TEXT NOT NULL COLLATE BINARY
) STRICT;

CREATE TABLE calendar_r2_approval_witness_history_v1 (
  sequence INTEGER PRIMARY KEY CHECK (sequence BETWEEN 0 AND 128),
  witness_id TEXT NOT NULL COLLATE BINARY,
  authority_id TEXT NOT NULL COLLATE BINARY,
  generation TEXT NOT NULL COLLATE BINARY,
  checkpoint_schema TEXT NOT NULL COLLATE BINARY,
  head_sha256 TEXT NOT NULL COLLATE BINARY
) STRICT;

CREATE TRIGGER calendar_r2_approval_witness_history_no_update_v1
BEFORE UPDATE ON calendar_r2_approval_witness_history_v1
BEGIN
  SELECT RAISE(ABORT, 'Immutable witness history.');
END;

CREATE TRIGGER calendar_r2_approval_witness_history_no_delete_v1
BEFORE DELETE ON calendar_r2_approval_witness_history_v1
BEGIN
  SELECT RAISE(ABORT, 'Immutable witness history.');
END;

-- Also reject INSERT OR REPLACE, even with SQLite recursive_triggers disabled.
CREATE TRIGGER calendar_r2_approval_witness_history_no_replace_v1
BEFORE INSERT ON calendar_r2_approval_witness_history_v1
WHEN EXISTS (SELECT 1 FROM calendar_r2_approval_witness_history_v1 WHERE sequence = NEW.sequence)
BEGIN
  SELECT RAISE(ABORT, 'Immutable witness history.');
END;
