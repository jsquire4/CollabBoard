-- Add CRDT support columns to board_objects
-- field_clocks: per-field HLC clocks for LWW merge (JSONB, ~500 bytes per object)
-- deleted_at: soft-delete tombstone for add-wins semantics

ALTER TABLE board_objects ADD COLUMN field_clocks JSONB DEFAULT '{}';
ALTER TABLE board_objects ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index: efficiently filter active (non-deleted) objects on load
CREATE INDEX idx_board_objects_active ON board_objects (board_id) WHERE deleted_at IS NULL;
