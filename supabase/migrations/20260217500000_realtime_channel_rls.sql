-- Secure Realtime channels so only board members can send/receive
-- broadcast and presence messages on board:{boardId} topics.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Board members can receive messages"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    is_board_member((split_part(realtime.topic(), ':', 2))::uuid, (select auth.uid()))
    AND realtime.messages.extension IN ('broadcast', 'presence')
  );

CREATE POLICY "Board members can send messages"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    is_board_member((split_part(realtime.topic(), ':', 2))::uuid, (select auth.uid()))
    AND realtime.messages.extension IN ('broadcast', 'presence')
  );
