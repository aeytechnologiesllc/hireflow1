/**
 * InterviewRoom — the route page for the in-app call, used by both sides.
 *
 * Two routes land here:
 *   /interviews/:id/room                 — employer/team-member, :id is the interview id
 *   /applications/:appId/interview-room   — candidate, :appId is the application id
 *
 * Mirrors VoiceInterviewPhase's shape: a held device-check step first (live
 * preview, mic-level hint — the getUserMedia pattern from
 * useVideoInterviewRecorder, without its recording/mixing machinery, since
 * this page never records anything), then the call itself via MeetingRoom.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import MeetingRoom from "@/components/meeting/MeetingRoom";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle, Loader2, Mic } from "lucide-react";

interface RoomContext {
  interviewId: string;
  otherLabel: string;
  backHref: string;
}

/** Live camera/mic preview for the pre-join device check — no recording, no
 *  upload, just getUserMedia + a mic-level hint, released the moment the
 *  call takes over. */
function useDevicePreview() {
  const [granted, setGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micLevels, setMicLevels] = useState<number[]>([0, 0, 0, 0, 0]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopLevelMonitor = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
  }, []);

  const startLevelMonitor = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 32;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(data);
        const step = Math.max(1, Math.floor(data.length / 5));
        setMicLevels([0, 1, 2, 3, 4].map((i) => Math.min(100, ((data[i * step] || 0) / 255) * 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Level metering is a nicety — a failure here shouldn't block the call.
    }
  }, []);

  const requestAccess = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      setGranted(true);
      startLevelMonitor(stream);
      return stream;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't access your camera or mic");
      setGranted(false);
      return null;
    }
  }, [startLevelMonitor]);

  const release = useCallback(() => {
    stopLevelMonitor();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setGranted(false);
    setMicLevels([0, 0, 0, 0, 0]);
  }, [stopLevelMonitor]);

  useEffect(() => () => release(), [release]);

  return { granted, error, micLevels, requestAccess, release, getStream: () => streamRef.current };
}

export default function InterviewRoom() {
  const { id, appId } = useParams<{ id?: string; appId?: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<RoomContext | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        if (id) {
          // Employer / team-member context — :id is the interview id itself.
          const { data, error } = await supabase
            .from("interviews")
            .select("id, application_id, applications:application_id ( candidate_id )")
            .eq("id", id)
            .single();
          if (error) throw error;
          if (cancelled) return;

          let otherLabel = "the candidate";
          const candidateId = (data.applications as { candidate_id: string } | null)?.candidate_id;
          if (candidateId) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("full_name")
              .eq("user_id", candidateId)
              .maybeSingle();
            if (profile?.full_name) otherLabel = profile.full_name;
          }

          setCtx({ interviewId: data.id, otherLabel, backHref: "/interviews" });
        } else if (appId) {
          // Candidate context — :appId is the application id; resolve its
          // most recent interview. Kept data-minimal: no employer profile
          // lookup here (candidates can't see raw employer profiles anyway).
          const { data, error } = await supabase
            .from("interviews")
            .select("id")
            .eq("application_id", appId)
            .order("scheduled_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          if (cancelled) return;
          if (!data) {
            setLoadError("No interview is scheduled for this application yet.");
            return;
          }
          setCtx({ interviewId: data.id, otherLabel: "the hiring team", backHref: `/applications/${appId}` });
        } else {
          setLoadError("Missing interview reference.");
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load this interview");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, appId]);

  const device = useDevicePreview();
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.srcObject = device.getStream();
    }
  }, [device.granted, device]);

  const backHref = ctx?.backHref ?? (id ? "/interviews" : "/applications");

  const handleJoin = () => {
    // Hand off to the call — release our own preview stream first so Daily
    // acquires a clean camera/mic grab rather than fighting a second one.
    device.release();
    setConfirmed(true);
  };

  if (loading) {
    return (
      <div className="ck-page flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--jade-bright)]" />
      </div>
    );
  }

  if (loadError || !ctx) {
    return (
      <div className="ck-page mx-auto max-w-lg space-y-4 py-16 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{loadError || "Couldn't load this interview."}</p>
        <button onClick={() => navigate(backHref)} className="ck-btn ck-btn-outline">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="ck-page mx-auto max-w-3xl space-y-6">
      <header className="ck-reveal flex items-center gap-3">
        <button
          onClick={() => navigate(backHref)}
          aria-label="Back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-transform active:scale-95 hover:bg-muted/40 motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">
            {confirmed ? "Interview" : "Join your interview"}
          </h1>
          <p className="truncate text-sm text-muted-foreground">With {ctx.otherLabel}</p>
        </div>
      </header>

      {!confirmed ? (
        <div className="ck-card ck-reveal relative overflow-hidden px-5 pb-6 pt-5 text-center sm:px-8 sm:pb-8 sm:pt-6">
          <span
            aria-hidden
            className="absolute left-5 right-5 top-0 h-[2px] rounded-[1px] sm:left-8 sm:right-8"
            style={{ background: "var(--brass-line)" }}
          />

          <div className="space-y-2">
            <h2 className="font-display ck-ink text-xl text-foreground sm:text-2xl">
              {device.granted ? "Check your camera & mic" : "Enable your camera & mic"}
            </h2>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              {device.granted
                ? "Make sure you can see yourself, then say a few words to test your microphone."
                : "We'll ask your browser for permission — you'll see a live preview before you join."}
            </p>
          </div>

          {!device.granted ? (
            <div className="mt-5 flex flex-col items-center gap-3">
              <button onClick={device.requestAccess} className="ck-btn ck-btn-primary gap-2 px-8 py-3">
                <Camera className="h-5 w-5" />
                Enable camera & microphone
              </button>
              {device.error && (
                <div
                  className="max-w-sm rounded-xl px-4 py-3 text-center"
                  style={{ background: "var(--amber-bg)", border: "1px solid var(--brass-line)" }}
                >
                  <p className="text-[13px] font-medium" style={{ color: "var(--amber-fg)" }}>
                    We couldn't reach your camera or mic
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--amber-fg)", opacity: 0.85 }}>
                    Check your browser's site permissions, then try again.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="relative mx-auto aspect-video w-full max-w-md overflow-hidden rounded-xl border border-border/50 bg-[var(--slab)]">
                <video
                  ref={previewRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                  style={{ transform: "scaleX(-1)" }}
                />
              </div>

              <div className="flex items-center justify-center gap-2">
                <Mic className="h-4 w-4 text-muted-foreground" />
                <div className="flex h-6 items-end gap-0.5">
                  {device.micLevels.map((level, i) => (
                    <div
                      key={i}
                      className={`w-1.5 rounded-full transition-[height] duration-75 ${level > 15 ? "bg-[var(--jade-bright)]" : "bg-muted-foreground/30"}`}
                      style={{ height: Math.max(4, level / 4 + 4) }}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">
                  {device.micLevels.some((l) => l > 15) ? "Mic working" : "Speak to test your mic"}
                </span>
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                <button onClick={device.release} className="ck-btn ck-btn-outline">
                  Cancel
                </button>
                <button onClick={handleJoin} className="ck-btn ck-btn-primary gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Join interview
                </button>
              </div>
            </div>
          )}

          <p className="mt-6 border-t border-border/60 pt-4 text-xs text-muted-foreground">
            Only you and {ctx.otherLabel} can join this room.
          </p>
        </div>
      ) : (
        <MeetingRoom
          interviewId={ctx.interviewId}
          selfLabel="You"
          otherLabel={ctx.otherLabel}
          onLeave={() => navigate(backHref)}
        />
      )}
    </div>
  );
}
