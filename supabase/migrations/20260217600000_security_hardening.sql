-- Security hardening: restrict lookup_user_by_email to board managers,
-- add atomic ownership transfer, and use cryptographic share link tokens.

-- ============================================================
-- 1. Replace lookup_user_by_email with a board-scoped version
--    that verifies the caller is a manager/owner on the board.
-- ============================================================
CREATE OR REPLACE FUNCTION lookup_user_by_email(p_board_id UUID, p_email TEXT)
RETURNS UUID AS $$
DECLARE
  v_caller_role TEXT;
  v_user_id UUID;
BEGIN
  -- Verify caller is a manager or owner on this board
  v_caller_role := get_board_role(p_board_id, auth.uid());
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Permission denied: must be board owner or manager';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Atomic ownership transfer RPC
--    Transfers ownership in a single transaction to prevent
--    the dual-owner race condition.
-- ============================================================
CREATE OR REPLACE FUNCTION transfer_board_ownership(p_board_id UUID, p_new_owner_member_id UUID)
RETURNS VOID AS $$
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_target_user_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is the current owner
  v_caller_role := get_board_role(p_board_id, v_caller_id);
  IF v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'Only the board owner can transfer ownership';
  END IF;

  -- Look up the target member's user_id
  SELECT user_id INTO v_target_user_id
  FROM board_members
  WHERE id = p_new_owner_member_id AND board_id = p_board_id;

  IF v_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target member not found on this board';
  END IF;

  IF v_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot transfer ownership to yourself';
  END IF;

  -- Atomic: set new owner and demote current owner in one transaction
  UPDATE board_members SET role = 'owner' WHERE id = p_new_owner_member_id;
  UPDATE board_members SET role = 'manager' WHERE board_id = p_board_id AND user_id = v_caller_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Use cryptographic tokens for share links instead of UUIDs
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE board_share_links
  ALTER COLUMN token SET DEFAULT encode(extensions.gen_random_bytes(32), 'hex');
