-- Track AI agent container state per board
CREATE TYPE container_status AS ENUM ('starting', 'running', 'stopping', 'stopped');

CREATE TABLE board_containers (
  board_id UUID PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
  machine_id TEXT,
  machine_url TEXT,
  status container_status NOT NULL DEFAULT 'starting',
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stopped_at TIMESTAMPTZ
);

-- Service-role only — no client RLS policies (accessed via API routes with service key)
ALTER TABLE board_containers ENABLE ROW LEVEL SECURITY;

-- RPC to ensure exactly one container per board (advisory lock prevents races)
CREATE OR REPLACE FUNCTION ensure_board_container(
  p_board_id UUID,
  p_machine_id TEXT DEFAULT NULL,
  p_machine_url TEXT DEFAULT NULL
)
RETURNS TABLE(board_id UUID, machine_id TEXT, machine_url TEXT, status container_status, is_new BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_key BIGINT;
  v_row board_containers%ROWTYPE;
BEGIN
  -- Derive a stable lock key from the board UUID
  v_lock_key := ('x' || left(replace(p_board_id::text, '-', ''), 15))::bit(60)::bigint;

  -- Advisory lock scoped to this transaction
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Check for existing running/starting container
  SELECT * INTO v_row
  FROM board_containers bc
  WHERE bc.board_id = p_board_id
    AND bc.status IN ('starting', 'running');

  IF FOUND THEN
    RETURN QUERY SELECT v_row.board_id, v_row.machine_id, v_row.machine_url, v_row.status, false;
    RETURN;
  END IF;

  -- Upsert: create or restart
  INSERT INTO board_containers (board_id, machine_id, machine_url, status, started_at, last_heartbeat)
  VALUES (p_board_id, p_machine_id, p_machine_url, 'starting', now(), now())
  ON CONFLICT (board_id)
  DO UPDATE SET
    machine_id = COALESCE(p_machine_id, board_containers.machine_id),
    machine_url = COALESCE(p_machine_url, board_containers.machine_url),
    status = 'starting',
    started_at = now(),
    last_heartbeat = now(),
    stopped_at = NULL
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.board_id, v_row.machine_id, v_row.machine_url, v_row.status, true;
END;
$$;
