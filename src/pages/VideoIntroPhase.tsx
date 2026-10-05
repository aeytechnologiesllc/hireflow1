import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { PhaseAlreadySubmitted } from "@/components/PhaseAlreadySubmitted";
import { StepAdvanceScreen } from "@/components/candidate/NextStepCard";
import { useResultAtFirstLoad, useStepAdvance } from "@/hooks/useStepAdvance";
import { AvaSeal } from "@/components/ava/AvaSeal";
import { useJourneyPosition } from "@/hooks/useJourneyPosition";
import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  CheckCircle,
  Camera
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { invokeTriggerAvaAnalysis } from "@/utils/triggerAvaAnalysis";
import { parseApplicationNotes } from "@/lib/applicationNotes";

interface ApplicationDetails {
  id: string;
  candidate_id: string;
  job_id: string;
  phase: string | null;
  notes: string | null;
  status: string;
  jobs: {
    title: string;
    processing_mode: string | null;
    passing_score: number | null;
    workflow_steps: Array<{ id: string; type: string; title?: string; config?: { maxDuration?: number; prompt?: string } }> | null;
    /** Its own column, not part of workflow_steps. Without it the journey
     *  builder drops the quiz and this screen quotes a smaller "of N" than
     *  the rest of the app. */
    quiz_questions?: unknown[] | null;
  } | null;
}

type RecordingState = "intro" | "camera_preview" | "recording" | "preview" | "submitting";

export default function VideoIntroPhase() {
  const { id, stepId } = useParams<{ id: string; stepId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [recordingState, setRecordingState] = useState<RecordingState>("intro");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  /** The container the browser actually recorded in — webm on Chrome, mp4 on
   *  iOS Safari. Drives the blob type, the file extension and the upload
   *  content type, so a recording is never mislabelled on the way to storage. */
  const recordedMimeRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch application details - force refetch on mount to handle reconsider workflow
  const { data: application, isLoading, isFetchedAfterMount } = useQuery({
    queryKey: ["video-intro-application", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*, jobs(title, processing_mode, passing_score, workflow_steps, quiz_questions)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as unknown as ApplicationDetails;
    },
    enabled: !!id && !!user && !authLoading,
    refetchOnMount: "always",
    staleTime: 0,
  });

  // Real-time subscription for phase resets - ensures immediate refresh when employer resets
  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`video-intro-phase-updates-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'applications',
        filter: `id=eq.${id}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["video-intro-application", id] });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [id, queryClient]);

  const videoConfig = (() => {
    const workflowSteps = application?.jobs?.workflow_steps;
    const videoStep = workflowSteps?.find(s => s.id === stepId || s.type === "video_intro" || s.type === "video_message");
    return {
      maxDuration: videoStep?.config?.maxDuration || 60,
      prompt: videoStep?.config?.prompt || "Record a brief 60-second video introducing yourself.",
    };
  })();

  // Where this screen sits in the whole journey — derived from the same real
  // workflow_steps used to build the journey at submit time below, via the
  // shared candidateJourney builder, never invented.
  const journey = useJourneyPosition(application?.jobs, { stepId, phase: application?.phase });

  // After the recording is sent: the waiting screen, then "Start <next step>"
  // the moment the row says it is open (see useStepAdvance).
  const advance = useStepAdvance({ applicationId: id, stepId, job: application?.jobs });

  // Once the recording is stored server-side: in auto mode, follow the row
  // to the next step; in manual mode, the hiring team opens it.
  const afterVideoSaved = async (isAutoMode: boolean) => {
    queryClient.invalidateQueries({ queryKey: ["applications", "candidate"] });
    queryClient.invalidateQueries({ queryKey: ["candidate-application", id] });

    if (isAutoMode) {
      // invokeTriggerAvaAnalysis never throws; the screen follows the row.
      advance.begin();
      advance.markSaved();
      const reply = await invokeTriggerAvaAnalysis({
        applicationId: id!,
        autopilotDecision: true,
        currentPhaseId: stepId,
      });
      advance.settle(reply);
      return;
    }

    // Manual mode - just trigger analysis in background, toast and navigate
    invokeTriggerAvaAnalysis({
      applicationId: id!,
    }).catch(err => console.error("[VideoIntroPhase] AVA analysis trigger failed:", err));

    toast.success("Video sent", {
      description: "Your recording is saved. The hiring team will get back to you — everyone hears back.",
    });
    navigate(`/applications/${id}`);
  };


  // Cleanup
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  // Connect stream to video
  useEffect(() => {
    if (streamRef.current && videoRef.current && recordingState === "camera_preview") {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [recordingState]);

  const enableCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setRecordingState("camera_preview");
    } catch (error) {
      console.error("Camera access error:", error);
      toast.error("We couldn't get to your camera or mic", {
        description: "Check your browser's permissions and try again.",
      });
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    
    chunksRef.current = [];

    // Probe in preference order rather than forcing a container. iOS Safari
    // supports neither 'video/webm' nor 'audio/webm', and passing an
    // unsupported mimeType to the MediaRecorder constructor throws
    // NotSupportedError — which was uncaught here, so on an iPhone the
    // recording simply never started and the candidate got no error either.
    // These are hourly workers on phones; this was most of them.
    // Same negotiation as useVideoInterviewRecorder.ts, which already had it.
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    const preferred = candidates.find((t) => MediaRecorder.isTypeSupported(t));

    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(
        streamRef.current,
        preferred ? { mimeType: preferred } : {}
      );
    } catch {
      // Last resort: let the browser choose its own container entirely.
      mediaRecorder = new MediaRecorder(streamRef.current);
    }
    // What the browser actually gave us — not what we asked for. The blob, the
    // file extension and the upload content type all follow this.
    recordedMimeRef.current = mediaRecorder.mimeType || preferred || "";

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recordedMimeRef.current || "video/webm",
      });

      // A recorder that produced nothing — a denied track, a device grabbed by
      // another app, a stop that raced the start — used to sail through to a
      // preview of an empty file, an upload, and a database row marked
      // completed. The candidate believed they had recorded a video; the
      // employer opened nothing. Send them back to try again instead.
      if (!chunksRef.current.length || blob.size === 0) {
        toast.error("That recording didn't capture", {
          description: "Nothing came through from the camera — give it another go.",
        });
        setRecordingState("camera_preview");
        return;
      }

      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
      setRecordingState("preview");
    };

    // Surface a recorder-level failure rather than leaving the UI in "recording"
    // with a stopwatch running over a dead recorder.
    mediaRecorder.onerror = (event) => {
      console.error("MediaRecorder error:", event);
      toast.error("The recording stopped unexpectedly", {
        description: "Check your camera and microphone, then try again.",
      });
      setRecordingState("camera_preview");
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setRecordingState("recording");
    setRecordingTime(0);
    
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        if (prev >= videoConfig.maxDuration - 1) {
          stopRecording();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
  };

  const resetRecording = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setRecordingTime(0);
    setRecordingState("intro");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const MIN_RECORDING_SECONDS = 3;

  const handleSubmit = async () => {
    if (!recordedBlob || !application || !user || isSubmitting) return;

    // Start-then-immediately-Stop produced a fraction-of-a-second clip that was
    // uploaded and written as `duration: 0 … COMPLETED`, spending the
    // candidate's one attempt on nothing. Ask for a few seconds of something.
    if (recordingTime < MIN_RECORDING_SECONDS) {
      toast.error("That's too short to send", {
        description: `Record at least ${MIN_RECORDING_SECONDS} seconds so the team can actually hear you.`,
      });
      return;
    }

    setIsSubmitting(true);
    setRecordingState("submitting");
    
    try {
      // CRITICAL: Re-fetch fresh job data to get current processing_mode
      // This prevents stale cached data from causing issues
      const { data: freshJob } = await supabase
        .from("jobs")
        .select("processing_mode, passing_score")
        .eq("id", application.job_id)
        .single();
      
      const isAutoMode = freshJob?.processing_mode === "auto";

      // Show the honest waiting screen immediately for autopilot mode
      if (isAutoMode) advance.begin();
      // 1. Upload video. Name and label it with what the browser ACTUALLY
      // recorded — an iOS recording is mp4, and storing it as .webm with a
      // video/webm content type produces a file nothing will play back for the
      // employer, which is a silent loss of the candidate's work.
      const recordedMime = recordedBlob.type || recordedMimeRef.current || "video/webm";
      const extension = recordedMime.includes("mp4") ? "mp4" : "webm";
      const fileName = `${user.id}/${id}-${stepId}-${Date.now()}.${extension}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("videos")
        .upload(fileName, recordedBlob, { contentType: recordedMime.split(";")[0] });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // 2. Persist the bare storage path, not a URL. The `videos` bucket is
      // private, so a public URL here would be a permanent dead link; viewers
      // mint a short-lived signed URL from the path (see candidateMediaUrl.ts).
      const videoUrl = fileName;

      // 3. Record the result server-side. complete-video-intro verifies this
      // is really this candidate's own upload for this application/step,
      // grades it (video intro is completion-based: always passed once a
      // real recording exists — same rule this screen always applied), and
      // advances phase/status using the same journey rules this screen's
      // own local computation used to apply — see its own doc comment and
      // docs/TRUSTED-RESULTS.md. The browser no longer writes
      // applications.notes/phase/phase_ai_analysis directly for this step.
      const { data: completeData, error: completeError } = await supabase.functions.invoke(
        "complete-video-intro",
        { body: { applicationId: id, stepId, videoUrl, duration: recordingTime } }
      );

      if (completeError || !completeData?.success) {
        const message =
          (completeData && typeof completeData.error === "string" && completeData.error) ||
          completeError?.message ||
          "Failed to save your video";
        throw new Error(message);
      }

      // The recording is stored. What opens next is read off the row (the
      // server moves `phase`), not off complete-video-intro's `next`.
      await afterVideoSaved(isAutoMode);
    } catch (error) {
      console.error("Submit error:", error);
      
      // Verify if the upload actually succeeded despite the error
      try {
        const { data: checkData } = await supabase
          .from("applications")
          .select("notes")
          .eq("id", id!)
          .single();
        
        if (checkData?.notes) {
          const checkNotes = parseApplicationNotes(checkData.notes) as Record<string, { videoUrl?: string } | undefined> & { videoIntroUrl?: string };
          if (checkNotes[stepId!]?.videoUrl || checkNotes.videoIntroUrl) {
            // Actually succeeded! Re-fetch job data to check mode
            const { data: freshJobCheck } = await supabase
              .from("jobs")
              .select("processing_mode")
              .eq("id", application.job_id)
              .single();
            await afterVideoSaved(freshJobCheck?.processing_mode === "auto");
            return;
          }
        }
      } catch {
        // Verification failed, show original error
      }
      
      // Storage and edge-function errors are not sentences a candidate can act
      // on. Keep the detail in the console; tell them what to do instead.
      console.error("Video intro upload failed:", error);
      toast.error("That didn't upload", {
        description: "Your recording is still here — check your connection and try again.",
      });
      setRecordingState("preview");
      advance.cancel();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if already submitted
  const existingResult = (() => {
    // If application was reconsidered (status reset to pending), allow re-submission
    if (application?.status === "pending" && application?.phase === stepId) {
      return null;
    }
    if (!application?.notes) return null;
    try {
      const notes = parseApplicationNotes(application.notes);
      return notes.videoIntroResult || notes.videoIntroUrl ? { videoUrl: notes.videoIntroUrl } : null;
    } catch {
      return null;
    }
  })();

  // "Already done" is decided once, from the first read after this page
  // mounted — never from a refresh that lands after the candidate sends.
  const resultAtFirstLoad = useResultAtFirstLoad(isFetchedAfterMount && !!application, !!existingResult);

  if (authLoading || isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <h2 className="font-display mb-2 text-xl text-foreground">We couldn't find this application</h2>
            <p className="mb-4 text-muted-foreground">
              It may have been removed, or you might not have access to it.
            </p>
            <Button onClick={() => navigate("/applications")}>
              Back to applications
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sent in this visit: the waiting screen, then the next step's button.
  if (advance.view) {
    return (
      <StepAdvanceScreen
        advance={advance}
        applicationId={id!}
        jobTitle={application.jobs?.title}
        completedTitle={journey.title}
      />
    );
  }

  if (resultAtFirstLoad === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  // Done before this visit began (a bookmark, the back button): say where
  // things stand and offer the next step, never a dead end.
  if (resultAtFirstLoad && existingResult && !isSubmitting) {
    return (
      <PhaseAlreadySubmitted
        applicationId={id!}
        phaseName={journey.title}
        isManualMode={application.jobs?.processing_mode === "manual"}
      />
    );
  }

  return (
    <div className="ck-page mx-auto max-w-3xl space-y-6">
      {/* Journey header — where am I, what's happening now, what's next */}
      <header className="ck-reveal space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/applications/${id}`)}
            aria-label="Back to application overview"
            className="h-11 w-11 shrink-0 text-muted-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
            {application.jobs?.title || "This role"}
          </p>
        </div>

        <div className="space-y-2.5">
          <h1 className="font-display ck-ink text-2xl text-foreground sm:text-3xl">
            Record your video
          </h1>

          <span className="block text-xs font-medium text-muted-foreground">
            Step <span className="ck-num">{journey.index + 1}</span> of{" "}
            <span className="ck-num">{journey.total}</span> — {journey.title}
          </span>

          <Progress value={journey.progressPct} className="h-1.5 bg-[var(--track)]" />

          <p className="text-sm text-muted-foreground">
            {recordingState === "recording"
              ? "Speak naturally — stop whenever you're done."
              : `Up to ${formatTime(videoConfig.maxDuration)}. Take your time — you can watch it back and re-record before you submit.`}
          </p>
        </div>
      </header>

      {/* Main Card */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="space-y-6 p-4 pt-6 sm:p-8">
          {/* Prompt */}
          {recordingState !== "submitting" && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">What to say</p>
              <p className="text-foreground">{videoConfig.prompt}</p>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* Recording States */}
            {recordingState !== "preview" && recordingState !== "submitting" && (
              <motion.div
                key="record"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Video Area */}
                <div className="relative aspect-video overflow-hidden rounded-xl border border-border/50 bg-[var(--slab)]">
                  {recordingState === "intro" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
                      <div
                        className="flex h-20 w-20 items-center justify-center rounded-full"
                        style={{ background: "color-mix(in srgb, var(--jade-bright) 16%, transparent)" }}
                      >
                        <Camera className="h-10 w-10 text-[var(--jade-bright)]" />
                      </div>
                      <p className="text-center text-[var(--slab-ink-2)]">
                        When you're ready, we'll ask for your camera and mic — you'll see a preview before
                        anything records.
                      </p>
                    </div>
                  )}

                  {(recordingState === "camera_preview" || recordingState === "recording") && (
                    <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                  )}

                  {recordingState === "camera_preview" && (
                    <div className="absolute left-4 top-4">
                      <Badge className="gap-1.5 border-transparent bg-[var(--slab)] text-[var(--slab-ink)]">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--jade-bright)]" />
                        Camera ready
                      </Badge>
                    </div>
                  )}

                  {recordingState === "recording" && (
                    <div className="absolute left-4 top-4">
                      <Badge className="gap-1.5 border-transparent bg-[var(--slab)] text-[var(--slab-ink)]">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--crit)]" />
                        <span className="ck-num">{formatTime(recordingTime)}</span> / {formatTime(videoConfig.maxDuration)}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-center gap-4">
                  {recordingState === "intro" && (
                    <Button onClick={enableCamera} size="lg" className="gap-2 px-8">
                      <Camera className="h-5 w-5" />
                      Turn on camera
                    </Button>
                  )}

                  {recordingState === "camera_preview" && (
                    <Button onClick={startRecording} size="lg" className="gap-2 px-8">
                      <Play className="h-5 w-5" />
                      Start recording
                    </Button>
                  )}

                  {recordingState === "recording" && (
                    <Button onClick={stopRecording} size="lg" className="gap-2 px-8">
                      <Square className="h-5 w-5" />
                      Stop recording
                    </Button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Preview State */}
            {recordingState === "preview" && recordedUrl && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="relative aspect-video overflow-hidden rounded-xl border border-border/50 bg-[var(--slab)]">
                  <video ref={previewRef} src={recordedUrl} controls className="h-full w-full object-cover" />
                  <div className="absolute left-4 top-4">
                    <Badge className="gap-1.5 border-transparent bg-[var(--slab)] text-[var(--slab-ink)]">
                      <AvaSeal size={14} className="ck-seal-press" />
                      <span className="ck-num">{formatTime(recordingTime)}</span> recorded
                    </Badge>
                  </div>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                  Watch it back, then submit when you're happy with it.
                </p>

                <div className="flex flex-wrap justify-center gap-3">
                  <Button onClick={resetRecording} variant="outline" size="lg" className="gap-2 px-6">
                    <RotateCcw className="h-5 w-5" />
                    Re-record
                  </Button>
                  <Button onClick={handleSubmit} size="lg" className="gap-2 px-8">
                    <CheckCircle className="h-5 w-5" />
                    Submit video
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Submitting State — a held moment, not a bare spinner */}
            {recordingState === "submitting" && (
              <motion.div
                key="submitting"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center gap-4 py-16"
              >
                <span className="ck-seal-breathe">
                  <AvaSeal size={32} />
                </span>
                <p className="font-display text-lg text-foreground">Sending your video…</p>
                <p className="text-sm text-muted-foreground">This can take a moment — stay on this page.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tips — helpful before and while composing, out of the way once recording starts */}
          {(recordingState === "intro" || recordingState === "camera_preview") && (
            <div className="space-y-3 rounded-xl bg-muted/30 p-5">
              <h4 className="text-sm font-medium text-foreground">Tips for a great video</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  "Find good lighting (face a window)",
                  "Choose a quiet location",
                  "Look at the camera, not yourself",
                  "Speak clearly and naturally",
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
