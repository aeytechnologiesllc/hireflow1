import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CandidateShell } from "@/components/candidate/CandidateShell";
import { SaveProgressPrompt } from "@/components/candidate/SaveProgressPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, FileText, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  fetchRoleById,
  normalizePhone,
  phaseLabel,
  submitPhase1Application,
  type ShowcaseRole,
} from "@/lib/showcaseApply";

type Step = "form" | "save" | "resume";

export default function ShowcaseApplyForm() {
  const { roleId } = useParams<{ roleId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const existingAppId = searchParams.get("app");
  const resumePhase = searchParams.get("phase");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [answer, setAnswer] = useState("");
  const [step, setStep] = useState<Step>(existingAppId ? "resume" : "form");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    applicationId: string;
    role: ShowcaseRole;
  } | null>(null);

  const { data: role, isLoading, error } = useQuery({
    queryKey: ["showcase-role", roleId],
    queryFn: () => fetchRoleById(roleId!),
    enabled: !!roleId,
  });

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const phoneValid = normalizePhone(phone).length >= 10;
  const canSubmit = name.trim().length > 1 && emailValid && phoneValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role || !canSubmit || submitting) return;

    setSubmitting(true);
    try {
      const res = await submitPhase1Application({
        roleId: role.id,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        answer: answer.trim() || undefined,
      });

      setResult({ applicationId: res.applicationId, role });

      if (res.isExisting) {
        toast.message("We found your existing application for this role.");
        navigate("/candidate/continue", { state: { phone } });
        return;
      }

      setStep("save");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit application");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <CandidateShell className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </CandidateShell>
    );
  }

  if (error || !role) {
    return (
      <CandidateShell className="flex min-h-[60vh] items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <p className="text-muted-foreground">This role is no longer accepting applications.</p>
            <Button onClick={() => navigate("/candidate/apply")}>Enter a different code</Button>
          </CardContent>
        </Card>
      </CandidateShell>
    );
  }

  if (step === "save" && result) {
    return (
      <CandidateShell className="px-4 py-10">
        <SaveProgressPrompt
          roleTitle={result.role.title}
          applicantName={name.trim()}
          applicantEmail={email.trim()}
          applicantPhone={phone.trim()}
          onSkip={() => navigate("/candidate/continue", { state: { phone } })}
        />
      </CandidateShell>
    );
  }

  if (step === "resume" && existingAppId) {
    const label = resumePhase ? phaseLabel(resumePhase) : phaseLabel("applied");
    const isNextStep = resumePhase === "quiz" || resumePhase === "interview";
    return (
      <CandidateShell className="flex min-h-[60vh] items-center justify-center px-4 py-10">
        <Card className="max-w-lg w-full">
          <CardContent className="p-8 space-y-4 text-center">
            <h2 className="text-2xl font-semibold">{role.title}</h2>
            <p className="text-muted-foreground text-sm">
              Current step: <span className="text-foreground font-medium">{label}</span>
            </p>
            {isNextStep ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {resumePhase === "quiz"
                    ? "Your timed assessment is the next step. It will open here when your employer enables it on this role."
                    : "Answer a few questions out loud is the next step. It will open here when your employer enables it on this role."}
                </p>
                <p className="text-xs text-muted-foreground">
                  Your application is saved — the hiring team has your contact details on file.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your application is on file. The hiring team will reach out by email or phone.
              </p>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <Button asChild variant="outline">
                <Link to="/candidate/continue">View all my applications</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link to="/candidate">Back to portal</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </CandidateShell>
    );
  }

  return (
    <CandidateShell className="px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Application</p>
          <h1 className="text-3xl font-semibold text-foreground">{role.title}</h1>
          <p className="text-sm text-muted-foreground">{role.location} · {role.pay}</p>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <FileText className="h-4 w-4 text-primary" />
                <span>No account required · takes about a minute</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" />
                <p className="text-xs text-muted-foreground">Used to find your application when you come back later.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="answer">Why are you interested? (optional)</Label>
                <textarea
                  id="answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                By applying you agree to be contacted about this job.
              </p>

              <Button type="submit" className="w-full h-11" disabled={!canSubmit || submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit application"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                <Link to="/candidate/continue" className="inline-flex items-center gap-1 text-primary hover:underline">
                  <LinkIcon className="h-3 w-3" />
                  Already applied? Continue with your phone
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </CandidateShell>
  );
}
