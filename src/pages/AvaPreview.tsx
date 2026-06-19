import AvaOrb from "@/components/AvaOrb";

// Deep Jade hero preview — verifies the real WebGL AvaOrb in HireFlow's locked
// design system (jade surface, brass accent, Fraunces serif). Throwaway preview
// route (/ava-preview) for visual sign-off before folding into Index.tsx (B3).
export default function AvaPreview() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(ellipse 90% 70% at 50% 22%, #0c1c14 0%, #070f0b 46%, #050b07 100%)",
        color: "#eef6f1",
        fontFamily: "Inter, system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "30px 20px 64px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 13,
          letterSpacing: "0.22em",
          fontWeight: 700,
        }}
      >
        HIREFLOW
        <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#1aa06a" }} />
        <span style={{ color: "rgba(238,246,241,.5)", letterSpacing: "0.18em", fontWeight: 600 }}>
          AI HIRING
        </span>
      </div>

      <div style={{ marginTop: 36, width: 300, height: 300 }}>
        <AvaOrb mode="rich" size={300} />
      </div>

      <h1
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 500,
          fontSize: "clamp(42px, 8vw, 74px)",
          lineHeight: 1.02,
          letterSpacing: "-0.02em",
          margin: "26px 0 0",
        }}
      >
        Hiring, <span style={{ fontStyle: "italic", color: "#1aa06a" }}>handled</span>.
      </h1>
      <p
        style={{
          fontSize: 17,
          lineHeight: 1.6,
          color: "rgba(238,246,241,.6)",
          maxWidth: 470,
          margin: "18px 0 0",
        }}
      >
        AVA interviews, scores and ranks every applicant — then hands you a shortlist.
        No inbox. No auto-rejections. You decide.
      </p>

      <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          style={{
            background: "#1aa06a",
            color: "#042619",
            fontWeight: 600,
            fontSize: 15,
            padding: "13px 26px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
          }}
        >
          Start hiring with AVA
        </button>
        <button
          style={{
            background: "transparent",
            color: "#eef6f1",
            fontWeight: 500,
            fontSize: 15,
            padding: "13px 24px",
            borderRadius: 999,
            border: "1px solid rgba(202,163,106,.35)",
            cursor: "pointer",
          }}
        >
          Meet AVA
        </button>
      </div>

      <div
        style={{
          marginTop: 44,
          width: "100%",
          maxWidth: 420,
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(202,163,106,.28)",
          borderRadius: 20,
          padding: 20,
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14 }}>
            Ava shortlisted <span style={{ fontFamily: "Fraunces, serif", fontWeight: 600 }}>5</span> for Senior Designer
          </div>
          <span
            style={{
              fontSize: 12,
              color: "#042619",
              background: "#1aa06a",
              fontWeight: 600,
              padding: "5px 12px",
              borderRadius: 999,
            }}
          >
            Review
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
          <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 30, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
              47
            </div>
            <div style={{ fontSize: 12, color: "rgba(238,246,241,.5)" }}>in pipeline</div>
          </div>
          <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 14, padding: "14px 16px" }}>
            <div
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 30,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
                color: "#1aa06a",
              }}
            >
              5
            </div>
            <div style={{ fontSize: 12, color: "rgba(238,246,241,.5)" }}>ready for you</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: "rgba(238,246,241,.4)" }}>
        Deep Jade · the real AvaOrb, live in WebGL
      </div>
    </div>
  );
}
