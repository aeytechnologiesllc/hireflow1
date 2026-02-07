import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Lightbulb } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateCardProps {
  /** The icon to display (animated) */
  icon: LucideIcon;
  /** Primary message/title */
  title: string;
  /** Secondary explanation text */
  description: string;
  /** Optional action button */
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  /** Optional contextual tip */
  tip?: string;
  /** Additional class names */
  className?: string;
}

/**
 * Reusable empty state component for consistent empty state displays
 * across the application (Messages, Documents, etc.)
 */
export function EmptyStateCard({
  icon: Icon,
  title,
  description,
  action,
  tip,
  className,
}: EmptyStateCardProps) {
  return (
    <Card className={cn("border-dashed bg-card/50", className)}>
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
        {/* Animated Icon */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mb-6"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="relative p-4 rounded-full bg-primary/10 border border-primary/20"
            >
              <Icon className="h-10 w-10 text-primary" />
            </motion.div>
          </div>
        </motion.div>

        {/* Title */}
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="text-xl font-semibold text-foreground mb-2"
        >
          {title}
        </motion.h3>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="text-muted-foreground max-w-sm mb-6"
        >
          {description}
        </motion.p>

        {/* Action Button */}
        {action && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            <Button onClick={action.onClick} className="gap-2">
              {action.icon && <action.icon className="h-4 w-4" />}
              {action.label}
            </Button>
          </motion.div>
        )}

        {/* Contextual Tip */}
        {tip && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            className="mt-6 flex items-start gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-3 max-w-sm"
          >
            <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>{tip}</span>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}
