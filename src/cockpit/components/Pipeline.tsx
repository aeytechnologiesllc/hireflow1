import { type PipelineNode } from "../data";
import { CountUp } from "./CountUp";

type Variant = "health" | "large" | "funnel";

interface PipelineProps {
  variant?: Variant;
  nodes?: PipelineNode[];
  className?: string;
}

const JADE = "hsl(152 50% 50%)";
const BRASS = "hsl(38 64% 66%)";
const MUTED = "hsl(150 10% 34%)";

function nodeColor(node: PipelineNode) {
  if (node.tone === "bottleneck") return BRASS;
  if (node.tone === "muted") return MUTED;
  return JADE;
}

/** Connected-circle pipeline motif (Deep Jade). */
export function Pipeline({ variant = "health", nodes = [], className }: PipelineProps) {
  const bottleneckIdx = nodes.findIndex((n) => n.tone === "bottleneck");

  const circle = variant === "large" ? 56 : variant === "funnel" ? 30 : 22;
  const labelH = 22;
  const connectorTop = labelH + circle / 2 - 1;

  return (
    <div className={className} style={{ display: "flex", width: "100%" }}>
      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;
        // segment after this node is muted once we've passed the bottleneck
        const segMuted = bottleneckIdx >= 0 && i >= bottleneckIdx;
        const segColor = segMuted ? MUTED : JADE;
        const color = nodeColor(node);
        const ringColor = color;
        const numberInside = variant === "large";

        return (
          <div key={node.key} style={{ position: "relative", flex: 1, textAlign: "center", minWidth: 0 }}>
            {/* connector to next node — draws in from the previous node */}
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
                  opacity: segMuted ? 0.6 : 0.85,
                  ["--ck-i" as string]: i,
                }}
              />
            )}

            {/* label */}
            <div
              style={{
                height: labelH,
                fontSize: 12.5,
                color: node.tone === "bottleneck" ? BRASS : "hsl(150 10% 64%)",
                fontWeight: 500,
              }}
            >
              {node.label}
            </div>

            {/* circle (pops in; bottleneck gently pulses) */}
            <div
              className="ck-pop"
              style={{ position: "relative", display: "flex", justifyContent: "center", ["--ck-i" as string]: i }}
            >
              <div
                className={node.tone === "bottleneck" ? "ck-node-pulse" : undefined}
                style={{
                  position: "relative",
                  zIndex: 1,
                  width: circle,
                  height: circle,
                  borderRadius: 999,
                  border: `2px solid ${ringColor}`,
                  background: "hsl(156 22% 6%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: node.tone === "bottleneck" ? `0 0 14px ${BRASS}55` : "none",
                }}
              >
                {numberInside && (
                  <span className="ck-num" style={{ fontSize: 22, color: color === MUTED ? "hsl(150 20% 80%)" : color }}>
                    <CountUp value={node.count} delay={120 + i * 90} />
                  </span>
                )}
              </div>
            </div>

            {/* number (below) */}
            {!numberInside && (
              <div className="ck-num" style={{ fontSize: variant === "funnel" ? 26 : 30, marginTop: 8, color: "hsl(150 30% 92%)" }}>
                <CountUp value={node.count} delay={120 + i * 90} />
              </div>
            )}

            {/* pct */}
            {variant === "funnel" ? (
              <>
                <div style={{ marginTop: 8, display: "flex", justifyContent: "center" }}>
                  <span
                    className="ck-pill"
                    style={
                      node.tone === "bottleneck"
                        ? { color: "hsl(150 32% 11%)", background: BRASS, borderColor: BRASS }
                        : { color: "hsl(150 14% 70%)", background: "hsl(150 10% 40% / 0.12)", borderColor: "hsl(150 10% 40% / 0.2)" }
                    }
                  >
                    {node.pct}
                  </span>
                </div>
                {typeof node.dropOff === "number" && i > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: node.tone === "bottleneck" ? BRASS : "hsl(150 10% 52%)" }}>
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
                  color: node.tone === "bottleneck" ? BRASS : "hsl(150 10% 52%)",
                }}
              >
                {node.pct}
              </div>
            )}

            {/* bottleneck marker for "large" */}
            {variant === "large" && node.tone === "bottleneck" && (
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
