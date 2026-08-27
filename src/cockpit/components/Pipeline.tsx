import { Check, X } from "lucide-react";
import { type PipelineNode } from "../data";
import { CountUp } from "./CountUp";

type Variant = "health" | "large" | "funnel";

interface PipelineProps {
  variant?: Variant;
  nodes?: PipelineNode[];
  className?: string;
}

const JADE = "var(--hf-green)";
const BRASS = "var(--hf-gold)";
const MUTED = "var(--hf-text-muted)";
const RED = "var(--hf-danger)";

function nodeColor(node: PipelineNode) {
  if (node.tone === "bottleneck") return BRASS;
  if (node.tone === "muted") return MUTED;
  return JADE;
}

function candColor(state: PipelineNode["state"]) {
  if (state === "done") return JADE;
  if (state === "current") return BRASS;
  if (state === "passed") return RED;
  return MUTED; // upcoming
}

/** Connected-circle pipeline motif (Deep Jade).
 *  Two modes:
 *   • aggregate (default) — each node shows a count + tone (green/bottleneck/muted).
 *   • single-candidate progress — when any node carries a `state`, the funnel
 *     tracks one applicant: jade up to and including their cleared stages, amber
 *     at their current stage, muted ahead. */
export function Pipeline({ variant = "health", nodes = [], className }: PipelineProps) {
  const candidateMode = nodes.some((n) => n.state != null);
  const bottleneckIdx = nodes.findIndex((n) => n.tone === "bottleneck");

  const circle = variant === "large" ? 56 : variant === "funnel" ? 30 : 22;
  const labelH = 22;
  const connectorTop = labelH + circle / 2 - 1;

  return (
    <div className={className} style={{ display: "flex", width: "100%" }}>
      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;

        // Connector color: aggregate mutes after the bottleneck; candidate mode
        // keeps the line jade only through stages the candidate has cleared.
        const aggSegMuted = bottleneckIdx >= 0 && i >= bottleneckIdx;
        const segColor = candidateMode ? (node.state === "done" ? JADE : MUTED) : aggSegMuted ? MUTED : JADE;
        const segOpacity = candidateMode ? (node.state === "done" ? 0.85 : 0.5) : aggSegMuted ? 0.6 : 0.85;

        const isCurrent = candidateMode && node.state === "current";
        const isBottleneck = !candidateMode && node.tone === "bottleneck";
        const pulse = isCurrent || isBottleneck;
        const color = candidateMode ? candColor(node.state) : nodeColor(node);
        const numberInside = variant === "large" && !candidateMode;

        return (
          <div key={node.key} style={{ position: "relative", flex: 1, textAlign: "center", minWidth: 0 }}>
            {/* connector to next node */}
            {!isLast && (
              <span
                aria-hidden
                className="ck-draw-x"
                style={{
                  position: "absolute",
                  left: "50%",
                  right: "-50%",
                  top: connectorTop,
                  height: 2,
                  background: segColor,
                  opacity: segOpacity,
                  ["--ck-i" as string]: i,
                }}
              />
            )}

            {/* label */}
            <div
              style={{
                height: labelH,
                fontSize: 12.5,
                color: isCurrent || isBottleneck ? BRASS : "var(--hf-text-soft)",
                fontWeight: 500,
              }}
            >
              {node.label}
            </div>

            {/* circle (pops in; current/bottleneck gently pulses) */}
            <div
              className="ck-pop"
              style={{ position: "relative", display: "flex", justifyContent: "center", ["--ck-i" as string]: i }}
            >
              <div
                className={pulse ? "ck-node-pulse" : undefined}
                style={{
                  position: "relative",
                  zIndex: 1,
                  width: circle,
                  height: circle,
                  borderRadius: 999,
                  border: `2px solid ${color}`,
                  background: "var(--hf-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: pulse ? `0 0 14px ${BRASS}55` : "none",
                }}
              >
                {numberInside && (
                  <span className="ck-num" style={{ fontSize: 22, color: color === MUTED ? "var(--hf-text)" : color }}>
                    <CountUp value={node.count} delay={120 + i * 90} />
                  </span>
                )}
                {candidateMode && variant === "large" && node.state === "done" && <Check className="h-6 w-6" style={{ color: JADE }} />}
                {candidateMode && variant === "large" && node.state === "current" && (
                  <span style={{ width: 14, height: 14, borderRadius: 999, background: BRASS, boxShadow: `0 0 10px ${BRASS}` }} />
                )}
                {candidateMode && variant === "large" && node.state === "passed" && <X className="h-6 w-6" style={{ color: RED }} />}
              </div>
            </div>

            {/* number (below) — aggregate non-large variants */}
            {!numberInside && !candidateMode && (
              <div className="ck-num" style={{ fontSize: variant === "funnel" ? 26 : 30, marginTop: 8, color: "var(--hf-text)" }}>
                <CountUp value={node.count} delay={120 + i * 90} />
              </div>
            )}

            {/* status / pct row */}
            {candidateMode ? (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  fontWeight: 600,
                  color:
                    node.state === "current"
                      ? BRASS
                      : node.state === "done"
                        ? "var(--hf-text-soft)"
                        : node.state === "passed"
                          ? RED
                          : "var(--hf-text-muted)",
                }}
              >
                {node.state === "current" ? "Now" : node.state === "done" ? "Done" : node.state === "passed" ? "Passed" : ""}
              </div>
            ) : variant === "funnel" ? (
              <>
                <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
                  <span
                    className="ck-pill"
                    style={
                      node.tone === "bottleneck"
                        ? { color: "var(--hf-surface-raised)", background: BRASS, borderColor: BRASS }
                        : { color: "var(--hf-text-soft)", background: "color-mix(in srgb, var(--hf-text-muted) 12%, transparent)", borderColor: "color-mix(in srgb, var(--hf-text-muted) 20%, transparent)" }
                    }
                  >
                    {node.pct}
                  </span>
                </div>
                {typeof node.dropOff === "number" && i > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: node.tone === "bottleneck" ? BRASS : "var(--hf-text-muted)" }}>
                    drop-off {node.dropOff}
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: node.tone === "bottleneck" ? BRASS : "var(--hf-text-muted)",
                }}
              >
                {node.pct}
              </div>
            )}

            {/* bottleneck marker for "large" (aggregate only) */}
            {!candidateMode && variant === "large" && node.tone === "bottleneck" && (
              <div style={{ marginTop: 6, fontSize: 12, color: BRASS, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span className="ck-dot ck-dot-closed" />
                Bottleneck
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default Pipeline;
