-- Sharing v2 Phase C (docs/SOCIAL-ARCHITECTURE.md): moment_shares — the
-- directed "send this moment to a person" grant. A row means the recipient can
-- see the moment ("Shared with me"); sender deletes to unsend, recipient
-- deletes to remove it from their inbox; viewed_at drives the unread badge.
--
-- sender_id is denormalized from moments.user_id (a deviation from the spec's
-- minimal table, documented there): policies on this table must not reference
-- moments, because the moments SELECT policy references this table — Postgres
-- would raise "infinite recursion detected in policy" the moment both sides
-- consult each other. With sender_id on the row, every moment_shares policy is
-- self-contained. It also gives "Shared with me" its sender attribution
-- without going through moments → profiles.

CREATE TABLE public.moment_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  viewed_at timestamptz,
  UNIQUE (moment_id, recipient_id)
);

-- "Shared with me" list and unread badge both query by recipient.
CREATE INDEX moment_shares_recipient_idx
  ON public.moment_shares (recipient_id, created_at DESC);

ALTER TABLE public.moment_shares ENABLE ROW LEVEL SECURITY;

-- Both parties can see the grant row (sender needs it for the "Shared with"
-- summary and the already-sent state in the share sheet's person picker).
CREATE POLICY "Sender and recipient can view shares"
ON public.moment_shares
FOR SELECT
USING (
  (SELECT auth.uid()) = recipient_id
  OR (SELECT auth.uid()) = sender_id
);

-- Only the moment's owner can send it, and only as themselves. The moments
-- EXISTS is security-critical: without it, anyone could mint a grant row for
-- an arbitrary moment_id with themselves as recipient and walk through the
-- moments SELECT policy's moment_shares branch. (Safe from recursion: this
-- consults moments' policy, which consults moment_shares' SELECT policy,
-- which is self-contained — the chain terminates.)
CREATE POLICY "Owners can send their moments"
ON public.moment_shares
FOR INSERT
WITH CHECK (
  (SELECT auth.uid()) = sender_id
  AND EXISTS (
    SELECT 1 FROM public.moments m
    WHERE m.id = moment_id
      AND m.user_id = (SELECT auth.uid())
  )
);

-- Recipient marks viewed. Column privileges below confine the update to
-- viewed_at — without them a recipient could repoint their own row's
-- moment_id at any moment and grant themselves access to it.
CREATE POLICY "Recipients can mark shares viewed"
ON public.moment_shares
FOR UPDATE
USING ((SELECT auth.uid()) = recipient_id)
WITH CHECK ((SELECT auth.uid()) = recipient_id);

REVOKE UPDATE ON public.moment_shares FROM authenticated;
GRANT UPDATE (viewed_at) ON public.moment_shares TO authenticated;

-- Sender unsends; recipient removes it from their inbox.
CREATE POLICY "Sender and recipient can delete shares"
ON public.moment_shares
FOR DELETE
USING (
  (SELECT auth.uid()) = recipient_id
  OR (SELECT auth.uid()) = sender_id
);

-- The v2 access rule gains its final branch: a moment_shares row grants the
-- recipient visibility. Full rule: own / own-album / member-album /
-- shared-to-me / has-link.
ALTER POLICY "Users can view moments"
ON public.moments
USING (
  (SELECT auth.uid()) = user_id
  OR EXISTS (
    SELECT 1
    FROM collection_moments cm
    JOIN collections c ON c.id = cm.collection_id
    WHERE cm.moment_id = moments.id
      AND c.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM collection_moments cm
    JOIN collection_members cmb ON cmb.collection_id = cm.collection_id
    WHERE cm.moment_id = moments.id
      AND cmb.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM moment_shares ms
    WHERE ms.moment_id = moments.id
      AND ms.recipient_id = (SELECT auth.uid())
  )
  OR share_token IS NOT NULL
);
