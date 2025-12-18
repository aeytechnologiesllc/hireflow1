-- Add columns for collaborative interview scheduling with confirmation flow

-- Candidate's response to the scheduled interview
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS candidate_response TEXT DEFAULT 'pending';
-- Values: 'pending', 'confirmed', 'reschedule_requested'

-- Store candidate's proposed alternative times (2-3 slots)
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS proposed_times JSONB;
-- Format: [{ "datetime": "2025-01-15T10:00:00Z" }, ...]

-- Candidate's note explaining reschedule request
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS candidate_note TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.interviews.candidate_response IS 'Candidate response to interview: pending, confirmed, or reschedule_requested';
COMMENT ON COLUMN public.interviews.proposed_times IS 'Array of alternative datetime options proposed by candidate when requesting reschedule';
COMMENT ON COLUMN public.interviews.candidate_note IS 'Optional note from candidate explaining reschedule request';