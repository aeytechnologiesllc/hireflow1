import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, CheckCircle2, FileText, MessageSquare, ClipboardCheck } from "lucide-react";
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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background grid pattern */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)`,
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
          <div className="flex items-center gap-3">
            <Link to="/candidate/auth">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                Sign In
              </Button>
            </Link>
            <Link to="/candidate/auth?tab=signup">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Create Account
              </Button>
            </Link>
          </div>
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
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/candidate/auth?tab=signup">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-8 h-12">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/candidate/auth">
              <Button size="lg" variant="outline" className="border-border hover:bg-muted/50 font-semibold px-8 h-12">
                Sign In to Your Account
              </Button>
            </Link>
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

        {/* How It Works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="max-w-2xl mx-auto"
        >
          <h2 className="text-2xl font-bold text-foreground text-center mb-8">How It Works</h2>
          <div className="space-y-4">
            {[
              "Create your free account or sign in",
              "Enter the job code provided by the employer",
              "Complete the application and any required assessments",
              "Track your progress and communicate with employers",
            ].map((step, index) => (
              <div key={index} className="flex items-center gap-4 bg-card/30 border border-border rounded-xl p-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                  {index + 1}
                </div>
                <p className="text-foreground">{step}</p>
              </div>
            ))}
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
