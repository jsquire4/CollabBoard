CREATE TABLE board_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000', -- single board for MVP
  type TEXT NOT NULL CHECK (type IN ('sticky_note', 'rectangle', 'circle', 'line', 'frame', 'connector', 'text')),
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  width DOUBLE PRECISION DEFAULT 150,
  height DOUBLE PRECISION DEFAULT 150,
  rotation DOUBLE PRECISION DEFAULT 0,
  text TEXT DEFAULT '',
  color TEXT DEFAULT '#FFEB3B',
  font_size INTEGER DEFAULT 14,
  -- Connector-specific fields
  from_id UUID REFERENCES board_objects(id) ON DELETE SET NULL,
  to_id UUID REFERENCES board_objects(id) ON DELETE SET NULL,
  connector_style TEXT DEFAULT 'arrow',
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for board queries
CREATE INDEX idx_board_objects_board_id ON board_objects(board_id);

-- RLS: anyone authenticated can read, only creator can update/delete
ALTER TABLE board_objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view board objects"
  ON board_objects FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone can create board objects"
  ON board_objects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can update own objects"
  ON board_objects FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can delete own objects"
  ON board_objects FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER board_objects_updated_at
  BEFORE UPDATE ON board_objects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();