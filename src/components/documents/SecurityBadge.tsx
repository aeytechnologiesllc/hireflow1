import { cn } from "@/lib/utils";
import { Shield, Lock, ShieldCheck, CheckCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";

interface SecurityBadgeProps {
  variant?: "encrypted" | "secure" | "protected" | "verified";
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  className?: string;
  animated?: boolean;
}

const variantConfig = {
  encrypted: {
    icon: Lock,
    label: "Encrypted",
    tooltip: "This document is protected with AES-256 encryption",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  secure: {
    icon: Shield,
    label: "Secure",
    tooltip: "Bank-level security protects your data",
    className: "bg-success/10 text-success border-success/20",
  },
  protected: {
    icon: ShieldCheck,
    label: "Protected",
    tooltip: "Your document is stored in a secure, private vault",
    className: "bg-accent/10 text-accent border-accent/20",
  },
  verified: {
    icon: CheckCircle,
    label: "Verified",
    tooltip: "This document has been verified and approved",
    className: "bg-success/10 text-success border-success/20",
  },
};

const sizeConfig = {
  sm: {
    container: "px-2 py-0.5 text-xs gap-1",
    icon: "h-3 w-3",
  },
  md: {
    container: "px-3 py-1 text-sm gap-1.5",
    icon: "h-4 w-4",
  },
  lg: {
    container: "px-4 py-1.5 text-base gap-2",
    icon: "h-5 w-5",
  },
};

export function SecurityBadge({
  variant = "encrypted",
  size = "md",
  showTooltip = true,
  className,
  animated = true,
}: SecurityBadgeProps) {
  const config = variantConfig[variant];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  const badge = (
    <motion.div
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        config.className,
        sizeStyles.container,
        className
      )}
      initial={animated ? { scale: 0.9, opacity: 0 } : undefined}
      animate={animated ? { scale: 1, opacity: 1 } : undefined}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <motion.div
        animate={animated ? { 
          scale: [1, 1.1, 1],
        } : undefined}
        transition={{ 
          duration: 2, 
          repeat: Infinity, 
          ease: "easeInOut" 
        }}
      >
        <Icon className={sizeStyles.icon} />
      </motion.div>
      <span>{config.label}</span>
    </motion.div>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {badge}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span>{config.tooltip}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
