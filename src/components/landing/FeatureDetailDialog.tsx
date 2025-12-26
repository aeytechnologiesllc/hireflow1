import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { 
  ArrowRight,
  CheckCircle,
  Sparkles,
  Zap,
  Target,
  Users,
  ChartBar,
  Clock,
  Rocket,
  type LucideIcon
} from "lucide-react";

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  titleColor: string;
  iconBg: string;
  detailedDescription: string;
  highlights: string[];
}

interface FeatureDetailDialogProps {
  feature: Feature | null;
  onClose: () => void;
}

// Animated circular progress chart
const CircularProgress = ({ value, label, color }: { value: number; label: string; color: string }) => {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  
  return (
    <div className="relative w-28 h-28">
      <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="hsl(220, 15%, 18%)"
          strokeWidth="8"
          fill="none"
        />
        <motion.circle
          cx="50"
          cy="50"
          r="45"
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span 
          className="text-2xl font-bold text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {value}%
        </motion.span>
        <span className="text-xs text-gray-400">{label}</span>
      </div>
    </div>
  );
};

// Animated bar chart
const BarChart = ({ data }: { data: { label: string; value: number; color: string }[] }) => {
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((item, index) => (
        <div key={item.label} className="flex flex-col items-center gap-1 flex-1">
          <motion.div
            className="w-full rounded-t-lg"
            style={{ backgroundColor: item.color }}
            initial={{ height: 0 }}
            animate={{ height: `${item.value}%` }}
            transition={{ duration: 0.8, delay: index * 0.15, ease: "easeOut" }}
          />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{item.label}</span>
        </div>
      ))}
    </div>
  );
};

// Animated workflow nodes
const WorkflowDiagram = () => {
  const steps = [
    { label: "Quiz", color: "bg-purple-500" },
    { label: "Video", color: "bg-fuchsia-500" },
    { label: "Chat", color: "bg-pink-500" },
    { label: "Interview", color: "bg-violet-500" },
  ];
  
  return (
    <div className="flex items-center justify-center gap-1">
      {steps.map((step, index) => (
        <motion.div key={step.label} className="flex items-center">
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: index * 0.2, duration: 0.3 }}
            className={`w-14 h-14 ${step.color} rounded-xl flex items-center justify-center`}
          >
            <span className="text-[10px] font-medium text-white">{step.label}</span>
          </motion.div>
          {index < steps.length - 1 && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: 16 }}
              transition={{ delay: index * 0.2 + 0.2, duration: 0.2 }}
              className="h-0.5 bg-gradient-to-r from-white/40 to-white/20"
            />
          )}
        </motion.div>
      ))}
    </div>
  );
};

// Animated pipeline kanban
const PipelineKanban = () => {
  const columns = [
    { label: "Applied", count: 24, color: "bg-blue-500" },
    { label: "Screening", count: 12, color: "bg-purple-500" },
    { label: "Interview", count: 5, color: "bg-fuchsia-500" },
    { label: "Hired", count: 2, color: "bg-emerald-500" },
  ];
  
  return (
    <div className="flex gap-2">
      {columns.map((col, index) => (
        <motion.div
          key={col.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.15 }}
          className="flex-1 bg-[hsl(220,15%,12%)] rounded-lg p-2"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-400">{col.label}</span>
            <motion.span 
              className="text-xs font-bold text-white"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.15 + 0.3 }}
            >
              {col.count}
            </motion.span>
          </div>
          <div className="space-y-1">
            {Array.from({ length: Math.min(col.count, 3) }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.15 + i * 0.1 + 0.2 }}
                className={`h-2 rounded ${col.color}/60`}
              />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

// Animated score radar
const ScoreRadar = () => {
  const points = [
    { angle: 0, value: 85 },
    { angle: 60, value: 72 },
    { angle: 120, value: 90 },
    { angle: 180, value: 65 },
    { angle: 240, value: 88 },
    { angle: 300, value: 78 },
  ];
  
  const labels = ["Skills", "Experience", "Culture", "Communication", "Technical", "Leadership"];
  
  const getPointPosition = (angle: number, value: number, radius: number = 50) => {
    const radian = (angle - 90) * (Math.PI / 180);
    const adjustedRadius = (value / 100) * radius;
    return {
      x: 60 + adjustedRadius * Math.cos(radian),
      y: 60 + adjustedRadius * Math.sin(radian),
    };
  };
  
  const pathData = points.map((p, i) => {
    const pos = getPointPosition(p.angle, p.value);
    return `${i === 0 ? 'M' : 'L'} ${pos.x} ${pos.y}`;
  }).join(' ') + ' Z';
  
  return (
    <div className="relative w-32 h-32">
      <svg viewBox="0 0 120 120" className="w-full h-full">
        {/* Background circles */}
        {[20, 40, 60, 80, 100].map((r) => (
          <circle
            key={r}
            cx="60"
            cy="60"
            r={(r / 100) * 50}
            fill="none"
            stroke="hsl(220, 15%, 18%)"
            strokeWidth="0.5"
          />
        ))}
        {/* Axes */}
        {points.map((p, i) => {
          const outer = getPointPosition(p.angle, 100);
          return (
            <line
              key={i}
              x1="60"
              y1="60"
              x2={outer.x}
              y2={outer.y}
              stroke="hsl(220, 15%, 18%)"
              strokeWidth="0.5"
            />
          );
        })}
        {/* Data shape */}
        <motion.path
          d={pathData}
          fill="rgba(168, 85, 247, 0.3)"
          stroke="rgb(168, 85, 247)"
          strokeWidth="2"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          style={{ transformOrigin: "60px 60px" }}
        />
        {/* Points */}
        {points.map((p, i) => {
          const pos = getPointPosition(p.angle, p.value);
          return (
            <motion.circle
              key={i}
              cx={pos.x}
              cy={pos.y}
              r="3"
              fill="rgb(168, 85, 247)"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.1 + 0.5 }}
            />
          );
        })}
      </svg>
      {/* Labels */}
      {labels.map((label, i) => {
        const pos = getPointPosition(i * 60, 130);
        return (
          <motion.span
            key={label}
            className="absolute text-[8px] text-gray-400 whitespace-nowrap"
            style={{
              left: pos.x - 15,
              top: pos.y - 5,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            {label}
          </motion.span>
        );
      })}
    </div>
  );
};

// Animated time savings
const TimeSavingsChart = () => {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-16">Before</span>
          <motion.div
            className="h-6 bg-red-500/60 rounded flex items-center justify-end pr-2"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 1, ease: "easeOut" }}
          >
            <span className="text-[10px] text-white font-medium">40 hrs</span>
          </motion.div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-16">After</span>
          <motion.div
            className="h-6 bg-emerald-500 rounded flex items-center justify-end pr-2"
            initial={{ width: 0 }}
            animate={{ width: "30%" }}
            transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
          >
            <span className="text-[10px] text-white font-medium">12 hrs</span>
          </motion.div>
        </div>
      </div>
      <motion.div
        className="flex flex-col items-center"
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1 }}
      >
        <span className="text-3xl font-bold text-emerald-400">70%</span>
        <span className="text-[10px] text-gray-400">Time Saved</span>
      </motion.div>
    </div>
  );
};

// Animated document flow
const DocumentFlow = () => {
  return (
    <div className="flex items-center justify-center gap-2">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="w-16 h-20 bg-[hsl(220,15%,15%)] rounded-lg border border-[hsl(220,15%,22%)] flex flex-col items-center justify-center"
      >
        <div className="w-8 h-1 bg-gray-500 rounded mb-1" />
        <div className="w-10 h-1 bg-gray-500 rounded mb-1" />
        <div className="w-6 h-1 bg-gray-500 rounded" />
      </motion.div>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.3 }}
        className="w-8 h-0.5 bg-gradient-to-r from-purple-500 to-fuchsia-500"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.5 }}
        className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center"
      >
        <Sparkles className="w-4 h-4 text-white" />
      </motion.div>
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.7 }}
        className="w-8 h-0.5 bg-gradient-to-r from-fuchsia-500 to-emerald-500"
      />
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.9 }}
        className="w-16 h-20 bg-[hsl(220,15%,15%)] rounded-lg border border-emerald-500/50 flex flex-col items-center justify-center relative"
      >
        <div className="w-8 h-1 bg-gray-500 rounded mb-1" />
        <div className="w-10 h-1 bg-gray-500 rounded mb-1" />
        <div className="w-6 h-1 bg-gray-500 rounded mb-2" />
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1.2 }}
          className="absolute -bottom-2 -right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center"
        >
          <CheckCircle className="w-4 h-4 text-white" />
        </motion.div>
      </motion.div>
    </div>
  );
};

// Get the appropriate visual for each feature
const getFeatureVisual = (title: string) => {
  switch (title) {
    case "Ava-Powered Screening":
      return (
        <div className="flex items-center justify-center gap-6">
          <CircularProgress value={92} label="Match" color="#a855f7" />
          <BarChart data={[
            { label: "Skills", value: 85, color: "#a855f7" },
            { label: "Exp", value: 72, color: "#d946ef" },
            { label: "Fit", value: 90, color: "#ec4899" },
            { label: "Comm", value: 78, color: "#8b5cf6" },
          ]} />
        </div>
      );
    case "Instant Job Setup":
      return (
        <div className="flex items-center justify-center gap-4">
          <motion.div
            className="relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="w-20 h-24 bg-[hsl(220,15%,12%)] rounded-lg border border-[hsl(220,15%,20%)] p-2"
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="w-full h-2 bg-purple-500/40 rounded mb-1.5" />
              <div className="w-3/4 h-1.5 bg-gray-600 rounded mb-1" />
              <div className="w-full h-1.5 bg-gray-600 rounded mb-1" />
              <div className="w-2/3 h-1.5 bg-gray-600 rounded mb-1" />
              <div className="w-full h-1.5 bg-gray-600 rounded" />
            </motion.div>
            <motion.div
              className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-br from-purple-500 to-fuchsia-500 rounded-full flex items-center justify-center"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.5, type: "spring" }}
            >
              <Zap className="w-4 h-4 text-white" />
            </motion.div>
          </motion.div>
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 }}
          >
            <motion.span
              className="text-4xl font-bold text-emerald-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              30s
            </motion.span>
            <span className="text-xs text-gray-400">Setup Time</span>
          </motion.div>
        </div>
      );
    case "Custom Workflows":
      return <WorkflowDiagram />;
    case "Smart Tracking":
      return <PipelineKanban />;
    case "Deep Insights":
      return (
        <div className="flex items-center justify-center gap-4">
          <ScoreRadar />
          <div className="space-y-2">
            {[
              { label: "Overall Score", value: "87%", color: "text-purple-400" },
              { label: "Recommendation", value: "Hire", color: "text-emerald-400" },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.2 + 0.5 }}
                className="text-right"
              >
                <div className="text-[10px] text-gray-400">{item.label}</div>
                <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
              </motion.div>
            ))}
          </div>
        </div>
      );
    case "Save 70% Time":
      return <TimeSavingsChart />;
    default:
      return <DocumentFlow />;
  }
};

export default function FeatureDetailDialog({ feature, onClose }: FeatureDetailDialogProps) {
  if (!feature) return null;
  
  return (
    <Dialog open={!!feature} onOpenChange={onClose}>
      <DialogContent className="bg-[hsl(220,15%,8%)] border-[hsl(220,15%,15%)] text-white max-w-xl p-0 overflow-hidden">
        {/* Header with gradient and visual */}
        <div className={`p-6 relative ${
          feature.iconBg === "bg-fuchsia-500" 
            ? "bg-gradient-to-br from-fuchsia-500/20 via-purple-500/10 to-transparent" 
            : "bg-gradient-to-br from-purple-500/20 via-fuchsia-500/10 to-transparent"
        }`}>
          {/* Floating decorative elements */}
          <motion.div
            className="absolute top-4 right-4 w-20 h-20 bg-gradient-to-br from-purple-500/10 to-fuchsia-500/10 rounded-full blur-xl"
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          
          <div className="flex items-start gap-4 mb-6">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className={`w-14 h-14 rounded-xl ${feature.iconBg} flex items-center justify-center flex-shrink-0`}
            >
              <feature.icon className="h-7 w-7 text-white" />
            </motion.div>
            <div>
              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`text-2xl font-bold ${feature.titleColor} mb-1`}
              >
                {feature.title}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-gray-400 text-sm"
              >
                {feature.description}
              </motion.p>
            </div>
          </div>
          
          {/* Visual/Chart Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[hsl(220,15%,10%)] rounded-xl p-4 border border-[hsl(220,15%,15%)]"
          >
            {getFeatureVisual(feature.title)}
          </motion.div>
        </div>
        
        {/* Content */}
        <div className="p-6 pt-4 space-y-5">
          <motion.p 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-gray-300 text-sm leading-relaxed"
          >
            {feature.detailedDescription}
          </motion.p>
          
          {/* Highlights */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Key Features
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {feature.highlights.map((highlight, index) => (
                <motion.div 
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + index * 0.08 }}
                  className="flex items-center gap-2 text-sm text-gray-300 bg-[hsl(220,15%,10%)] rounded-lg px-3 py-2"
                >
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="text-xs">{highlight}</span>
                </motion.div>
              ))}
            </div>
          </div>
          
          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="pt-2"
          >
            <Link to="/auth" onClick={onClose}>
              <Button className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-white font-medium rounded-xl">
                <Rocket className="mr-2 h-5 w-5" />
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
