-- Employer-owned external posting integrations.
-- JOIN tokens are written and read only through Edge Functions; clients receive
-- status plus a masked preview, never the raw token.

CREATE TABLE IF NOT EXISTS public.employer_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('join')),
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error')),
  api_token_ciphertext TEXT NOT NULL,
  api_token_nonce TEXT NOT NULL,
  token_preview TEXT NOT NULL,
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_validated_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (employer_id, provider)
);

ALTER TABLE public.employer_integrations ENABLE ROW LEVEL SECURITY;

-- Do not expose encrypted secrets through PostgREST. The service role used by
-- Edge Functions bypasses RLS; app clients must call join-integration instead.
REVOKE ALL ON TABLE public.employer_integrations FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_employer_integrations_employer_provider
  ON public.employer_integrations (employer_id, provider);

DROP TRIGGER IF EXISTS update_employer_integrations_updated_at ON public.employer_integrations;
CREATE TRIGGER update_employer_integrations_updated_at
BEFORE UPDATE ON public.employer_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
