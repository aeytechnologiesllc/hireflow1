/**
 * TalkToAva — cinematic, voice-primary job creation. Ava (OpenAI Realtime, interruptible
 * speech-to-speech) is a consultative assistant: she listens, advises, extracts a structured
 * JobBrief, reads it back, and hands off to the EXISTING build pipeline. The ORB is the hero —
 * large, alive, and the tap-to-start CTA. No form during voice; the typed form is one tap away.
 */
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Loader2, Check, Pencil, AlertCircle } from "lucide-react";
import { AvaOrb } from "@/components/ava/AvaOrb";
import { useAvaVoice } from "@/hooks/useAvaVoice";
import {
  briefHasAnyData,
  canCreate,
  emptyJobBrief,
  mapJobBriefToFormPayload,
  mergeBriefFromTool,
  payToText,
  typeLabel,
  type BriefFormPayload,
  type JobBrief,
} from "@/lib/avaEngine/jobBrief";

const DISPLAY = "'Fraunces', serif";

type Phase = "idle" | "listening" | "thinking" | "speaking" | "readback" | "creating" | "error";
type Msg = { id: number; role: "user" | "ava"; text: string };

interface TalkToAvaProps {
  /** Current wizard step. TalkToAva stays mounted across 0 (intake) → 3 (build) → 4 (review). */
  step: number;
  brief: { role: string; location: string; type: string; pay: string; start: string; work: string; openings: number };
  /** The live plan (review step) — lets Ava resolve which step the employer means by voice. */
  reviewCards: { id: string; kind: string; title: string }[];
  onBriefPatch: (patch: Partial<BriefFormPayload>) => void;
  onComplete: (payload: BriefFormPayload) => void;
  onPreferType: () => void;
  /** Real-time voice editing of the plan on the review step. */
  onEditPhase: (id: string, field: "title" | "candidate", value: string) => void;
  onRemovePhase: (id: string) => void;
  onReorderPhases: (ids: string[]) => void;
  onConfirmPublish: () => void;
}

/** Match a plain step name Ava says ("the quiz", "voice interview") to a plan card. */
function matchCard(cards: { id: string; kind: string; title: string }[], name: unknown): { id: string } | null {
  const q = String(name ?? "").toLowerCase().trim();
  if (!q) return null;
  return (
    cards.find((c) => c.kind.toLowerCase() === q) ||
    cards.find((c) => c.kind.toLowerCase().includes(q) || q.includes(c.kind.toLowerCase())) ||
    cards.find((c) => c.title.toLowerCase().includes(q)) ||
    null
  );
}

export default function TalkToAva({ step, reviewCards, onBriefPatch, onComplete, onPreferType, onEditPhase, onRemovePhase, onReorderPhases, onConfirmPublish }: TalkToAvaProps) {
  const [jobBrief, setJobBrief] = useState<JobBrief>(emptyJobBrief);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [readback, setReadback] = useState(false);
  const [creating, setCreating] = useState(false);
  const [handedBack, setHandedBack] = useState(false);
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));

  const msgCounter = useRef(0);
  const avaMsgId = useRef<number | null>(null);
  const greeted = useRef(false);
  const finishing = useRef(false);
  const handedOff = useRef(false);
  const jobBriefRef = useRef(jobBrief);
  jobBriefRef.current = jobBrief;
  const reviewCardsRef = useRef(reviewCards);
  reviewCardsRef.current = reviewCards;
  const reviewPromptedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const f = () => setVw(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  const onTranscript = useCallback((text: string, role: "user" | "assistant") => {
    if (role === "user") setJobBrief((b) => ({ ...b, rawTranscript: (b.rawTranscript + " " + text).trim() }));
    setMessages((prev) => {
      if (role === "user") {
        avaMsgId.current = null;
        return [...prev, { id: ++msgCounter.current, role: "user", text }];
      }
      if (avaMsgId.current != null) return prev.map((m) => (m.id === avaMsgId.current ? { ...m, text: m.text + text } : m));
      const id = ++msgCounter.current;
      avaMsgId.current = id;
      return [...prev, { id, role: "ava", text }];
    });
  }, []);

  const handoff = useCallback(() => {
    if (handedOff.current) return;
    handedOff.current = true;
    onComplete(mapJobBriefToFormPayload(jobBriefRef.current));
  }, [onComplete]);

  const doCreate = useCallback(() => {
    if (finishing.current || !canCreate(jobBriefRef.current)) return;
    finishing.current = true;
    setCreating(true); // show "building…" while Ava finishes her handoff line; the effects below transition
  }, []);

  const onToolCall = useCallback(
    (toolName: string, args: any) => {
      if (toolName === "set_brief_fields" && args && typeof args === "object") {
        setJobBrief((prev) => {
          const next = mergeBriefFromTool(prev, args);
          onBriefPatch(mapJobBriefToFormPayload(next));
          return next;
        });
      } else if (toolName === "present_readback") {
        setReadback(true);
      } else if (toolName === "create_job" || toolName === "finish_brief") {
        doCreate();
      } else if (toolName === "edit_phase") {
        const card = matchCard(reviewCardsRef.current, args?.phase);
        if (card) {
          if (typeof args?.title === "string" && args.title.trim()) onEditPhase(card.id, "title", args.title.trim());
          if (typeof args?.description === "string" && args.description.trim()) onEditPhase(card.id, "candidate", args.description.trim());
        }
      } else if (toolName === "remove_phase") {
        const card = matchCard(reviewCardsRef.current, args?.phase);
        if (card) onRemovePhase(card.id);
      } else if (toolName === "reorder_phases") {
        const ids = (Array.isArray(args?.order) ? args.order : [])
          .map((n: unknown) => matchCard(reviewCardsRef.current, n)?.id)
          .filter((x: string | undefined): x is string => Boolean(x));
        if (ids.length) onReorderPhases(ids);
      } else if (toolName === "confirm_plan") {
        onConfirmPublish();
      } else if (toolName === "hand_off") {
        setHandedBack(true);
      }
    },
    [onBriefPatch, doCreate, onEditPhase, onRemovePhase, onReorderPhases, onConfirmPublish],
  );

  const voice = useAvaVoice({ mode: "intake", currentRoute: "/jobs/create", onTranscript, onToolCall });
  const { connect, disconnect, triggerResponse, getVoiceLevel, isConnected, isConnecting, isListening, isSpeaking, isProcessing, error } = voice;

  useEffect(() => {
    if (isConnected && !greeted.current) {
      greeted.current = true;
      const t = window.setTimeout(() => triggerResponse(), 350);
      return () => window.clearTimeout(t);
    }
  }, [isConnected, triggerResponse]);

  useEffect(() => () => { try { disconnect(); } catch { /* no-op */ } }, [disconnect]);
  useEffect(() => { transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  // Smooth handoff: once confirmed, let Ava finish her closing line, THEN glide into the build
  // animation. Transition a beat after she stops speaking; a hard cap ensures we never hang.
  useEffect(() => {
    if (!creating) return;
    const cap = window.setTimeout(handoff, 6000);
    return () => window.clearTimeout(cap);
  }, [creating, handoff]);
  useEffect(() => {
    if (!creating || isSpeaking) return; // keep waiting while she's still talking
    const t = window.setTimeout(handoff, 700); // a calm beat after she finishes → transition
    return () => window.clearTimeout(t);
  }, [creating, isSpeaking, handoff]);

  // Once the plan is on screen (review step), clear the building state.
  useEffect(() => {
    if (step >= 4) setCreating(false);
  }, [step]);

  // REVIEW: prompt Ava — ONCE — to present the plan and invite changes. She must NOT announce it
  // before the employer can see it, so we (a) wait until she's quiet, then (b) hold a beat for the
  // build→review transition to finish, so "it's ready" lands exactly when the plan is on screen.
  useEffect(() => {
    if (step !== 4 || !isConnected || reviewPromptedRef.current) return;
    if (isSpeaking || isProcessing) return; // wait until she's finished her build line
    const t = window.setTimeout(() => {
      if (reviewPromptedRef.current) return;
      reviewPromptedRef.current = true;
      const summary = reviewCardsRef.current.map((c, i) => `${i + 1}. ${c.kind} — ${c.title}`).join("; ");
      voice.sendSystemInstruction(
        `[The build animation has finished and the hiring plan is NOW VISIBLE on the employer's screen, with these steps: ${summary}. NOW (not before) tell them it's ready and ask if they'd like to change anything — you can rename or reword a step, remove one, reorder them, or publish. One or two sentences.]`,
      );
    }, 1300);
    return () => window.clearTimeout(t);
  }, [step, isConnected, isSpeaking, isProcessing, voice]);

  // Graceful handoff: when Ava hands the plan back, let her finish her sign-off line, then quietly
  // end the voice session so the employer can publish manually.
  useEffect(() => {
    if (!handedBack || !isConnected || isSpeaking) return;
    const t = window.setTimeout(() => { try { disconnect(); } catch { /* no-op */ } }, 900);
    return () => window.clearTimeout(t);
  }, [handedBack, isConnected, isSpeaking, disconnect]);

  const hasData = briefHasAnyData(jobBrief);
  const phase: Phase = creating ? "creating"
    : error ? "error"
    : !isConnected ? "idle"
    : readback ? "readback"
    : isListening ? "listening"
    : isProcessing ? "thinking"
    : isSpeaking ? "speaking"
    : "listening";

  const STATUS: Record<Phase, string> = {
    idle: "Tap to start",
    listening: "I'm listening…",
    thinking: "One moment…",
    speaking: "Ava",
    readback: "Does this sound right?",
    creating: "Building your hiring workflow…",
    error: "Microphone unavailable",
  };

  // Orb is the hero: large + responsive, grows + warms while she works.
  const orbSize = vw >= 1024 ? 340 : vw >= 640 ? 300 : 248;
  const GREEN = "152 60% 45%";
  const GOLD = "38 60% 60%";
  const orb = (() => {
    switch (phase) {
      case "creating": return { scale: 1.06, glow: `drop-shadow(0 0 110px hsl(${GREEN} / 0.55))` };
      case "readback": return { scale: 1.02, glow: `drop-shadow(0 0 80px hsl(${GOLD} / 0.36)) drop-shadow(0 0 56px hsl(${GREEN} / 0.38))` };
      case "speaking": return { scale: 1.03, glow: `drop-shadow(0 0 86px hsl(${GREEN} / 0.46)) drop-shadow(0 0 44px hsl(${GOLD} / 0.22))` };
      case "listening": return { scale: 1.02, glow: `drop-shadow(0 0 76px hsl(${GREEN} / 0.42))` };
      case "thinking": return { scale: 1.0, glow: `drop-shadow(0 0 62px hsl(${GREEN} / 0.34))` };
      case "error": return { scale: 1.0, glow: "drop-shadow(0 0 40px hsl(0 50% 50% / 0.3))" };
      default: return { scale: 1.0, glow: `drop-shadow(0 0 56px hsl(${GREEN} / 0.3))` };
    }
  })();

  const OrbVisual = (
    <div aria-hidden style={{ transform: `scale(${orb.scale})`, filter: orb.glow, transition: "transform 0.8s ease, filter 0.8s ease" }}>
      <AvaOrb size={orbSize} reflection={false} amp={0.26} flow={0.72} getIntensity={getVoiceLevel} />
    </div>
  );

  // BUILD step — keep the voice session alive (BuildStep renders its own orb); nothing visible here.
  if (step === 3) return <div aria-hidden className="hidden" />;

  // REVIEW step — a compact "Ava is here" bar so she can refine the plan with the employer by voice.
  if (step === 4) {
    if (handedBack) {
      return (
        <div className="mx-auto mb-6 w-full max-w-2xl">
          <div className="flex items-center gap-3 rounded-2xl p-3.5 sm:p-4" style={PANEL}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: "hsl(var(--ck-jade) / 0.16)", color: "hsl(var(--ck-mint))" }}>
              <Check className="h-4 w-4" />
            </span>
            <p className="text-[13.5px] leading-snug" style={{ color: "hsl(var(--foreground) / 0.85)" }}>
              Ava stepped back — hit <strong style={{ color: "hsl(var(--ck-brass-bright))" }}>Publish role</strong> when you're ready.
            </p>
          </div>
        </div>
      );
    }
    const reviewStatus = !isConnected ? "Connecting…" : isSpeaking ? "Speaking" : isProcessing ? "One moment…" : "Listening";
    return (
      <div className="mx-auto mb-6 w-full max-w-2xl">
        <div className="flex items-center gap-3.5 rounded-2xl p-3.5 sm:p-4" style={PANEL}>
          <div aria-hidden className="shrink-0" style={{ filter: `drop-shadow(0 0 26px hsl(${GREEN} / 0.4))` }}>
            <AvaOrb size={56} reflection={false} amp={0.26} flow={0.72} getIntensity={getVoiceLevel} />
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "hsl(var(--ck-brass))" }}>Ava · {reviewStatus}</div>
            <p className="mt-0.5 text-[13.5px] leading-snug" style={{ color: "hsl(var(--foreground) / 0.85)" }}>
              Tell me what to change — rename a step, remove one, reorder, or say “publish it.”
            </p>
          </div>
          <button type="button" onClick={() => disconnect()} className="shrink-0 text-[12px] font-medium transition hover:opacity-80" style={{ color: "hsl(var(--muted-foreground))" }}>End voice</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
      {/* ORB — the hero + primary CTA when idle */}
      {!isConnected && !creating ? (
        <button
          type="button"
          onClick={() => connect()}
          disabled={isConnecting}
          aria-label="Start talking with Ava"
          className="group relative rounded-full outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] disabled:opacity-70"
        >
          {OrbVisual}
        </button>
      ) : (
        OrbVisual
      )}

      <span className="mt-6 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "hsl(var(--ck-brass))" }}>
        {STATUS[phase]}
      </span>

      {!isConnected && (
        <>
          <h1 className="mt-3 text-3xl leading-[1.1] sm:text-[2.6rem]" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>
            Tell Ava who you<br className="hidden sm:block" /> need to hire.
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
            Speak naturally. Ava will shape it into a hiring flow.
          </p>
        </>
      )}

      {/* Controls — secondary to the orb */}
      <div className="mt-6 flex flex-col items-center gap-3">
        {!isConnected && !creating ? (
          <>
            <button type="button" onClick={() => connect()} disabled={isConnecting} className="inline-flex items-center gap-2 text-[15px] font-semibold transition hover:opacity-80 disabled:opacity-60" style={{ color: "hsl(var(--ck-brass-bright))" }}>
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isConnecting ? "Connecting…" : "Start talking"}
            </button>
            <button type="button" onClick={onPreferType} className="inline-flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: "hsl(var(--muted-foreground))" }}>
              <Keyboard className="h-3.5 w-3.5" /> Prefer to type
            </button>
          </>
        ) : creating ? (
          <span className="inline-flex items-center gap-2 text-sm" style={{ color: "hsl(var(--ck-brass))" }}>
            <Loader2 className="h-4 w-4 animate-spin" /> Ava is building your workflow…
          </span>
        ) : (
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => disconnect()} className="text-[13px] font-medium transition hover:opacity-80" style={{ color: "hsl(var(--muted-foreground))" }}>
              End voice
            </button>
            <span style={{ color: "hsl(var(--border))" }}>·</span>
            <button type="button" onClick={onPreferType} className="inline-flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80" style={{ color: "hsl(var(--muted-foreground))" }}>
              <Keyboard className="h-3.5 w-3.5" /> Prefer to type
            </button>
          </div>
        )}
      </div>

      {/* Conversation surface — appears only when there's something to show */}
      {(error || readback || hasData || (isConnected && !creating)) && (
        <div className="mt-9 w-full text-left">
          {error ? (
            <ErrorCard message={error || ""} onPreferType={onPreferType} />
          ) : readback ? (
            <ReadbackCard brief={jobBrief} canCreate={canCreate(jobBrief)} onCreate={doCreate} onAddDetail={() => setReadback(false)} onPreferType={onPreferType} />
          ) : hasData ? (
            <BriefSummary brief={jobBrief} onPreferType={onPreferType} />
          ) : (
            <LiveCaption ref={transcriptRef} messages={messages} status={STATUS[phase]} />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- sub-views ---------- */

const PANEL = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-lg)" } as const;
const LBL = "text-[10.5px] font-semibold uppercase tracking-[0.13em]";

function SummaryRows({ brief }: { brief: JobBrief }) {
  const rows = [
    { k: "Role", v: brief.roleTitle || "" },
    { k: "Type", v: typeLabel(brief) },
    { k: "Location", v: brief.location || (brief.workMode === "remote" ? "Remote" : "") },
    { k: "Pay", v: payToText(brief.pay) },
    { k: "Start", v: brief.startDateText || "" },
  ].filter((r) => r.v); // only show what's captured — no validation chips, no "missing" noise
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.k} className="flex items-baseline gap-3">
          <span className={`${LBL} w-20 shrink-0`} style={{ color: "hsl(var(--muted-foreground))" }}>{r.k}</span>
          <span className="text-[14.5px]" style={{ color: "hsl(var(--foreground))" }}>{r.v}</span>
        </div>
      ))}
      {brief.responsibilities.length > 0 && (
        <div className="flex items-baseline gap-3">
          <span className={`${LBL} w-20 shrink-0`} style={{ color: "hsl(var(--muted-foreground))" }}>Day-to-day</span>
          <span className="text-[14px] leading-relaxed" style={{ color: "hsl(var(--foreground))" }}>{brief.responsibilities.join(" · ")}</span>
        </div>
      )}
    </div>
  );
}

function BriefSummary({ brief, onPreferType }: { brief: JobBrief; onPreferType: () => void }) {
  return (
    <div className="rounded-2xl p-5 sm:p-6" style={PANEL}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--muted-foreground))" }}>Ava's brief</span>
        <button type="button" onClick={onPreferType} className="inline-flex items-center gap-1 text-[12px] font-medium transition hover:opacity-80" style={{ color: "hsl(var(--muted-foreground))" }}>
          <Pencil className="h-3 w-3" /> Edit manually
        </button>
      </div>
      <SummaryRows brief={brief} />
    </div>
  );
}

function ReadbackCard({ brief, canCreate, onCreate, onAddDetail, onPreferType }: { brief: JobBrief; canCreate: boolean; onCreate: () => void; onAddDetail: () => void; onPreferType: () => void }) {
  const mayAsk = brief.missingCriticalFields.slice(0, 2);
  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ ...PANEL, border: "1px solid hsl(var(--primary) / 0.4)" }}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--ck-brass))" }}>Here's what I heard</div>
      <h3 className="mb-4 text-xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>{brief.roleTitle || "Your role"}</h3>
      <SummaryRows brief={brief} />
      {mayAsk.length > 0 && (
        <p className="mt-3 text-[12.5px] italic" style={{ color: "hsl(var(--muted-foreground))" }}>
          Ava may ask about {mayAsk.join(" and ").toLowerCase()} as you go.
        </p>
      )}
      <div className="mt-5 flex flex-col gap-2.5">
        <button type="button" onClick={onCreate} disabled={!canCreate} className="ck-btn ck-btn-brass inline-flex items-center justify-center gap-2 !py-3 !text-[15px] disabled:opacity-50">
          <Check className="h-4 w-4" /> Create hiring flow
        </button>
        <div className="flex items-center justify-center gap-4">
          <button type="button" onClick={onAddDetail} className="text-[13px] font-medium transition hover:opacity-80" style={{ color: "hsl(var(--muted-foreground))" }}>Add one more detail</button>
          <span style={{ color: "hsl(var(--border))" }}>·</span>
          <button type="button" onClick={onPreferType} className="inline-flex items-center gap-1 text-[13px] font-medium transition hover:opacity-80" style={{ color: "hsl(var(--muted-foreground))" }}>
            <Pencil className="h-3 w-3" /> Edit manually
          </button>
        </div>
      </div>
    </div>
  );
}

const LiveCaption = forwardRef<HTMLDivElement, { messages: Msg[]; status: string }>(
  function LiveCaption({ messages, status }, ref) {
    return (
      <div className="rounded-2xl p-5 text-center" style={{ background: "hsl(var(--card) / 0.5)", border: "1px solid hsl(var(--border))" }}>
        <div ref={ref} className="max-h-40 space-y-1.5 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-[14px]" style={{ color: "hsl(var(--muted-foreground))" }}>Go ahead — tell me about the role in your own words.</p>
          ) : (
            messages.slice(-4).map((m) => (
              <p key={m.id} className="text-[14px] leading-snug" style={{ color: m.role === "user" ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                {m.text}
              </p>
            ))
          )}
        </div>
        <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "hsl(var(--muted-foreground) / 0.7)" }}>{status}</div>
      </div>
    );
  },
);

function ErrorCard({ message, onPreferType }: { message: string; onPreferType: () => void }) {
  const denied = message?.toLowerCase().includes("permission") || message?.toLowerCase().includes("denied");
  return (
    <div className="rounded-2xl p-6" style={{ ...PANEL, border: "1px solid hsl(0 50% 50% / 0.35)" }}>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "hsl(0 60% 60%)" }} />
        <div>
          <div className="text-[15px] font-semibold" style={{ color: "hsl(var(--foreground))" }}>I couldn't reach your microphone</div>
          <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
            {denied ? "Allow mic access in your browser, or just type it instead — no problem." : "Give it another tap, or type it instead — no problem."}
          </p>
          <button type="button" onClick={onPreferType} className="ck-btn ck-btn-outline mt-3 inline-flex items-center gap-1.5 !py-2 !text-[13px]">
            <Keyboard className="h-3.5 w-3.5" /> Type it instead
          </button>
        </div>
      </div>
    </div>
  );
}
