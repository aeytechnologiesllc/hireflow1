import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion, MotionConfig, type Easing } from "framer-motion";
import FeatureDetailDialog from "@/components/landing/FeatureDetailDialog";
import BrandMark from "@/components/landing/BrandMark";
import AvaDemo from "@/components/landing/AvaDemo";
import AvaGlyph from "@/components/AvaGlyph";
import AvaUniverse from "@/components/landing/AvaUniverse";
import AvaOrb from "@/components/AvaOrb";
import Reveal from "@/components/landing/Reveal";
import Tilt3D from "@/components/landing/Tilt3D";
import MountWhenNear from "@/components/landing/MountWhenNear";
import { IconScreening, IconInstant, IconWorkflows, IconTracking, IconInsights, IconTime } from "@/components/landing/FeatureIcons";
import { 
  ArrowRight,
  CheckCircle,
  Briefcase,
  User
} from "lucide-react";

const stats = [
  { value: "70%", label: "Faster time-to-hire" },
  { value: "95%", label: "Less screening time" },
  { value: "10×", label: "More qualified shortlists" },
  { value: "24/7", label: "Ava is screening" },
];

const features = [
  {
    icon: IconScreening,
    title: "Ava-Powered Screening",
    description: "Ava evaluates every candidate with custom workflows and intelligent scoring in seconds",
    titleColor: "text-foreground",
    iconBg: "bg-fuchsia-500",
    detailedDescription: "Ava, our intelligent assistant, automatically reviews and scores every application the moment it's submitted. Using advanced natural language processing and machine learning, Ava analyzes resumes, cover letters, and application responses to identify the most qualified candidates.",
    highlights: [
      "Instant evaluation of all incoming applications",
      "Smart scoring based on job requirements",
      "Bias-free screening process",
      "Detailed analysis reports for each candidate"
    ],
  },
  {
    icon: IconInstant,
    title: "Instant Job Setup",
    description: "Generate perfect application questions and screening steps in under 30 seconds",
    titleColor: "text-emerald-400",
    iconBg: "bg-fuchsia-500",
    detailedDescription: "Create comprehensive job postings in seconds, not hours. Simply enter your job title and let Ava generate everything else — from job descriptions and requirements to custom screening questions and assessment workflows.",
    highlights: [
      "Ava-generated job descriptions",
      "Smart application questions",
      "Auto-configured screening workflows",
      "One-click publishing"
    ],
  },
  {
    icon: IconWorkflows,
    title: "Custom Workflows",
    description: "Typing tests, video responses, skill assessments — fully automated",
    titleColor: "text-foreground",
    iconBg: "bg-purple-500",
    detailedDescription: "Design multi-stage hiring pipelines with powerful assessment tools. Include typing speed tests for support roles, video introductions for customer-facing positions, chat simulations for service roles, and custom quizzes to test specific knowledge.",
    highlights: [
      "Typing speed assessments",
      "Video introduction recording",
      "Live chat simulation tests",
      "Custom quiz builder"
    ],
  },
  {
    icon: IconTracking,
    title: "Smart Tracking",
    description: "Pipeline view, bulk actions, and real-time candidate updates",
    titleColor: "text-foreground",
    iconBg: "bg-fuchsia-500",
    detailedDescription: "Track every candidate's journey through your hiring pipeline with our intuitive dashboard. See real-time updates as candidates complete phases, perform bulk actions on multiple applicants, and never lose track of promising talent.",
    highlights: [
      "Visual pipeline management",
      "Real-time status updates",
      "Bulk actions and filtering",
      "Candidate comparison tools"
    ],
  },
  {
    icon: IconInsights,
    title: "Deep Insights",
    description: "Ava recommendations with detailed analysis for every single candidate",
    titleColor: "text-emerald-400",
    iconBg: "bg-purple-500",
    detailedDescription: "Get comprehensive insights into each candidate with AVA's detailed analysis. View scoring breakdowns, competency assessments, and personalized recommendations that help you make data-driven hiring decisions with confidence.",
    highlights: [
      "Detailed scoring breakdowns",
      "Competency assessments",
      "Interview recommendations",
      "Hiring analytics dashboard"
    ],
  },
  {
    icon: IconTime,
    title: "Save 70% Time",
    description: "Stop manually reviewing hundreds of applications. Let AVA do it.",
    titleColor: "text-foreground",
    iconBg: "bg-purple-500",
    detailedDescription: "Reclaim your time with automated candidate screening. AVA works 24/7, reviewing applications as they come in and advancing qualified candidates automatically. Spend your time interviewing great candidates, not sorting through unqualified ones.",
    highlights: [
      "Automated first-round screening",
      "Auto-advance qualified candidates",
      "Rejection email automation",
      "Focus on top talent only"
    ],
  },
];

// Easing constant
const easeOut: Easing = [0.4, 0, 0.2, 1];

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6, ease: easeOut }
  }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { duration: 0.5, ease: easeOut }
  }
};

export default function Index() {
  const [selectedFeature, setSelectedFeature] = useState<typeof features[0] | null>(null);
  const navigate = useNavigate();
  const { user, role } = useAuth();

  // In Natively app wrapper, skip landing page unless explicitly requested
  const [searchParams] = useSearchParams();
  const isNatively = /Natively\//.test(navigator.userAgent);
  const showLanding = searchParams.get('showLanding') === 'true';

  useEffect(() => {
    if (!isNatively) return;
    if (showLanding) return; // User explicitly wants to see landing page

    if (user) {
      navigate(role === 'candidate' ? '/applications' : '/dashboard', { replace: true });
    } else {
      navigate('/auth', { replace: true });
    }
  }, [user, role, navigate, isNatively, showLanding]);

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-[100dvh] bg-[hsl(220,18%,7%)] overflow-x-hidden relative isolate">
      {/* Subtle dotted-grid depth texture */}
      <div className="hf-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      {/* Navigation */}
      <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: easeOut }}
        className="fixed top-0 left-0 right-0 z-50 bg-[hsl(220,18%,7%)]/85 backdrop-blur-md border-b border-[hsl(220,15%,14%)]"
      >
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark size={38} className="transition-transform duration-300 hover:scale-105" />
            <span className="text-xl font-bold text-white tracking-tight">HireFlow</span>
          </Link>
          <div className="flex items-center gap-4">
            {!isNatively && (
              <Link to="/candidate" className="text-sm text-gray-400 hover:text-emerald-400 transition-colors hidden sm:block">
                Looking for work? →
              </Link>
            )}
            <Link to="/auth">
              <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-transparent">
                Sign In
              </Button>
            </Link>
            <Link to="/auth">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
                <Button className="bg-[hsl(220,15%,13%)] hover:bg-[hsl(220,15%,17%)] text-white border border-[hsl(220,15%,18%)] rounded-full px-6">
                  Get Started
                </Button>
              </motion.div>
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        {/* Soft aurora behind the orb */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[540px] h-[540px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none animate-pulse-slow" />
        {/* Animated green glow effect */}
        <motion.div 
          animate={{ 
            opacity: [0.15, 0.25, 0.15],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/20 blur-[100px] rounded-full" 
        />
        
        <div className="container mx-auto px-4 relative">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="max-w-4xl mx-auto text-center"
          >
            {/* AVA — the real premium orb */}
            <motion.div variants={scaleIn} className="flex justify-center w-full -mt-6 sm:-mt-10">
              <div className="w-full max-w-[620px] h-[380px] sm:h-[480px]">
                <AvaUniverse />
              </div>
            </motion.div>
            <motion.div
              variants={fadeInUp}
              className="flex items-center justify-center mt-2 mb-8"
            >
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[hsl(220,15%,11%)] border border-[hsl(220,15%,17%)] text-gray-300 text-sm">
                <AvaGlyph className="h-3.5 w-3.5 text-emerald-400" />
                Powered by Ava
              </div>
            </motion.div>
            
            {/* Main Headline */}
            <motion.h1 
              variants={fadeInUp}
              className="text-5xl md:text-6xl lg:text-7xl font-serif font-medium tracking-[-0.02em] mb-6 leading-[1.04] text-white"
            >
              Screen every applicant.
              <br className="hidden sm:block" />{" "}
              Interview only{" "}
              <motion.span
                className="text-emerald-400 inline-block"
                animate={{
                  textShadow: [
                    "0 0 24px hsla(160, 70%, 50%, 0.35)",
                    "0 0 48px hsla(160, 70%, 55%, 0.6)",
                    "0 0 24px hsla(160, 70%, 50%, 0.35)"
                  ]
                }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              >the best.</motion.span>
            </motion.h1>
            
            {/* Subheadline */}
            <motion.p variants={fadeInUp} className="text-lg md:text-xl text-gray-300/90 mb-10 max-w-2xl mx-auto leading-relaxed">
              Ava reads, interviews, and ranks everyone who applies — so your shortlist is ready in{" "}
              <span className="text-white font-medium">minutes, not weeks</span>.
            </motion.p>
            
            {/* CTAs */}
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/try-job-creator" className="w-full sm:w-auto">
                <motion.span
                  animate={{
                    boxShadow: [
                      "0 10px 40px -12px hsla(160, 65%, 45%, 0.7)",
                      "0 16px 60px -10px hsla(160, 70%, 50%, 0.95)",
                      "0 10px 40px -12px hsla(160, 65%, 45%, 0.7)"
                    ]
                  }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex items-center justify-center gap-2 w-full sm:w-auto rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-semibold text-base px-8 py-4"
                >
                  <AvaGlyph className="h-[18px] w-[18px]" />
                  Create a job with Ava
                  <ArrowRight className="h-5 w-5" />
                </motion.span>
              </Link>
              <a
                href="#how"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById("how")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="w-full sm:w-auto"
              >
                <span className="flex items-center justify-center gap-2 w-full sm:w-auto rounded-full border border-[hsl(220,15%,20%)] bg-white/[0.02] text-gray-200 font-medium text-base px-7 py-4 transition-colors hover:bg-white/[0.06] hover:border-emerald-500/40">
                  See how it works
                </span>
              </a>
            </motion.div>
            <motion.p variants={fadeInUp} className="mt-4 text-sm text-emerald-400/90 flex items-center justify-center gap-2">
              <AvaGlyph className="h-3.5 w-3.5" />
              No signup required — watch Ava work first
            </motion.p>
            
            {/* Trust badges */}
            <motion.div 
              variants={fadeInUp}
              className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:gap-8 mt-8 text-sm text-gray-400"
            >
              {["Free to start", "No credit card", "2 min setup"].map((text, i) => (
                <motion.div 
                  key={text}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + i * 0.1 }}
                  className="flex items-center gap-2"
                >
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                  {text}
                </motion.div>
              ))}
            </motion.div>
            
            {/* Role Selection Section - hidden on mobile (employer-only mobile experience) */}
            {!isNatively && (
              <motion.div
                variants={fadeInUp}
                className="mt-12 hidden sm:flex flex-col sm:flex-row items-center justify-center gap-4"
              >
                <div className="text-sm text-gray-400 mr-2">I want to:</div>
                <Link to="/auth">
                  <Button
                    variant="outline"
                    className="bg-transparent border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-500/10 text-white min-w-[150px]"
                  >
                    <Briefcase className="mr-2 h-4 w-4" />
                    Hire talent
                  </Button>
                </Link>
                <Link to="/candidate">
                  <Button
                    variant="outline"
                    className="bg-transparent border-[hsl(220,15%,22%)] hover:border-gray-400 hover:bg-white/5 text-white min-w-[150px]"
                  >
                    <User className="mr-2 h-4 w-4" />
                    Find a job
                  </Button>
                </Link>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Live product demo — see Ava work */}
      <section className="px-4 pb-20">
        <Reveal className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <p className="text-emerald-400 text-sm font-semibold tracking-[0.2em] uppercase mb-3">See it in action</p>
            <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-[-0.02em] text-white">
              From interview to shortlist — automatically
            </h2>
          </div>
          <AvaDemo />
        </Reveal>
      </section>

      {/* Stats Section */}
      <section className="py-20 border-t border-b border-[hsl(220,15%,12%)]" aria-labelledby="results-heading">
        <div className="container mx-auto px-4">
          <h2 id="results-heading" className="sr-only">Results</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto">
            {stats.map((stat, index) => (
              <Reveal key={stat.label} delay={index * 90} className="text-center">
                <div className="text-4xl md:text-5xl font-serif font-medium tracking-tight text-white mb-1.5 [font-variant-numeric:tabular-nums]">
                  {stat.value}
                </div>
                <div className="text-gray-400 text-sm">{stat.label}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          {/* Section Header */}
          <Reveal className="text-center mb-16">
            <div className="w-24 h-24 mx-auto mb-6">
              <AvaOrb mode="rich" bright={1.1} />
            </div>
            <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-[-0.02em] text-white mb-4">
              Meet Ava — Your Hiring Assistant
            </h2>
            <p className="text-gray-400 text-lg">Click any feature to learn more</p>
          </Reveal>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <Reveal key={feature.title} delay={(index % 3) * 90} className="h-full">
                <Tilt3D max={8} className="h-full">
                  <button
                    onClick={() => setSelectedFeature(feature)}
                    className="group relative h-full w-full text-left p-6 rounded-2xl bg-[hsl(220,15%,10%)] border border-[hsl(220,15%,15%)] cursor-pointer transition-colors duration-300 hover:border-emerald-500/40 hover:shadow-[0_24px_60px_-22px_rgba(16,185,129,0.4)] [transform-style:preserve-3d]"
                  >
                    <div className="relative w-14 h-14 mb-5" style={{ transform: "translateZ(40px)" }}>
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-emerald-500/40 to-teal-500/20 blur-lg scale-110 opacity-50 group-hover:opacity-90 transition-opacity duration-300" />
                      <div className="relative w-full h-full rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/[0.03] border border-emerald-500/30 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
                        <feature.icon className="h-7 w-7 text-emerald-300" />
                      </div>
                    </div>
                    <h3 className="text-xl font-bold mb-3 text-white" style={{ transform: "translateZ(26px)" }}>
                      {feature.title}
                    </h3>
                    <p className="text-gray-400 mb-4 leading-relaxed" style={{ transform: "translateZ(16px)" }}>
                      {feature.description}
                    </p>
                    <span className="inline-flex items-center gap-2 text-emerald-400 text-sm font-medium transition-transform duration-300 group-hover:translate-x-1" style={{ transform: "translateZ(20px)" }}>
                      Learn more
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </button>
                </Tilt3D>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how" className="py-24 border-t border-[hsl(220,15%,12%)] scroll-mt-20">
        <div className="container mx-auto px-4">
          <Reveal className="text-center mb-14">
            <p className="text-emerald-400 text-sm font-semibold tracking-[0.2em] uppercase mb-3">How it works</p>
            <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-[-0.02em] text-white">
              From open role to shortlist
            </h2>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { n: "01", t: "Post your role", d: "Tell Ava what you're hiring for. She drafts the posting and the screening flow in seconds." },
              { n: "02", t: "Ava screens & ranks", d: "Every applicant is interviewed, scored and ranked automatically — around the clock." },
              { n: "03", t: "Review your shortlist", d: "You get the strongest candidates with the reasoning. You make the call — no auto-rejections." },
            ].map((step, i) => (
              <Reveal key={step.n} delay={i * 100} className="h-full">
                <Tilt3D max={7} className="h-full">
                  <div className="group relative h-full p-7 rounded-2xl bg-[hsl(220,15%,10%)] border border-[hsl(220,15%,15%)] transition-colors duration-300 hover:border-emerald-500/30 hover:shadow-[0_24px_60px_-26px_rgba(16,185,129,0.35)] [transform-style:preserve-3d]">
                    <div className="font-serif text-4xl text-emerald-400/90 mb-4 [font-variant-numeric:tabular-nums]" style={{ transform: "translateZ(34px)" }}>{step.n}</div>
                    <h3 className="text-lg font-semibold text-white mb-2" style={{ transform: "translateZ(22px)" }}>{step.t}</h3>
                    <p className="text-gray-400 leading-relaxed text-[15px]" style={{ transform: "translateZ(12px)" }}>{step.d}</p>
                  </div>
                </Tilt3D>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-28 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,18%,7%)] via-[hsl(200,22%,8%)] to-[hsl(160,30%,9%)]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[420px] bg-emerald-500/10 blur-[120px] rounded-full animate-pulse-slow" />

        <div className="container mx-auto px-4 relative">
          <Reveal className="max-w-2xl mx-auto text-center">
            {/* The premium 3D universe — defer-mounted so its WebGL context isn't
                created until the CTA scrolls near (keeps mobile context pressure down) */}
            <MountWhenNear className="w-full max-w-[460px] h-[240px] sm:h-[280px] mx-auto -mb-2">
              <AvaUniverse />
            </MountWhenNear>

            <h2 className="text-4xl md:text-5xl font-serif font-medium tracking-[-0.02em] text-white mb-6">
              Ready to Hire Smarter?
            </h2>

            <p className="text-xl text-gray-300 mb-2">Stop drowning in applications.</p>
            <p className="text-lg text-gray-400 mb-10">
              Let AVA handle the screening so you can focus on hiring the best.
            </p>

            <Link to="/auth" className="inline-block">
              <motion.span
                animate={{
                  boxShadow: [
                    "0 10px 40px -12px hsla(160, 65%, 45%, 0.7)",
                    "0 16px 60px -10px hsla(160, 70%, 50%, 0.95)",
                    "0 10px 40px -12px hsla(160, 65%, 45%, 0.7)"
                  ]
                }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-semibold text-lg px-10 py-4"
              >
                Get started free
                <ArrowRight className="h-5 w-5" />
              </motion.span>
            </Link>

            <p className="mt-6 text-gray-400 text-sm">
              Setup in 2 minutes • No contracts • Cancel anytime
            </p>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-[hsl(220,15%,12%)] bg-[hsl(220,18%,5%)]">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-2 text-sm text-gray-400">
            <div className="flex items-center gap-2.5">
              <BrandMark size={22} />
              <span>© 2026 HireFlow. Powered by Ava.</span>
            </div>
            <span className="hidden md:inline">•</span>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <span>•</span>
            <Link to="/candidate" className="hidden sm:inline hover:text-emerald-400 transition-colors">Candidate Portal</Link>
          </div>
        </div>
      </footer>
      {/* Feature Detail Dialog */}
      <FeatureDetailDialog
        feature={selectedFeature}
        onClose={() => setSelectedFeature(null)}
      />
    </div>
    </MotionConfig>
  );
}
