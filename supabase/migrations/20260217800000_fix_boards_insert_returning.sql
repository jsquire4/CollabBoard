-- Fix boards INSERT...RETURNING failure.
--
-- PostgREST uses INSERT...RETURNING for .insert().select().single().
-- The RETURNING clause requires the SELECT policy to pass. The current
-- SELECT policy (is_board_member) can fail because the AFTER INSERT
-- trigger that creates the board_members row may not be visible in the
-- same command snapshot.
--
-- Fix: add a permissive SELECT policy so the board creator can always
-- read their own board, independent of board_members.

CREATE POLICY "Creators can view own boards"
  ON boards FOR SELECT
  USING (auth.uid() = created_by);
