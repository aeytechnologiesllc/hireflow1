import { useState, useEffect, useCallback, memo } from "react";
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
import { format, addMinutes, setHours, setMinutes, startOfDay } from "date-fns";
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  Users,
  Sparkles,
  CheckCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Link2,
  Mail,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";
import { useIsMobile } from "@/hooks/use-mobile";

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

// State to save before OAuth redirect
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
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedTime, setSelectedTime] = useState("");
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
    { id: "calendar", title: "Select Date & Time", icon: CalendarIcon },
    { id: "details", title: "Interview Details", icon: Users },
    { id: "meeting", title: "Meeting Setup", icon: Video },
    { id: "review", title: "Review & Schedule", icon: CheckCircle },
  ];

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
      const storedToken = localStorage.getItem("google_access_token");
      const tokenExpiry = localStorage.getItem("google_token_expiry");
      
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
    const storedToken = localStorage.getItem("google_access_token");
    const tokenExpiry = localStorage.getItem("google_token_expiry");
    
    if (storedToken && tokenExpiry) {
      const expiry = new Date(tokenExpiry);
      if (expiry > new Date()) {
        setGoogleAccessToken(storedToken);
        setIsGoogleConnected(true);
      } else {
        // Try to refresh
        const refreshToken = localStorage.getItem("google_refresh_token");
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

      localStorage.setItem("google_access_token", data.access_token);
      localStorage.setItem(
        "google_token_expiry",
        new Date(Date.now() + data.expires_in * 1000).toISOString()
      );

      setGoogleAccessToken(data.access_token);
      setIsGoogleConnected(true);
    } catch (error) {
      console.error("Token refresh failed:", error);
      localStorage.removeItem("google_access_token");
      localStorage.removeItem("google_refresh_token");
      localStorage.removeItem("google_token_expiry");
    }
  };

  const connectGoogleCalendar = () => {
    if (!GOOGLE_CLIENT_ID) {
      toast.error("Google Calendar integration not configured", {
        description: "Please add VITE_GOOGLE_CLIENT_ID to your environment.",
      });
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
    localStorage.setItem(WIZARD_STATE_KEY, JSON.stringify(stateToSave));

    // Store current URL to return after OAuth
    localStorage.setItem("google_oauth_return_url", window.location.pathname + window.location.search);

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
    if (!applicationId || !selectedDate || !selectedTime) return;

    setIsCreating(true);
    try {
      let meetingLink = manualMeetingLink;

      // Create Google Calendar event with Meet link if connected
      if (isGoogleConnected && generateMeetLink) {
        const eventResult = await createCalendarEvent();
        if (eventResult?.meetLink) {
          meetingLink = eventResult.meetLink;
          setCreatedMeetLink(meetingLink);
        }
      }

      const [hours, minutes] = selectedTime.split(":").map(Number);
      const scheduledAt = setMinutes(setHours(selectedDate, hours), minutes);

      await createInterview.mutateAsync({
        application_id: applicationId,
        scheduled_at: scheduledAt.toISOString(),
        duration_minutes: parseInt(duration),
        interview_type: interviewType,
        meeting_link: meetingLink || null,
        notes: notes || null,
      });

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
        const { notifyInterviewScheduled } = await import("@/utils/emailNotifications");
        await notifyInterviewScheduled(
          appData.candidate_id,
          (appData.jobs as any)?.title || jobTitle || "Position",
          format(scheduledAt, "EEEE, MMMM d, yyyy"),
          formatTimeToAMPM(selectedTime),
          undefined
        );
      }

      // Invalidate interview queries so ApplicantDetails updates
      queryClient.invalidateQueries({ queryKey: ["interview", "application", applicationId] });
      queryClient.invalidateQueries({ queryKey: ["interviews"] });

      // Clear saved wizard state
      localStorage.removeItem(WIZARD_STATE_KEY);

      // Show success view instead of closing immediately
      setCreatedMeetLink(meetingLink || null);
      setShowSuccess(true);

      // Call onComplete to notify parent that scheduling was successful
      onComplete?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to schedule interview");
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
    setSelectedDate(undefined);
    setSelectedTime("");
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
      // Move to meeting step since Google is now connected
      setCurrentStep(2);
    }
  }, [open, initialState]);

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return selectedDate && selectedTime;
      case 1:
        return true;
      case 2:
        // For video interviews: require either Google auto-generate OR a valid manual link
        if (interviewType === "video") {
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
            
            <h2 className="text-2xl font-semibold mb-2">Interview Scheduled!</h2>
            <p className="text-muted-foreground mb-6">
              Your interview with {candidateName} has been scheduled.
            </p>

            {/* Interview Details */}
            <div className="rounded-xl border border-border p-4 mb-6 text-left space-y-3">
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Date & Time</p>
                  <p className="font-medium">
                    {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : ""} at {formatTimeToAMPM(selectedTime)}
                  </p>
                </div>
              </div>

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

            {candidateEmail && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-muted/50 mb-6">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Calendar invite sent to {candidateEmail}
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
                {/* Step 1: Calendar */}
                {currentStep === 0 && (
                  <motion.div
                    key="calendar"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
                    className="space-y-6"
                  >
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

                    {selectedDate && selectedTime && (
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                        <div className="flex items-center gap-2 text-primary">
                          <CheckCircle className="h-5 w-5" />
                          <span className="font-medium">
                            {format(selectedDate, "EEEE, MMMM d, yyyy")} at {formatTimeToAMPM(selectedTime)}
                          </span>
                        </div>
                      </div>
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
                    {interviewType === "video" && (
                      <>
                        {/* Google Calendar Connection */}
                        <div className="p-4 rounded-lg border border-border bg-card">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-green-500 flex items-center justify-center">
                              <CalendarIcon className="h-6 w-6 text-white" />
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
                                      localStorage.removeItem("google_access_token");
                                      localStorage.removeItem("google_refresh_token");
                                      localStorage.removeItem("google_token_expiry");
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
                          <Sparkles className="h-5 w-5 text-primary" />
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

                        <div className="flex items-center gap-3">
                          <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm text-muted-foreground">Date & Time</p>
                            <p className="font-medium">
                              {selectedDate ? format(selectedDate, "EEEE, MMMM d, yyyy") : ""} at {formatTimeToAMPM(selectedTime)}
                            </p>
                          </div>
                        </div>

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
                                {isGoogleConnected && generateMeetLink
                                  ? "Google Meet link will be generated"
                                  : manualMeetingLink || "No link provided"}
                              </p>
                            </div>
                          </div>
                        )}

                        {notes && (
                          <div className="flex items-start gap-3 pt-2 border-t border-border">
                            <Sparkles className="h-5 w-5 text-muted-foreground mt-0.5" />
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
                          Calendar invite will be sent to {candidateEmail}
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
                  Schedule Interview
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Export the state type for use in parent components
export type { SavedWizardState };
