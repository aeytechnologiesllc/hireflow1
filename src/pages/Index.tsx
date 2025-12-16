import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion, type Easing } from "framer-motion";
import FeatureDetailDialog from "@/components/landing/FeatureDetailDialog";
import hireflowLogo from "@/assets/hireflow-logo.png";
import avaOrbLogo from "@/assets/ava-orb.png";
import { 
  ArrowRight,
  CheckCircle,
  Sparkles,
  TrendingUp,
  Clock,
  Award,
  Zap,
  Target,
  Users,
  ChartBar,
  Rocket
} from "lucide-react";

const stats = [
  { icon: TrendingUp, value: "70%", label: "Faster Hiring", color: "text-fuchsia-400" },
  { icon: Clock, value: "95%", label: "Time Saved", color: "text-pink-400" },
  { icon: Award, value: "10x", label: "More Qualified", color: "text-purple-400" },
  { icon: Sparkles, value: "24/7", label: "AI Screening", color: "text-violet-400" },
];

const features = [
  {
    icon: Sparkles,
    title: "AI-Powered Screening",
    description: "AVA evaluates every candidate with custom workflows and intelligent scoring in seconds",
    titleColor: "text-foreground",
    iconBg: "bg-fuchsia-500",
    detailedDescription: "AVA, our intelligent AI assistant, automatically reviews and scores every application the moment it's submitted. Using advanced natural language processing and machine learning, AVA analyzes resumes, cover letters, and application responses to identify the most qualified candidates.",
    highlights: [
      "Instant evaluation of all incoming applications",
      "Smart scoring based on job requirements",
      "Bias-free screening process",
      "Detailed analysis reports for each candidate"
    ],
  },
  {
    icon: Zap,
    title: "Instant Job Setup",
    description: "Generate perfect application questions and screening steps in under 30 seconds",
    titleColor: "text-emerald-400",
    iconBg: "bg-fuchsia-500",
    detailedDescription: "Create comprehensive job postings in seconds, not hours. Simply enter your job title and let AVA generate everything else — from job descriptions and requirements to custom screening questions and assessment workflows.",
    highlights: [
      "AI-generated job descriptions",
      "Smart application questions",
      "Auto-configured screening workflows",
      "One-click publishing"
    ],
  },
  {
    icon: Target,
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
    icon: Users,
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
    icon: ChartBar,
    title: "Deep Insights",
    description: "AI recommendations with detailed analysis for every single candidate",
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
    icon: Clock,
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

  return (
    <div className="min-h-screen bg-[hsl(220,18%,7%)] overflow-x-hidden">
      {/* Navigation */}
      <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: easeOut }}
        className="fixed top-0 left-0 right-0 z-50 bg-[hsl(220,18%,7%)]/85 backdrop-blur-md border-b border-[hsl(220,15%,14%)]"
      >
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <motion.img 
              src={hireflowLogo}
              alt="HireFlow"
              whileHover={{ scale: 1.05, rotate: 5 }}
              className="w-10 h-10 rounded-lg object-cover"
            />
            <span className="text-xl font-bold text-white">HireFlow</span>
          </Link>
          <div className="flex items-center gap-4">
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
            {/* AVA AI Badge */}
            <motion.div 
              variants={fadeInUp}
              className="flex items-center justify-center gap-3 mb-8"
            >
              <motion.div 
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                {/* Subtle glow behind orb */}
                <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-xl scale-150" />
                <img 
                  src={avaOrbLogo} 
                  alt="AVA AI" 
                  className="relative w-14 h-14 object-contain"
                />
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.05 }}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[hsl(220,15%,11%)] border border-[hsl(220,15%,17%)] text-gray-300 text-sm"
              >
                Powered by AVA AI
                <motion.div 
                  animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="h-4 w-4 text-purple-400" />
                </motion.div>
              </motion.div>
            </motion.div>
            
            {/* Main Headline */}
            <motion.h1 
              variants={fadeInUp}
              className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight text-white"
            >
              Hire <motion.span 
                className="text-emerald-400 inline-block"
                animate={{ 
                  textShadow: [
                    "0 0 20px hsla(160, 60%, 50%, 0.3)",
                    "0 0 40px hsla(160, 60%, 50%, 0.5)",
                    "0 0 20px hsla(160, 60%, 50%, 0.3)"
                  ]
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >10x Faster</motion.span> with AI
            </motion.h1>
            
            {/* Subheadlines */}
            <motion.p variants={fadeInUp} className="text-xl md:text-2xl text-gray-300 mb-3">
              Stop wasting time on unqualified candidates.
            </motion.p>
            <motion.p variants={fadeInUp} className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
              AVA screens, evaluates, and ranks candidates automatically — so you only interview the best.
            </motion.p>
            
            {/* CTA Button */}
            <motion.div variants={fadeInUp}>
              <Link to="/auth">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  animate={{ 
                    boxShadow: [
                      "0 0 40px -15px hsla(160, 60%, 40%, 1)",
                      "0 0 80px -15px hsla(160, 60%, 50%, 1)",
                      "0 0 40px -15px hsla(160, 60%, 40%, 1)"
                    ]
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-block rounded-xl"
                >
                  <Button 
                    size="lg" 
                    className="bg-[hsl(220,15%,11%)] hover:bg-[hsl(220,15%,14%)] text-white border border-[hsl(220,15%,17%)] rounded-xl px-8 py-6 text-lg h-auto"
                  >
                    <Rocket className="mr-2 h-5 w-5" />
                    Start Hiring for Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </motion.div>
              </Link>
            </motion.div>
            
            {/* Trust badges */}
            <motion.div 
              variants={fadeInUp}
              className="flex items-center justify-center gap-8 mt-8 text-sm text-gray-400"
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
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 border-t border-b border-[hsl(220,15%,12%)]">
        <div className="container mx-auto px-4">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {stats.map((stat, index) => (
              <motion.div 
                key={stat.label} 
                variants={scaleIn}
                whileHover={{ scale: 1.05, y: -5 }}
                className="text-center"
              >
                <motion.div
                  animate={{ 
                    y: [0, -3, 0],
                    rotate: index % 2 === 0 ? [0, 5, 0] : [0, -5, 0]
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: index * 0.2 }}
                >
                  <stat.icon className={`h-8 w-8 mx-auto mb-3 ${stat.color}`} />
                </motion.div>
                <motion.div 
                  className={`text-4xl md:text-5xl font-bold mb-2 ${stat.color}`}
                  initial={{ opacity: 0, scale: 0.5 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                >
                  {stat.value}
                </motion.div>
                <div className="text-gray-400 text-sm">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          {/* Section Header */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div 
              variants={scaleIn}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center mx-auto mb-6"
            >
              <motion.div 
                animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Sparkles className="h-8 w-8 text-white" />
              </motion.div>
            </motion.div>
            <motion.h2 
              variants={fadeInUp}
              className="text-4xl md:text-5xl font-bold text-white mb-4"
            >
              Meet AVA — Your AI Hiring Assistant
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-gray-400 text-lg">
              Click any feature to learn more
            </motion.p>
          </motion.div>
          
          {/* Feature Cards */}
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={staggerContainer}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto"
          >
            {features.map((feature) => (
              <motion.div 
                key={feature.title}
                variants={fadeInUp}
                whileHover={{ 
                  scale: 1.02, 
                  y: -5,
                  borderColor: "hsl(220, 15%, 30%)"
                }}
                onClick={() => setSelectedFeature(feature)}
                className="group p-6 rounded-2xl bg-[hsl(220,15%,10%)] border border-[hsl(220,15%,15%)] transition-colors cursor-pointer"
              >
                <motion.div 
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className={`w-14 h-14 rounded-xl ${feature.iconBg} flex items-center justify-center mb-5`}
                >
                  <feature.icon className="h-7 w-7 text-white" />
                </motion.div>
                <h3 className={`text-xl font-bold mb-3 ${feature.titleColor}`}>
                  {feature.title}
                </h3>
                <p className="text-gray-400 mb-4 leading-relaxed">
                  {feature.description}
                </p>
                <motion.button 
                  className="flex items-center gap-2 text-emerald-400 text-sm font-medium"
                  whileHover={{ x: 5 }}
                >
                  Learn more
                  <ArrowRight className="h-4 w-4" />
                </motion.button>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,18%,7%)] via-[hsl(260,28%,10%)] to-[hsl(160,28%,10%)]" />
        <motion.div 
          animate={{ 
            opacity: [0.1, 0.2, 0.1],
            scale: [1, 1.2, 1]
          }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/10 blur-[120px] rounded-full" 
        />
        
        <div className="container mx-auto px-4 relative">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="max-w-2xl mx-auto text-center"
          >
            {/* Rocket Icon */}
            <motion.div 
              variants={scaleIn}
              animate={{ 
                y: [0, -10, 0],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="mb-8"
            >
              <Rocket className="h-16 w-16 mx-auto text-emerald-400" />
            </motion.div>
            
            <motion.h2 
              variants={fadeInUp}
              className="text-4xl md:text-5xl font-bold text-white mb-6"
            >
              Ready to Hire Smarter?
            </motion.h2>
            
            <motion.p variants={fadeInUp} className="text-xl text-gray-300 mb-2">
              Stop drowning in applications.
            </motion.p>
            <motion.p variants={fadeInUp} className="text-lg text-gray-400 mb-10">
              Let AVA handle the screening so you can focus on hiring the best.
            </motion.p>
            
            {/* CTA Button */}
            <motion.div variants={fadeInUp}>
              <Link to="/auth">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-block"
                >
                  <Button 
                    size="lg"
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-white rounded-xl px-10 py-6 text-lg h-auto font-semibold shadow-[0_0_60px_-15px_hsla(160,60%,50%,1)]"
                  >
                    <Rocket className="mr-2 h-5 w-5" />
                    Get Started Free — No Credit Card
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </motion.div>
              </Link>
            </motion.div>
            
            {/* Trust line */}
            <motion.p 
              variants={fadeInUp}
              className="mt-6 text-gray-400 text-sm"
            >
              <motion.span 
                animate={{ rotate: [0, 20, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="inline-block text-purple-400"
              >
                ✨
              </motion.span>{" "}
              Setup in 2 minutes • No contracts • Cancel anytime
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <motion.footer 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="py-6 border-t border-[hsl(220,15%,12%)] bg-[hsl(220,18%,5%)]"
      >
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-2 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <motion.div 
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
                className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center"
              >
                <Sparkles className="h-3 w-3 text-white" />
              </motion.div>
              <span>© 2025 HireFlow. Powered by AVA AI.</span>
            </div>
            <span className="hidden md:inline">•</span>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
          </div>
        </div>
      </motion.footer>
      {/* Feature Detail Dialog */}
      <FeatureDetailDialog 
        feature={selectedFeature} 
        onClose={() => setSelectedFeature(null)} 
      />
    </div>
  );
}
