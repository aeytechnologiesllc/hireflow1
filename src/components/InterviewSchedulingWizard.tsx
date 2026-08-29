import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateInterview } from "@/hooks/useInterviews";
import { useUpdateApplication } from "@/hooks/useApplications";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, addMinutes, addDays, setHours, setMinutes, startOfDay } from "date-fns";
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  Users,
  FileText,
  CheckCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Link2,
  Mail,
  ExternalLink,
  Copy,
  Check,
  X,
  Plus,
} from "lucide-react";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useIsMobile } from "@/hooks/use-mobile";
import { hapticLight } from "@/lib/haptics";
import type { Json } from "@/integrations/supabase/types";

interface InterviewSchedulingWizardProps {
  applicationId: string | null;
  candidateName: string;
  candidateEmail?: string;
  jobTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  initialState?: SavedWizardState | null;
}

// State to save before OAuth redirect. Google connect is only reachable from
// the exact-time (legacy single-slot) path, so that's all this needs to carry.
interface SavedWizardState {
  currentStep: number;
  selectedDate: string | null;
  selectedTime: string;
  duration: string;
  interviewType: string;
  notes: string;
  applicationId: string;
  candidateName: string;
  savedAt: number;
}

// A single window the employer is offering the candidate.
interface WindowSlot {
  day: Date;
  time: string; // "HH:mm"
}

// The owner should never be forced into offering more than one time if
// that's all they want — a single offered window is a perfectly valid,
// fully supported path. This just gates how many the wheel accepts.
const MIN_WINDOWS = 1;
const MAX_WINDOWS = 6;
// Interviews shouldn't run past this local time, so longer durations quietly
// drop the last few start slots of the day instead of overflowing into night.
const DAY_CUTOFF_HOUR = 20;
const DAY_CUTOFF_MINUTE = 30;

// iOS-style time wheel geometry — the drum is exactly this tall, each row
// exactly this tall, and padded top/bottom so the first and last slot can
// still scroll all the way to the centered band.
const WHEEL_HEIGHT = 200;
const WHEEL_ROW_HEIGHT = 40;
const WHEEL_PADDING = (WHEEL_HEIGHT - WHEEL_ROW_HEIGHT) / 2;

const WIZARD_STATE_KEY = "interview_wizard_state";
const WIZARD_STATE_EXPIRY = 30 * 60 * 1000; // 30 minutes

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar.events";
const FIXED_REDIRECT_URI = `${window.location.origin}/oauth/google/callback`;

const timeSlots = [
  { value: "09:00", label: "9:00 AM" },
  { value: "09:30", label: "9:30 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "10:30", label: "10:30 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "11:30", label: "11:30 AM" },
  { value: "12:00", label: "12:00 PM" },
  { value: "12:30", label: "12:30 PM" },
  { value: "13:00", label: "1:00 PM" },
  { value: "13:30", label: "1:30 PM" },
  { value: "14:00", label: "2:00 PM" },
  { value: "14:30", label: "2:30 PM" },
  { value: "15:00", label: "3:00 PM" },
  { value: "15:30", label: "3:30 PM" },
  { value: "16:00", label: "4:00 PM" },
  { value: "16:30", label: "4:30 PM" },
  { value: "17:00", label: "5:00 PM" },
  { value: "17:30", label: "5:30 PM" },
  { value: "18:00", label: "6:00 PM" },
  { value: "18:30", label: "6:30 PM" },
  { value: "19:00", label: "7:00 PM" },
  { value: "19:30", label: "7:30 PM" },
  { value: "20:00", label: "8:00 PM" },
];

// Memoized time slot button for performance
const TimeSlotButton = memo(({ 
  slot, 
  isSelected, 
  onSelect 
}: { 
  slot: { value: string; label: string }; 
  isSelected: boolean; 
  onSelect: (value: string) => void;
}) => (
  <Button
    type="button"
    variant={isSelected ? "default" : "outline"}
    size="sm"
    className="w-full"
    onClick={() => onSelect(slot.value)}
  >
    {slot.label}
  </Button>
));

const formatTimeToAMPM = (time24: string): string => {
  const [hours, minutes] = time24.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
};

// Validate meeting links for common video conferencing platforms
const isValidMeetingLink = (url: string): boolean => {
  if (!url || url.trim() === "") return false;
  
  try {
    const parsedUrl = new URL(url.trim());
    
    // Check for valid meeting platform domains
    const validDomains = [
      "meet.google.com",
      "zoom.us",
      "us02web.zoom.us",
      "us04web.zoom.us",
      "us05web.zoom.us",
      "us06web.zoom.us",
      "teams.microsoft.com",
      "whereby.com",
      "webex.com",
      "gotomeeting.com",
    ];
    
    // Check if the hostname matches any valid domain
    return validDomains.some(domain => 
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith("." + domain)
    );
  } catch {
    return false; // Invalid URL format
  }
};

const combineDayAndTime = (day: Date, time: string): Date => {
  const [hours, minutes] = time.split(":").map(Number);
  return setMinutes(setHours(day, hours), minutes);
};

const windowKey = (day: Date, time: string): string => `${format(day, "yyyy-MM-dd")}_${time}`;

export default function InterviewSchedulingWizard({
  applicationId,
  candidateName,
  candidateEmail,
  jobTitle,
  open,
  onOpenChange,
  onComplete,
  initialState,
}: InterviewSchedulingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  // Windows mode is the default: the employer offers a handful of times and
  // the candidate picks. The toggle below drops back to today's single-slot
  // behavior for phone/in-person or a time already agreed by other means.
  const [exactTimeMode, setExactTimeMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedWindows, setSelectedWindows] = useState<WindowSlot[]>([]);
  const [viewDayIndex, setViewDayIndex] = useState(0);
  const [duration, setDuration] = useState("15");
  const [interviewType, setInterviewType] = useState("video");
  const [notes, setNotes] = useState("");
  const [generateMeetLink, setGenerateMeetLink] = useState(true);
  const [manualMeetingLink, setManualMeetingLink] = useState("");
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdMeetLink, setCreatedMeetLink] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [meetingLinkError, setMeetingLinkError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const createInterview = useCreateInterview();
  const updateApplication = useUpdateApplication();
  const isMobile = useIsMobile();

  const steps = [
    { id: "calendar", title: "Offer Times", icon: CalendarIcon },
    { id: "details", title: "Interview Details", icon: Users },
    { id: "meeting", title: "Meeting Setup", icon: Video },
    { id: "review", title: "Review & Schedule", icon: CheckCircle },
  ];

  const durationMinutes = parseInt(duration) || 15;

  // Next 60 days (~2 months), recomputed whenever the wizard opens so
  // "today" stays right. Plain mapped day cells stay cheap at this size —
  // no virtualization needed for a scrollable strip this short.
  const dayOptions = useMemo(
    () => Array.from({ length: 60 }, (_, i) => addDays(startOfDay(new Date()), i)),
    [open]
  );
  const viewDay = dayOptions[viewDayIndex] ?? dayOptions[0];

  // 30-min slots for the viewed day that still fit the chosen duration before
  // the day's cutoff, and aren't already in the past.
  const daySlots = useMemo(() => {
    const now = new Date();
    const dayEndCutoff = setMinutes(setHours(viewDay, DAY_CUTOFF_HOUR), DAY_CUTOFF_MINUTE);
    return timeSlots.filter((slot) => {
      const start = combineDayAndTime(viewDay, slot.value);
      if (start < now) return false;
      if (addMinutes(start, durationMinutes) > dayEndCutoff) return false;
      return true;
    });
  }, [viewDay, durationMinutes]);

  const sortedSelectedWindows = useMemo(
    () =>
      [...selectedWindows].sort(
        (a, b) => combineDayAndTime(a.day, a.time).getTime() - combineDayAndTime(b.day, b.time).getTime()
      ),
    [selectedWindows]
  );

  const isWindowSelected = useCallback(
    (day: Date, time: string) => selectedWindows.some((w) => windowKey(w.day, w.time) === windowKey(day, time)),
    [selectedWindows]
  );

  const toggleWindow = useCallback((day: Date, time: string) => {
    const key = windowKey(day, time);
    setSelectedWindows((prev) => {
      if (prev.some((w) => windowKey(w.day, w.time) === key)) {
        return prev.filter((w) => windowKey(w.day, w.time) !== key);
      }
      if (prev.length >= MAX_WINDOWS) {
        toast.error(`Up to ${MAX_WINDOWS} times — remove one to add another.`);
        return prev;
      }
      return [...prev, { day, time }];
    });
  }, []);

  // ── iOS-style time wheel ─────────────────────────────────────────────────
  // Tracked as raw scrollTop (rAF-throttled) rather than per-row refs: with a
  // fixed row height and top padding, every row's on-screen center is pure
  // arithmetic, so no DOM measurement is needed to know what's centered.
  const wheelRef = useRef<HTMLDivElement>(null);
  const wheelScrollRaf = useRef<number | null>(null);
  const [wheelScrollTop, setWheelScrollTop] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  const handleWheelScroll = useCallback(() => {
    if (wheelScrollRaf.current != null) return;
    wheelScrollRaf.current = requestAnimationFrame(() => {
      wheelScrollRaf.current = null;
      if (wheelRef.current) setWheelScrollTop(wheelRef.current.scrollTop);
    });
  }, []);

  // Snap the wheel back to the top slot whenever the viewed day (or the
  // duration, which reshapes daySlots) changes — a fresh day starts fresh.
  useLayoutEffect(() => {
    if (wheelRef.current) wheelRef.current.scrollTop = 0;
    setWheelScrollTop(0);
  }, [viewDayIndex, durationMinutes]);

  const wheelCenterIndex = useMemo(() => {
    if (daySlots.length === 0) return 0;
    const continuousCenter =
      (wheelScrollTop + WHEEL_HEIGHT / 2 - WHEEL_PADDING - WHEEL_ROW_HEIGHT / 2) / WHEEL_ROW_HEIGHT;
    return Math.min(Math.max(Math.round(continuousCenter), 0), daySlots.length - 1);
  }, [wheelScrollTop, daySlots.length]);

  // Tapping the already-centered row adds it; tapping any other row glides
  // it to center instead, same as flicking the drum there yourself.
  const handleWheelRowTap = useCallback(
    (index: number, value: string) => {
      if (index === wheelCenterIndex) {
        toggleWindow(viewDay, value);
        return;
      }
      const el = wheelRef.current;
      if (!el) return;
      const target = index * WHEEL_ROW_HEIGHT + WHEEL_PADDING + WHEEL_ROW_HEIGHT / 2 - WHEEL_HEIGHT / 2;
      el.scrollTo({ top: target, behavior: prefersReducedMotion ? "auto" : "smooth" });
    },
    [wheelCenterIndex, viewDay, toggleWindow, prefersReducedMotion]
  );

  // Swipe handlers for step navigation
  const handleSwipeLeft = useCallback(() => {
    if (canProceed() && currentStep < steps.length - 1) {
      handleNext();
    }
  }, [currentStep, steps.length]);

  const handleSwipeRight = useCallback(() => {
    if (currentStep > 0) {
      handleBack();
    }
  }, [currentStep]);

  const swipeProps = useSwipeGesture({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
  }, { threshold: 60, velocity: 400 });

  // OAuth callback is now handled by /oauth/google/callback page
  // This effect just checks if tokens were updated after returning from OAuth
  useEffect(() => {
    if (open) {
      const storedToken = sessionStorage.getItem("google_access_token");
      const tokenExpiry = sessionStorage.getItem("google_token_expiry");

      if (storedToken && tokenExpiry) {
        const expiry = new Date(tokenExpiry);
        if (expiry > new Date()) {
          setGoogleAccessToken(storedToken);
          setIsGoogleConnected(true);
        }
      }
    }
  }, [open]);

  // Check for stored Google tokens
  useEffect(() => {
    const storedToken = sessionStorage.getItem("google_access_token");
    const tokenExpiry = sessionStorage.getItem("google_token_expiry");

    if (storedToken && tokenExpiry) {
      const expiry = new Date(tokenExpiry);
      if (expiry > new Date()) {
        setGoogleAccessToken(storedToken);
        setIsGoogleConnected(true);
      } else {
        // Try to refresh
        const refreshToken = sessionStorage.getItem("google_refresh_token");
        if (refreshToken) {
          refreshGoogleToken(refreshToken);
        }
      }
    }
  }, [open]);

  // Token exchange is now handled by OAuthGoogleCallback page

  const refreshGoogleToken = async (refreshToken: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: {
          action: "refresh_token",
          refreshToken,
        },
      });

      if (error) throw error;

      sessionStorage.setItem("google_access_token", data.access_token);
      sessionStorage.setItem(
        "google_token_expiry",
        new Date(Date.now() + data.expires_in * 1000).toISOString()
      );

      setGoogleAccessToken(data.access_token);
      setIsGoogleConnected(true);
    } catch (error) {
      console.error("Token refresh failed:", error);
      sessionStorage.removeItem("google_access_token");
      sessionStorage.removeItem("google_refresh_token");
      sessionStorage.removeItem("google_token_expiry");
    }
  };

  const connectGoogleCalendar = () => {
    if (!GOOGLE_CLIENT_ID) {
      // The owner can still finish scheduling without Google, so name the fallback
      // rather than the missing config — setup is our job, not theirs.
      toast.error(
        "I can't reach your Google Calendar yet — pick a time here and I'll send it by email instead."
      );
      return;
    }

    // Save wizard state before OAuth redirect
    const stateToSave: SavedWizardState = {
      currentStep,
      selectedDate: selectedDate ? selectedDate.toISOString() : null,
      selectedTime,
      duration,
      interviewType,
      notes,
      applicationId: applicationId || "",
      candidateName,
      savedAt: Date.now(),
    };
    // Google connect is only ever reached from the exact-time path.
    localStorage.setItem(WIZARD_STATE_KEY, JSON.stringify(stateToSave));

    // Store current URL to return after OAuth
    sessionStorage.setItem("google_oauth_return_url", window.location.pathname + window.location.search);

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", FIXED_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", GOOGLE_SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", "google_calendar_connect");

    window.location.href = authUrl.toString();
  };

  const createCalendarEvent = async () => {
    if (!googleAccessToken || !selectedDate || !selectedTime) return null;

    const [hours, minutes] = selectedTime.split(":").map(Number);
    const startTime = setMinutes(setHours(selectedDate, hours), minutes);
    const endTime = addMinutes(startTime, parseInt(duration));

    try {
      const { data, error } = await supabase.functions.invoke("google-calendar", {
        body: {
          action: "create_event",
          accessToken: googleAccessToken,
          summary: `Interview: ${candidateName} - ${jobTitle || "Position"}`,
          description: `Interview with ${candidateName} for ${jobTitle || "the position"}.\n\n${notes || ""}`,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          attendees: candidateEmail ? [candidateEmail] : [],
          createMeetLink: generateMeetLink,
        },
      });

      if (error) throw error;

      return data;
    } catch (error: any) {
      console.error("Calendar event creation failed:", error);
      throw error;
    }
  };

  const handleSchedule = async () => {
    if (!applicationId) return;
    if (exactTimeMode) {
      if (!selectedDate || !selectedTime) return;
    } else if (sortedSelectedWindows.length < MIN_WINDOWS) {
      return;
    }

    setIsCreating(true);
    try {
      let meetingLink = manualMeetingLink;
      let scheduledAt: Date;
      let interviewDateLabel: string;
      let interviewTimeLabel: string;

      if (exactTimeMode) {
        // Create Google Calendar event with Meet link if connected
        if (isGoogleConnected && generateMeetLink) {
          const eventResult = await createCalendarEvent();
          if (eventResult?.meetLink) {
            meetingLink = eventResult.meetLink;
            setCreatedMeetLink(meetingLink);
          }
        }

        const [hours, minutes] = selectedTime.split(":").map(Number);
        scheduledAt = setMinutes(setHours(selectedDate!, hours), minutes);

        await createInterview.mutateAsync({
          application_id: applicationId,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: parseInt(duration),
          interview_type: interviewType,
          meeting_link: meetingLink || null,
          notes: notes || null,
        });

        interviewDateLabel = format(scheduledAt, "EEEE, MMMM d, yyyy");
        interviewTimeLabel = formatTimeToAMPM(selectedTime);
      } else {
        // Windows mode: offer a set of start times, the candidate picks one.
        // scheduled_at is a placeholder (the earliest window) until they do.
        scheduledAt = combineDayAndTime(sortedSelectedWindows[0].day, sortedSelectedWindows[0].time);
        const employerWindows = sortedSelectedWindows.map((w) => ({
          start: combineDayAndTime(w.day, w.time).toISOString(),
          durationMinutes: parseInt(duration),
        }));

        await createInterview.mutateAsync({
          application_id: applicationId,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: parseInt(duration),
          interview_type: interviewType,
          meeting_link: null,
          notes: notes || null,
          candidate_response: "awaiting_pick",
          employer_windows: employerWindows as unknown as Json,
          meeting_provider: interviewType === "video" ? "daily" : null,
        });

        interviewDateLabel = `${sortedSelectedWindows.length} times to choose from`;
        interviewTimeLabel = "pick what works in your dashboard";
      }

      await updateApplication.mutateAsync({
        id: applicationId,
        status: "interview",
      });

      // Send email notification to candidate
      const { data: appData } = await supabase
        .from("applications")
        .select("candidate_id, jobs(title, employer_id, profiles:employer_id(company_name))")
        .eq("id", applicationId)
        .single();

      if (appData) {
        const resolvedJobTitle = (appData.jobs as { title?: string } | null)?.title || jobTitle || "Position";
        if (exactTimeMode) {
          const { notifyInterviewScheduled } = await import("@/utils/emailNotifications");
          await notifyInterviewScheduled(
            appData.candidate_id,
            resolvedJobTitle,
            interviewDateLabel,
            interviewTimeLabel,
            undefined
          );
        } else {
          const { notifyInterviewPickTime } = await import("@/utils/emailNotifications");
          const proposedTimes = sortedSelectedWindows.map(
            (w) => `${format(w.day, "EEEE, MMMM d")} · ${formatTimeToAMPM(w.time)}`
          );
          await notifyInterviewPickTime(
            appData.candidate_id,
            resolvedJobTitle,
            proposedTimes,
            undefined
          );
        }
      }

      // Invalidate interview queries so ApplicantDetails updates
      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });

      // Clear saved wizard state
      localStorage.removeItem(WIZARD_STATE_KEY);

      // Show success view instead of closing immediately
      setCreatedMeetLink(exactTimeMode ? meetingLink || null : null);
      setShowSuccess(true);

      // Call onComplete to notify parent that scheduling was successful
      onComplete?.();
    } catch (error: any) {
      // Raw Supabase/Postgres messages mean nothing to the owner — keep them in
      // the console for us and give them the one thing they can act on.
      console.error("Interview scheduling failed:", error);
      toast.error("I couldn't book that time. Try again, or pick another slot.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSuccessClose = () => {
    setShowSuccess(false);
    onOpenChange(false);
    resetForm();
  };

  const copyMeetingLink = async () => {
    if (createdMeetLink) {
      await navigator.clipboard.writeText(createdMeetLink);
      setLinkCopied(true);
      toast.success("Meeting link copied!");
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setCurrentStep(0);
    setExactTimeMode(false);
    setSelectedDate(undefined);
    setSelectedTime("");
    setSelectedWindows([]);
    setViewDayIndex(0);
    setDuration("60");
    setInterviewType("video");
    setNotes("");
    setManualMeetingLink("");
    setCreatedMeetLink(null);
    setShowSuccess(false);
    setLinkCopied(false);
  };

  // Restore wizard state from localStorage on mount (after OAuth return)
  useEffect(() => {
    if (open && initialState) {
      // Restore from passed initialState
      setCurrentStep(initialState.currentStep);
      if (initialState.selectedDate) {
        setSelectedDate(new Date(initialState.selectedDate));
      }
      setSelectedTime(initialState.selectedTime);
      setDuration(initialState.duration);
      setInterviewType(initialState.interviewType);
      setNotes(initialState.notes);
      // Google connect only happens from the exact-time path — restore into it.
      setExactTimeMode(true);
      // Move to meeting step since Google is now connected
      setCurrentStep(2);
    }
  }, [open, initialState]);

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        if (exactTimeMode) return !!(selectedDate && selectedTime);
        return selectedWindows.length >= MIN_WINDOWS;
      case 1:
        return true;
      case 2:
        // For video interviews: require either Google auto-generate OR a valid manual link —
        // but only in exact-time mode. Windows mode gets an in-app room, no link to collect.
        if (interviewType === "video") {
          if (!exactTimeMode) return true;
          // Google connected with auto-generate enabled = valid
          if (isGoogleConnected && generateMeetLink) {
            return true;
          }
          // Otherwise, must have a valid manual meeting link
          return isValidMeetingLink(manualMeetingLink);
        }
        // Non-video interviews don't need a meeting link
        return true;
      case 3:
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <>
      {/* Scoped to this wizard only — hides the native scrollbar on the day
          strip and the time wheel so they read as a drum, not a scroll box. */}
      <style>{`
        .iwz-scrollbar-none { scrollbar-width: none; -ms-overflow-style: none; }
        .iwz-scrollbar-none::-webkit-scrollbar { display: none; width: 0; height: 0; }
      `}</style>
      <Dialog open={open} onOpenChange={showSuccess ? handleSuccessClose : onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
        {/* Success View */}
        {showSuccess ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{ willChange: "transform, opacity" }}
            className="p-8 text-center w-full overflow-hidden"
          >
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-success/20 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            
            <h2 className="text-2xl font-semibold mb-2">
              {exactTimeMode ? "Interview Scheduled!" : "Sent."}
            </h2>
            <p className="text-muted-foreground mb-6">
              {exactTimeMode
                ? `Your interview with ${candidateName} has been scheduled.`
                : `${candidateName} picks whichever time works — you'll see it land on your calendar here.`}
            </p>

            {/* Interview Details */}
            <div className="rounded-xl border border-border p-4 mb-6 text-left space-y-3">
              {exactTimeMode ? (
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Date & Time</p>
                    <p className="font-medium">
                      {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : ""} at {formatTimeToAMPM(selectedTime)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Times offered</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {sortedSelectedWindows.map((w) => (
                        <span
                          key={windowKey(w.day, w.time)}
                          className="text-xs font-medium rounded-full border border-border bg-muted/50 px-2 py-1"
                        >
                          {format(w.day, "EEE, MMM d")} · {formatTimeToAMPM(w.time)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-medium">{duration} minutes</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Video className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium capitalize">{interviewType} Interview</p>
                </div>
              </div>
            </div>

            {/* Meeting Link with Copy Button */}
            {createdMeetLink && (
              <div className="mb-6 w-full overflow-hidden">
                <Label className="text-sm font-medium text-muted-foreground mb-2 block text-left">
                  Meeting Link
                </Label>
                <div className="flex items-center gap-2 max-w-full">
                  <div className="flex-1 min-w-0 overflow-hidden p-3 bg-muted/50 rounded-lg border border-border text-left">
                    <a 
                      href={createdMeetLink} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm block truncate"
                      title={createdMeetLink}
                    >
                      {createdMeetLink}
                    </a>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copyMeetingLink}
                    className="shrink-0"
                  >
                    {linkCopied ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {!exactTimeMode && interviewType === "video" && (
              <div className="mb-6 flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-left">
                <Video className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  A private video room is created automatically once {candidateName} confirms a time.
                </p>
              </div>
            )}

            {candidateEmail && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-muted/50 mb-6">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {exactTimeMode
                    ? `Calendar invite sent to ${candidateEmail}`
                    : `Email sent to ${candidateEmail} to pick a time`}
                </span>
              </div>
            )}

            <Button onClick={handleSuccessClose} className="w-full">
              Done
            </Button>
          </motion.div>
        ) : (
          <>
            {/* Progress Header */}
            <div className="border-b border-border p-6 bg-gradient-to-r from-primary/5 to-accent/5">
              <div className="flex items-center justify-between mb-4 pr-10 sm:pr-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                    {(() => {
                      const StepIcon = steps[currentStep]?.icon;
                      return StepIcon ? <StepIcon className="h-5 w-5 text-primary" /> : null;
                    })()}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold">{steps[currentStep]?.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      Scheduling interview with {candidateName}
                    </p>
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">
                  Step {currentStep + 1} of {steps.length}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="flex gap-2">
                {steps.map((step, index) => (
            <motion.div
                    key={step.id}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      index <= currentStep ? "bg-primary" : "bg-muted"
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Content - with swipe support on mobile */}
            <motion.div 
              className="p-6 overflow-y-auto max-h-[60vh] touch-pan-y"
              {...(isMobile ? swipeProps : {})}
            >
              <AnimatePresence mode="wait" initial={false}>
                {/* Step 1: Offer times */}
                {currentStep === 0 && (
                  <motion.div
                    key="calendar"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
                    className="space-y-4"
                  >
                    {/* Exact-time toggle — quiet text link, not a bordered row */}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setExactTimeMode((v) => !v)}
                        onPointerDown={hapticLight}
                        className="text-xs font-medium transition-opacity duration-150 ease-out active:opacity-60 motion-reduce:transition-none"
                        style={{ color: "var(--jade)" }}
                      >
                        {exactTimeMode ? "Offer a few times instead" : "Book one exact time instead"}
                      </button>
                    </div>

                    {exactTimeMode ? (
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* Date Picker */}
                        <div className="space-y-3">
                          <Label className="text-sm font-medium">Select Date</Label>
                          <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            disabled={(date) => date < startOfDay(new Date())}
                            className={cn("rounded-lg border p-3 pointer-events-auto bg-background")}
                          />
                        </div>

                        {/* Time Slots */}
                        <div className="space-y-3">
                          <Label className="text-sm font-medium">Select Time</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto pr-2">
                            {timeSlots.map((slot) => (
                              <TimeSlotButton
                                key={slot.value}
                                slot={slot}
                                isSelected={selectedTime === slot.value}
                                onSelect={setSelectedTime}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Day picker — Apple Calendar week strip. No rectangles, no borders. */}
                        <div
                          className="iwz-scrollbar-none flex gap-1.5 overflow-x-auto px-1 -mx-1 pb-0.5"
                          style={{ scrollSnapType: "x proximity" }}
                        >
                          {dayOptions.map((day, idx) => {
                            const dayStamp = format(day, "yyyy-MM-dd");
                            const hasWindows = selectedWindows.some(
                              (w) => format(w.day, "yyyy-MM-dd") === dayStamp
                            );
                            const active = idx === viewDayIndex;
                            // 60 days spans a couple of month boundaries — a quiet
                            // label (not a border) marks where the next one starts,
                            // so scrolling the strip still reads as a calendar.
                            const isMonthStart = format(day, "d") === "1";
                            return (
                              <div
                                key={idx}
                                className="flex shrink-0 flex-col items-center"
                                style={{
                                  scrollSnapAlign: "start",
                                  marginLeft: isMonthStart && idx > 0 ? 10 : 0,
                                }}
                              >
                                <span
                                  className="h-3 text-[9px] font-semibold uppercase tracking-wider"
                                  style={{ color: "var(--ink-2)" }}
                                  aria-hidden={!isMonthStart}
                                >
                                  {isMonthStart ? format(day, "MMM") : ""}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setViewDayIndex(idx)}
                                  onPointerDown={hapticLight}
                                  className="flex flex-col items-center gap-1 rounded-full px-0.5 pt-0.5 pb-1 transition-transform duration-150 ease-out active:scale-[0.94] motion-reduce:transition-none"
                                >
                                  <span
                                    className="text-[10px] font-semibold uppercase tracking-wide"
                                    style={{ color: "var(--ink-3)" }}
                                  >
                                    {format(day, "EEEEE")}
                                  </span>
                                  <span
                                    className="flex h-11 w-11 items-center justify-center rounded-full text-[15px] font-semibold transition-colors duration-150 ease-out"
                                    style={{
                                      background: active ? "var(--jade)" : "transparent",
                                      color: active ? "var(--slab-ink)" : "var(--ink)",
                                    }}
                                  >
                                    {format(day, "d")}
                                  </span>
                                  <span
                                    className="h-1 w-1 rounded-full transition-opacity duration-150"
                                    style={{ background: "var(--jade)", opacity: hasWindows ? 1 : 0 }}
                                  />
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {/* iOS-style time wheel — the heart of this step */}
                        <div className="flex flex-col items-center gap-2">
                          <p className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>
                            {format(viewDay, "EEEE, MMM d")}
                          </p>
                          <div className="relative w-[200px] max-w-full" style={{ height: WHEEL_HEIGHT }}>
                            {/* Center band — soft jade tint behind the selected row */}
                            <div
                              className="pointer-events-none absolute left-0 right-0 rounded-2xl"
                              style={{
                                top: "50%",
                                height: WHEEL_ROW_HEIGHT,
                                transform: "translateY(-50%)",
                                background: "var(--jade-soft)",
                                zIndex: 0,
                              }}
                            />
                            {daySlots.length === 0 ? (
                              <div
                                className="relative flex h-full items-center justify-center px-4 text-center text-sm"
                                style={{ color: "var(--ink-3)", zIndex: 1 }}
                              >
                                No {duration}-min slots left — try another day.
                              </div>
                            ) : (
                              <div
                                ref={wheelRef}
                                onScroll={handleWheelScroll}
                                className="iwz-scrollbar-none relative h-full overflow-y-auto"
                                style={{
                                  zIndex: 1,
                                  scrollSnapType: "y mandatory",
                                  WebkitOverflowScrolling: "touch",
                                  overscrollBehavior: "contain",
                                  maskImage:
                                    "linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)",
                                  WebkitMaskImage:
                                    "linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)",
                                }}
                              >
                                <div style={{ height: WHEEL_PADDING }} aria-hidden="true" />
                                {daySlots.map((slot, i) => {
                                  const centered = i === wheelCenterIndex;
                                  const continuousCenter =
                                    (wheelScrollTop + WHEEL_HEIGHT / 2 - WHEEL_PADDING - WHEEL_ROW_HEIGHT / 2) /
                                    WHEEL_ROW_HEIGHT;
                                  const distance = Math.abs(i - continuousCenter);
                                  const selected = isWindowSelected(viewDay, slot.value);
                                  return (
                                    <button
                                      key={slot.value}
                                      type="button"
                                      onClick={() => handleWheelRowTap(i, slot.value)}
                                      onPointerDown={hapticLight}
                                      className="flex w-full items-center justify-center"
                                      style={{
                                        height: WHEEL_ROW_HEIGHT,
                                        scrollSnapAlign: "center",
                                        fontSize: centered ? 19 : 15,
                                        fontWeight: centered ? 600 : 500,
                                        color: centered ? "var(--ink)" : "var(--ink-3)",
                                        opacity: prefersReducedMotion
                                          ? 1
                                          : Math.max(0.32, 1 - distance * 0.34),
                                        transform: prefersReducedMotion
                                          ? undefined
                                          : `scale(${Math.max(0.82, 1 - distance * 0.11)})`,
                                        transition: "color 150ms ease-out",
                                      }}
                                    >
                                      {slot.label}
                                      {selected && (
                                        <span
                                          className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full"
                                          style={{ background: "var(--jade)" }}
                                          aria-hidden="true"
                                        />
                                      )}
                                    </button>
                                  );
                                })}
                                <div style={{ height: WHEEL_PADDING }} aria-hidden="true" />
                              </div>
                            )}
                          </div>

                          {/* Add action — jade pill, label tracks the centered row live */}
                          <button
                            type="button"
                            disabled={!daySlots[wheelCenterIndex]}
                            onClick={() => {
                              const centerSlot = daySlots[wheelCenterIndex];
                              if (centerSlot) toggleWindow(viewDay, centerSlot.value);
                            }}
                            onPointerDown={hapticLight}
                            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none disabled:opacity-40 disabled:pointer-events-none"
                            style={
                              daySlots[wheelCenterIndex] &&
                              isWindowSelected(viewDay, daySlots[wheelCenterIndex].value)
                                ? { background: "var(--jade-soft)", color: "var(--jade-soft-fg)" }
                                : { background: "var(--jade)", color: "var(--btn-fg)" }
                            }
                          >
                            {daySlots[wheelCenterIndex] ? (
                              isWindowSelected(viewDay, daySlots[wheelCenterIndex].value) ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )
                            ) : null}
                            {daySlots[wheelCenterIndex]
                              ? `${
                                  isWindowSelected(viewDay, daySlots[wheelCenterIndex].value) ? "Added" : "Add"
                                } ${format(viewDay, "EEE")} ${formatTimeToAMPM(daySlots[wheelCenterIndex].value)}`
                              : "No times left today"}
                          </button>
                        </div>

                        {/* Selected windows as removable chips */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>
                              Times you're offering
                            </span>
                            <span
                              className="text-xs font-medium"
                              style={{
                                color:
                                  selectedWindows.length >= MIN_WINDOWS ? "var(--jade)" : "var(--ink-3)",
                              }}
                            >
                              {selectedWindows.length} of {MAX_WINDOWS}
                            </span>
                          </div>
                          {sortedSelectedWindows.length === 0 ? (
                            <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                              Scroll the wheel and tap Add to offer a time.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {sortedSelectedWindows.map((w) => (
                                <span
                                  key={windowKey(w.day, w.time)}
                                  className="inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-1.5 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none"
                                  style={{ background: "var(--surface-2)", color: "var(--ink)" }}
                                >
                                  {format(w.day, "EEE d")} · {formatTimeToAMPM(w.time)}
                                  <button
                                    type="button"
                                    onClick={() => toggleWindow(w.day, w.time)}
                                    onPointerDown={hapticLight}
                                    aria-label={`Remove ${format(w.day, "EEE d")} ${formatTimeToAMPM(w.time)}`}
                                    className="rounded-full p-1 transition-transform duration-150 ease-out active:scale-90 motion-reduce:transition-none"
                                    style={{ color: "var(--ink-3)" }}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          {selectedWindows.length === 1 && (
                            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                              Tip: offering 2–3 times usually gets a faster pick.
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}

                {/* Step 2: Details */}
                {currentStep === 1 && (
                  <motion.div
                    key="details"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
                    className="space-y-6"
                  >
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Duration</Label>
                        <Select value={duration} onValueChange={setDuration}>
                          <SelectTrigger className="bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">15 minutes</SelectItem>
                            <SelectItem value="30">30 minutes</SelectItem>
                            <SelectItem value="45">45 minutes</SelectItem>
                            <SelectItem value="60">1 hour</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Interview Type</Label>
                        <Select value={interviewType} onValueChange={setInterviewType}>
                          <SelectTrigger className="bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="video">
                              <div className="flex items-center gap-2">
                                <Video className="h-4 w-4" />
                                Video Call
                              </div>
                            </SelectItem>
                            <SelectItem value="phone">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Phone Call
                              </div>
                            </SelectItem>
                            <SelectItem value="in-person">
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                In Person
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Interview Notes (Optional)</Label>
                      <Textarea
                        placeholder="Topics to cover, interview format, preparation instructions..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={4}
                        className="resize-none bg-background"
                      />
                    </div>
                  </motion.div>
                )}

                {/* Step 3: Meeting Setup */}
                {currentStep === 2 && (
                  <motion.div
                    key="meeting"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
                    className="space-y-6"
                  >
                    {interviewType === "video" && !exactTimeMode && (
                      <div className="p-4 rounded-lg border border-border bg-card">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
                            <Video className="h-6 w-6" style={{ color: "hsl(var(--primary-foreground))" }} />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-foreground">In-app video room</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              No link to send — a private room is created automatically once {candidateName} confirms
                              a time, and you'll both join it right here in HireFlow.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {interviewType === "video" && exactTimeMode && (
                      <>
                        {/* Google Calendar Connection */}
                        <div className="p-4 rounded-lg border border-border bg-card">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
                              <CalendarIcon className="h-6 w-6" style={{ color: "hsl(var(--primary-foreground))" }} />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-foreground">Google Calendar Integration</h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                Connect to automatically create calendar events and Google Meet links
                              </p>
                              
                              {isGoogleConnected ? (
                                <div className="mt-3 flex items-center gap-2">
                                  <Badge className="bg-success/20 text-success">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Connected
                                  </Badge>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      sessionStorage.removeItem("google_access_token");
                                      sessionStorage.removeItem("google_refresh_token");
                                      sessionStorage.removeItem("google_token_expiry");
                                      setIsGoogleConnected(false);
                                      setGoogleAccessToken(null);
                                    }}
                                  >
                                    Disconnect
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="mt-3 gap-2"
                                  onClick={connectGoogleCalendar}
                                  disabled={isConnectingGoogle}
                                >
                                  {isConnectingGoogle ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <ExternalLink className="h-4 w-4" />
                                  )}
                                  Connect Google Calendar
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Meet Link Options */}
                        {isGoogleConnected && (
                          <div className="space-y-3">
                            <Label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={generateMeetLink}
                                onChange={(e) => setGenerateMeetLink(e.target.checked)}
                                className="rounded"
                              />
                              <span>Generate Google Meet link automatically</span>
                            </Label>
                          </div>
                        )}

                        {/* Manual Link */}
                        {(!isGoogleConnected || !generateMeetLink) && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Meeting Link <span className="text-destructive">*</span></Label>
                            <div className="relative">
                              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="https://meet.google.com/... or https://zoom.us/j/..."
                                value={manualMeetingLink}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setManualMeetingLink(value);
                                  
                                  // Validate and show error only if user has typed something
                                  if (value && !isValidMeetingLink(value)) {
                                    setMeetingLinkError("Please enter a valid Google Meet, Zoom, or Teams link");
                                  } else {
                                    setMeetingLinkError(null);
                                  }
                                }}
                                className={cn(
                                  "pl-10 bg-background",
                                  meetingLinkError && "border-destructive focus-visible:ring-destructive"
                                )}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Accepted: Google Meet, Zoom, Microsoft Teams, Webex, GoToMeeting
                            </p>
                            {meetingLinkError && (
                              <p className="text-xs text-destructive">{meetingLinkError}</p>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {interviewType !== "video" && (
                      <div className="p-8 text-center text-muted-foreground">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No meeting link required for {interviewType} interviews.</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Step 4: Review */}
                {currentStep === 3 && (
                  <motion.div
                    key="review"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
                    className="space-y-6"
                  >
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-4 border-b border-border">
                        <h3 className="font-semibold text-foreground flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-primary" />
                          Interview Summary
                        </h3>
                      </div>
                      
                      <div className="p-4 space-y-4">
                        <div className="flex items-center gap-3">
                          <Users className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Candidate</p>
                            <p className="font-medium">{candidateName}</p>
                          </div>
                        </div>

                        {exactTimeMode ? (
                          <div className="flex items-center gap-3">
                            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm text-muted-foreground">Date & Time</p>
                              <p className="font-medium">
                                {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : ""} at {formatTimeToAMPM(selectedTime)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-sm text-muted-foreground">Times offered</p>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {sortedSelectedWindows.map((w) => (
                                  <span
                                    key={windowKey(w.day, w.time)}
                                    className="text-xs font-medium rounded-full border border-border bg-muted/40 px-2 py-1"
                                  >
                                    {format(w.day, "EEE, MMM d")} · {formatTimeToAMPM(w.time)}
                                  </span>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1.5">{candidateName} picks one.</p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-3">
                          <Clock className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Duration</p>
                            <p className="font-medium">{duration} minutes</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Video className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Type</p>
                            <p className="font-medium capitalize">{interviewType} Interview</p>
                          </div>
                        </div>

                        {interviewType === "video" && (
                          <div className="flex items-center gap-3">
                            <Link2 className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="text-sm text-muted-foreground">Meeting</p>
                              <p className="font-medium">
                                {!exactTimeMode
                                  ? "In-app video room — created automatically"
                                  : isGoogleConnected && generateMeetLink
                                  ? "Google Meet link will be generated"
                                  : manualMeetingLink || "No link provided"}
                              </p>
                            </div>
                          </div>
                        )}

                        {notes && (
                          <div className="flex items-start gap-3 pt-2 border-t border-border">
                            <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-sm text-muted-foreground">Notes</p>
                              <p className="text-sm">{notes}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {candidateEmail && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {exactTimeMode
                            ? `Calendar invite will be sent to ${candidateEmail}`
                            : `An email will be sent to ${candidateEmail} to pick a time`}
                        </span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              {isMobile && (
                <p className="text-center text-xs text-muted-foreground pt-4">
                  Swipe left/right to navigate steps
                </p>
              )}
            </motion.div>

            {/* Footer */}
            <div className="border-t border-border p-4 flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={currentStep === 0 ? () => onOpenChange(false) : handleBack}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                {currentStep === 0 ? "Cancel" : "Back"}
              </Button>

              {currentStep < steps.length - 1 ? (
                <Button onClick={handleNext} disabled={!canProceed()}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleSchedule} disabled={isCreating}>
                  {isCreating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  {exactTimeMode ? "Schedule Interview" : "Send Times"}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
      </Dialog>
    </>
  );
}

// Export the state type for use in parent components
export type { SavedWizardState };
