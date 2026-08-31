/**
 * FlowLab — walk the whole create-job flow, Day and Night, in lockstep.
 *
 * Built because reviewing this flow meant clicking through six steps, then
 * flipping the theme in localStorage and clicking through all six again — and
 * the publish screen at the end was the hardest to reach and therefore the
 * least looked at.
 *
 * Both panes are real instances of the flow, not screenshots. `.dark` is a
 * class selector and every token is defined under `:root` / `.dark`, so
 * wrapping one pane in `.dark` re-scopes the entire palette for that subtree
 * only. One step control drives both, so Day and Night are always showing the
 * same moment.
 *
 * Dev-only route: /flow-lab. `import.meta.env.DEV` folds to false in a
 * production build, so neither the route nor this chunk ships.
 */
import { useEffect, useState } from "react";
import AvaFlowPreview from "./AvaFlowPreview";
import TalkToAva from "@/components/ava/createFlow/TalkToAva";

const STEPS = ["Brief", "Follow-ups", "Rigor", "Ava builds", "Review plan", "Publish"] as const;

/** The voice intake screen. It is the REAL flow's default entry (inputMode
 *  starts as "voice"), but the prototype has no voice mode, so it never showed
 *  up in the lab. Rendered here in its idle state — it only opens a session on
 *  click, so nothing is spent just looking at it. */
const VOICE = -1;
const noop = () => {};
function TalkToAvaPane() {
  // Display-only, deliberately. This mounts the REAL voice component, and its
  // "Start talking" button opens a paid OpenAI Realtime session — the same
  // spend the /interview/voice gate was added to stop. The lab is reachable in
  // production so it can be reviewed from a phone, which means anyone can open
  // it, so this one pane is inert: look at it, don't run it. Every other pane
  // stays fully interactive because the prototype costs nothing to click.
  return (
    <div className="relative flex min-h-[560px] flex-col justify-center px-6 py-10"
         style={{ background: "hsl(var(--background))", color: "hsl(var(--foreground))", pointerEvents: "none", userSelect: "none" }}
         aria-hidden>
      <TalkToAva
        step={0}
        planVisible={false}
        brief={{ role: "Caf\u00e9 Manager", location: "Maria's Caf\u00e9 \u00b7 Austin, TX", type: "Full-time \u00b7 On-site", pay: "$24\u201328 / hr", start: "Within a few weeks", work: "Run daily operations, lead a small team, own the till and open/close.", openings: 1 }}
        reviewCards={[]}
        onBriefPatch={noop}
        onComplete={noop}
        onPreferType={noop}
        onEditPhase={noop}
        onRemovePhase={noop}
        onReorderPhases={noop}
        onConfirmPublish={noop}
      />
    </div>
  );
}
const WIDTHS = [
  { label: "Phone · 390", px: 390 },
  { label: "Pane · 820", px: 820 },
  { label: "Desktop · 1440", px: 1440 },
] as const;
type Mode = "both" | "day" | "night";

export default function FlowLab() {
  // Custom properties INHERIT. If `.dark` is on <html> (the app's own theme
  // switch puts it there), a pane without the class still inherits every dark
  // value and the "Day" pane renders dark. So the lab pins the document to
  // light and lets the Night pane's own `.dark` class override downward —
  // overriding is scoped, inheriting is not.
  useEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => {
      if (had) root.classList.add("dark");
    };
  }, []);

  const [step, setStep] = useState(0);
  const [width, setWidth] = useState<number>(820);
  const [mode, setMode] = useState<Mode>("both");

  const panes: Array<{ key: Mode; label: string; dark: boolean }> =
    mode === "both"
      ? [
          { key: "day", label: "Day · Paper", dark: false },
          { key: "night", label: "Night · Ink", dark: true },
        ]
      : mode === "day"
        ? [{ key: "day", label: "Day · Paper", dark: false }]
        : [{ key: "night", label: "Night · Ink", dark: true }];

  const btn = (on: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    border: `1px solid ${on ? "#0F6B4F" : "#D6CDB6"}`,
    background: on ? "#0F6B4F" : "#FCFAF4",
    color: on ? "#F0EBDF" : "#3F4B45",
  });

  return (
    <div style={{ minHeight: "100dvh", background: "#7a7368", padding: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Controls live outside both panes, so they never inherit either theme. */}
      <div
        style={{
          position: "sticky", top: 0, zIndex: 50, display: "flex", flexWrap: "wrap",
          alignItems: "center", gap: 14, padding: "12px 14px", marginBottom: 16,
          borderRadius: 12, background: "#FCFAF4", border: "1px solid #D6CDB6",
          boxShadow: "0 8px 24px -12px rgba(0,0,0,.5)",
        }}
      >
        <strong style={{ fontSize: 13, color: "#14201B" }}>Flow lab</strong>

        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" style={btn(step === VOICE)} onClick={() => setStep(VOICE)}>
            0. Talk to Ava
          </button>
          {STEPS.map((label, i) => (
            <button key={label} type="button" style={btn(step === i)} onClick={() => setStep(i)}>
              {i + 1}. {label}
            </button>
          ))}
        </span>

        <span style={{ width: 1, height: 22, background: "#D6CDB6" }} />

        <span style={{ display: "flex", gap: 6 }}>
          {(["both", "day", "night"] as Mode[]).map((m) => (
            <button key={m} type="button" style={btn(mode === m)} onClick={() => setMode(m)}>
              {m === "both" ? "Both" : m === "day" ? "Day" : "Night"}
            </button>
          ))}
        </span>

        <span style={{ width: 1, height: 22, background: "#D6CDB6" }} />

        <span style={{ display: "flex", gap: 6 }}>
          {WIDTHS.map((w) => (
            <button key={w.px} type="button" style={btn(width === w.px)} onClick={() => setWidth(w.px)}>
              {w.label}
            </button>
          ))}
        </span>

        <span style={{ marginLeft: "auto", fontSize: 11, color: "#5C655E" }}>
          {step === VOICE
            ? "Voice intake is display-only here — starting a session costs money."
            : "Both panes are live — the buttons inside them work too."}
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", overflowX: "auto", paddingBottom: 24 }}>
        {panes.map((pane) => (
          <div key={pane.key} style={{ flex: "0 0 auto" }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#fff", opacity: .85, marginBottom: 8 }}>
              {pane.label} · {step === VOICE ? "Talk to Ava (voice intake)" : `step ${step + 1} of ${STEPS.length}`} · {width}px
            </div>
            {/* The theme scope. Everything inside reads this subtree's tokens. */}
            <div
              className={pane.dark ? "dark" : undefined}
              style={{ width, borderRadius: 12, overflow: "hidden", boxShadow: "0 20px 50px -20px rgba(0,0,0,.65)" }}
            >
              {step === VOICE ? <TalkToAvaPane /> : <AvaFlowPreview externalStep={step} embedded />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
