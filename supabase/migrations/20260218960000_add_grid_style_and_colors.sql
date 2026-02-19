-- Grid customization: style, canvas color, grid line colors
ALTER TABLE boards ADD COLUMN grid_style TEXT NOT NULL DEFAULT 'lines';
ALTER TABLE boards ADD COLUMN canvas_color TEXT NOT NULL DEFAULT '#e8ecf1';
ALTER TABLE boards ADD COLUMN grid_color TEXT NOT NULL DEFAULT '#b4becd';
ALTER TABLE boards ADD COLUMN subdivision_color TEXT NOT NULL DEFAULT '#b4becd';
