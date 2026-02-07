import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  Clock,
  ChevronUp,
  ChevronDown,
  Keyboard,
  Video,
  MessageSquare,
  Bot,
  Upload,
  Mic,
  Lightbulb,
  Users,
} from "lucide-react";

type PhaseType =
  | "quiz"
  | "typing_test"
  | "video_intro"
  | "video_message"
  | "chat_simulation"
  | "chat_interview"
  | "voice_interview"
  | "portfolio_upload"
  | "sales_simulation";

interface PhaseContextCardProps {
  phaseType: PhaseType;
  className?: string;
}

interface PhaseInfo {
  icon: React.ElementType;
  title: string;
  description: string;
  duration: string;
  tips: string[];
}

const phaseInfoMap: Record<PhaseType, PhaseInfo> = {
  quiz: {
    icon: ClipboardList,
    title: "Knowledge Assessment",
    description:
      "This timed assessment helps the hiring team understand your knowledge and problem-solving abilities relevant to the role.",
    duration: "5-10 minutes",
    tips: [
      "Read each question carefully before answering",
      "You cannot go back to previous questions",
      "Don't worry if you're unsure — answer to the best of your ability",
    ],
  },
  typing_test: {
    icon: Keyboard,
    title: "Typing Assessment",
    description:
      "This test measures your typing speed and accuracy — important for roles that require a lot of written communication.",
    duration: "2-3 minutes",
    tips: [
      "Type at a comfortable pace — accuracy matters more than speed",
      "Focus on the text and avoid distractions",
      "You can see your progress in real-time",
    ],
  },
  video_intro: {
    icon: Video,
    title: "Video Introduction",
    description:
      "Record a brief video to introduce yourself. This gives the hiring team a chance to see your personality and communication style.",
    duration: "2-5 minutes",
    tips: [
      "Find a quiet place with good lighting",
      "Speak naturally — be yourself",
      "Share what excites you about this opportunity",
    ],
  },
  video_message: {
    icon: Video,
    title: "Video Response",
    description:
      "Record a video response to the prompt provided. This helps the team understand your thought process and communication skills.",
    duration: "2-5 minutes",
    tips: [
      "Take a moment to think before recording",
      "Keep your response focused and concise",
      "You can re-record if needed",
    ],
  },
  chat_simulation: {
    icon: MessageSquare,
    title: "Customer Support Simulation",
    description:
      "Practice handling a realistic customer support scenario. This shows how you communicate and resolve customer issues.",
    duration: "10-15 minutes",
    tips: [
      "Be professional and empathetic",
      "Ask clarifying questions if needed",
      "Focus on finding a solution for the customer",
    ],
  },
  chat_interview: {
    icon: Bot,
    title: "Interview Conversation",
    description:
      "Have a text-based conversation about your experience and qualifications. Ava will guide you through interview questions.",
    duration: "15-20 minutes",
    tips: [
      "Take your time to compose thoughtful responses",
      "Share specific examples from your experience",
      "Ask questions if you need clarification",
    ],
  },
  voice_interview: {
    icon: Mic,
    title: "Voice Interview with Ava",
    description:
      "Have a real-time voice conversation with Ava, our AI assistant. This gives the team deeper insight into your communication skills.",
    duration: "10-15 minutes",
    tips: [
      "Find a quiet space with a good internet connection",
      "Speak clearly and at a natural pace",
      "It's okay to pause and think before answering",
    ],
  },
  portfolio_upload: {
    icon: Upload,
    title: "Portfolio Submission",
    description:
      "Share examples of your work. This helps the team see the quality and style of your previous projects.",
    duration: "5 minutes",
    tips: [
      "Choose your best and most relevant work",
      "Provide context for each piece if possible",
      "Accepted formats: PDF, images, or links",
    ],
  },
  sales_simulation: {
    icon: Users,
    title: "Sales Conversation",
    description:
      "Demonstrate your sales approach in a realistic roleplay scenario. Show how you build rapport and handle objections.",
    duration: "10-15 minutes",
    tips: [
      "Listen actively to understand the prospect's needs",
      "Focus on value rather than features",
      "Handle objections with confidence and empathy",
    ],
  },
};

export function PhaseContextCard({ phaseType, className = "" }: PhaseContextCardProps) {
  // Check if user has dismissed this phase's context before
  const storageKey = `phaseContext_${phaseType}_collapsed`;
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return saved !== "true"; // Default to expanded
  });

  // Persist collapse state
  useEffect(() => {
    localStorage.setItem(storageKey, isExpanded ? "false" : "true");
  }, [isExpanded, storageKey]);

  const phaseInfo = phaseInfoMap[phaseType];
  if (!phaseInfo) return null;

  const Icon = phaseInfo.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      <Card className="bg-primary/5 border-primary/20 overflow-hidden">
        <CardContent className="p-0">
          {/* Header - always visible */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-primary/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-foreground text-sm">
                  About This Step
                </h3>
                <p className="text-xs text-muted-foreground">{phaseInfo.title}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </button>

          {/* Expandable content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-4">
                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {phaseInfo.description}
                  </p>

                  {/* Duration badge */}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">
                      Takes about {phaseInfo.duration}
                    </span>
                  </div>

                  {/* Tips */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      Quick Tips
                    </div>
                    <ul className="space-y-1.5 pl-6">
                      {phaseInfo.tips.map((tip, index) => (
                        <li
                          key={index}
                          className="text-xs text-muted-foreground list-disc"
                        >
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
