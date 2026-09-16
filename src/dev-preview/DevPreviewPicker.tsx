/**
 * Dev-preview-only. The `/__preview` picker: pick a screen, role, Day/Night
 * theme and a device width, and it renders that REAL signed-in route in an
 * iframe against offline fixture data (see fixtureClient.ts / fixtures.ts /
 * install.ts) — no sign-in, no network, no live database.
 *
 * The iframe loads the app fresh at the target path with `?__preview=1`,
 * which is what src/main.tsx's DEV-only bootstrap checks before installing
 * the fixture client — so every screen here runs through the exact same
 * routes, layouts and hooks production does.
 */
import { useMemo, useState } from "react";
import { PREVIEW_SCREENS, PREVIEW_SCREEN_GROUPS, type PreviewScreen } from "./screens";
import type { PreviewRole } from "./install";

type ThemeChoice = "light" | "dark";
type WidthChoice = "phone" | "pane" | "desktop";

const WIDTHS: Record<WidthChoice, { width: number | null; label: string }> = {
  phone: { width: 390, label: "Phone (390px)" },
  pane: { width: 820, label: "Pane (820px)" },
  desktop: { width: null, label: "Desktop" },
};

function buildIframeSrc(screen: PreviewScreen, role: PreviewRole, theme: ThemeChoice): string {
  const [path, existingQuery] = screen.path.split("?");
  const params = new URLSearchParams(existingQuery ?? "");
  params.set("__preview", "1");
  params.set("__previewRole", role);
  params.set("__previewTheme", theme);
  return `${path}?${params.toString()}`;
}

export default function DevPreviewPicker() {
  const [selectedId, setSelectedId] = useState(PREVIEW_SCREENS[0].id);
  const selected = useMemo(() => PREVIEW_SCREENS.find((s) => s.id === selectedId) ?? PREVIEW_SCREENS[0], [selectedId]);
  const [roleOverride, setRoleOverride] = useState<PreviewRole | "auto">("auto");
  const [theme, setTheme] = useState<ThemeChoice>("light");
  const [widthChoice, setWidthChoice] = useState<WidthChoice>("desktop");
  const [reloadKey, setReloadKey] = useState(0);

  const role: PreviewRole = roleOverride === "auto" ? selected.role : roleOverride;
  const iframeSrc = buildIframeSrc(selected, role, theme);
  const widthPx = WIDTHS[widthChoice].width;

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f3efe6", fontFamily: "system-ui, sans-serif" }}>
      <aside
        style={{
          width: 320,
          flexShrink: 0,
          overflowY: "auto",
          borderRight: "1px solid #d8d0bd",
          background: "#fbf9f3",
          padding: "16px",
        }}
      >
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>HireFlow dev preview</h1>
        <p style={{ fontSize: 12, color: "#75705f", margin: "0 0 16px" }}>
          Dev-only. Fixture data, no network, no sign-in. See docs/DEV-PREVIEW.md.
        </p>

        <Control label="Theme">
          <Segmented
            value={theme}
            onChange={(v) => setTheme(v as ThemeChoice)}
            options={[{ value: "light", label: "Day" }, { value: "dark", label: "Night" }]}
          />
        </Control>

        <Control label="Width">
          <Segmented
            value={widthChoice}
            onChange={(v) => setWidthChoice(v as WidthChoice)}
            options={(Object.keys(WIDTHS) as WidthChoice[]).map((w) => ({ value: w, label: WIDTHS[w].label }))}
          />
        </Control>

        <Control label="Role (overrides screen default)">
          <select
            value={roleOverride}
            onChange={(e) => setRoleOverride(e.target.value as PreviewRole | "auto")}
            style={selectStyle}
          >
            <option value="auto">Auto ({selected.role})</option>
            <option value="employer">Employer</option>
            <option value="team_member">Team member</option>
            <option value="candidate">Candidate</option>
            <option value="rejected_candidate">Candidate (rejected)</option>
          </select>
        </Control>

        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          style={{ ...selectStyle, cursor: "pointer", marginBottom: 16, fontWeight: 600 }}
        >
          Reload screen
        </button>

        {PREVIEW_SCREEN_GROUPS.map((group) => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "#8c8570", margin: "0 0 6px" }}>
              {group}
            </div>
            {PREVIEW_SCREENS.filter((s) => s.group === group).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 8px",
                  marginBottom: 2,
                  borderRadius: 6,
                  border: "none",
                  background: s.id === selectedId ? "#e4ddc9" : "transparent",
                  fontSize: 13,
                  cursor: "pointer",
                  color: "#3a352a",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "8px 16px", borderBottom: "1px solid #d8d0bd", fontSize: 12, color: "#5b5646", background: "#fbf9f3" }}>
          <strong>{selected.label}</strong> — role: {role} — <code>{iframeSrc}</code>
        </div>
        <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: widthPx ? "center" : "stretch", background: "#e9e4d6" }}>
          <iframe
            key={`${iframeSrc}-${reloadKey}`}
            title="HireFlow dev preview"
            src={iframeSrc}
            style={{
              border: widthPx ? "1px solid #cfc7b0" : "none",
              width: widthPx ? `${widthPx}px` : "100%",
              height: "100%",
              background: "#fff",
            }}
          />
        </div>
      </main>
    </div>
  );
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#75705f", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div style={{ display: "flex", border: "1px solid #d8d0bd", borderRadius: 6, overflow: "hidden" }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: "6px 4px",
            fontSize: 12,
            border: "none",
            cursor: "pointer",
            background: value === opt.value ? "#3a352a" : "#fff",
            color: value === opt.value ? "#fff" : "#3a352a",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  fontSize: 13,
  borderRadius: 6,
  border: "1px solid #d8d0bd",
  background: "#fff",
  color: "#3a352a",
};
