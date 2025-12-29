import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Clock, Globe, Mic, Video, ChevronLeft, ChevronRight, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface AvaInterviewConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (config: {
    duration: number;
    language: string;
    languageRule: 'hard' | 'soft';
    videoEnabled: boolean;
  }) => void;
  candidateName: string;
  language?: string;
  voiceMinutesRemaining?: number;
}

const DURATION_OPTIONS = [
  { value: 5, label: "5 min", description: "Quick screening" },
  { value: 10, label: "10 min", description: "Standard" },
  { value: 15, label: "15 min", description: "In-depth" },
  { value: 20, label: "20 min", description: "Comprehensive" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "hi", label: "Hindi" },
  { value: "ur", label: "Urdu" },
  { value: "ar", label: "Arabic" },
  { value: "zh", label: "Mandarin" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "vi", label: "Vietnamese" },
  { value: "it", label: "Italian" },
  { value: "nl", label: "Dutch" },
  { value: "ru", label: "Russian" },
  { value: "tr", label: "Turkish" },
  { value: "pl", label: "Polish" },
];

const STEPS = [
  { id: 1, title: "Duration", icon: Clock },
  { id: 2, title: "Language", icon: Globe },
];

export function AvaInterviewConfigDialog({
  open,
  onOpenChange,
  onConfirm,
  candidateName,
  language = "en",
  voiceMinutesRemaining,
}: AvaInterviewConfigDialogProps) {
  const [step, setStep] = useState(1);
  const [selectedDuration, setSelectedDuration] = useState(10);
  const [selectedLanguage, setSelectedLanguage] = useState(language.toLowerCase().substring(0, 2) || "en");
  const [languageRule, setLanguageRule] = useState<'hard' | 'soft'>('soft');
  // Video is always enabled - audio-only option removed
  const videoEnabled = true;

  const hasInsufficientMinutes = voiceMinutesRemaining !== undefined && voiceMinutesRemaining < selectedDuration && voiceMinutesRemaining > 0;
  const hasNoMinutes = voiceMinutesRemaining !== undefined && voiceMinutesRemaining <= 0;
  const minutesAfterInterview = voiceMinutesRemaining !== undefined ? Math.max(0, voiceMinutesRemaining - selectedDuration) : undefined;

  const handleConfirm = () => {
    onConfirm({
      duration: selectedDuration,
      language: selectedLanguage,
      languageRule,
      videoEnabled,
    });
    // Reset state
    setStep(1);
    onOpenChange(false);
  };

  const handleClose = () => {
    setStep(1);
    onOpenChange(false);
  };

  const nextStep = () => setStep((s) => Math.min(s + 1, 2));
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const getLanguageLabel = (code: string) => {
    return LANGUAGE_OPTIONS.find((l) => l.value === code)?.label || "English";
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            Configure Ava Interview
          </DialogTitle>
          <DialogDescription>
            Set up the interview for{" "}
            <span className="font-medium text-foreground">{candidateName}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between py-4 border-b border-border">
          {STEPS.map((s, index) => {
            const StepIcon = s.icon;
            const isActive = step === s.id;
            const isCompleted = step > s.id;

            return (
              <div key={s.id} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full transition-all",
                    isActive && "bg-primary/10 text-primary",
                    isCompleted && "text-primary",
                    !isActive && !isCompleted && "text-muted-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center w-6 h-6 rounded-full border-2 transition-all",
                      isActive && "border-primary bg-primary text-primary-foreground",
                      isCompleted && "border-primary bg-primary text-primary-foreground",
                      !isActive && !isCompleted && "border-muted-foreground/50"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <StepIcon className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <span className="text-sm font-medium hidden sm:inline">{s.title}</span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-8 h-0.5 mx-1",
                      step > s.id ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="py-4 min-h-[220px]"
          >
            {/* Step 1: Duration */}
            {step === 1 && (
              <div className="space-y-4">
                {/* Voice Minutes Display */}
                {voiceMinutesRemaining !== undefined && (
                  <div className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    hasNoMinutes ? "bg-destructive/10 border-destructive/30" : 
                    hasInsufficientMinutes ? "bg-amber-500/10 border-amber-500/30" : 
                    "bg-muted/50 border-border"
                  )}>
                    <div className="flex items-center gap-2">
                      <Clock className={cn(
                        "h-4 w-4",
                        hasNoMinutes ? "text-destructive" : 
                        hasInsufficientMinutes ? "text-amber-500" : 
                        "text-muted-foreground"
                      )} />
                      <span className="text-sm">Voice minutes available:</span>
                    </div>
                    <Badge variant={hasNoMinutes ? "destructive" : hasInsufficientMinutes ? "outline" : "secondary"}>
                      {voiceMinutesRemaining} min
                    </Badge>
                  </div>
                )}

                {/* No Minutes Warning */}
                {hasNoMinutes && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>No voice minutes available</AlertTitle>
                    <AlertDescription>
                      Purchase additional voice credits or upgrade your plan to continue scheduling Ava interviews.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Insufficient Minutes Warning */}
                {hasInsufficientMinutes && (
                  <Alert className="border-amber-500/50 bg-amber-500/10">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <AlertTitle className="text-amber-600">Insufficient minutes</AlertTitle>
                    <AlertDescription className="text-amber-600/80">
                      You have {voiceMinutesRemaining} minutes but selected a {selectedDuration}-minute interview. 
                      The interview may end early.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Interview Duration
                  </label>
                  <p className="text-xs text-muted-foreground">
                    How long should Ava spend interviewing this candidate?
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DURATION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSelectedDuration(option.value)}
                      disabled={hasNoMinutes}
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-lg border transition-all",
                        hasNoMinutes && "opacity-50 cursor-not-allowed",
                        selectedDuration === option.value
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <span
                        className={cn(
                          "text-lg font-semibold",
                          selectedDuration === option.value
                            ? "text-primary"
                            : "text-foreground"
                        )}
                      >
                        {option.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Ava will manage time gracefully, ensuring a proper conclusion even if time runs short.
                </p>
              </div>
            )}

            {/* Step 2: Language */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    Interview Language
                  </label>
                  <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium">Language Requirement</label>
                  <RadioGroup
                    value={languageRule}
                    onValueChange={(v) => setLanguageRule(v as 'hard' | 'soft')}
                    className="space-y-3"
                  >
                    <div
                      className={cn(
                        "flex items-start space-x-3 p-3 rounded-lg border transition-all cursor-pointer",
                        languageRule === "hard"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setLanguageRule("hard")}
                    >
                      <RadioGroupItem value="hard" id="hard" className="mt-0.5" />
                      <div className="space-y-1">
                        <Label htmlFor="hard" className="font-medium cursor-pointer flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-destructive" />
                          Hard Requirement
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Interview will end immediately if candidate cannot communicate in{" "}
                          {getLanguageLabel(selectedLanguage)}. Score will be 0.
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex items-start space-x-3 p-3 rounded-lg border transition-all cursor-pointer",
                        languageRule === "soft"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                      onClick={() => setLanguageRule("soft")}
                    >
                      <RadioGroupItem value="soft" id="soft" className="mt-0.5" />
                      <div className="space-y-1">
                        <Label htmlFor="soft" className="font-medium cursor-pointer flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary" />
                          Soft Requirement
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Interview continues in candidate's language, but 10-15 points deducted for not meeting the {getLanguageLabel(selectedLanguage)} requirement.
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>

        {/* Summary (shown on step 2) */}
        {step === 2 && (
          <div className="p-3 rounded-lg bg-muted/50 border border-border space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground">Configuration Summary</h4>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                {selectedDuration} minutes
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Globe className="h-3 w-3" />
                {getLanguageLabel(selectedLanguage)}
                <span className="text-muted-foreground">
                  ({languageRule === 'hard' ? 'strict' : 'flexible'})
                </span>
              </Badge>
              <Badge variant="secondary" className="gap-1">
                <Video className="h-3 w-3" />
                Video Interview
              </Badge>
            </div>
            {/* Voice minutes remaining after interview */}
            {minutesAfterInterview !== undefined && (
              <div className={cn(
                "flex items-center justify-between pt-2 mt-2 border-t border-border text-sm",
                minutesAfterInterview === 0 && "text-amber-500"
              )}>
                <span className="text-muted-foreground">After this interview:</span>
                <span className={cn(
                  "font-medium",
                  minutesAfterInterview === 0 ? "text-amber-500" : "text-foreground"
                )}>
                  {minutesAfterInterview} min remaining
                </span>
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-2 pt-2">
          {step > 1 ? (
            <Button variant="outline" onClick={prevStep} className="gap-1">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          ) : (
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          <div className="flex-1" />
          {step < 2 ? (
            <Button 
              onClick={nextStep} 
              disabled={hasNoMinutes}
              className="gap-1 bg-gradient-to-r from-primary to-teal-400 hover:opacity-90"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleConfirm}
              disabled={hasNoMinutes}
              className="gap-1 bg-gradient-to-r from-primary to-teal-400 hover:opacity-90"
            >
              Start Interview
              <Check className="h-4 w-4" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
