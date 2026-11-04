/**
 * Background effects for the interview call (the owner, 2026-11-04: "blur
 * the background or add a different one, premium, like the newer ones";
 * then: "it should be there before you get into the call", "real ones, like
 * an office", "hover to see it"). Daily's own video processors, wherever the
 * browser can run them (supportsVideoProcessing: desktop browsers, not an
 * iPhone). The choice is remembered on this browser and put back at the
 * next call. Pictures: public/call-backgrounds (CREDITS.md).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DailyCall } from "@daily-co/daily-js";

export type BackgroundChoice =
  | "none"
  | "blur-light"
  | "blur-strong"
  | "office"
  | "loft"
  | "home-office"
  | "library"
  | "living-room"
  | "lounge"
  | "studio"
  | "sage-studio"
  | "deep-green"
  | "warm-office";

interface BackgroundOption {
  id: BackgroundChoice;
  label: string;
  /** A picture background: /call-backgrounds/<id>.jpg, thumbnail <id>-thumb.jpg. */
  picture?: boolean;
}

export const BACKGROUNDS: readonly BackgroundOption[] = [
  { id: "none", label: "None" },
  { id: "blur-light", label: "Soft blur" },
  { id: "blur-strong", label: "Blur" },
  { id: "office", label: "Office", picture: true },
  { id: "loft", label: "Loft", picture: true },
  { id: "home-office", label: "Home office", picture: true },
  { id: "library", label: "Library", picture: true },
  { id: "living-room", label: "Living room", picture: true },
  { id: "lounge", label: "Lounge", picture: true },
  { id: "studio", label: "Studio", picture: true },
  { id: "sage-studio", label: "Sage", picture: true },
  { id: "deep-green", label: "Green", picture: true },
  { id: "warm-office", label: "Warm", picture: true },
];

const KEY = "hf-call-background";

export function readBackground(): BackgroundChoice {
  try {
    const saved = window.localStorage.getItem(KEY);
    return BACKGROUNDS.some((b) => b.id === saved) ? (saved as BackgroundChoice) : "none";
  } catch {
    return "none";
  }
}

export function saveBackground(choice: BackgroundChoice): void {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    // Not remembered: it still applies to this call.
  }
}

/** Daily's video processor for a choice. */
export function processorFor(choice: BackgroundChoice) {
  if (choice === "blur-light") return { type: "background-blur" as const, config: { strength: 0.45 } };
  if (choice === "blur-strong") return { type: "background-blur" as const, config: { strength: 1 } };
  if (BACKGROUNDS.find((b) => b.id === choice)?.picture) {
    return { type: "background-image" as const, config: { source: `${window.location.origin}/call-backgrounds/${choice}.jpg` } };
  }
  return { type: "none" as const };
}

/**
 * The tiles. Hovering a tile shows it on your picture at once (onPreview);
 * leaving the tiles puts your choice back; a click (a tap on a phone) keeps it.
 */
export function BackgroundPicker({
  value,
  onPreview,
  onChoose,
}: {
  value: BackgroundChoice;
  onPreview: (choice: BackgroundChoice | null) => void;
  onChoose: (choice: BackgroundChoice) => void;
}) {
  const timer = useRef<number | null>(null);
  // A short wait, so sweeping the mouse across the row does not start a
  // dozen effects.
  const preview = (choice: BackgroundChoice | null) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onPreview(choice), choice === null ? 0 : 140);
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" onMouseLeave={() => preview(null)}>
      {BACKGROUNDS.map((b) => {
        const on = value === b.id;
        return (
          <button
            key={b.id}
            type="button"
            onMouseEnter={() => preview(b.id)}
            onFocus={() => preview(b.id)}
            onClick={() => onChoose(b.id)}
            aria-pressed={on}
            title={b.label}
            className="group flex flex-col items-center gap-1 text-[11px] font-medium text-muted-foreground transition-transform duration-150 hover:-translate-y-0.5 active:scale-95 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <span
              className="relative block aspect-video w-full overflow-hidden rounded-lg border transition-shadow duration-150 group-hover:shadow-md"
              style={{
                borderColor: on ? "var(--action)" : "var(--line-soft)",
                boxShadow: on ? "0 0 0 2px var(--action)" : undefined,
                background: b.picture
                  ? `center / cover no-repeat url(/call-backgrounds/${b.id}-thumb.jpg)`
                  : "linear-gradient(135deg, var(--surface-2), var(--line-soft))",
              }}
            >
              {!b.picture && (
                <span className="absolute inset-0 flex items-center justify-center gap-1" aria-hidden>
                  {b.id === "none" ? (
                    <span className="text-[10px]" style={{ color: "var(--ink-2)" }}>
                      Off
                    </span>
                  ) : (
                    [0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-2 w-2 rounded-full"
                        style={{ background: "var(--ink-2)", filter: `blur(${b.id === "blur-light" ? 1 : 2.5}px)` }}
                      />
                    ))
                  )}
                </span>
              )}
            </span>
            <span className="truncate" style={{ color: on ? "var(--ink)" : undefined }}>
              {b.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The background, chosen and seen before joining (the owner, 2026-11-04: "it
 * should be there before you get into the call so I can set it up"). Where
 * the browser can run Daily's video processors, a short-lived Daily camera
 * shows your picture with the background on it; hovering a tile shows that
 * one. It is closed before the call starts, which puts the saved choice back
 * on its own camera (MeetingRoom). Where it cannot run, nothing changes.
 */
export function useBackgroundPreview(active: boolean) {
  const [supported, setSupported] = useState(false);
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [choice, setChoice] = useState<BackgroundChoice>(() => readBackground());
  const callRef = useRef<DailyCall | null>(null);
  const choiceRef = useRef(choice);
  choiceRef.current = choice;

  useEffect(() => {
    let cancelled = false;
    import("@daily-co/daily-js")
      .then(({ default: DailyIframe }) => {
        if (!cancelled) setSupported(!!DailyIframe.supportedBrowser()?.supportsVideoProcessing);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active || !supported) return;
    let cancelled = false;
    (async () => {
      try {
        const { default: DailyIframe } = await import("@daily-co/daily-js");
        if (cancelled) return;
        const call = DailyIframe.createCallObject({ startAudioOff: true });
        callRef.current = call;
        const refresh = () => {
          const t = call.participants()?.local?.tracks?.video as { state?: string; track?: unknown; persistentTrack?: unknown } | undefined;
          const live = t?.state === "playable" ? (t.persistentTrack ?? t.track) : null;
          setTrack(live instanceof MediaStreamTrack ? live : null);
        };
        call.on("track-started", refresh);
        call.on("track-stopped", refresh);
        call.on("participant-updated", refresh);
        await call.startCamera({ startAudioOff: true });
        if (cancelled) return;
        if (choiceRef.current !== "none") {
          await call.updateInputSettings({ video: { processor: processorFor(choiceRef.current) } });
        }
        refresh();
      } catch {
        // No background preview: the plain picture stays.
        setTrack(null);
      }
    })();
    return () => {
      cancelled = true;
      const call = callRef.current;
      callRef.current = null;
      setTrack(null);
      if (call) void call.destroy().catch(() => {});
    };
  }, [active, supported]);

  const show = useCallback((preview: BackgroundChoice | null) => {
    void callRef.current?.updateInputSettings({ video: { processor: processorFor(preview ?? choiceRef.current) } }).catch(() => {});
  }, []);
  const choose = useCallback(
    (next: BackgroundChoice) => {
      setChoice(next);
      saveBackground(next);
      show(next);
    },
    [show],
  );
  /** Closes the preview camera before the call opens its own (Daily allows one at a time). */
  const stop = useCallback(async () => {
    const call = callRef.current;
    callRef.current = null;
    setTrack(null);
    if (call) await call.destroy().catch(() => {});
  }, []);

  return { supported, track, choice, show, choose, stop };
}
