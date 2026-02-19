-- Line/arrow waypoints for multi-segment routing
ALTER TABLE board_objects ADD COLUMN waypoints TEXT DEFAULT NULL;

-- Board-level canvas settings
ALTER TABLE boards ADD COLUMN grid_size INTEGER NOT NULL DEFAULT 40;
ALTER TABLE boards ADD COLUMN grid_subdivisions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE boards ADD COLUMN grid_visible BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE boards ADD COLUMN snap_to_grid BOOLEAN NOT NULL DEFAULT false;
