import { Link } from "react-router-dom";
import { ArrowRight, FileText, MessageSquare, ClipboardCheck, KeyRound, Phone } from "lucide-react";
import { CandidateShell } from "@/components/candidate/CandidateShell";

export default function CandidatePortalLanding() {
  const features = [
    {
      icon: ClipboardCheck,
      title: "Apply in minutes",
      description: "Enter your job code — no account needed to get started",
    },
    {
      icon: Phone,
      title: "Pick up anytime",
      description: "Continue with the phone number you used when you applied",
    },
    {
      icon: MessageSquare,
      title: "Stay in the loop",
      description: "Track your status and hear back from the hiring team",
    },
  ];

  return (
    <CandidateShell>
      <div className="mx-auto max-w-4xl px-4 py-8 md:py-12">
        <header className="mb-12 flex items-center justify-between">
          <Link to="/" className="font-display text-lg tracking-wide" style={{ color: "hsl(150 30% 92%)" }}>
            HIREFLOW
          </Link>
          <Link to="/candidate/auth" className="cand-btn-ghost text-sm">
            Sign in
          </Link>
        </header>

        <section className="cand-rise mx-auto mb-14 max-w-2xl text-center" style={{ ["--cand-i" as string]: 0 }}>
          <p className="cand-kicker mb-4">Candidate portal</p>
          <h1 className="font-display text-4xl font-medium leading-tight md:text-5xl" style={{ color: "hsl(150 33% 95%)" }}>
            Apply without the hassle.
            <span className="mt-1 block" style={{ color: "hsl(38 64% 64%)" }}>
              One code. One clear path.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed" style={{ color: "hsl(150 12% 62%)" }}>
            Enter the job code from the employer to apply — no signup wall. Come back anytime with your phone number.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link to="/candidate/apply" className="cand-btn-primary w-full sm:w-auto">
              Enter job code
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/candidate/continue" className="cand-btn-ghost w-full sm:w-auto">
              Continue your application
            </Link>
          </div>
        </section>

        <section className="cand-rise mb-14 grid gap-4 md:grid-cols-3" style={{ ["--cand-i" as string]: 1 }}>
          {features.map((feature) => (
            <div key={feature.title} className="cand-panel p-5 text-left">
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-full"
                style={{ background: "hsl(152 30% 14%)", color: "hsl(152 46% 58%)" }}
              >
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg" style={{ color: "hsl(150 30% 91%)" }}>{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-snug" style={{ color: "hsl(150 12% 58%)" }}>{feature.description}</p>
            </div>
          ))}
        </section>

        <section className="cand-rise cand-panel mx-auto max-w-2xl p-6 md:p-8" style={{ ["--cand-i" as string]: 5 }}>
          <h2 className="font-display text-center text-2xl" style={{ color: "hsl(150 30% 93%)" }}>How it works</h2>
          <div className="mt-6 space-y-4">
            {[
              { step: 1, icon: KeyRound, title: "Get a job code", desc: "The employer shares a code or apply link for the role" },
              { step: 2, icon: ClipboardCheck, title: "Apply — no account needed", desc: "Name, email, phone, and a few answers. That's it." },
              { step: 3, icon: Phone, title: "Come back with your phone", desc: "See all your applications and pick up where you left off" },
              { step: 4, icon: FileText, title: "Optional: create an account", desc: "Save progress with Google or email — encouraged, never required to start" },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="flex items-start gap-4 border-t pt-4 first:border-t-0 first:pt-0" style={{ borderColor: "hsl(150 12% 14%)" }}>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                  style={{ background: "hsl(152 30% 16%)", color: "hsl(152 46% 58%)" }}
                >
                  {step}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color: "hsl(38 60% 62%)" }} />
                    <span className="font-medium" style={{ color: "hsl(150 28% 88%)" }}>{title}</span>
                  </div>
                  <p className="mt-0.5 text-sm" style={{ color: "hsl(150 12% 56%)" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-14 text-center text-sm" style={{ color: "hsl(150 10% 48%)" }}>
          Hiring for your business?{" "}
          <Link to="/auth" style={{ color: "hsl(38 60% 62%)" }}>
            Employer sign in
          </Link>
        </footer>
      </div>
    </CandidateShell>
  );
}
