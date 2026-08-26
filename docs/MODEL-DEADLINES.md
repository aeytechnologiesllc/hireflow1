# AI model deadlines — what breaks, when, and how to swap it

Every model name in HireFlow is now read from an environment variable. Swapping a
model is a **config change in the Supabase dashboard**, not a code change and not a
deploy. Nothing here requires touching the repo.

## The dates that matter

| When | What retires | Who uses it |
|---|---|---|
| **~14–23 Oct 2026** | `gpt-4.1` | job writing, candidate analysis, shortlisting, workflow + flow generation, chat/sales evaluation |
| **≥16 Oct 2026** | `google/gemini-2.5-flash` | performance reports, document generation, document field extraction, portfolio analysis |
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

### Documents (Gemini, via the Lovable gateway)

| Variable | Default today | Function |
|---|---|---|
| `GEMINI_REPORT_MODEL` | `google/gemini-2.5-flash` | `ai-generate-performance-report` |
| `GEMINI_DOCUMENT_MODEL` | `google/gemini-2.5-flash` | `ai-generate-document` |
| `GEMINI_DOC_FIELDS_MODEL` | `google/gemini-2.5-flash` | `ai-analyze-document-fields` |
| `GEMINI_PORTFOLIO_MODEL` | `google/gemini-2.5-flash` | `ai-analyze-portfolio` |

### Voice (OpenAI Realtime)

| Variable | Default today | Note |
|---|---|---|
| `OPENAI_REALTIME_MODEL` | `gpt-realtime` | the replacement generation is also **~3× cheaper per audio minute** — this swap improves margin, not just compatibility |
| `OPENAI_REALTIME_TRANSCRIPTION_MODEL` | `gpt-4o-transcribe` | |

## Swap procedure (do this once, per family)

1. **Confirm the replacement id** against the provider's current model list — never
   guess a name; a wrong id fails at call time.
2. Change **one** variable first (start with `OPENAI_JOB_MODEL` — lowest blast radius).
3. Create a test job end to end and read the output.
4. Roll the rest, then run one full candidate journey: apply → screen → voice → seal.
5. If anything regresses, unset the variable — it falls straight back to the old default.

## Third-party dependency worth knowing

Four document functions call `ai.gateway.lovable.dev` (the scaffolding vendor's AI
gateway) rather than Google directly, using `LOVABLE_API_KEY`. That is an external
dependency on a tool we no longer build with. It works today, but moving these four
to a direct provider call removes a vendor we do not control from the production path.
Not urgent; worth doing before scale.
