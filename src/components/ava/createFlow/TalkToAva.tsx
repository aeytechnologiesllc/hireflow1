/**
 * TalkToAva — voice-primary, conversational job creation. Ava (OpenAI Realtime,
 * interruptible speech-to-speech) listens, extracts a structured JobBrief, reads it
 * back for confirmation, then hands off to the EXISTING build pipeline. The screen
 * stops feeling like a form: orb-led, minimal, with a live caption → premium summary
 * → readback card. Typed form stays one tap away ("Prefer to type").
 */
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Keyboard, Loader2, Mic, Pencil, Square } from "lucide-react";
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

type Phase = "idle" | "listening" | "thinking" | "asking_followup" | "readback" | "creating" | "error";
type Msg = { id: number; role: "user" | "ava"; text: string };

interface TalkToAvaProps {
  brief: { role: string; location: string; type: string; pay: string; start: string; work: string; openings: number };
  onBriefPatch: (patch: Partial<BriefFormPayload>) => void;
  onComplete: (payload: BriefFormPayload) => void;
  onPreferType: () => void;
}

export default function TalkToAva({ onBriefPatch, onComplete, onPreferType }: TalkToAvaProps) {
  const [jobBrief, setJobBrief] = useState<JobBrief>(emptyJobBrief);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [readback, setReadback] = useState(false);
  const [creating, setCreating] = useState(false);

  const msgCounter = useRef(0);
  const avaMsgId = useRef<number | null>(null);
  const greeted = useRef(false);
  const finishing = useRef(false);
  const jobBriefRef = useRef(jobBrief);
  jobBriefRef.current = jobBrief;
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const onTranscript = useCallback((text: string, role: "user" | "assistant") => {
    if (role === "user") {
      setJobBrief((b) => ({ ...b, rawTranscript: (b.rawTranscript + " " + text).trim() }));
    }
    setMessages((prev) => {
      if (role === "user") {
        avaMsgId.current = null;
        return [...prev, { id: ++msgCounter.current, role: "user", text }];
      }
      if (avaMsgId.current != null) {
        return prev.map((m) => (m.id === avaMsgId.current ? { ...m, text: m.text + text } : m));
      }
      const id = ++msgCounter.current;
      avaMsgId.current = id;
      return [...prev, { id, role: "ava", text }];
    });
  }, []);

  const doCreate = useCallback(() => {
    const b = jobBriefRef.current;
    if (finishing.current || !canCreate(b)) return;
    finishing.current = true;
    setCreating(true);
    // Let Ava's confirmation land, then hand off to the existing build pipeline (unmounts this).
    window.setTimeout(() => onComplete(mapJobBriefToFormPayload(b)), 700);
  }, [onComplete]);

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
      }
    },
    [onBriefPatch, doCreate],
  );

  const voice = useAvaVoice({ mode: "intake", currentRoute: "/jobs/create", onTranscript, onToolCall });
  const { connect, disconnect, triggerResponse, getVoiceLevel, isConnected, isConnecting, isListening, isSpeaking, isProcessing, error } = voice;

  // Ava greets first once the realtime channel is live.
  useEffect(() => {
    if (isConnected && !greeted.current) {
      greeted.current = true;
      const t = window.setTimeout(() => triggerResponse(), 350);
      return () => window.clearTimeout(t);
    }
  }, [isConnected, triggerResponse]);

  // Disconnect on unmount.
  useEffect(() => () => { try { disconnect(); } catch { /* no-op */ } }, [disconnect]);

  // Auto-scroll the live caption.
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const hasData = briefHasAnyData(jobBrief);
  const phase: Phase = creating
    ? "creating"
    : error
    ? "error"
    : !isConnected
    ? "idle"
    : readback
    ? "readback"
    : isListening
    ? "listening"
    : isProcessing
    ? "thinking"
    : isSpeaking
    ? "asking_followup"
    : "listening"; // connected + quiet → still listening (server VAD is always on)

  const STATUS: Record<Phase, string> = {
    idle: "Tap to talk with Ava",
    listening: "I'm listening…",
    thinking: "Building the role brief…",
    asking_followup: "Ava is speaking…",
    readback: "Does this sound right?",
    creating: "Building your hiring workflow…",
    error: "Microphone unavailable",
  };

  // Orb wrapper pulse per phase (the mesh also reacts to live voice via getVoiceLevel).
  const orb = (() => {
    switch (phase) {
      case "creating": return { scale: 1.1, glow: "drop-shadow(0 0 110px hsl(152 60% 45% / 0.6))" };
      case "readback": return { scale: 1.03, glow: "drop-shadow(0 0 90px hsl(38 60% 60% / 0.4)) drop-shadow(0 0 60px hsl(152 60% 45% / 0.4))" };
      case "listening": return { scale: 1.025, glow: "drop-shadow(0 0 80px hsl(152 60% 45% / 0.45))" };
      case "asking_followup": return { scale: 1.05, glow: "drop-shadow(0 0 90px hsl(152 60% 45% / 0.5))" };
      case "thinking": return { scale: 1.0, glow: "drop-shadow(0 0 70px hsl(152 60% 45% / 0.38))" };
      case "error": return { scale: 1.0, glow: "drop-shadow(0 0 40px hsl(0 50% 50% / 0.3))" };
      default: return { scale: 1.0, glow: "drop-shadow(0 0 50px hsl(152 60% 45% / 0.28))" };
    }
  })();

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
      {/* Left — orb + voice control */}
      <div className="flex flex-col items-center text-center">
        <div
          aria-hidden
          style={{ transform: `scale(${orb.scale})`, filter: orb.glow, transition: "transform 0.45s ease, filter 0.45s ease" }}
        >
          <AvaOrb size={236} reflection={false} amp={0.26} flow={0.72} getIntensity={getVoiceLevel} />
        </div>

        <span className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: "hsl(var(--ck-brass))" }}>
          {STATUS[phase]}
        </span>
        <h1 className="mt-3 text-3xl leading-[1.1] sm:text-4xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>
          Tell Ava what you're<br className="hidden sm:block" /> hiring for.
        </h1>
        {!isConnected && (
          <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
            Say it naturally — role, pay, location, the day-to-day. Ava turns it into a hiring flow.
          </p>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          {!isConnected ? (
            <button
              type="button"
              onClick={() => connect()}
              disabled={isConnecting}
              className="ck-btn ck-btn-brass inline-flex items-center justify-center gap-2 !px-6 !py-3.5 !text-[15px] disabled:opacity-60"
            >
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {isConnecting ? "Connecting…" : "Talk to Ava"}
            </button>
          ) : !creating ? (
            <button
              type="button"
              onClick={() => disconnect()}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium"
              style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))" }}
            >
              <Square className="h-4 w-4" /> End voice
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm" style={{ color: "hsl(var(--ck-brass))" }}>
              <Loader2 className="h-4 w-4 animate-spin" /> Ava is building your workflow…
            </span>
          )}

          {!creating && (
            <button
              type="button"
              onClick={onPreferType}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80"
              style={{ color: "hsl(var(--muted-foreground))" }}
            >
              <Keyboard className="h-3.5 w-3.5" /> Prefer to type
            </button>
          )}
        </div>
      </div>

      {/* Right — conversation surface (caption / summary / readback / error) */}
      <div className="min-h-[260px]">
        {phase === "error" ? (
          <ErrorCard onPreferType={onPreferType} message={error || ""} />
        ) : readback ? (
          <ReadbackCard
            brief={jobBrief}
            canCreate={canCreate(jobBrief)}
            onCreate={doCreate}
            onAddDetail={() => setReadback(false)}
            onPreferType={onPreferType}
          />
        ) : hasData ? (
          <BriefSummary brief={jobBrief} onPreferType={onPreferType} />
        ) : (
          <LiveCaption ref={transcriptRef} messages={messages} connected={isConnected} status={STATUS[phase]} />
        )}
      </div>
    </div>
  );
}

/* ---------- sub-views ---------- */

const PANEL = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-lg)" } as const;
const label = "text-[10.5px] font-semibold uppercase tracking-[0.13em]";

function SummaryRows({ brief }: { brief: JobBrief }) {
  const rows: { k: string; v: string }[] = [
    { k: "Role", v: brief.roleTitle || "" },
    { k: "Type", v: typeLabel(brief) },
    { k: "Location", v: brief.location || (brief.workMode === "remote" ? "Remote" : "") },
    { k: "Pay", v: payToText(brief.pay) },
    { k: "Start", v: brief.startDateText || "" },
  ];
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.k} className="flex items-baseline gap-3">
          <span className={`${label} w-20 shrink-0`} style={{ color: "hsl(var(--muted-foreground))" }}>{r.k}</span>
          <span className="text-[14.5px]" style={{ color: r.v ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground) / 0.5)" }}>
            {r.v || "—"}
          </span>
        </div>
      ))}
      {brief.responsibilities.length > 0 && (
        <div className="flex items-baseline gap-3">
          <span className={`${label} w-20 shrink-0`} style={{ color: "hsl(var(--muted-foreground))" }}>Day-to-day</span>
          <span className="text-[14px] leading-relaxed" style={{ color: "hsl(var(--foreground))" }}>
            {brief.responsibilities.join(" · ")}
          </span>
        </div>
      )}
      {brief.missingCriticalFields.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-2 pt-1">
          <span className={label} style={{ color: "hsl(var(--ck-brass))" }}>Still need</span>
          {brief.missingCriticalFields.map((m) => (
            <span key={m} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "hsl(var(--ck-surface-2))", border: "1px solid hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              {m}
            </span>
          ))}
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
  return (
    <div className="rounded-2xl p-5 sm:p-6" style={{ ...PANEL, border: "1px solid hsl(var(--primary) / 0.4)" }}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--ck-brass))" }}>Here's what I heard</div>
      <h3 className="mb-4 text-xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>{brief.roleTitle || "Your role"}</h3>
      <SummaryRows brief={brief} />
      <div className="mt-5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onCreate}
          disabled={!canCreate}
          className="ck-btn ck-btn-brass inline-flex items-center justify-center gap-2 !py-3 !text-[15px] disabled:opacity-50"
        >
          <Check className="h-4 w-4" /> Create hiring flow
        </button>
        <div className="flex items-center justify-center gap-4">
          <button type="button" onClick={onAddDetail} className="text-[13px] font-medium transition hover:opacity-80" style={{ color: "hsl(var(--muted-foreground))" }}>
            Add one more detail
          </button>
          <span style={{ color: "hsl(var(--border))" }}>·</span>
          <button type="button" onClick={onPreferType} className="inline-flex items-center gap-1 text-[13px] font-medium transition hover:opacity-80" style={{ color: "hsl(var(--muted-foreground))" }}>
            <Pencil className="h-3 w-3" /> Edit manually
          </button>
        </div>
      </div>
    </div>
  );
}

const LiveCaption = forwardRef<HTMLDivElement, { messages: Msg[]; connected: boolean; status: string }>(
  function LiveCaption({ messages, connected, status }, ref) {
    if (!connected) {
      return (
        <div className="flex h-full min-h-[220px] items-center justify-center rounded-2xl p-6 text-center" style={{ background: "hsl(var(--card) / 0.4)", border: "1px dashed hsl(var(--border))" }}>
          <p className="max-w-xs text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
            Ava's brief will appear here as you talk.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-2xl p-5 sm:p-6" style={PANEL}>
        <span className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--muted-foreground))" }}>{status}</span>
        <div ref={ref} className="mt-3 max-h-56 space-y-2 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-[14px]" style={{ color: "hsl(var(--muted-foreground))" }}>Go ahead — describe the role in your own words.</p>
          ) : (
            messages.slice(-6).map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <span
                  className="max-w-[88%] rounded-lg px-2.5 py-1.5 text-[13.5px] leading-snug"
                  style={m.role === "user" ? { background: "hsl(var(--primary) / 0.14)", color: "hsl(var(--foreground))" } : { color: "hsl(var(--muted-foreground))" }}
                >
                  {m.text}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  },
);

function ErrorCard({ message, onPreferType }: { message: string; onPreferType: () => void }) {
  return (
    <div className="rounded-2xl p-6" style={{ ...PANEL, border: "1px solid hsl(0 50% 50% / 0.35)" }}>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "hsl(0 60% 60%)" }} />
        <div>
          <div className="text-[15px] font-semibold" style={{ color: "hsl(var(--foreground))" }}>I couldn't reach your microphone</div>
          <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
            {message?.toLowerCase().includes("permission") || message?.toLowerCase().includes("denied")
              ? "Allow mic access in your browser, or just type it instead — no problem."
              : "Give it another tap, or type it instead — no problem."}
          </p>
          <button type="button" onClick={onPreferType} className="ck-btn ck-btn-outline mt-3 inline-flex items-center gap-1.5 !py-2 !text-[13px]">
            <Keyboard className="h-3.5 w-3.5" /> Type it instead
          </button>
        </div>
      </div>
    </div>
  );
}
