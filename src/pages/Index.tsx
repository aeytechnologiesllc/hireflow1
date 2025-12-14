import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Briefcase, 
  Users, 
  Zap, 
  Shield, 
  BarChart3, 
  MessageSquare, 
  ArrowRight,
  CheckCircle2,
  Sparkles
} from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "AI-Powered Screening",
    description: "Automatically analyze resumes and applications with advanced AI to find the best candidates faster.",
  },
  {
    icon: Shield,
    title: "Bias Detection",
    description: "Ensure inclusive job postings with AI that identifies and suggests improvements for potential bias.",
  },
  {
    icon: BarChart3,
    title: "Smart Analytics",
    description: "Track hiring metrics, candidate progress, and team performance with intuitive dashboards.",
  },
  {
    icon: MessageSquare,
    title: "Real-time Messaging",
    description: "Communicate seamlessly with candidates and team members through built-in messaging.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Invite team members, assign roles, and collaborate on hiring decisions together.",
  },
  {
    icon: Briefcase,
    title: "Interview Management",
    description: "Schedule interviews, get AI-generated questions, and manage the entire interview process.",
  },
];

const benefits = [
  "Reduce time-to-hire by up to 60%",
  "Increase candidate quality scores",
  "Eliminate unconscious bias in job posts",
  "Streamline team collaboration",
  "Make data-driven hiring decisions",
];

export default function Index() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold">
            <span className="text-gradient">HireFlow</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/auth">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link to="/auth">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 gradient-hero overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute top-60 -left-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
        </div>
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" />
              AI-Powered Hiring Platform
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Hire Smarter with
              <span className="text-gradient block">AI-Driven Insights</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Transform your hiring process with intelligent candidate screening, 
              bias-free job postings, and seamless team collaboration.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/auth">
                <Button size="lg" className="text-base px-8 shadow-glow">
                  Start Hiring
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/auth">
                <Button size="lg" variant="outline" className="text-base px-8">
                  Find Jobs
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need to Hire Better
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed to streamline your hiring process from start to finish.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={feature.title} 
                className="group hover:shadow-lg transition-all duration-300 border-0 gradient-card"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg gradient-primary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <feature.icon className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Why Teams Choose <span className="text-gradient">HireFlow</span>
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Join thousands of companies that have transformed their hiring process 
                with our AI-powered platform.
              </p>
              
              <ul className="space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-success/20 flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    </div>
                    <span className="text-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>
              
              <div className="mt-8">
                <Link to="/auth">
                  <Button size="lg">
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-square rounded-2xl gradient-primary opacity-10 absolute inset-0 blur-3xl" />
              <Card className="relative border-0 shadow-xl">
                <CardContent className="p-8">
                  <div className="grid grid-cols-2 gap-6 text-center">
                    <div className="p-4 rounded-lg bg-secondary/50">
                      <div className="text-3xl font-bold text-primary mb-1">60%</div>
                      <div className="text-sm text-muted-foreground">Faster Hiring</div>
                    </div>
                    <div className="p-4 rounded-lg bg-secondary/50">
                      <div className="text-3xl font-bold text-primary mb-1">85%</div>
                      <div className="text-sm text-muted-foreground">Quality Match</div>
                    </div>
                    <div className="p-4 rounded-lg bg-secondary/50">
                      <div className="text-3xl font-bold text-primary mb-1">10k+</div>
                      <div className="text-sm text-muted-foreground">Jobs Posted</div>
                    </div>
                    <div className="p-4 rounded-lg bg-secondary/50">
                      <div className="text-3xl font-bold text-primary mb-1">50k+</div>
                      <div className="text-sm text-muted-foreground">Candidates</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <Card className="gradient-primary border-0 overflow-hidden">
            <CardContent className="p-12 text-center text-primary-foreground">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to Transform Your Hiring?
              </h2>
              <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">
                Start building your dream team today with AI-powered insights and streamlined workflows.
              </p>
              <Link to="/auth">
                <Button size="lg" variant="secondary" className="text-base px-8">
                  Get Started for Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border bg-background">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-2xl font-bold">
              <span className="text-gradient">HireFlow</span>
            </div>
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} HireFlow. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
