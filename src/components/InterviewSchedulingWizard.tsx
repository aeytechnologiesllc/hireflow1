import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect, memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateInterview, useInterviews } from "@/hooks/useInterviews";
import { clashAt, clashWords, type BusyInterview } from "@/lib/interviewClash";
import { atClock, firstDayWithTimes, timesLeftOn } from "@/lib/interviewOfferDays";
import { sayClock, suggestTimes, suggestionWords } from "@/lib/interviewSuggestion";
import { useJobInterviewHints } from "@/hooks/useJobInterviewHints";
import { useUpdateApplication } from "@/hooks/useApplications";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import type { EmailStatus } from "@/utils/emailNotifications";
import { candidateOrigin } from "@/lib/hosts";
import { applicantEmailTime, clockGapWords, inviteEmailWords, localTimeZone, shortTimeIn, zonePlace } from "@/lib/interviewTimes";
import { fetchApplicantTimeZone, useApplicantTimeZone } from "@/hooks/useApplicantTimeZone";

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

// One time, and only one. The owner, 2026-10-07: "I wanna just give them one
// time for the interview, not two, just one ... because I don't want them to
// pick two times and then I can't do those two times." The applicant books
// it, or writes when they are free and the owner sets a new time. (Until
// then the wheel took up to six, and the applicant picked among them.)
// Choosing another time replaces the one chosen.
const MIN_WINDOWS = 1;
const MAX_WINDOWS = 1;
// Interviews shouldn't run past this local time, so longer durations quietly
// drop the last few start slots of the day instead of overflowing into night.
const DAY_CUTOFF = { hour: 20, minute: 30 };

// iOS-style time wheel geometry — the drum is exactly this tall, each row
// exactly this tall, and padded top/bottom so the first and last slot can
// still scroll all the way to the centered band.
const WHEEL_HEIGHT = 200;
const WHEEL_ROW_HEIGHT = 40;
const WHEEL_PADDING = (WHEEL_HEIGHT - WHEEL_ROW_HEIGHT) / 2;

const WIZARD_STATE_KEY = "interview_wizard_state";
const WIZARD_STATE_EXPIRY = 30 * 60 * 1000; // 30 minutes
// The owner's own meeting link, remembered on this browser: one Google Meet
// "meeting for later" link serves every interview, so it is pasted once.
const OWN_LINK_KEY = "interview_own_meeting_link";
// A first conversation with someone who finished every test: half an hour.
const DEFAULT_DURATION = "30";

const rememberedOwnLink = (): string => {
  try {
    return localStorage.getItem(OWN_LINK_KEY) ?? "";
  } catch {
    return "";
  }
};

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/calendar.events";
// Google only returns to addresses registered on its sign-in client, and the
// registered one is the candidates' host. So the calendar sign-in always comes
// back through hireflownow.com, whose HostGate forwards the code to the staff
// host when the split is on (src/lib/hosts.ts). Both the request and the code
// exchange must name this same address.
const FIXED_REDIRECT_URI = `${candidateOrigin()}/oauth/google/callback`;

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

// The same start times as plain "HH:mm", and the day's cutoff, for
// src/lib/interviewOfferDays.ts (what is left of a day, and which day to open on).
const SLOT_VALUES = timeSlots.map((slot) => slot.value);

// Memoized time slot button for performance
const TimeSlotButton = memo(({ 
  slot, 
  isSelected, 
  onSelect,
  disabled = false,
}: { 
  slot: { value: string; label: string }; 
  isSelected: boolean; 
  onSelect: (value: string) => void;
  /** A time on the chosen day that has already passed. */
  disabled?: boolean;
}) => (
  <Button
    type="button"
    variant={isSelected ? "default" : "outline"}
    size="sm"
    className="w-full"
    disabled={disabled}
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

/**
 * One offered time: the owner's clock, and under it the applicant's own when
 * theirs differs. Two short lines, so neither breaks in the middle on a phone.
 */
function OfferedTime({ mine, theirs }: { mine: string; theirs: string | null }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="whitespace-nowrap">{mine}</span>
      {theirs && (
        <span className="whitespace-nowrap text-[11px] font-normal" style={{ color: "var(--ink-3)" }}>
          {theirs} theirs
        </span>
      )}
    </span>
  );
}

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
  // The default: the employer offers one time and the applicant books it (or
  // says they cannot make it). The toggle below books a time outright, for a
  // time already agreed by other means.
  const [exactTimeMode, setExactTimeMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState("");
  const [selectedWindows, setSelectedWindows] = useState<WindowSlot[]>([]);
  const [viewDayIndex, setViewDayIndex] = useState(0);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
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
  // Whether the candidate email actually went out (Resend can be unconfigured,
  // or they can have this notification type turned off) — the success screen
  // only claims "sent" once this says so.
  const [candidateEmailStatus, setCandidateEmailStatus] = useState<EmailStatus | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [meetingLinkError, setMeetingLinkError] = useState<string | null>(null);
  // Offering times: the built-in room, or a link of the owner's own (Google
  // Meet, Zoom). Booking one exact time has always taken a link.
  const [ownLinkMode, setOwnLinkMode] = useState(false);

  // The applicant's own clock, as their connection check recorded it: shown
  // beside every time here, and what their email says (src/lib/interviewTimes.ts).
  const teamZone = useMemo(() => localTimeZone(), []);
  const zoneLookup = useApplicantTimeZone(applicationId, open);
  const applicantZone = zoneLookup.data ?? null;
  const firstName = candidateName.trim().split(/\s+/)[0] || "them";
  // Whose clock is shown beside the owner's own: the applicant's when their
  // connection check recorded it, else the one the job is posted for
  // (src/lib/interviewSuggestion.ts). The owner, 2026-10-07: "since my job is
  // posted in the Philippines ... based on where I post it, the time should
  // show me." Only what this screen SHOWS: their email still states their own
  // clock, or the team's (named) when theirs is not on file.
  const jobHints = useJobInterviewHints(applicationId, open).data ?? null;
  const shownZone = applicantZone ?? jobHints?.zone ?? null;
  const theirTime = useCallback(
    (at: Date): string | null => (shownZone && shownZone !== teamZone ? shortTimeIn(at, shownZone) : null),
    [shownZone, teamZone],
  );
  const showTheirClock = !!shownZone && shownZone !== teamZone;

  const queryClient = useQueryClient();
  const createInterview = useCreateInterview();
  // The team's other live interviews: a time that runs into one is said so
  // before it is sent (src/lib/interviewClash.ts). This applicant's own
  // earlier interview is left out: it is replaced by the one being set up.
  const allInterviews = useInterviews().data;
  const busy = useMemo<BusyInterview[]>(
    () =>
      (allInterviews ?? [])
        .filter((row) => row.status === "scheduled" && row.application_id !== applicationId && row.candidate_response !== "reschedule_requested")
        .map((row) => ({
          id: row.id,
          name: row.applications?.profiles?.full_name ?? row.applications?.profiles?.email ?? "another applicant",
          start: row.scheduled_at,
          minutes: row.duration_minutes,
          booked: row.candidate_response === "confirmed",
        })),
    [allInterviews, applicationId],
  );
  const updateApplication = useUpdateApplication();
  const isMobile = useIsMobile();

  const steps = [
    { id: "calendar", title: "Offer a Time", icon: CalendarIcon },
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
    // `open` isn't read above; it's the deliberate trigger so "today" is re-read each open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );
  const viewDay = dayOptions[viewDayIndex] ?? dayOptions[0];

  // 30-min slots for the viewed day that still fit the chosen duration before
  // the day's cutoff, and aren't already in the past.
  const daySlots = useMemo(() => {
    const left = new Set(timesLeftOn(viewDay, SLOT_VALUES, durationMinutes, new Date(), DAY_CUTOFF));
    return timeSlots.filter((slot) => left.has(slot.value));
  }, [viewDay, durationMinutes]);

  // Open on the first day that still has a time to offer. It used to open on
  // today, always: late in the evening that is an empty wheel ("No 30-min
  // slots left"), and the owner sets interviews up in the evening.
  useEffect(() => {
    if (!open) return;
    setViewDayIndex(firstDayWithTimes(dayOptions, SLOT_VALUES, durationMinutes, new Date(), DAY_CUTOFF));
    // Only when it opens: after that the day is the owner's own choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Booking a time outright: a time of the chosen day that has passed is
  // not offered, and one chosen before it passed is dropped.
  const exactTimePassed = useCallback(
    (clock: string) => !!selectedDate && atClock(selectedDate, clock).getTime() <= Date.now(),
    [selectedDate],
  );
  useEffect(() => {
    if (selectedTime && exactTimePassed(selectedTime)) setSelectedTime("");
  }, [selectedTime, exactTimePassed]);

  const sortedSelectedWindows = useMemo(
    () =>
      [...selectedWindows].sort(
        (a, b) => combineDayAndTime(a.day, a.time).getTime() - combineDayAndTime(b.day, b.time).getTime()
      ),
    [selectedWindows]
  );

  // The chosen time runs into another interview of the team's: said before it is sent.
  const offeredClash = useMemo(() => {
    const chosen = sortedSelectedWindows[0];
    if (!chosen) return null;
    return clashAt(combineDayAndTime(chosen.day, chosen.time), durationMinutes, busy);
  }, [sortedSelectedWindows, durationMinutes, busy]);

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
      // One time: a new choice takes the place of the last.
      return [...prev.slice(0, MAX_WINDOWS - 1), { day, time }];
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

  // Which of the day's times to suggest: the ones inside the job's own shift
  // when its post states one, else the applicant's waking hours
  // (src/lib/interviewSuggestion.ts). "Show me a suggestion always in there,
  // what would be good based on the job ... it's got to be good for me too":
  // the owner's own hours are already the times this wheel offers.
  const suggestion = useMemo(
    () => suggestTimes(viewDay, daySlots.map((slot) => slot.value), durationMinutes, shownZone, jobHints?.shift ?? null),
    [viewDay, daySlots, durationMinutes, shownZone, jobHints],
  );
  const suggestedTimes = useMemo(() => new Set(suggestion.slots), [suggestion]);
  const suggestionSaid = useMemo(
    () => suggestionWords(suggestion, viewDay, shownZone, firstName === "them" ? "" : firstName),
    [suggestion, viewDay, shownZone, firstName],
  );
  // Not worth saying when every time on offer suits them anyway.
  const showSuggestion =
    !!shownZone && shownZone !== teamZone && daySlots.length > 0 && !(suggestion.kind === "waking" && suggestion.slots.length === daySlots.length);
  const firstSuggestedIndex = useMemo(
    () => (showSuggestion && suggestion.slots.length > 0 ? daySlots.findIndex((slot) => slot.value === suggestion.slots[0]) : -1),
    [showSuggestion, suggestion, daySlots],
  );

  // The wheel starts each day on the first suggested time (the top one when
  // there is none), until the owner moves it himself: after that it is his.
  const wheelMovedByHand = useRef(false);
  const markWheelMoved = useCallback(() => {
    wheelMovedByHand.current = true;
  }, []);
  useLayoutEffect(() => {
    wheelMovedByHand.current = false;
  }, [viewDayIndex, open]);
  useLayoutEffect(() => {
    if (wheelMovedByHand.current) return;
    const top = Math.max(0, firstSuggestedIndex) * WHEEL_ROW_HEIGHT;
    if (wheelRef.current) wheelRef.current.scrollTop = top;
    setWheelScrollTop(top);
  }, [viewDayIndex, durationMinutes, firstSuggestedIndex, open]);
  // Coming back to this step puts a new wheel on the page: it is set to
  // where the last one was, so the lit row and the button still agree.
  useLayoutEffect(() => {
    if (currentStep === 0 && wheelRef.current) wheelRef.current.scrollTop = wheelScrollTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);
  const goToSuggested = useCallback(() => {
    if (firstSuggestedIndex < 0 || !wheelRef.current) return;
    wheelRef.current.scrollTo({ top: firstSuggestedIndex * WHEEL_ROW_HEIGHT, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }, [firstSuggestedIndex, prefersReducedMotion]);

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

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 0:
        if (exactTimeMode) return !!(selectedDate && selectedTime) && !exactTimePassed(selectedTime);
        return selectedWindows.length >= MIN_WINDOWS;
      case 1:
        return true;
      case 2:
        // For video interviews: require either Google auto-generate OR a valid manual link
        // in exact-time mode. Windows mode gets the in-app room unless the owner
        // chose a link of their own, which then has to be a real one.
        if (interviewType === "video") {
          if (!exactTimeMode) return !ownLinkMode || isValidMeetingLink(manualMeetingLink);
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
  }, [
    currentStep,
    exactTimeMode,
    selectedDate,
    selectedTime,
    exactTimePassed,
    selectedWindows,
    interviewType,
    isGoogleConnected,
    generateMeetLink,
    manualMeetingLink,
    ownLinkMode,
  ]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, steps.length]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  // Swipe handlers for step navigation
  const handleSwipeLeft = useCallback(() => {
    if (canProceed() && currentStep < steps.length - 1) {
      handleNext();
    }
  }, [currentStep, steps.length, canProceed, handleNext]);

  const handleSwipeRight = useCallback(() => {
    if (currentStep > 0) {
      handleBack();
    }
  }, [currentStep, handleBack]);

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
        "I can't reach your Google Calendar yet — pick a time here and I'll get it to them in HireFlow."
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
    } catch (error) {
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
      // One live interview for an application. Any earlier one still live
      // (an offer never answered, a time already set) is replaced by this
      // one, after this one is safely made: on 2026-10-07 the owner set up a
      // second interview for the same applicant and both sat on the
      // Interviews page, one "No time yet" and one confirmed.
      const { data: earlierLive } = await supabase
        .from("interviews")
        .select("id")
        .eq("application_id", applicationId)
        .eq("status", "scheduled");
      const earlierIds = (earlierLive ?? []).map((row) => row.id);

      let meetingLink = interviewType === "video" ? manualMeetingLink.trim() : "";
      // Offering times with a link of the owner's own instead of the built-in room.
      const ownLink = !exactTimeMode && interviewType === "video" && ownLinkMode ? manualMeetingLink.trim() : "";
      let scheduledAt: Date;
      let interviewDateLabel: string;
      let interviewTimeLabel: string;
      // Their email states every time on THEIR clock, with the zone named. The
      // lookup has usually landed by now; when it has not, ask once more.
      const theirZone = applicantZone ?? (await fetchApplicantTimeZone(applicationId));

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

        const written = applicantEmailTime(scheduledAt, theirZone, teamZone);
        interviewDateLabel = written.date;
        interviewTimeLabel = written.time;
      } else {
        // Windows mode: offer a set of start times, the candidate picks one.
        // scheduled_at is a placeholder (the earliest window) until they do.
        scheduledAt = combineDayAndTime(sortedSelectedWindows[0].day, sortedSelectedWindows[0].time);
        // `zone` is the clock these were picked on: what the applicant's
        // answer is written on when the team is told (candidate-interview-response).
        // Replacing an interview that was still live (the time changed):
        // marked `again`, so the applicant's page and email say "a new time".
        const employerWindows = sortedSelectedWindows.map((w) => ({
          start: combineDayAndTime(w.day, w.time).toISOString(),
          durationMinutes: parseInt(duration),
          zone: teamZone,
          ...(earlierIds.length > 0 ? { again: true } : {}),
        }));

        await createInterview.mutateAsync({
          application_id: applicationId,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: parseInt(duration),
          interview_type: interviewType,
          meeting_link: ownLink || null,
          notes: notes || null,
          candidate_response: "awaiting_pick",
          employer_windows: employerWindows as unknown as Json,
          // 'daily' is the built-in room; a link of the owner's own takes its
          // place, and both sides then get that link to join.
          meeting_provider: interviewType === "video" && !ownLink ? "daily" : null,
        });

        interviewDateLabel = `${sortedSelectedWindows.length} times to choose from`;
        interviewTimeLabel = "pick what works in your dashboard";
      }

      if (earlierIds.length > 0) {
        const { error: replaceError } = await supabase.from("interviews").update({ status: "cancelled" }).in("id", earlierIds);
        if (replaceError) console.error("[interview] could not retire the earlier interview:", replaceError);
      }

      await updateApplication.mutateAsync({
        id: applicationId,
        status: "interview",
      });

      // Tell the applicant by email. The lookup asks only for what the email
      // needs. Until 2026-10-07 it also asked for the employer's company name
      // through a relationship the database does not have: the request was
      // refused (400), nothing was said, and no invitation was ever emailed.
      // The owner's own test found it. A lookup that fails now says so.
      const { data: appData, error: appLookupError } = await supabase
        .from("applications")
        .select("candidate_id, jobs(title)")
        .eq("id", applicationId)
        .single();

      if (appLookupError || !appData?.candidate_id) {
        console.error("[interview] could not look up who to email the invitation to:", appLookupError);
        setCandidateEmailStatus("failed");
      } else {
        const resolvedJobTitle = (appData.jobs as { title?: string } | null)?.title || jobTitle || "Position";
        if (exactTimeMode) {
          const { notifyInterviewScheduled } = await import("@/utils/emailNotifications");
          const status = await notifyInterviewScheduled(
            appData.candidate_id,
            resolvedJobTitle,
            interviewDateLabel,
            interviewTimeLabel,
            undefined
          );
          setCandidateEmailStatus(status);
        } else {
          const { notifyInterviewPickTime } = await import("@/utils/emailNotifications");
          const proposedTimes = sortedSelectedWindows.map(
            (w) => applicantEmailTime(combineDayAndTime(w.day, w.time), theirZone, teamZone).line
          );
          const status = await notifyInterviewPickTime(
            appData.candidate_id,
            resolvedJobTitle,
            proposedTimes,
            undefined,
            earlierIds.length > 0,
            { interviewType, minutes: parseInt(duration) }
          );
          setCandidateEmailStatus(status);
        }
      }

      // Invalidate interview queries so ApplicantDetails updates
      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });

      // Clear saved wizard state
      localStorage.removeItem(WIZARD_STATE_KEY);
      // A pasted link is remembered for the next interview (this browser only).
      const pastedLink = exactTimeMode ? (isGoogleConnected && generateMeetLink ? "" : meetingLink) : ownLink;
      if (pastedLink) {
        try {
          localStorage.setItem(OWN_LINK_KEY, pastedLink);
        } catch {
          // Private window or blocked storage: it is only a convenience.
        }
      }

      // Show success view instead of closing immediately
      setCreatedMeetLink(exactTimeMode ? meetingLink || null : ownLink || null);
      setShowSuccess(true);

      // Call onComplete to notify parent that scheduling was successful
      onComplete?.();
    } catch (error) {
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
    setDuration(DEFAULT_DURATION);
    setInterviewType("video");
    setNotes("");
    setManualMeetingLink("");
    setMeetingLinkError(null);
    setOwnLinkMode(false);
    setCreatedMeetLink(null);
    setShowSuccess(false);
    setLinkCopied(false);
    setCandidateEmailStatus(null);
  };

  // The link the owner pasted last time comes back with them: whoever ran the
  // last interview on their own Google Meet link almost always wants it again.
  useEffect(() => {
    if (!open) return;
    const remembered = rememberedOwnLink();
    if (!remembered || !isValidMeetingLink(remembered)) return;
    setManualMeetingLink((current) => current || remembered);
    setOwnLinkMode(true);
  }, [open]);

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

  // The one place a meeting link is typed: booking an exact time, or offering
  // times with a link of the owner's own.
  const meetingLinkField = (
    <div className="space-y-2">
      <Label className="text-sm font-medium" htmlFor="interview-meeting-link">
        Meeting Link <span className="text-destructive">*</span>
      </Label>
      <div className="relative">
        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id="interview-meeting-link"
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
  );

  return (
    <>
      {/* Scoped to this wizard only — hides the native scrollbar on the day
          strip and the time wheel so they read as a drum, not a scroll box. */}
      <style>{`
        .iwz-scrollbar-none { scrollbar-width: none; -ms-overflow-style: none; }
        .iwz-scrollbar-none::-webkit-scrollbar { display: none; width: 0; height: 0; }
      `}</style>
      <Dialog open={open} onOpenChange={showSuccess ? handleSuccessClose : onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0" aria-describedby={undefined}>
        {/* A name for screen readers; every step draws its own visible heading. */}
        <DialogTitle className="sr-only">Set up an interview with {candidateName}</DialogTitle>
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
                : `${candidateName} is asked to book this time, and you are told when they do. If they can't make it, they write when they are free and you set a new time.`}
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
                    {selectedDate && selectedTime && theirTime(combineDayAndTime(selectedDate, selectedTime)) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {theirTime(combineDayAndTime(selectedDate, selectedTime))} for {firstName}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Time offered</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {sortedSelectedWindows.map((w) => (
                        <span
                          key={windowKey(w.day, w.time)}
                          className="text-xs font-medium rounded-xl border border-border bg-muted/50 px-2.5 py-1"
                        >
                          <OfferedTime
                            mine={`${format(w.day, "EEE, MMM d")} · ${formatTimeToAMPM(w.time)}`}
                            theirs={theirTime(combineDayAndTime(w.day, w.time))}
                          />
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
                {!exactTimeMode && (
                  <p className="text-xs text-muted-foreground mt-2 text-left">
                    {firstName} gets this link once they have picked a time.
                  </p>
                )}
              </div>
            )}

            {!exactTimeMode && interviewType === "video" && !createdMeetLink && (
              <div className="mb-6 flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-left">
                <Video className="h-5 w-5 text-muted-foreground shrink-0" />
                <p className="text-sm text-muted-foreground">
                  A private video room is created automatically once {candidateName} confirms a time.
                </p>
              </div>
            )}

            {/* What happened to the invitation email, said truthfully: "sent"
                only when the mail service took it. */}
            <div
              data-testid="invite-email-status"
              data-email-status={candidateEmailStatus ?? "none"}
              className={cn(
                "flex items-center justify-center gap-2 p-3 rounded-lg mb-6",
                candidateEmailStatus === "sent" ? "bg-muted/50" : "border border-[var(--brass-line)] bg-[var(--amber-bg)]",
              )}
            >
              <Mail className={cn("h-4 w-4 shrink-0", candidateEmailStatus === "sent" ? "text-muted-foreground" : "text-[var(--amber-fg)]")} />
              <span className={cn("text-sm", candidateEmailStatus === "sent" ? "text-muted-foreground" : "text-foreground")}>
                {inviteEmailWords(candidateEmailStatus, { email: candidateEmail, firstName, exactTime: exactTimeMode })}
              </span>
            </div>

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
                        {exactTimeMode ? "Offer a time for them to book instead" : "Already agreed a time? Book it directly"}
                      </button>
                    </div>

                    {/* Whose clock: the times here are the owner's; the applicant's
                        own are beside them, and their email states theirs. */}
                    {applicantZone && applicantZone !== teamZone && (
                      <p className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }} data-testid="their-clock-note">
                        {firstName} is in {zonePlace(applicantZone)}, {clockGapWords(new Date(), applicantZone, teamZone)}. You
                        pick on your clock; their own time is shown beside it, and it is the time their email states.
                      </p>
                    )}
                    {zoneLookup.isFetched && !applicantZone && shownZone && shownZone !== teamZone && (
                      <p className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }} data-testid="their-clock-note">
                        {firstName}&apos;s own time zone is not on file. This job is posted on {zonePlace(shownZone)} time,{" "}
                        {clockGapWords(new Date(), shownZone, teamZone)}, so that is the time shown beside yours. Their email
                        gives the time on your clock and names your time zone.
                      </p>
                    )}
                    {zoneLookup.isFetched && !applicantZone && !(shownZone && shownZone !== teamZone) && (
                      <p className="text-xs leading-relaxed" style={{ color: "var(--ink-2)" }} data-testid="their-clock-note">
                        {firstName}'s time zone is not on file, so their email gives these times on your clock and names
                        your time zone.
                      </p>
                    )}

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
                                disabled={exactTimePassed(slot.value)}
                              />
                            ))}
                          </div>
                          {selectedDate && selectedTime && theirTime(combineDayAndTime(selectedDate, selectedTime)) && (
                            <p className="text-xs" style={{ color: "var(--ink-2)" }} data-testid="their-time-exact">
                              That is {theirTime(combineDayAndTime(selectedDate, selectedTime))} for {firstName}.
                            </p>
                          )}
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
                          {/* The day, and beside it the suggestion: always here when
                              their clock is known. One line, so the wheel and its
                              button stay on the screen without scrolling. */}
                          <div className="max-w-[600px] text-center" data-testid={showSuggestion ? "time-suggestion" : undefined} data-suggestion-kind={showSuggestion ? suggestion.kind : undefined}>
                            <p className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5">
                              <span className="text-xs font-medium" style={{ color: "var(--ink-3)" }} data-testid="wheel-day">
                                {format(viewDay, "EEEE, MMM d")}
                              </span>
                              {showSuggestion && suggestionSaid.headline && (
                                <>
                                  <span
                                    className="text-[10px] font-bold uppercase leading-[1.2] tracking-[0.12em]"
                                    style={{ color: "var(--brass)" }}
                                  >
                                    Suggested
                                  </span>
                                  <span className="text-[14.5px] font-semibold" style={{ color: "var(--ink)" }}>
                                    {suggestionSaid.headline}
                                  </span>
                                  {firstSuggestedIndex >= 0 && !suggestedTimes.has(daySlots[wheelCenterIndex]?.value ?? "") && (
                                    <button
                                      type="button"
                                      onClick={goToSuggested}
                                      onPointerDown={hapticLight}
                                      className="text-xs font-semibold transition-opacity duration-150 ease-out active:opacity-60 motion-reduce:transition-none"
                                      // The phone stylesheet's 44px button floor would open a gap in this line.
                                      style={{ color: "var(--jade)", minHeight: 0, padding: 0 }}
                                      data-testid="time-suggestion-go"
                                    >
                                      Go to {sayClock(suggestion.slots[0])}
                                    </button>
                                  )}
                                </>
                              )}
                            </p>
                            {showSuggestion && (
                              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
                                {suggestionSaid.why}
                              </p>
                            )}
                          </div>
                          <div className={cn("relative max-w-full", showTheirClock ? "w-[300px]" : "w-[200px]")} style={{ height: WHEEL_HEIGHT }}>
                            {/* Two clocks, side by side: the owner's, and theirs. Named over
                                the top of the wheel, where its rows fade out anyway. */}
                            {showTheirClock && daySlots.length > 0 && (
                              <div
                                className="pointer-events-none absolute inset-x-0 top-0 grid grid-cols-2 gap-4 px-2.5 text-[10px] font-bold uppercase leading-[1.2] tracking-[0.1em]"
                                style={{ color: "var(--ink-3)", zIndex: 2 }}
                                data-testid="wheel-clocks"
                              >
                                <span className="text-right">Your time</span>
                                <span className="truncate text-left">{firstName === "them" ? "Their" : `${firstName}'s`} time</span>
                              </div>
                            )}
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
                                onPointerDown={markWheelMoved}
                                onWheel={markWheelMoved}
                                onTouchStart={markWheelMoved}
                                onKeyDown={markWheelMoved}
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
                                  const theirs = showTheirClock ? theirTime(combineDayAndTime(viewDay, slot.value)) : null;
                                  const isSuggested = showSuggestion && suggestedTimes.has(slot.value);
                                  return (
                                    <button
                                      key={slot.value}
                                      type="button"
                                      onClick={() => handleWheelRowTap(i, slot.value)}
                                      onPointerDown={hapticLight}
                                      data-wheel-time={slot.value}
                                      data-suggested={isSuggested ? "true" : undefined}
                                      className={theirs ? "grid w-full grid-cols-2 items-center gap-4" : "flex w-full items-center justify-center"}
                                      style={{
                                        height: WHEEL_ROW_HEIGHT,
                                        // The phone stylesheet gives every button a 44px floor
                                        // (src/index.css). A taller row than the wheel counts on
                                        // put the lit row and the button a row apart, further
                                        // down the list: the row's height is the wheel's own.
                                        minHeight: WHEEL_ROW_HEIGHT,
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
                                      <span className={theirs ? "whitespace-nowrap text-right" : undefined}>
                                        {slot.label}
                                        {selected && (
                                          <span
                                            className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full"
                                            style={{ background: "var(--jade)" }}
                                            aria-hidden="true"
                                          />
                                        )}
                                      </span>
                                      {theirs && (
                                        /* Their own clock for this row. A suggested time reads in jade. */
                                        <span
                                          className="whitespace-nowrap text-left"
                                          style={{
                                            fontSize: centered ? 14 : 12.5,
                                            fontWeight: isSuggested ? 600 : 500,
                                            color: isSuggested ? "var(--jade-soft-fg)" : centered ? "var(--ink-2)" : "var(--ink-3)",
                                          }}
                                          data-their-time
                                        >
                                          {theirs}
                                        </span>
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
                                  isWindowSelected(viewDay, daySlots[wheelCenterIndex].value) ? "Chosen:" : "Choose"
                                } ${format(viewDay, "EEE")} ${formatTimeToAMPM(daySlots[wheelCenterIndex].value)}`
                              : "No times left today"}
                          </button>
                          {daySlots[wheelCenterIndex] &&
                            theirTime(combineDayAndTime(viewDay, daySlots[wheelCenterIndex].value)) && (
                              <p className="text-xs" style={{ color: "var(--ink-2)" }} data-testid="their-time-wheel">
                                {theirTime(combineDayAndTime(viewDay, daySlots[wheelCenterIndex].value))} for {firstName}
                              </p>
                            )}
                        </div>

                        {/* The one time on offer, as a removable chip */}
                        <div className="space-y-2" data-testid="offered-time">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium" style={{ color: "var(--ink-3)" }}>
                              The time you're offering
                            </span>
                          </div>
                          {sortedSelectedWindows.length === 0 ? (
                            <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                              Scroll the wheel and tap Choose. You offer one time.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {sortedSelectedWindows.map((w) => (
                                <span
                                  key={windowKey(w.day, w.time)}
                                  className="inline-flex items-center gap-1.5 rounded-2xl py-1 pl-3 pr-1.5 text-sm font-medium transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none"
                                  style={{ background: "var(--surface-2)", color: "var(--ink)" }}
                                >
                                  <OfferedTime
                                    mine={`${format(w.day, "EEE d")} · ${formatTimeToAMPM(w.time)}`}
                                    theirs={theirTime(combineDayAndTime(w.day, w.time))}
                                  />
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
                            <>
                              {offeredClash && (
                                <p className="text-xs font-medium" style={{ color: "var(--ink)" }} data-testid="offered-time-clash">
                                  {clashWords(offeredClash)}
                                </p>
                              )}
                              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                                {firstName} books it, or writes when they are free if they can&apos;t make it. Then you set a new time.
                              </p>
                            </>
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
                      <div className="space-y-3" role="radiogroup" aria-label="Where the call happens">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={!ownLinkMode}
                          data-testid="meeting-built-in"
                          onClick={() => setOwnLinkMode(false)}
                          className={cn(
                            "w-full text-left p-4 rounded-lg border bg-card transition-colors",
                            !ownLinkMode ? "border-primary" : "border-border",
                          )}
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 shrink-0 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
                              <Video className="h-6 w-6" style={{ color: "hsl(var(--primary-foreground))" }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-foreground">Built-in video room</h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                No link to send. A private room opens 15 minutes before the call, and you both join
                                it right here in HireFlow.
                              </p>
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={ownLinkMode}
                          data-testid="meeting-own-link"
                          onClick={() => setOwnLinkMode(true)}
                          className={cn(
                            "w-full text-left p-4 rounded-lg border bg-card transition-colors",
                            ownLinkMode ? "border-primary" : "border-border",
                          )}
                        >
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 shrink-0 rounded-lg flex items-center justify-center bg-muted">
                              <Link2 className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-semibold text-foreground">My own link</h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                Google Meet, Zoom or Teams. {firstName} gets the link once they have picked a time,
                                and it is remembered here for your next interview.
                              </p>
                            </div>
                          </div>
                        </button>
                        {ownLinkMode && meetingLinkField}
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
                        {(!isGoogleConnected || !generateMeetLink) && meetingLinkField}
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
                              {selectedDate && selectedTime && theirTime(combineDayAndTime(selectedDate, selectedTime)) && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {theirTime(combineDayAndTime(selectedDate, selectedTime))} for {firstName}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                            <div>
                              <p className="text-sm text-muted-foreground">Time offered</p>
                              <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {sortedSelectedWindows.map((w) => (
                                  <span
                                    key={windowKey(w.day, w.time)}
                                    className="text-xs font-medium rounded-xl border border-border bg-muted/40 px-2.5 py-1"
                                  >
                                    <OfferedTime
                                      mine={`${format(w.day, "EEE, MMM d")} · ${formatTimeToAMPM(w.time)}`}
                                      theirs={theirTime(combineDayAndTime(w.day, w.time))}
                                    />
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
                              <p className="font-medium break-all">
                                {!exactTimeMode
                                  ? ownLinkMode
                                    ? manualMeetingLink.trim()
                                    : "In-app video room — created automatically"
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
                            ? `${candidateName} will see this interview in HireFlow`
                            : `${candidateName} will see this in HireFlow to pick a time`}
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
              {/* A soft pill, not the stock outline: at night that one is a black slab. */}
              <button
                type="button"
                className="hf-pill hf-pill--tonal"
                onClick={currentStep === 0 ? () => onOpenChange(false) : handleBack}
                data-testid="wizard-back"
              >
                <ChevronLeft />
                {currentStep === 0 ? "Cancel" : "Back"}
              </button>

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
                  {exactTimeMode ? "Schedule Interview" : "Send the Time"}
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
