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
import { createPortal } from "react-dom";
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
  Settings2,
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
  /** Join with the camera / microphone off (the join screen's own switches). */
  startCamOff?: boolean;
  startMicOff?: boolean;
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
  // Only a track Daily says is playable, and its persistentTrack (stable
  // across mutes): bound while still "loading", a phone's camera stayed
  // black until it was turned off and on again (the owner, 2026-11-04).
  const info = participant?.tracks?.[kind] as { state?: string; track?: unknown; persistentTrack?: unknown } | undefined;
  if (!info || info.state !== "playable") return null;
  const track = info.persistentTrack ?? info.track;
  return track instanceof MediaStreamTrack ? track : null;
}

/** Bind a track to a media element and start it (iOS needs the explicit play()). */
function bindTrack(el: HTMLMediaElement | null, track: MediaStreamTrack | null) {
  if (!el) return;
  const current = el.srcObject instanceof MediaStream ? el.srcObject.getTracks()[0] : null;
  if (current !== track) el.srcObject = track ? new MediaStream([track]) : null;
  if (track) void el.play().catch(() => {});
}

/**
 * How loud a microphone track is right now, 0-1, measured in the page
 * itself (Web Audio). Daily's own level observers sent nothing on the
 * owner's phone, so the bars stood still (2026-11-04).
 */
function useTrackLevel(track: MediaStreamTrack | null): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!track) {
      setLevel(0);
      return;
    }
    let raf = 0;
    let ctx: AudioContext | null = null;
    const resume = () => void ctx?.resume().catch(() => {});
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      const source = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let last = 0;
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        if (now - last < 100) return;
        last = now;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length)));
      };
      raf = requestAnimationFrame(tick);
      // A phone starts the context suspended until the next touch.
      resume();
      window.addEventListener("pointerdown", resume, { passive: true });
    } catch {
      // No metering: the call itself is unaffected.
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", resume);
      void ctx?.close().catch(() => {});
    };
  }, [track]);
  return level;
}

/** Fetch this interview's {url, token} from the interview-rooms edge function,
 *  translating its non-2xx shapes into a state this component knows how to render. */
async function fetchRoomCredentials(interviewId: string): Promise<RoomCredentials> {
  const { data, error } = await supabase.functions.invoke("interview-rooms", {
    body: { interviewId },
  });

  const roomUrl = data?.roomUrl ?? data?.url; // edge fn returns roomUrl
  if (!error && roomUrl && data?.token) {
    return { ok: true, url: roomUrl as string, token: data.token as string };
  }

  // data's shape depends on the edge function's response body, which varies
  // by error case below — only a possible `error` string field is read off it.
  let payload: { error?: string } | null = data ?? null;
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

/** Under Tailwind's sm: the phone layout, where the call fills the screen. */
function useSmallScreen(): boolean {
  const query = "(max-width: 639px)";
  const [small, setSmall] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setSmall(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return small;
}

/** Above this (0-1), someone is speaking. */
const SPEAKING_LEVEL = 0.03;

/** Five bars that rise with the voice: who is speaking, and that a mic works. */
function SpeakingBars({ level, small = false }: { level: number; small?: boolean }) {
  // Daily's level is small for normal speech; lift it so talking fills the bars.
  const lifted = Math.min(1, Math.sqrt(Math.max(0, level)) * 2.2);
  const max = small ? 10 : 14;
  return (
    <span className="flex items-end gap-[2px]" aria-hidden style={{ height: max }}>
      {[0.35, 0.6, 1, 0.6, 0.35].map((weight, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full transition-[height] duration-100 motion-reduce:transition-none"
          style={{
            height: Math.max(2, Math.round(max * Math.min(1, lifted * weight * 1.4))),
            background: lifted * weight > 0.15 ? "var(--action-bright)" : "rgba(255,255,255,0.45)",
          }}
        />
      ))}
    </span>
  );
}

export default function MeetingRoom({ interviewId, selfLabel, otherLabel, onLeave, startCamOff = false, startMicOff = false }: MeetingRoomProps) {
  const [phase, setPhase] = useState<RoomPhase>("connecting");
  // On a phone the call is put straight on the page body: inside the app's
  // shell (a z-index of its own) the bottom menu bar sat on top of it.
  const smallScreen = useSmallScreen();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [participants, setParticipants] = useState<DailyParticipantsObject | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [attempt, setAttempt] = useState(0);
  // How loud each side is right now, 0-1 (Daily's audio level observers):
  // the bars that move when someone speaks, so both can see the mic works
  // (the owner, 2026-11-04).
  const [localLevel, setLocalLevel] = useState(0);
  // The camera or mic could not start (in use elsewhere, no permission):
  // said out loud with a retry, instead of a black square (Jhoanna's call,
  // 2026-11-04, showed no camera and nobody knew why).
  const [deviceProblem, setDeviceProblem] = useState<string | null>(null);
  const [remoteLevel, setRemoteLevel] = useState(0);

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

      // `credentials.ok === false` (not `!credentials.ok`) — TS only narrows
      // this discriminated union's boolean discriminant on an equality check;
      // truthiness narrowing leaves the `ok: true` member in the negated branch.
      if (credentials.ok === false) {
        if (credentials.kind === "error") setErrorMessage(credentials.message);
        setPhase(credentials.kind);
        return;
      }

      try {
        const { default: DailyIframe } = await import("@daily-co/daily-js");
        if (cancelled) return;

        const call = DailyIframe.createCallObject({
          subscribeToTracksAutomatically: true,
          startVideoOff: startCamOff,
          startAudioOff: startMicOff,
        });
        callRef.current = call;

        call.on("participant-joined", refreshParticipants);
        call.on("participant-updated", refreshParticipants);
        call.on("participant-left", refreshParticipants);
        call.on("track-started", refreshParticipants);
        call.on("track-stopped", refreshParticipants);
        call.on("camera-error", (ev) => {
          const kind = (ev as { error?: { type?: string } } | undefined)?.error?.type;
          setDeviceProblem(
            kind === "permissions"
              ? "Your browser blocked the camera or microphone. Allow them in the address bar, then press Try again."
              : kind === "not-found"
                ? "No camera or microphone was found on this device."
                : kind === "cam-in-use" || kind === "mic-in-use" || kind === "cam-mic-in-use"
                  ? "Another app is using your camera or microphone. Close it, then press Try again."
                  : "Your camera or microphone could not start. Press Try again.",
          );
        });
        call.on("local-audio-level", (ev) => setLocalLevel(typeof ev?.audioLevel === "number" ? ev.audioLevel : 0));
        call.on("remote-participants-audio-level", (ev) => {
          const levels = Object.values(ev?.participantsAudioLevel ?? {}).filter((v): v is number => typeof v === "number");
          setRemoteLevel(levels.length > 0 ? Math.max(...levels) : 0);
        });
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
        // The speaking bars. A failure only means no bars: the call goes on.
        call.startLocalAudioLevelObserver(150).catch(() => {});
        call.startRemoteParticipantsAudioLevelObserver(150).catch(() => {});
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
    bindTrack(stageVideoRef.current, stageIsScreenShare ? stageTrack : remoteCamTrack);
  }, [stageIsScreenShare, stageTrack, remoteCamTrack]);

  useEffect(() => {
    bindTrack(localVideoRef.current, localCamTrack);
  }, [localCamTrack]);

  useEffect(() => {
    bindTrack(remoteAudioRef.current, remoteMicTrack);
  }, [remoteMicTrack]);

  useEffect(() => {
    bindTrack(screenAudioRef.current, remoteScreenAudioTrack);
  }, [remoteScreenAudioTrack]);

  // The speaking bars: measured from the tracks themselves, Daily's own
  // observers as a second source (whichever hears more).
  const localMicTrack = micOn ? activeTrack(local, "audio") : null;
  const measuredLocal = useTrackLevel(localMicTrack);
  const measuredRemote = useTrackLevel(remoteMicTrack);
  const shownLocalLevel = Math.max(measuredLocal, localLevel);
  const shownRemoteLevel = Math.max(measuredRemote, remoteLevel);

  const toggleMic = useCallback(() => {
    callRef.current?.setLocalAudio(!micOn);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    callRef.current?.setLocalVideo(!camOn);
  }, [camOn]);

  // Choosing the microphone, camera and speaker, in the call (the owner,
  // 2026-11-04: either side must be able to change them). Listed when the
  // panel opens, since a headset plugged in mid-call should show up.
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [deviceList, setDeviceList] = useState<{ mics: MediaDeviceInfo[]; cams: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] }>({ mics: [], cams: [], speakers: [] });
  const [chosen, setChosen] = useState<{ mic: string; cam: string; speaker: string }>({ mic: "", cam: "", speaker: "" });

  const openDevices = useCallback(async () => {
    const call = callRef.current;
    if (!call) return;
    if (devicesOpen) {
      setDevicesOpen(false);
      return;
    }
    try {
      const { devices } = await call.enumerateDevices();
      const pick = (kind: string) => (devices as MediaDeviceInfo[]).filter((d) => d.kind === kind && d.deviceId);
      setDeviceList({ mics: pick("audioinput"), cams: pick("videoinput"), speakers: pick("audiooutput") });
      const current = await call.getInputDevices();
      const idOf = (d: unknown) => (d && typeof d === "object" && "deviceId" in d ? String((d as { deviceId: unknown }).deviceId ?? "") : "");
      setChosen({ mic: idOf(current.mic), cam: idOf(current.camera), speaker: idOf(current.speaker) });
    } catch {
      // Listing failed: the panel still opens, with what it has.
    }
    setDevicesOpen(true);
  }, [devicesOpen]);

  const chooseDevice = useCallback(async (kind: "mic" | "cam" | "speaker", deviceId: string) => {
    const call = callRef.current;
    if (!call || !deviceId) return;
    setChosen((was) => ({ ...was, [kind]: deviceId }));
    try {
      if (kind === "mic") await call.setInputDevicesAsync({ audioDeviceId: deviceId });
      else if (kind === "cam") await call.setInputDevicesAsync({ videoDeviceId: deviceId });
      else await call.setOutputDeviceAsync({ outputDeviceId: deviceId });
    } catch {
      // A device that cannot be opened leaves the current one in place.
    }
  }, []);

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
        icon={<Loader2 className="h-8 w-8 animate-spin text-[var(--action-bright)]" />}
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

  const callView = (
    // On a phone the call fills the screen, as WhatsApp and Google Meet do
    // (the owner, 2026-11-04); from sm up it sits in the page as before.
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--slab)] sm:static sm:z-auto sm:gap-4 sm:bg-transparent">
      <div
        className="flex items-center justify-between px-4 pb-2 text-sm sm:px-0 sm:pb-0 sm:pt-0 sm:text-muted-foreground"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))", color: "var(--slab-ink-2)" }}
      >
        <span className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${remoteHasJoined ? "bg-[var(--action-bright)]" : "animate-pulse bg-muted-foreground/50"}`}
            aria-hidden
          />
          {remoteHasJoined ? "Connected" : `Waiting for ${otherLabel}`}
        </span>
        <span className="ck-num font-mono text-sm">{formatElapsed(elapsedSeconds)}</span>
      </div>

      {/* Main stage — letterhead-framed, remote camera or either side's screen share */}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden bg-[var(--slab)] sm:aspect-video sm:flex-none sm:rounded-xl sm:border sm:border-border/50">
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
              style={{ background: "color-mix(in srgb, var(--slab-action) 16%, transparent)" }}
            >
              <span className="font-display text-2xl text-[var(--slab-action)]">
                {otherLabel.trim().slice(0, 1).toUpperCase() || "?"}
              </span>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--slab-ink)" }}>
              {remoteHasJoined ? `${otherLabel}'s camera is off` : `You're in — ${otherLabel} hasn't joined yet`}
            </p>
          </div>
        )}

        {remoteHasJoined && (
          <span className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-lg bg-black/55 px-2.5 py-1.5 text-xs font-medium text-white">
            <SpeakingBars level={shownRemoteLevel} />
            {shownRemoteLevel > SPEAKING_LEVEL ? `${otherLabel} is speaking` : otherLabel}
          </span>
        )}

        {stageIsScreenShare && (
          <span className="ck-pill absolute left-3 top-3 z-10 border-transparent bg-black/60 text-white">
            {stageIsMine ? "You're sharing your screen" : `${otherLabel} is sharing their screen`}
          </span>
        )}

        {/* Local picture-in-picture */}
        <div className="absolute right-3 top-3 z-10 aspect-[3/4] w-24 overflow-hidden rounded-lg border border-white/20 bg-black shadow-lg sm:bottom-3 sm:top-auto sm:aspect-video sm:w-40">
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
          <span className="absolute bottom-1 left-1.5 flex items-center gap-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {micOn && <SpeakingBars level={shownLocalLevel} small />}
            {selfLabel}
          </span>
        </div>
      </div>

      {/* Remote audio sinks — hidden, they only carry sound */}
      <audio ref={remoteAudioRef} autoPlay />
      <audio ref={screenAudioRef} autoPlay />

      <p className="py-1.5 text-center text-xs sm:-mt-1 sm:py-0 sm:text-muted-foreground" style={{ color: "var(--slab-ink-2)" }} aria-live="polite">
        {!micOn ? "Your microphone is muted" : shownLocalLevel > SPEAKING_LEVEL ? "Your mic is working" : "Speak to check your mic: the bars by \"You\" move"}
      </p>

      {devicesOpen && (
        <div className="ck-card mx-3 mb-2 grid gap-3 px-4 py-3 text-sm sm:mx-0 sm:mb-0 sm:grid-cols-3">
          {([
            ["mic", "Microphone", deviceList.mics],
            ["cam", "Camera", deviceList.cams],
            ["speaker", "Speaker", deviceList.speakers],
          ] as const).map(([kind, label, list]) => (
            <label key={kind} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{label}</span>
              {list.length === 0 ? (
                <span className="text-xs text-muted-foreground">{kind === "speaker" ? "Your browser's default" : `No ${label.toLowerCase()} found`}</span>
              ) : (
                <select
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                  value={chosen[kind]}
                  onChange={(e) => void chooseDevice(kind, e.target.value)}
                >
                  {!chosen[kind] && <option value="">Choose…</option>}
                  {list.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `${label} ${i + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </div>
      )}

      {deviceProblem && (
        <div
          className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs sm:mx-0 sm:mb-0"
          style={{ background: "var(--amber-bg)", color: "var(--amber-fg)", border: "1px solid var(--brass-line)" }}
          role="status"
        >
          <span>{deviceProblem}</span>
          <button
            type="button"
            className="ck-btn ck-btn-outline shrink-0 !px-3 !py-1 !text-xs"
            onClick={() => {
              setDeviceProblem(null);
              const call = callRef.current;
              if (!call) return;
              void call.setInputDevicesAsync({}).catch(() => {});
              call.setLocalVideo(true);
              call.setLocalAudio(true);
            }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Controls */}
      <div
        className="ck-card flex items-center justify-center gap-3 rounded-none border-x-0 border-b-0 px-4 pt-3 sm:rounded-[var(--hf-radius-lg)] sm:border-x sm:border-b sm:py-3"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
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
        <RoomControlButton onClick={openDevices} label="Choose microphone, camera and speaker" variant={devicesOpen ? "active" : "default"}>
          <Settings2 className="h-5 w-5" />
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
  return smallScreen ? createPortal(callView, document.body) : callView;
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
        ? "border-transparent bg-[var(--action-soft)] text-[var(--action-soft-fg)] hover:brightness-105"
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
