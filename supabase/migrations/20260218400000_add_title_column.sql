-- Add title field for sticky notes (and potentially other shapes)
ALTER TABLE board_objects
  ADD COLUMN title TEXT;
