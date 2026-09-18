BEGIN;
CREATE TABLE IF NOT EXISTS public.status_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  author_id uuid NOT NULL REFERENCES public.users(id),
  type text NOT NULL CHECK (type IN ('TEXT','IMAGE','VIDEO')),
  body text,
  background_color text,
  storage_key text,
  mime_type text,
  size_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS status_updates_feed_idx ON public.status_updates(company_id, expires_at) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS public.status_update_views (
  status_id uuid NOT NULL REFERENCES public.status_updates(id) ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES public.users(id),
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(status_id, viewer_id)
);
ALTER TABLE public.status_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_update_views ENABLE ROW LEVEL SECURITY;
-- Access is through the authenticated API, which enforces company and author scope.
REVOKE ALL ON public.status_updates, public.status_update_views FROM anon, authenticated;
COMMIT;
