/**
 * TalkToAva — voice-primary job intake. The employer talks to Ava (OpenAI Realtime,
 * speech-to-speech, interruptible); she fills the brief live via tool calls. The same
 * brief is editable inline (override), and "prefer to type" drops to the typed form.
 * This is the default step-0 of the create-job flow; it writes the SAME briefFields.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Loader2, Mic, Square } from "lucide-react";
import { AvaOrb } from "@/components/ava/AvaOrb";
import { useAvaVoice } from "@/hooks/useAvaVoice";

const DISPLAY = "'Fraunces', serif";

export interface BriefFields {
  role: string;
  location: string;
  type: string;
  pay: string;
  start: string;
  work: string;
  openings: number;
}

interface TalkToAvaProps {
  brief: BriefFields;
  onBriefPatch: (patch: Partial<BriefFields>) => void;
  onComplete: () => void;
  onPreferType: () => void;
}

type Msg = { id: number; role: "user" | "ava"; text: string };

const FIELD_ROWS: { key: keyof BriefFields; label: string; placeholder: string }[] = [
  { key: "role", label: "Role", placeholder: "e.g. Line Cook" },
  { key: "location", label: "Location", placeholder: "City, State — or Remote" },
  { key: "type", label: "Type", placeholder: "Full-time · On-site" },
  { key: "pay", label: "Pay", placeholder: "$22/hr or Discuss at interview" },
  { key: "start", label: "Start", placeholder: "Within a few weeks" },
  { key: "work", label: "What they'll do", placeholder: "The day-to-day…" },
];

export default function TalkToAva({ brief, onBriefPatch, onComplete, onPreferType }: TalkToAvaProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const msgCounter = useRef(0);
  const avaMsgId = useRef<number | null>(null);
  const greeted = useRef(false);
  const finishing = useRef(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const onTranscript = useCallback((text: string, role: "user" | "assistant") => {
    setMessages((prev) => {
      if (role === "user") {
        avaMsgId.current = null; // next Ava delta starts a fresh bubble
        return [...prev, { id: ++msgCounter.current, role: "user", text }];
      }
      // assistant — accumulate streamed deltas into one bubble
      if (avaMsgId.current != null) {
        return prev.map((m) => (m.id === avaMsgId.current ? { ...m, text: m.text + text } : m));
      }
      const id = ++msgCounter.current;
      avaMsgId.current = id;
      return [...prev, { id, role: "ava", text }];
    });
  }, []);

  const onToolCall = useCallback(
    (toolName: string, args: any) => {
      if (toolName === "set_brief_fields" && args && typeof args === "object") {
        const patch: Partial<BriefFields> = {};
        for (const k of ["role", "location", "type", "pay", "start", "work"] as const) {
          if (typeof args[k] === "string" && args[k].trim()) patch[k] = args[k];
        }
        if (args.openings != null && !Number.isNaN(Number(args.openings))) {
          patch.openings = Math.max(1, Math.round(Number(args.openings)));
        }
        if (Object.keys(patch).length) onBriefPatch(patch);
      } else if (toolName === "finish_brief") {
        if (finishing.current) return;
        finishing.current = true;
        // onComplete advances the flow → this component unmounts → the unmount effect
        // disconnects the voice session. Give Ava's closing line a beat to play first.
        window.setTimeout(() => onComplete(), 2200);
      }
    },
    [onBriefPatch, onComplete],
  );

  const voice = useAvaVoice({ mode: "intake", currentRoute: "/jobs/create", onTranscript, onToolCall });
  const { connect, disconnect, triggerResponse, getAvaLevel, isConnected, isConnecting, isSpeaking, isListening, isProcessing, error } = voice;

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

  // Auto-scroll the transcript.
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const status = error
    ? "Mic unavailable"
    : isConnecting
    ? "Connecting…"
    : isSpeaking
    ? "Ava is speaking…"
    : isProcessing
    ? "Thinking…"
    : isConnected
    ? "Listening…"
    : "Tap to talk with Ava";

  // Orb pulse via a CSS wrapper (no AvaOrb prop changes → no WebGL re-init).
  const orbScale = isSpeaking ? 1.06 : isListening ? 1.025 : 1;
  const orbGlow = isSpeaking
    ? "drop-shadow(0 0 90px hsl(152 60% 45% / 0.55))"
    : isListening
    ? "drop-shadow(0 0 70px hsl(152 60% 45% / 0.4))"
    : "drop-shadow(0 0 50px hsl(152 60% 45% / 0.28))";

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
      {/* Left: orb + voice control */}
      <div className="flex flex-col items-center text-center">
        <div
          aria-hidden
          style={{ transform: `scale(${orbScale})`, filter: orbGlow, transition: "transform 0.4s ease, filter 0.4s ease" }}
        >
          <AvaOrb size={236} reflection={false} amp={0.26} flow={0.72} getIntensity={getAvaLevel} />
        </div>

        <span
          className="mt-5 text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "hsl(var(--ck-brass))" }}
        >
          {status}
        </span>
        <h1 className="mt-3 text-3xl leading-[1.1] sm:text-4xl" style={{ fontFamily: DISPLAY, fontWeight: 500 }}>
          Tell Ava what you're<br className="hidden sm:block" /> hiring for.
        </h1>
        <p className="mt-3 max-w-sm text-sm leading-relaxed" style={{ color: "hsl(var(--muted-foreground))" }}>
          Just talk to her like a colleague — she'll ask a couple of quick questions and build your whole hiring flow.
        </p>

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
          ) : (
            <button
              type="button"
              onClick={() => disconnect()}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium"
              style={{ background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))" }}
            >
              <Square className="h-4 w-4" /> End voice
            </button>
          )}

          <button
            type="button"
            onClick={onPreferType}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition hover:opacity-80"
            style={{ color: "hsl(var(--muted-foreground))" }}
          >
            <Keyboard className="h-3.5 w-3.5" /> Prefer to type
          </button>

          {error && (
            <p className="mt-1 max-w-xs text-[12.5px]" style={{ color: "hsl(var(--muted-foreground))" }}>
              Couldn't reach your mic — no problem, just tap <strong>Prefer to type</strong>.
            </p>
          )}
        </div>
      </div>

      {/* Right: live brief + transcript */}
      <div className="rounded-2xl p-5 sm:p-6" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", boxShadow: "var(--shadow-lg)" }}>
        <div className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "hsl(var(--muted-foreground))" }}>
          What I've got so far
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {FIELD_ROWS.map((f) => {
            const val = String(brief[f.key] ?? "");
            const filled = val.trim().length > 0;
            return (
              <div key={f.key} className={f.key === "work" ? "sm:col-span-2" : ""}>
                <label className="block text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: filled ? "hsl(var(--ck-brass))" : "hsl(var(--muted-foreground))" }}>
                  {f.label}
                </label>
                <input
                  value={val}
                  onChange={(e) => onBriefPatch({ [f.key]: e.target.value } as Partial<BriefFields>)}
                  placeholder={f.placeholder}
                  className="mt-1 w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "hsl(var(--ck-surface-2))",
                    border: `1px solid ${filled ? "hsl(var(--primary) / 0.4)" : "hsl(var(--border))"}`,
                    color: "hsl(var(--foreground))",
                  }}
                />
              </div>
            );
          })}
        </div>

        {messages.length > 0 && (
          <div
            ref={transcriptRef}
            className="mt-4 max-h-40 space-y-2 overflow-y-auto rounded-xl p-3"
            style={{ background: "hsl(var(--ck-surface-2) / 0.5)", border: "1px solid hsl(var(--border))" }}
          >
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <span
                  className="max-w-[85%] rounded-lg px-2.5 py-1.5 text-[13px] leading-snug"
                  style={
                    m.role === "user"
                      ? { background: "hsl(var(--primary) / 0.14)", color: "hsl(var(--foreground))" }
                      : { background: "hsl(var(--card))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))" }
                  }
                >
                  {m.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
