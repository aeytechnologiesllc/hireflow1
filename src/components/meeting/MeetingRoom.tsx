/**
 * MeetingRoom — the live call surface shared by both sides of an interview.
 *
 * Talks to Daily in CALL OBJECT mode only (DailyIframe.createCallObject) —
 * never their prebuilt iframe UI — and renders every pixel ourselves in
 * Paper/Ink: a letterhead-framed main stage, a local picture-in-picture, and
 * a control bar with tactile press feedback. daily-js is dynamic-imported on
 * first connect so it never rides in this route's initial chunk, let alone
 * anyone else's.
 *
 * Room credentials come from the `interview-rooms` edge function, which owns
 * the Daily REST calls (room create-or-get, meeting token mint) server-side.
 * This component only ever sees a {url, token} pair or a reason it can't
 * have one yet.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type {
  DailyCall,
  DailyEventObjectFatalError,
  DailyParticipant,
  DailyParticipantsObject,
} from "@daily-co/daily-js";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  ScreenShare,
  ScreenShareOff,
  Video,
  VideoOff,
  WifiOff,
} from "lucide-react";

export interface MeetingRoomProps {
  /** interviews.id — the room name on the Daily side is derived from this. */
  interviewId: string;
  /** How to label the local participant in the UI (kept generic — "You"). */
  selfLabel: string;
  /** How to label the other side while waiting / in their tiles. */
  otherLabel: string;
  /** Called after a clean teardown, both on the Leave button and on error "Back". */
  onLeave: () => void;
}

type RoomPhase =
  | "connecting"
  | "in-call"
  | "not-configured"
  | "not-open"
  | "error"
  | "left";

type RoomCredentials =
  | { ok: true; url: string; token: string }
  | { ok: false; kind: "not-configured" }
  | { ok: false; kind: "not-open" }
  | { ok: false; kind: "error"; message: string };

type TrackKind = "video" | "audio" | "screenVideo" | "screenAudio";

function activeTrack(
  participant: DailyParticipant | undefined,
  kind: TrackKind,
): MediaStreamTrack | null {
  const track = participant?.tracks?.[kind]?.track;
  return track instanceof MediaStreamTrack ? track : null;
}

/** Fetch this interview's {url, token} from the interview-rooms edge function,
 *  translating its non-2xx shapes into a state this component knows how to render. */
async function fetchRoomCredentials(interviewId: string): Promise<RoomCredentials> {
  const { data, error } = await supabase.functions.invoke("interview-rooms", {
    body: { interviewId },
  });

  if (!error && data?.url && data?.token) {
    return { ok: true, url: data.url as string, token: data.token as string };
  }

  let payload: any = data ?? null;
  let status: number | null = null;

  if (error) {
    const ctx = (error as { context?: Response }).context;
    status = typeof ctx?.status === "number" ? ctx.status : null;
    if (!payload && ctx && typeof ctx.clone === "function") {
      try {
        payload = await ctx.clone().json();
      } catch {
        // Non-JSON error body — fall through to error.message below.
      }
    }
  }

  const code: string | undefined = payload?.error;

  if (status === 503 || code === "video rooms not configured yet" || code === "video_not_configured") {
    return { ok: false, kind: "not-configured" };
  }
  if (code === "not_open" || code === "room_not_open") {
    return { ok: false, kind: "not-open" };
  }

  return {
    ok: false,
    kind: "error",
    message: code || error?.message || "Couldn't reach the call room",
  };
}

/** Leave-then-destroy, tolerant of a call object that's already half-gone. */
async function teardownCall(call: DailyCall) {
  try {
    const state = call.meetingState();
    if (state === "joined-meeting" || state === "joining-meeting") {
      await call.leave();
    }
  } catch {
    // Already left — nothing to do.
  }
  try {
    await call.destroy();
  } catch {
    // Already destroyed.
  }
}

function formatElapsed(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function MeetingRoom({ interviewId, selfLabel, otherLabel, onLeave }: MeetingRoomProps) {
  const [phase, setPhase] = useState<RoomPhase>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participants, setParticipants] = useState<DailyParticipantsObject | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const callRef = useRef<DailyCall | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const stageVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const screenAudioRef = useRef<HTMLAudioElement>(null);

  const refreshParticipants = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    setParticipants({ ...call.participants() });
    setMicOn(call.localAudio());
    setCamOn(call.localVideo());
  }, []);

  // Join (or re-join, on retry) — a fresh call object every attempt, torn
  // down on cleanup so a stale async connect from a superseded attempt can
  // never write state into the new one.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setPhase("connecting");
      setErrorMessage(null);

      const credentials = await fetchRoomCredentials(interviewId);
      if (cancelled) return;

      if (!credentials.ok) {
        if (credentials.kind === "error") setErrorMessage(credentials.message);
        setPhase(credentials.kind);
        return;
      }

      try {
        const { default: DailyIframe } = await import("@daily-co/daily-js");
        if (cancelled) return;

        const call = DailyIframe.createCallObject({ subscribeToTracksAutomatically: true });
        callRef.current = call;

        call.on("participant-joined", refreshParticipants);
        call.on("participant-updated", refreshParticipants);
        call.on("participant-left", refreshParticipants);
        call.on("track-started", refreshParticipants);
        call.on("track-stopped", refreshParticipants);
        call.on("left-meeting", () => {
          if (!cancelled) setPhase("left");
        });
        call.on("error", (ev) => {
          if (cancelled) return;
          const fatalType = (ev as DailyEventObjectFatalError).error?.type;
          if (fatalType === "nbf-room" || fatalType === "nbf-token") {
            setPhase("not-open");
          } else {
            setErrorMessage(ev.errorMsg || "The call was interrupted");
            setPhase("error");
          }
        });

        await call.join({ url: credentials.url, token: credentials.token, userName: selfLabel });
        if (cancelled) {
          await teardownCall(call);
          return;
        }

        startedAtRef.current = Date.now();
        refreshParticipants();
        setPhase("in-call");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Couldn't connect to the call";
        const lower = message.toLowerCase();
        if (lower.includes("nbf") || lower.includes("not yet started") || lower.includes("not started")) {
          setPhase("not-open");
        } else {
          setErrorMessage(message);
          setPhase("error");
        }
      }
    }

    run();

    return () => {
      cancelled = true;
      const call = callRef.current;
      callRef.current = null;
      if (call) teardownCall(call);
    };
  }, [attempt, interviewId, selfLabel, refreshParticipants]);

  // Elapsed timer — ticks only once actually in the call.
  useEffect(() => {
    if (phase !== "in-call") return;
    const id = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const local = participants?.local;
  const remote = participants ? Object.values(participants).find((p) => !p.local) : undefined;
  const remoteHasJoined = !!remote;

  const remoteCamTrack = activeTrack(remote, "video");
  const remoteMicTrack = activeTrack(remote, "audio");
  const remoteScreenTrack = activeTrack(remote, "screenVideo");
  const remoteScreenAudioTrack = activeTrack(remote, "screenAudio");
  const localCamTrack = activeTrack(local, "video");
  const localScreenTrack = activeTrack(local, "screenVideo");

  const isSharingScreen = !!localScreenTrack;
  const stageTrack = remoteScreenTrack || localScreenTrack;
  const stageIsScreenShare = !!stageTrack;
  const stageIsMine = stageIsScreenShare && stageTrack === localScreenTrack;

  // Bind whichever MediaStreamTrack should be on stage right now — the
  // active screen share if one exists, otherwise the remote camera.
  useEffect(() => {
    const el = stageVideoRef.current;
    if (!el) return;
    const track = stageIsScreenShare ? stageTrack : remoteCamTrack;
    el.srcObject = track ? new MediaStream([track]) : null;
  }, [stageIsScreenShare, stageTrack, remoteCamTrack]);

  useEffect(() => {
    const el = localVideoRef.current;
    if (!el) return;
    el.srcObject = localCamTrack ? new MediaStream([localCamTrack]) : null;
  }, [localCamTrack]);

  useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el) return;
    el.srcObject = remoteMicTrack ? new MediaStream([remoteMicTrack]) : null;
  }, [remoteMicTrack]);

  useEffect(() => {
    const el = screenAudioRef.current;
    if (!el) return;
    el.srcObject = remoteScreenAudioTrack ? new MediaStream([remoteScreenAudioTrack]) : null;
  }, [remoteScreenAudioTrack]);

  const toggleMic = useCallback(() => {
    callRef.current?.setLocalAudio(!micOn);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    callRef.current?.setLocalVideo(!camOn);
  }, [camOn]);

  const toggleScreenShare = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    try {
      if (isSharingScreen) {
        await call.stopScreenShare();
      } else {
        await call.startScreenShare();
      }
    } catch {
      // The user likely dismissed the OS share picker — nothing to recover.
    }
  }, [isSharingScreen]);

  const handleLeave = useCallback(async () => {
    const call = callRef.current;
    callRef.current = null;
    if (call) await teardownCall(call);
    onLeave();
  }, [onLeave]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  if (phase === "connecting") {
    return (
      <RoomStatusScreen
        icon={<Loader2 className="h-8 w-8 animate-spin text-[var(--jade-bright)]" />}
        title="Connecting…"
        body="Setting up your call room."
      />
    );
  }

  if (phase === "not-configured") {
    return (
      <RoomStatusScreen
        icon={<WifiOff className="h-8 w-8" style={{ color: "var(--amber-fg)" }} />}
        title="Video rooms aren't switched on yet"
        body="The hiring team hasn't turned on in-app video calls for this interview yet. Check back later, or use whatever meeting link they've shared."
        action={
          <button onClick={onLeave} className="ck-btn ck-btn-outline">
            Back
          </button>
        }
      />
    );
  }

  if (phase === "not-open") {
    return (
      <RoomStatusScreen
        icon={<AlertTriangle className="h-8 w-8" style={{ color: "var(--amber-fg)" }} />}
        title="This room isn't open yet"
        body="It opens shortly before the scheduled time — try again in a moment."
        action={
          <div className="flex gap-3">
            <button onClick={retry} className="ck-btn ck-btn-primary gap-2">
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
            <button onClick={onLeave} className="ck-btn ck-btn-outline">
              Back
            </button>
          </div>
        }
      />
    );
  }

  if (phase === "error") {
    return (
      <RoomStatusScreen
        icon={<AlertTriangle className="h-8 w-8 text-destructive" />}
        title="Couldn't connect"
        body={errorMessage || "Something interrupted the call."}
        action={
          <div className="flex gap-3">
            <button onClick={retry} className="ck-btn ck-btn-primary gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
            <button onClick={onLeave} className="ck-btn ck-btn-outline">
              Back
            </button>
          </div>
        }
      />
    );
  }

  if (phase === "left") {
    return (
      <RoomStatusScreen
        icon={<PhoneOff className="h-8 w-8 text-muted-foreground" />}
        title="You've left the call"
        body={`Duration: ${formatElapsed(elapsedSeconds)}`}
        action={
          <button onClick={onLeave} className="ck-btn ck-btn-primary">
            Done
          </button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${remoteHasJoined ? "bg-[var(--jade-bright)]" : "animate-pulse bg-muted-foreground/50"}`}
            aria-hidden
          />
          {remoteHasJoined ? "Connected" : `Waiting for ${otherLabel}`}
        </span>
        <span className="ck-num font-mono text-sm">{formatElapsed(elapsedSeconds)}</span>
      </div>

      {/* Main stage — letterhead-framed, remote camera or either side's screen share */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/50 bg-[var(--slab)]">
        <span
          aria-hidden
          className="absolute left-6 right-6 top-0 z-10 h-[2px] rounded-[1px]"
          style={{ background: "var(--brass-line)" }}
        />

        {stageIsScreenShare || remoteCamTrack ? (
          <video
            ref={stageVideoRef}
            autoPlay
            playsInline
            muted={stageIsMine}
            className={stageIsScreenShare ? "h-full w-full object-contain bg-black" : "h-full w-full object-cover"}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: "color-mix(in srgb, var(--jade-bright) 16%, transparent)" }}
            >
              <span className="font-display text-2xl text-[var(--jade-bright)]">
                {otherLabel.trim().slice(0, 1).toUpperCase() || "?"}
              </span>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--slab-ink)" }}>
              {remoteHasJoined ? `${otherLabel}'s camera is off` : `You're in — ${otherLabel} hasn't joined yet`}
            </p>
          </div>
        )}

        {stageIsScreenShare && (
          <span className="ck-pill absolute left-3 top-3 z-10 border-transparent bg-black/60 text-white">
            {stageIsMine ? "You're sharing your screen" : `${otherLabel} is sharing their screen`}
          </span>
        )}

        {/* Local picture-in-picture */}
        <div className="absolute bottom-3 right-3 z-10 aspect-video w-28 overflow-hidden rounded-lg border border-white/20 bg-black shadow-lg sm:w-40">
          {localCamTrack ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--slab)" }}>
              <VideoOff className="h-5 w-5" style={{ color: "var(--slab-ink-2)" }} />
            </div>
          )}
          <span className="absolute bottom-1 left-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {selfLabel}
          </span>
        </div>
      </div>

      {/* Remote audio sinks — hidden, they only carry sound */}
      <audio ref={remoteAudioRef} autoPlay />
      <audio ref={screenAudioRef} autoPlay />

      {/* Controls */}
      <div className="ck-card flex items-center justify-center gap-3 px-4 py-3">
        <RoomControlButton
          onClick={toggleMic}
          label={micOn ? "Mute microphone" : "Unmute microphone"}
          variant={micOn ? "default" : "warn"}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </RoomControlButton>
        <RoomControlButton
          onClick={toggleCam}
          label={camOn ? "Turn camera off" : "Turn camera on"}
          variant={camOn ? "default" : "warn"}
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </RoomControlButton>
        <RoomControlButton
          onClick={toggleScreenShare}
          label={isSharingScreen ? "Stop screen share" : "Share your screen"}
          variant={isSharingScreen ? "active" : "default"}
        >
          {isSharingScreen ? <ScreenShareOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
        </RoomControlButton>
        <button
          type="button"
          onClick={handleLeave}
          aria-label="Leave call"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-transform duration-150 hover:brightness-105 active:translate-y-0.5 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:active:translate-y-0"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function RoomControlButton({
  onClick,
  label,
  variant,
  children,
}: {
  onClick: () => void;
  label: string;
  variant: "default" | "warn" | "active";
  children: ReactNode;
}) {
  const variantClass =
    variant === "warn"
      ? "border-transparent bg-destructive/15 text-destructive hover:bg-destructive/20"
      : variant === "active"
        ? "border-transparent bg-[var(--jade-soft)] text-[var(--jade-soft-fg)] hover:brightness-105"
        : "border-[var(--brass-line)] bg-transparent text-muted-foreground hover:bg-muted/40";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={variant !== "default"}
      className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-150 active:translate-y-0.5 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 motion-reduce:active:translate-y-0 ${variantClass}`}
    >
      {children}
    </button>
  );
}

function RoomStatusScreen({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="ck-card ck-reveal flex flex-col items-center gap-4 px-6 py-14 text-center">
      {icon}
      <div className="space-y-1.5">
        <h2 className="font-display ck-ink text-xl text-foreground">{title}</h2>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>
      </div>
      {action}
    </div>
  );
}
