-- Schema cleanup: fix orphaned RLS policies, remove stale columns/defaults,
-- and wipe all user data for a fresh start.

-- ============================================================
-- 1. Drop orphaned RLS policies from init migration
--    These were never removed because the sharing migration
--    used wrong policy names in DROP IF EXISTS.
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view board objects" ON board_objects;
DROP POLICY IF EXISTS "Anyone can create board objects" ON board_objects;
DROP POLICY IF EXISTS "Creator can update own objects" ON board_objects;
DROP POLICY IF EXISTS "Creator can delete own objects" ON board_objects;

-- ============================================================
-- 2. Remove stale board_objects.board_id default (MVP leftover)
-- ============================================================
ALTER TABLE board_objects ALTER COLUMN board_id DROP DEFAULT;

-- ============================================================
-- 3. Drop unused connector columns and tighten type CHECK
-- ============================================================
ALTER TABLE board_objects DROP COLUMN IF EXISTS from_id;
ALTER TABLE board_objects DROP COLUMN IF EXISTS to_id;
ALTER TABLE board_objects DROP COLUMN IF EXISTS connector_style;

-- Replace type CHECK to remove unused types (line, connector, text)
ALTER TABLE board_objects DROP CONSTRAINT IF EXISTS board_objects_type_check;
ALTER TABLE board_objects ADD CONSTRAINT board_objects_type_check
  CHECK (type IN ('sticky_note', 'rectangle', 'circle', 'frame', 'group'));

-- ============================================================
-- 4. Re-assert boards INSERT policy
--    The sharing migration created this policy, but it may have
--    been dropped or corrupted. Drop + recreate to be safe.
-- ============================================================
DROP POLICY IF EXISTS "Users can create boards" ON boards;
CREATE POLICY "Users can create boards"
  ON boards FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- ============================================================
-- 5. Wipe all data for fresh start
--    Order: children before parents to respect FK constraints.
-- ============================================================
DELETE FROM board_objects;
DELETE FROM board_invites;
DELETE FROM board_share_links;
DELETE FROM board_members;
DELETE FROM boards;
