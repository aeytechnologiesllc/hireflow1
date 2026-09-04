# AI model deadlines — what breaks, when, and how to swap it

Every model name in HireFlow is now read from an environment variable. Swapping a
model is a **config change in the Supabase dashboard**, not a code change and not a
deploy. Nothing here requires touching the repo.

## The dates that matter

| When | What retires | Who uses it |
|---|---|---|
| **~14–23 Oct 2026** | `gpt-4.1` | job writing, candidate analysis, shortlisting, workflow + flow generation, chat/sales evaluation |
| **no announced date** | `gpt-5.6-luna`, `gpt-5.6-terra` | performance reports, document generation, document field placement, portfolio analysis (moved off Gemini/Lovable, Sep 2026) |
| **no announced date** | `gpt-4o-mini` | live conversational turns in chat/sales/interview simulations |
| **20 Jan 2027** | `gpt-realtime`, `gpt-4o-transcribe` | Ava's voice interviews and transcription |

## How to swap (5 minutes, no deploy)

1. Open the Supabase dashboard → **Edge Functions → Secrets**.
2. Set the variable(s) below to the replacement model id.
3. Done — the next invocation picks it up. No redeploy, no code change.

### Text / analysis (OpenAI)

| Variable | Default today | Function |
|---|---|---|
| `OPENAI_ANALYSIS_MODEL` | `gpt-4.1` | `ai-analyze` — the candidate scorecard |
| `OPENAI_SHORTLIST_MODEL` | `gpt-4.1` | `ai-shortlist` |
| `OPENAI_JOB_MODEL` | `gpt-4.1` | `ai-generate-job-content` |
| `OPENAI_WORKFLOW_MODEL` | `gpt-4.1` | `ai-generate-workflow` |
| `OPENAI_MODEL` | `gpt-4.1` | `generate-flow` — Ava's job-creation flow |
| `OPENAI_CHAT_INTERVIEW_MODEL` | `gpt-4o-mini` | live turns, chat interview |
| `OPENAI_CHAT_INTERVIEW_EVAL_MODEL` | `gpt-4.1` | scoring, chat interview |
| `OPENAI_CHAT_SIMULATION_MODEL` | `gpt-4o-mini` | live turns, chat simulation |
| `OPENAI_CHAT_SIMULATION_EVAL_MODEL` | `gpt-4.1` | scoring, chat simulation |
| `OPENAI_SALES_SIMULATION_MODEL` | `gpt-4o-mini` | live turns, sales simulation |
| `OPENAI_SALES_SIMULATION_EVAL_MODEL` | `gpt-4.1` | scoring, sales simulation |

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

### Voice (OpenAI Realtime, plus one ElevenLabs demo)

| Variable | Default today | Note |
|---|---|---|
| `OPENAI_REALTIME_MODEL` | `gpt-realtime` | the replacement generation is also **~3× cheaper per audio minute** — this swap improves margin, not just compatibility |
| `OPENAI_REALTIME_TRANSCRIPTION_MODEL` | `gpt-4o-transcribe` | |
| `ELEVENLABS_API_KEY` (`elevenlabs-tts`) | — | not a model variable. The `elevenlabs-tts` function is called **only by the `/marketing-demo` page**; no candidate or employer flow depends on it. If ElevenLabs breaks, the product does not. |

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
