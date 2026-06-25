# Ava Engine — Architecture Plan

> **Status:** Canonical design. This is the binding plan for the Ava hiring engine —
> the system that turns a small-business owner's plain-language brief into a
> complete, fair, runnable hiring flow, screens every candidate, and hands the
> owner a ranked shortlist with one decision per person: **Advance** or **Pass**.
>
> **Audience:** founder + any agent building the engine. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md)
> for the current `_repo` data shapes and [`../CLAUDE.md`](../CLAUDE.md) for product rules
> (Deep Jade, the orb, the **applicant no-AI-language** rule).

---

## 1. What the engine is (in one breath)

An owner tells **Ava** what they're hiring for. Ava asks a few smart follow-ups,
recommends how hard to screen, then **builds the entire hiring flow** — job post,
application, a short timed scenario quiz, a practical simulation, an "answer out
loud" voice interview, and the shortlist logic. As candidates apply, the engine
**runs and scores every stage automatically** and produces a **ranked shortlist**.
The owner only ever does the human part: review the top few and decide.

The engine is one pipeline with six conceptual stages:

```
Guided brief  →  Rigor recommendation  →  Structured JobFlow  →  Scoring  →  Voice  →  Shortlist
   (owner)          (Ava recommends)        (Ava builds)        (per stage)  (final stage)  (ranked)
```

Each arrow is a typed, inspectable handoff. Nothing is a black box: every
generated artifact is editable by the owner before publish, and every score a
candidate receives is backed by a stored, auditable **ScoringArtifact**.

### Design principles

1. **Owner briefs, Ava builds, owner approves.** Ava never auto-publishes. The
   owner always sees and can edit the generated flow first.
2. **Everything generated is structured + editable.** The output of generation is
   typed data (`JobFlow`), never opaque prose. The review screen is just a
   renderer over that data.
3. **Scores are explainable and stored.** Every grade carries the rubric it was
   graded against, the evidence, and the model/version that produced it.
4. **Fair by construction.** Same rubric for every candidate in a role, scoring on
   job-relevant signals only, knockouts are explicit and disclosed, and there is a
   consent + disclosure slot on the candidate side.
5. **Candidate side speaks human.** No "AI", "Ava", "bot", "automated", or
   "algorithm" anywhere a candidate can see. The voice interview is "answer a few
   questions out loud." (See Rule 3 in `CLAUDE.md`.)

---

## 2. The flow, stage by stage

### 2.1 Guided create-job brief (owner input)

A short, friendly form — never a wall of fields. The owner gives the minimum:

- **Role title** (e.g. "Line cook — Chinese cuisine", "Branch manager")
- **Location** + **work mode** (on-site / hybrid / remote)
- **Employment type** (full-time / part-time / contract)
- **Pay** (range or rate)
- **Start urgency** (ASAP / few weeks / flexible)
- **What they'll actually do** (one or two sentences in the owner's words)

Then Ava asks **adaptive follow-ups, one at a time** — only the questions that
materially change the flow. Each is answerable with selectable chips plus an
optional "add detail" field, so the owner can move fast or be precise. Examples:

- Chef: "Is this a high-volume line, or a calmer prep-and-plate kitchen?" ·
  "Which cuisines/stations matter most?" · "Food-handler certification required?"
- Branch manager: "How many people will they manage?" · "Cash-handling and
  compliance responsibility?" · "Is this turning around an underperforming branch?"

The brief is captured as a typed `JobBrief` and **autosaves to local storage** so a
reload never loses work.

### 2.2 Rigor recommendation (Ava recommends, owner decides)

Ava recommends a **screening rigor**: **Easy · Standard · High**. The
recommendation is reasoned from the brief — seniority, money/people/compliance
exposure, safety-critical work, applicant-volume expectations — and shown with a
one-line rationale the owner can accept or override:

> *"I'd screen this at **High** — they'll handle cash, manage a team, and own
> compliance. A practical simulation plus a structured voice interview protects
> you from a costly mishire."*

Rigor scales the flow deterministically (phase count, question count, time limits,
score bars, shortlist size). The owner can always step it up or down; rigor is a
default, not a cage.

| Rigor | Application Qs | Quiz items | Simulation | Voice Qs | Shortlist | Min score bar |
|-------|---------------:|-----------:|:----------:|---------:|:---------:|:-------------:|
| **Easy** | 2 | 5 | optional | 4 | top 8 | lenient |
| **Standard** | 3 | 8 | yes | 6 | top 5 | moderate |
| **High** | 4 | 12 | yes (harder) | 8 | top 3 | strict |

### 2.3 Structured JobFlow (Ava builds — the hero moment)

Ava generates a fully-configured, **role-aware** `JobFlow`: a job post, an ordered
list of `ScreeningPhase`s, and the shortlist logic. "Role-aware" means it detects
the role family from the title and brief and writes **practical, specific** content
— wok-line scenarios for a Chinese-cuisine cook, cash-reconciliation and
de-escalation scenarios for a branch manager — not generic filler.

During generation the UI is the **hero moment**: the orb scales up and goes
energetic while a first-person reasoning thread streams in line by line
("Understanding the role" → "Choosing screening steps" → "Writing practical
scenarios" → "Building the scorecard" → "Preparing shortlist criteria"), newest
line highlighted. The result then cascades onto the review screen.

### 2.4 Scoring (per stage, automatic)

As candidates complete each phase, the engine scores it server-side against the
phase's stored rubric and writes a `ScoringArtifact`. Rubrics live server-side so
scores can't be reverse-engineered or gamed from the client. Quiz answers are
graded against model answers; simulation transcripts against a behavior rubric;
voice answers transcribed then scored on the role's competency dimensions.

### 2.5 Voice (the differentiator)

The voice interview is a short set of spoken questions. The candidate sees a calm,
recording-only screen (the orb is brand/recording visual **only** — no AI framing).
Each answer is transcribed, then scored on the role's competency dimensions
(e.g. *clarity, judgment, customer empathy, ownership*) with a short evidence-backed
read. This is the strongest signal and the hardest to fake — it's the moat.

### 2.6 Shortlist (ranked output)

The engine combines per-phase scores using the role's weights into a single
composite, applies any knockout thresholds, and ranks candidates. The owner sees
the **top N** with a one-glance scorecard and Ava's read per candidate, and acts:
**Advance** or **Pass**. That decision is the only required human step.

---

## 3. Model split — which model does what

Different jobs want different models. The engine isolates each LLM call behind a
typed task interface so models can be swapped per task via config/secret without
touching product code.

| Task | Why | Default tier |
|------|-----|--------------|
| **Brief follow-ups** | Cheap, fast, conversational; low stakes | Small/fast |
| **Rigor recommendation** | Short reasoning over the brief | Small/fast |
| **Flow generation** | The hard reasoning job — role-aware, structured, must produce valid `JobFlow` JSON | Large/reasoning |
| **Quiz grading** | Compare answer to model answer + rubric; deterministic-ish | Small/fast (or rules) |
| **Simulation scoring** | Judge a transcript against a behavior rubric | Mid |
| **Voice transcription** | Audio → text | Speech-to-text model |
| **Voice scoring** | Score transcript on competency dimensions, cite evidence | Mid/large |
| **Shortlist composition** | Mostly arithmetic over stored scores; LLM only for the per-candidate summary | Rules + small/fast |

Rules of the split:

- **Generation = the only expensive, latency-tolerant call** (~10–20s, behind the
  hero moment). Everything else is cheap and frequent.
- **Grading prefers rules where possible.** Use the model for judgment, not for
  arithmetic. Composite scoring and ranking are pure functions.
- **Every model call is a typed task** with a versioned prompt and a JSON-schema'd
  output, validated before it touches the pipeline. A bad/empty model response
  falls back to the **role-aware template generator** so create-job never breaks.
- **Model + prompt version are recorded** in every `ScoringArtifact` for audit and
  for safe A/B of model upgrades.

---

## 4. The phase system

A `JobFlow` is an ordered list of `ScreeningPhase`s. Phases are pluggable: each has
a `kind`, a config, a rubric, optional knockout threshold, and a weight in the
composite. The engine knows how to **render** (candidate UI), **run**, and **score**
each kind.

### Built-in phase kinds

| Kind | Candidate experience | Scored on | Auto / human |
|------|----------------------|-----------|--------------|
| `application` | Short structured questions | Completeness + role-fit signals | Auto |
| `quiz` | Timed scenario questions | Correctness vs. model answers + reasoning | Auto |
| `simulation` | Practical role-play (e.g. handle an upset customer, reconcile a till) | Behavior rubric | Auto |
| `typing_test` | Timed typing (where speed/accuracy matters) | WPM + accuracy | Auto |
| `coding_test` | Small practical task (technical roles only) | Correctness + quality | Auto |
| `voice_interview` | "Answer a few questions out loud" | Competency dimensions, evidence-backed | Auto |
| `document_request` | Upload (certs, portfolio, ID) | Presence/validity check | Auto + human |
| `trial_shift` | Paid in-person trial | Owner rating | Human |
| `in_person` | Final in-person interview | Owner rating | Human |
| `background_check` | Contingent final stage | Pass/flag | External |
| `custom` | Owner-defined | Owner-defined | Configurable |

Phase capabilities (each kind implements):

- `generateConfig(brief, rigor)` → the phase's content + rubric
- `render(props)` → candidate-facing UI (no AI language)
- `score(submission, rubric)` → `ScoringArtifact`
- editor metadata → so the review screen can edit it inline

The owner can **reorder, edit, remove, and add** phases on the review screen.
Rigor sets the defaults; the owner has the final say.

---

## 5. Scoring & fairness

### Scoring model

- Each phase produces a normalized **0–100** sub-score plus structured evidence.
- The **composite** is a weighted sum of phase sub-scores using the role's weights
  (voice typically weighted highest). Pure function, fully reproducible.
- **Knockout thresholds** are explicit per phase (`passThreshold`). Below it, a
  candidate is auto-declined for that role — recorded with the reason, never silent.
- Ranking is by composite, then by the highest-signal phase as tie-break.

### Fairness, transparency, compliance

- **One rubric per role.** Every candidate for a role is graded against the exact
  same stored rubric and weights. No per-candidate prompt drift.
- **Job-relevant signals only.** Scoring dimensions must map to the work. No
  scoring on accent, demographics, name, photo, or other protected/irrelevant
  attributes. Transcription is content-only.
- **Evidence required.** Every sub-score stores the evidence it was based on, so a
  human can audit any decision.
- **Knockouts are disclosed and reviewable.** Auto-declines are visible to the
  owner and reversible.
- **Consent + disclosure slot on the candidate side.** AI-in-hiring disclosure is
  **legally required** in some jurisdictions (Illinois AIVI Act, NYC Local Law 144,
  Colorado AI Act, EU AI Act). The "no AI language" rule is a tone choice and is
  **not** a license to skip legally required disclosure. The candidate flow keeps a
  fine-print/consent slot; get counsel sign-off before launch.
- **Human-in-the-loop by design.** The engine ranks; a person decides. Advance/Pass
  is always a human action.
- **Auditability.** Model + prompt version on every artifact; rubric + weights
  versioned on the role; an append-only decision log.

---

## 6. Data model

> TypeScript shapes are the source of truth for the engine; the Postgres tables
> below persist them. Fractional scores are `double precision`. Nested,
> variable-shape config (phase content, rubrics, evidence) is JSONB.

### 6.1 `JobBrief`

```typescript
type Rigor = "easy" | "standard" | "high";
type WorkMode = "onsite" | "hybrid" | "remote";
type EmploymentType = "full_time" | "part_time" | "contract";

interface JobBrief {
  roleTitle: string;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  pay: string;                 // free text range/rate
  startUrgency: "asap" | "few_weeks" | "flexible";
  whatTheyDo: string;          // owner's words
  followUps: BriefAnswer[];    // adaptive Q&A captured one at a time
  openings: number;
}

interface BriefAnswer {
  questionId: string;
  question: string;
  answer: string;              // chip selection(s) + optional detail
}

interface RigorRecommendation {
  recommended: Rigor;
  chosen: Rigor;               // owner's final pick (defaults to recommended)
  rationale: string;           // employer-facing, first-person Ava copy
}
```

### 6.2 `JobFlow`

```typescript
interface JobFlow {
  id: string;
  roleId: string;
  version: number;
  rigor: Rigor;
  jobPost: JobPost;            // generated, editable
  phases: ScreeningPhase[];    // ordered candidate journey
  shortlist: ShortlistConfig;
  generatedBy: ModelStamp;     // which model/prompt built this
  createdAt: string;
}

interface JobPost {
  title: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  niceToHaves: string[];
  // NOTE: candidate-facing — contains NO AI/Ava language.
}

interface ShortlistConfig {
  topN: number;
  minCompositeScore: number;   // 0–100 bar
  weights: Record<string, number>; // phaseId -> weight (sum ~= 1)
  tieBreakPhaseId?: string;
}
```

### 6.3 `ScreeningPhase`

```typescript
type PhaseKind =
  | "application" | "quiz" | "simulation" | "typing_test" | "coding_test"
  | "voice_interview" | "document_request" | "trial_shift" | "in_person"
  | "background_check" | "custom";

interface ScreeningPhase {
  id: string;
  kind: PhaseKind;
  order: number;
  title: string;               // candidate-facing label (no AI language)
  rationale: string;           // employer-facing: why this phase exists
  config: PhaseConfig;         // kind-specific (see below)
  rubric: PhaseRubric;         // stored server-side; never sent to client
  weight: number;              // contribution to composite (0–1)
  passThreshold?: number;      // knockout; auto-decline below this (0–100)
  scoringMode: "auto" | "human" | "external";
}

// Discriminated union by kind — examples of the two highest-signal configs:
interface QuizConfig {
  kind: "quiz";
  timeLimitSec: number;
  items: {
    id: string;
    scenario: string;          // candidate-facing
    options?: string[];        // MCQ or open
    // modelAnswer/keyPoints live in the rubric, NOT here.
  }[];
}

interface VoiceConfig {
  kind: "voice_interview";
  maxCallLengthSec: number;
  questions: { id: string; prompt: string }[];   // "Tell us about a time…"
  dimensions: string[];        // e.g. ["clarity","judgment","empathy","ownership"]
}

type PhaseConfig =
  | QuizConfig | VoiceConfig
  | { kind: Exclude<PhaseKind, "quiz" | "voice_interview">; [k: string]: unknown };

interface PhaseRubric {
  // Server-side only. Per-item model answers / behavior anchors / dimension
  // descriptors used to grade. Kept out of all client payloads.
  criteria: RubricCriterion[];
}

interface RubricCriterion {
  id: string;
  label: string;               // maps to a job-relevant signal only
  guidance: string;            // how to score it
  weightWithinPhase: number;
}
```

### 6.4 `ScoringArtifact`

```typescript
interface ScoringArtifact {
  id: string;
  applicationId: string;
  phaseId: string;
  phaseKind: PhaseKind;
  subScore: number;            // 0–100, normalized
  dimensionScores: Record<string, number>; // per criterion/dimension
  evidence: ScoringEvidence[]; // quotes/spans backing the score — auditable
  knockout: boolean;           // true if below passThreshold
  read: string;                // employer-facing short summary ("Ava's read")
  model: ModelStamp;           // model + prompt version that produced this
  rubricVersion: number;
  createdAt: string;
}

interface ScoringEvidence {
  source: "answer" | "transcript" | "document";
  ref: string;                 // which item/question/span
  excerpt: string;
  note: string;
}

interface ModelStamp {
  provider: string;            // e.g. "openai"
  model: string;               // e.g. "gpt-5.1"
  promptVersion: string;       // e.g. "flowgen@3"
}

interface CompositeResult {
  applicationId: string;
  roleId: string;
  composite: number;           // 0–100 weighted
  rank: number;
  shortlisted: boolean;
  decision?: "advance" | "pass"; // the human step
}
```

### 6.5 Postgres tables

Builds on the existing showcase schema (`roles`, `candidates`, `applications` — see
[`BACKEND-SCHEMA.md`](./BACKEND-SCHEMA.md)). New/extended:

| Table | Key columns | Notes |
|-------|-------------|-------|
| `roles` | `flow jsonb`, `rigor text`, `openings int` | `flow` persists the full `JobFlow`. Already present; extend. |
| `job_briefs` | `id`, `role_id`, `brief jsonb`, `rigor_recommendation jsonb` | Captures the owner input + Ava's recommendation. |
| `screening_phases` | *(denormalized view of `roles.flow.phases`)* | Optional; flow is canonical in `roles.flow`. Materialize only if querying across roles. |
| `scoring_artifacts` | `id`, `application_id`, `phase_id`, `phase_kind`, `sub_score double precision`, `dimension_scores jsonb`, `evidence jsonb`, `knockout bool`, `read text`, `model jsonb`, `rubric_version int`, `created_at` | One row per candidate per phase. Service-role writes only. |
| `composite_results` | `application_id`, `role_id`, `composite double precision`, `rank int`, `shortlisted bool`, `decision text` | Recomputed when artifacts change. |
| `applications` | `quiz_score`, `voice_score`, `decision`, `note`, `current_phase` | Already present; the denormalized fast-path for the pipeline UI. |
| `phase_rubrics` | `phase_id`, `rubric jsonb`, `version int` | **Server-side only** — never readable by the anon/publishable key. The anti-cheat boundary. |

**Security boundary:** rubrics and model answers (`phase_rubrics`, the `rubric`
field) are **never** exposed to the client. All scoring runs in edge functions with
service-role writes; the candidate client only ever submits answers and reads its
own progress.

---

## 7. Roadmap — 5 phases

### Phase 1 — Guided create-job + flow generation (the front door)
- `JobBrief` form + adaptive follow-ups (one at a time, chips + detail).
- Rigor recommendation with rationale + override.
- Flow generation → valid `JobFlow` (role-aware), with the template generator as
  guaranteed fallback. Hero "Ava builds" moment.
- Editable review screen (reorder / edit / remove / add phases) → publish persists
  `JobFlow` to `roles.flow`.
- **Exit:** an owner can brief Ava and publish a complete, editable, role-specific
  flow end to end.

### Phase 2 — Phase runtime + auto-scoring (application, quiz, simulation)
- Candidate runtime for `application`, `quiz`, `simulation` (no AI language).
- Server-side grading edge functions; rubrics stored server-side; `ScoringArtifact`
  writes; knockouts.
- **Exit:** candidates flow through the early stages and get real, stored,
  auditable scores.

### Phase 3 — Voice interview + transcription/scoring (the moat)
- Voice runtime ("answer a few questions out loud"), recording-only orb visual.
- Transcription → competency-dimension scoring with evidence → `ScoringArtifact`.
- **Exit:** the highest-signal stage is live and the differentiator works.

### Phase 4 — Composite, ranking, shortlist & decisions
- Composite scoring (weights), ranking, `composite_results`.
- Shortlist UI: top-N scorecards + Ava's per-candidate read + **Advance / Pass**.
- **Exit:** the owner gets a ranked shortlist and makes the one human decision.

### Phase 5 — Fairness, audit, multi-model & hardening
- Audit log + evidence surfacing; model/prompt versioning + safe model A/B.
- Consent/disclosure slot + counsel sign-off; bias review of dimensions.
- RLS hardening (scope writes, gate edge functions, rate-limit/captcha), notifications.
- **Exit:** defensible, compliant, multi-tenant-ready engine.

---

## 8. How this maps onto the current repo

- **Generation today:** `generate-flow` edge function (OpenAI server-side) +
  role-aware template fallback. This plan formalizes its output as the typed
  `JobFlow` above.
- **Persistence today:** `roles.flow` (JSONB), `rigor`, `openings` already exist.
  This plan adds `job_briefs`, `scoring_artifacts`, `composite_results`, and the
  server-only `phase_rubrics`.
- **Scoring today:** screening edge functions (`grade-quiz`, `transcribe-audio`,
  `score-interview`) live in the parent `web/` project. This plan unifies their
  outputs under one `ScoringArtifact` shape with evidence + model stamps.
- **UI today:** `AvaOrb`, `AvaWorkflowGenerationOverlay`, `CreateJob`,
  `CandidateJourneyProgress`, and the phase pages (`QuizPhase`, `VoiceInterviewPhase`,
  …) already exist and become the renderers for this engine's phases.

The mockup at **`/ava-preview`** (`src/pages/AvaFlowPreview.tsx`) is the visual/motion
prototype of Phase 1's owner experience (brief → follow-ups → rigor → build → review
→ publish) with canned data — design intent before real logic is wired.
