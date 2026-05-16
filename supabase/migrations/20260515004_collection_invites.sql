-- collection_invites: tracks owner-sent invitations that require acceptance
-- (distinct from the open invite-link flow which directly inserts into collection_members)
CREATE TABLE public.collection_invites (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id uuid NOT NULL REFERENCES public.collections ON DELETE CASCADE,
  inviter_id   uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  invitee_id   uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(collection_id, invitee_id)
);

ALTER TABLE public.collection_invites ENABLE ROW LEVEL SECURITY;

-- Invitees can see their own pending invites; inviters can see invites they sent
CREATE POLICY "Invitees and inviters can view invites"
  ON public.collection_invites FOR SELECT
  USING (invitee_id = auth.uid() OR inviter_id = auth.uid());

-- Collection owners can send invites
CREATE POLICY "Owners can send invites"
  ON public.collection_invites FOR INSERT
  WITH CHECK (
    inviter_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.collections
      WHERE id = collection_id AND user_id = auth.uid()
    )
  );

-- Owners can revoke invites; invitees can decline (both delete the row)
CREATE POLICY "Owners or invitees can delete invites"
  ON public.collection_invites FOR DELETE
  USING (
    invitee_id = auth.uid()
    OR inviter_id = auth.uid()
  );
