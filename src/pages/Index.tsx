import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
  },
  {
    icon: Zap,
    title: "Instant Job Setup",
    description: "Generate perfect application questions and screening steps in under 30 seconds",
    titleColor: "text-emerald-400",
    iconBg: "bg-fuchsia-500",
  },
  {
    icon: Target,
    title: "Custom Workflows",
    description: "Typing tests, video responses, skill assessments — fully automated",
    titleColor: "text-foreground",
    iconBg: "bg-purple-500",
  },
  {
    icon: Users,
    title: "Smart Tracking",
    description: "Pipeline view, bulk actions, and real-time candidate updates",
    titleColor: "text-foreground",
    iconBg: "bg-fuchsia-500",
  },
  {
    icon: ChartBar,
    title: "Deep Insights",
    description: "AI recommendations with detailed analysis for every single candidate",
    titleColor: "text-emerald-400",
    iconBg: "bg-purple-500",
  },
  {
    icon: Clock,
    title: "Save 70% Time",
    description: "Stop manually reviewing hundreds of applications. Let AVA do it.",
    titleColor: "text-foreground",
    iconBg: "bg-purple-500",
  },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-[hsl(220,20%,8%)]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[hsl(220,20%,8%)]/80 backdrop-blur-md border-b border-[hsl(220,15%,15%)]">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">HireFlow</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-transparent">
                Sign In
              </Button>
            </Link>
            <Link to="/auth">
              <Button className="bg-[hsl(220,15%,15%)] hover:bg-[hsl(220,15%,20%)] text-white border border-[hsl(220,15%,20%)] rounded-full px-6">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-24 overflow-hidden">
        {/* Green glow effect */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/20 blur-[100px] rounded-full" />
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-4xl mx-auto text-center">
            {/* AVA AI Badge */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[hsl(220,15%,12%)] border border-[hsl(220,15%,18%)] text-gray-300 text-sm">
                Powered by AVA AI
                <Sparkles className="h-4 w-4 text-purple-400" />
              </div>
            </div>
            
            {/* Main Headline */}
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight text-white">
              Hire <span className="text-emerald-400">10x Faster</span> with AI
            </h1>
            
            {/* Subheadlines */}
            <p className="text-xl md:text-2xl text-gray-300 mb-3">
              Stop wasting time on unqualified candidates.
            </p>
            <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
              AVA screens, evaluates, and ranks candidates automatically — so you only interview the best.
            </p>
            
            {/* CTA Button */}
            <Link to="/auth">
              <Button 
                size="lg" 
                className="bg-[hsl(220,15%,12%)] hover:bg-[hsl(220,15%,15%)] text-white border border-[hsl(220,15%,18%)] rounded-xl px-8 py-6 text-lg h-auto shadow-[0_0_60px_-15px_hsl(160,60%,40%)]"
              >
                <Rocket className="mr-2 h-5 w-5" />
                Start Hiring for Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            
            {/* Trust badges */}
            <div className="flex items-center justify-center gap-8 mt-8 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                Free to start
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                No credit card
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-400" />
                2 min setup
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 border-t border-b border-[hsl(220,15%,12%)]">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <stat.icon className={`h-8 w-8 mx-auto mb-3 ${stat.color}`} />
                <div className={`text-4xl md:text-5xl font-bold mb-2 ${stat.color}`}>
                  {stat.value}
                </div>
                <div className="text-gray-400 text-sm">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          {/* Section Header */}
          <div className="text-center mb-16">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Meet AVA — Your AI Hiring Assistant
            </h2>
            <p className="text-gray-400 text-lg">
              Click any feature to learn more
            </p>
          </div>
          
          {/* Feature Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {features.map((feature, index) => (
              <div 
                key={feature.title}
                className="group p-6 rounded-2xl bg-[hsl(220,15%,10%)] border border-[hsl(220,15%,15%)] hover:border-[hsl(220,15%,25%)] transition-all cursor-pointer"
              >
                <div className={`w-14 h-14 rounded-xl ${feature.iconBg} flex items-center justify-center mb-5`}>
                  <feature.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className={`text-xl font-bold mb-3 ${feature.titleColor}`}>
                  {feature.title}
                </h3>
                <p className="text-gray-400 mb-4 leading-relaxed">
                  {feature.description}
                </p>
                <button className="flex items-center gap-2 text-emerald-400 text-sm font-medium group-hover:gap-3 transition-all">
                  Learn more
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 relative overflow-hidden">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(220,20%,8%)] via-[hsl(260,30%,12%)] to-[hsl(160,30%,12%)]" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/10 blur-[120px] rounded-full" />
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-2xl mx-auto text-center">
            {/* Rocket Icon */}
            <div className="mb-8">
              <Rocket className="h-16 w-16 mx-auto text-emerald-400" />
            </div>
            
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
              Ready to Hire Smarter?
            </h2>
            
            <p className="text-xl text-gray-300 mb-2">
              Stop drowning in applications.
            </p>
            <p className="text-lg text-gray-400 mb-10">
              Let AVA handle the screening so you can focus on hiring the best.
            </p>
            
            {/* CTA Button */}
            <Link to="/auth">
              <Button 
                size="lg"
                className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-white rounded-xl px-10 py-6 text-lg h-auto font-semibold"
              >
                <Rocket className="mr-2 h-5 w-5" />
                Get Started Free — No Credit Card
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            
            {/* Trust line */}
            <p className="mt-6 text-gray-400 text-sm">
              <span className="text-purple-400">✨</span> Setup in 2 minutes • No contracts • Cancel anytime
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 border-t border-[hsl(220,15%,12%)] bg-[hsl(220,20%,6%)]">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-2 text-sm text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center">
                <Sparkles className="h-3 w-3 text-white" />
              </div>
              <span>© 2025 HireFlow. Powered by AVA AI.</span>
            </div>
            <span className="hidden md:inline">•</span>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
