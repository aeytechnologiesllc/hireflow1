# AI model deadlines — what breaks, when, and how to swap it

Every model name in HireFlow is now read from an environment variable. Swapping a
model is a **config change in the Supabase dashboard**, not a code change and not a
deploy. Nothing here requires touching the repo.

**Updated 2026-09-16.** The Oct-2026 `gpt-4.1` / `gpt-4o-mini` retirement and the
Jan-2027 `gpt-realtime` / `gpt-4o-transcribe` retirement described in earlier
versions of this doc are **already defused** — every function listed below is live
on the newer model families. See `docs/OVERNIGHT-LOG.md` for the migration record.
Verified against the deployed edge function source (`supabase/functions/*/index.ts`)
on 2026-09-16, not against provider docs — confirm current retirement dates with the
provider before relying on "no announced date" below.

## The dates that matter

| When | What retires | Who uses it |
|---|---|---|
| **~14–23 Oct 2026** | `gpt-4.1`, `gpt-4o-mini` | already migrated off — no function defaults to these any more (`ai-models-come-from-env` guard also blocks a regression) |
| **no announced date** | `gpt-5.6-luna`, `gpt-5.6-terra` | job writing, candidate analysis, shortlisting, workflow + flow generation, chat/sales live turns + evaluation, performance reports, document generation, document field placement, portfolio analysis |
| **20 Jan 2027** | `gpt-realtime`, `gpt-4o-transcribe` | already migrated off — voice now runs on `gpt-realtime-2.1` / `gpt-live-transcribe` |
| **no announced date** | `gpt-realtime-2.1`, `gpt-live-transcribe` | Ava's voice interviews and transcription (current) |

## How to swap (5 minutes, no deploy)

1. Open the Supabase dashboard → **Edge Functions → Secrets**.
2. Set the variable(s) below to the replacement model id.
3. Done — the next invocation picks it up. No redeploy, no code change.

### Text / analysis (OpenAI)

| Variable | Default today | Function |
|---|---|---|
| `OPENAI_ANALYSIS_MODEL` | `gpt-5.6-terra` | `ai-analyze` — the candidate scorecard |
| `OPENAI_SHORTLIST_MODEL` | `gpt-5.6-terra` | `ai-shortlist` |
| `OPENAI_JOB_MODEL` | `gpt-5.6-luna` | `ai-generate-job-content` |
| `OPENAI_WORKFLOW_MODEL` | `gpt-5.6-luna` | `ai-generate-workflow` |
| `OPENAI_MODEL` | `gpt-5.6-luna` | `generate-flow` — Ava's job-creation flow |
| `OPENAI_CHAT_INTERVIEW_MODEL` | `gpt-5.6-luna` | live turns, chat interview |
| `OPENAI_CHAT_INTERVIEW_EVAL_MODEL` | `gpt-5.6-luna` | scoring, chat interview |
| `OPENAI_CHAT_SIMULATION_MODEL` | `gpt-5.6-luna` | live turns, chat simulation |
| `OPENAI_CHAT_SIMULATION_EVAL_MODEL` | `gpt-5.6-luna` | scoring, chat simulation |
| `OPENAI_SALES_SIMULATION_MODEL` | `gpt-5.6-luna` | live turns, sales simulation |
| `OPENAI_SALES_SIMULATION_EVAL_MODEL` | `gpt-5.6-luna` | scoring, sales simulation |

GPT-5.6 models reject a non-default `temperature`; the shared OpenAI helpers strip
that param before calling out, so callers do not need to special-case it.

### Documents & portfolio (OpenAI)

These four used to run on Gemini through the Lovable gateway. They now call OpenAI
directly with the same `OPENAI_API_KEY` as everything else. The old `GEMINI_*`
variables are dead — unset them if they are still in Secrets.

| Variable | Default today | Function |
|---|---|---|
| `OPENAI_REPORT_MODEL` | `gpt-5.6-terra` | `ai-generate-performance-report` — long JSON blueprint |
| `OPENAI_DOCUMENT_MODEL` | `gpt-5.6-luna` | `ai-generate-document` — plain-text offer letters, NDAs, contracts |
| `OPENAI_DOC_FIELDS_MODEL` | `gpt-5.6-luna` | `ai-analyze-document-fields` — signature-field placement (JSON) |
| `OPENAI_PORTFOLIO_MODEL` | `gpt-5.6-terra` | `ai-analyze-portfolio` — vision: images + PDFs inlined (needs a model with image and file input) |

### Voice (OpenAI Realtime; the ElevenLabs demo is retired)

| Variable | Default today | Note |
|---|---|---|
| `OPENAI_REALTIME_MODEL` | `gpt-realtime-2.1` | already the newer generation — **~3× cheaper per audio minute** than the retiring `gpt-realtime` |
| `OPENAI_REALTIME_TRANSCRIPTION_MODEL` | `gpt-live-transcribe` | already the newer generation, replacing the retiring `gpt-4o-transcribe` |
| `ELEVENLABS_API_KEY` (`elevenlabs-tts`) | — | not a model variable. `elevenlabs-tts` is **retired** (410 since 2026-09-16): its only caller, `/marketing-demo`, now redirects home, and it was a sign-in-free proxy with no text length cap. No product flow uses ElevenLabs. |

## Swap procedure (do this once, per family)

1. **Confirm the replacement id** against the provider's current model list — never
   guess a name; a wrong id fails at call time.
2. Change **one** variable first (start with `OPENAI_JOB_MODEL` — lowest blast radius).
3. Create a test job end to end and read the output.
4. Roll the rest, then run one full candidate journey: apply → screen → voice → seal.
5. If anything regresses, unset the variable — it falls straight back to the old default.

## Lovable gateway — gone (Sep 2026)

Four document functions used to call `ai.gateway.lovable.dev` (the scaffolding
vendor's AI gateway) with `LOVABLE_API_KEY`. That key was never set in production,
so those four features were silently dead. They now call OpenAI directly (table
above) and no code references the gateway or the key any more. `LOVABLE_API_KEY`
can be deleted from Secrets; nothing reads it.
