-- Fix can_use_agents permissions:
-- 1. Change default to true (editors get agent access by default)
-- 2. Backfill existing owner/manager rows to true
-- 3. Add trigger to enforce owners/managers always have can_use_agents = true
-- 4. Replace create_board_owner() to set can_use_agents = true
-- 5. Replace get_board_member_details() to include can_use_agents

-- ============================================================
-- 1. Change column default
-- ============================================================
ALTER TABLE board_members ALTER COLUMN can_use_agents SET DEFAULT true;

-- ============================================================
-- 2. Backfill existing owner/manager rows
-- ============================================================
UPDATE board_members
SET can_use_agents = true
WHERE role IN ('owner', 'manager') AND can_use_agents = false;

-- ============================================================
-- 3. Trigger: enforce can_use_agents for owner/manager roles
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_agent_access_by_role()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IN ('owner', 'manager') THEN
    NEW.can_use_agents := true;
  END IF;
  IF NEW.role = 'viewer' THEN
    NEW.can_use_agents := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_agent_access_by_role ON board_members;
CREATE TRIGGER trigger_enforce_agent_access_by_role
  BEFORE INSERT OR UPDATE ON board_members
  FOR EACH ROW EXECUTE FUNCTION enforce_agent_access_by_role();

-- ============================================================
-- 4. Replace create_board_owner() to set can_use_agents = true
-- ============================================================
CREATE OR REPLACE FUNCTION create_board_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO board_members (board_id, user_id, role, added_by, can_use_agents)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Replace get_board_member_details() to include can_use_agents
-- Must DROP first because return type is changing (adding can_use_agents column)
-- ============================================================
DROP FUNCTION IF EXISTS get_board_member_details(UUID);
CREATE OR REPLACE FUNCTION get_board_member_details(p_board_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  role TEXT,
  added_at TIMESTAMPTZ,
  email TEXT,
  display_name TEXT,
  can_use_agents BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is a member of this board
  IF NOT EXISTS (
    SELECT 1 FROM board_members bm
    WHERE bm.board_id = p_board_id AND bm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this board';
  END IF;

  RETURN QUERY
    SELECT
      bm.id,
      bm.user_id,
      bm.role::TEXT,
      bm.added_at,
      u.email::TEXT,
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))::TEXT AS display_name,
      bm.can_use_agents
    FROM board_members bm
    JOIN auth.users u ON u.id = bm.user_id
    WHERE bm.board_id = p_board_id
    ORDER BY bm.added_at ASC;
END;
$$;
