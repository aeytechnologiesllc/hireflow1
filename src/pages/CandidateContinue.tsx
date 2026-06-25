import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CandidateShell } from "@/components/candidate/CandidateShell";
import { SaveProgressPrompt } from "@/components/candidate/SaveProgressPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowRight, ChevronRight, Loader2, Phone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchApplicationsByPhone,
  normalizePhone,
  phaseLabel,
  resumeRouteForApplication,
  type PhoneApplicationSummary,
} from "@/lib/showcaseApply";

type Step = "phone" | "dashboard";

export default function CandidateContinue() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const phoneFromUrl = searchParams.get("phone") ?? "";

  const [phone, setPhone] = useState(phoneFromUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applications, setApplications] = useState<PhoneApplicationSummary[]>([]);
  const [step, setStep] = useState<Step>("phone");
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);

  const lookup = async () => {
    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      setError("Enter a valid phone number");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const rows = await fetchApplicationsByPhone(phone);
      if (!rows.length) {
        setError("No applications found for this phone number. Check the number or apply to a new role.");
        setApplications([]);
        return;
      }
      setApplications(rows);
      setStep("dashboard");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openApplication = (app: PhoneApplicationSummary) => {
    navigate(resumeRouteForApplication(app));
  };

  return (
    <CandidateShell className="flex min-h-[70vh] flex-col items-center px-4 py-10">
      <AnimatePresence mode="wait">
        {step === "phone" && (
          <motion.div
            key="phone-step"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="w-full max-w-md space-y-6"
          >
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Phone className="h-7 w-7 text-primary" />
              </div>
              <h1 className="text-3xl font-bold text-foreground">Continue your application</h1>
              <p className="text-sm text-muted-foreground">
                Enter the phone number you used when you applied. We&apos;ll show your open applications.
              </p>
            </div>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError(""); }}
                    placeholder="(555) 123-4567"
                    autoComplete="tel"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <Button className="w-full h-11 gap-2" disabled={loading || !phone.trim()} onClick={() => void lookup()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    <>
                      Find my applications
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  New here?{" "}
                  <Link to="/candidate/apply" className="text-primary hover:underline">Enter a job code</Link>
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {step === "dashboard" && (
          <motion.div
            key="dashboard-step"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="w-full max-w-lg space-y-5"
          >
            <div className="text-center space-y-1">
              <h1 className="text-2xl font-semibold text-foreground">Your applications</h1>
              <p className="text-sm text-muted-foreground">Tap a role to pick up where you left off.</p>
            </div>

            <div className="space-y-3">
              {applications.map((app) => (
                <button
                  key={app.applicationId}
                  type="button"
                  onClick={() => openApplication(app)}
                  className="w-full text-left rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{app.roleTitle}</p>
                      <p className="text-xs text-muted-foreground truncate">{app.roleLocation}</p>
                      <p className="mt-1 text-sm text-primary">{phaseLabel(app.currentPhase)}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={() => { setStep("phone"); setError(""); }}>
                Different phone
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => setShowAccountPrompt(true)}>
                Save to an account
              </Button>
            </div>

            {showAccountPrompt && applications[0] && (
              <SaveProgressPrompt
                roleTitle={applications[0].roleTitle}
                applicantName={applications[0].applicantName}
                applicantEmail=""
                applicantPhone={phone}
                onSkip={() => setShowAccountPrompt(false)}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </CandidateShell>
  );
}
