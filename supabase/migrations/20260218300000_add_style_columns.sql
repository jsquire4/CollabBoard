-- Add extended shape styling columns
ALTER TABLE board_objects
  ADD COLUMN stroke_color TEXT,
  ADD COLUMN opacity DOUBLE PRECISION DEFAULT 1.0,
  ADD COLUMN shadow_color TEXT DEFAULT 'rgba(0,0,0,0.2)',
  ADD COLUMN shadow_blur DOUBLE PRECISION DEFAULT 6,
  ADD COLUMN shadow_offset_x DOUBLE PRECISION DEFAULT 0,
  ADD COLUMN shadow_offset_y DOUBLE PRECISION DEFAULT 2,
  ADD COLUMN text_align TEXT DEFAULT 'center',
  ADD COLUMN text_vertical_align TEXT DEFAULT 'middle',
  ADD COLUMN text_padding DOUBLE PRECISION DEFAULT 8,
  ADD COLUMN text_color TEXT DEFAULT '#000000',
  ADD COLUMN corner_radius DOUBLE PRECISION DEFAULT 0;
