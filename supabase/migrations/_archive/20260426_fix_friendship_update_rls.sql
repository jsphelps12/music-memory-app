-- Fix: only the addressee should be able to accept a friend request (UPDATE).
-- The requester has no need to UPDATE a friendship — they cancel via DELETE.
-- The old "Either party can update friendship" policy allowed requesters to
-- self-accept their own pending requests.

DROP POLICY IF EXISTS "Either party can update friendship" ON public.friendships;

CREATE POLICY "Only addressee can accept or update friendship"
  ON public.friendships FOR UPDATE
  USING (addressee_id = auth.uid());
