import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, CheckCircle2, FileText, MessageSquare, ClipboardCheck, UserPlus, KeyRound, Lightbulb } from "lucide-react";
import hireflowLogo from "@/assets/hireflow-logo.png";

export default function CandidatePortalLanding() {
  const features = [
    {
      icon: ClipboardCheck,
      title: "Easy Application",
      description: "Enter your job code and complete your application in minutes",
    },
    {
      icon: FileText,
      title: "Track Progress",
      description: "Monitor your application status and complete assessments",
    },
    {
      icon: MessageSquare,
      title: "Direct Communication",
      description: "Message employers directly and stay updated on your application",
    },
  ];

  return (
    <div className="dark min-h-[100dvh] bg-[hsl(220,18%,10%)] text-white relative overflow-y-auto">
      {/* Background grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }}
      />

      {/* Gradient orbs */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 py-8 relative z-10">
        {/* Header */}
        <header className="flex items-center justify-between mb-16">
          <Link to="/" className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-accent/40 rounded-xl blur-lg" />
              <img src={hireflowLogo} alt="HireFlow" className="h-10 w-10 rounded-xl relative" />
            </div>
            <span className="text-xl font-bold text-foreground">HireFlow</span>
          </Link>
          <Link to="/candidate/auth">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              Sign In or Create Account
            </Button>
          </Link>
        </header>

        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" />
            Candidate Portal
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6">
            Find Your Next
            <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Opportunity
            </span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Enter your job application code to apply for positions, complete assessments, 
            and track your progress — all in one place.
          </p>
          <div className="flex flex-col items-center justify-center gap-3">
            <Link to="/candidate/auth">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 h-12">
                Sign In or Create Account
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground">
              New here? Create your account from the same screen after you continue.
            </p>
          </div>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-20"
        >
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-6 text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </motion.div>

        {/* How It Works - Enhanced */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="max-w-3xl mx-auto"
        >
          <h2 className="text-2xl font-bold text-foreground text-center mb-4">How It Works</h2>
          <p className="text-center text-muted-foreground mb-8 max-w-xl mx-auto">
            Unlike traditional job boards, HireFlow uses a <span className="text-primary font-medium">direct application code</span> system. 
            Employers share a unique code with you when you apply for their position.
          </p>
          
          {/* Steps as cards with icons */}
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { step: 1, icon: UserPlus, title: "Sign In or Create an Account", desc: "Use the same candidate screen whether you're new or returning" },
              { step: 2, icon: KeyRound, title: "Get a Job Code", desc: "The employer provides you with a unique application code" },
              { step: 3, icon: ClipboardCheck, title: "Apply & Complete Tasks", desc: "Enter the code and complete any required assessments" },
              { step: 4, icon: MessageSquare, title: "Track & Communicate", desc: "Monitor your progress and message employers directly" },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="flex items-start gap-4 bg-card/30 border border-border rounded-xl p-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {step}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-medium text-foreground">{title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
          
          {/* Info callout */}
          <div className="mt-6 flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 max-w-xl mx-auto">
            <Lightbulb className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground font-medium">Don't have a job code yet?</span> Ask the employer or recruiter who directed you to HireFlow for the application code.
            </p>
          </div>
        </motion.div>

        {/* Footer */}
        <footer className="mt-20 text-center text-sm text-muted-foreground">
          <p>
            Looking to hire?{" "}
            <Link to="/" className="text-primary hover:underline">
              Visit our employer portal
            </Link>
          </p>
        </footer>
      </div>
    </div>
  );
}
