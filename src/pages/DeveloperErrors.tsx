import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Bug, Clock, Repeat } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useClientErrorEvents, type ClientErrorEvent } from "@/hooks/useClientErrorEvents";
import { formatDistanceToNow } from "date-fns";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export default function DeveloperErrors() {
  const { data: events, isLoading, error } = useClientErrorEvents();
  const [selected, setSelected] = useState<ClientErrorEvent | null>(null);

  const totalOccurrences = (events ?? []).reduce((sum, e) => sum + e.occurrence_count, 0);
  const newestFirst = events ?? [];

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2 text-destructive">
              <Bug className="h-4 w-4" />
              Distinct Errors
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{isLoading ? <Skeleton className="h-8 w-12" /> : newestFirst.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              Total Occurrences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{isLoading ? <Skeleton className="h-8 w-12" /> : totalOccurrences}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Most Frequent
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-foreground truncate">
              {isLoading ? <Skeleton className="h-6 w-24" /> : (
                newestFirst.length
                  ? [...newestFirst].sort((a, b) => b.occurrence_count - a.occurrence_count)[0].message
                  : "None"
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bug className="h-5 w-5 text-destructive" />
              Error Groups
            </CardTitle>
            <CardDescription>
              Grouped by fingerprint (same error site + route). Click a row for the sample stack trace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading && (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            )}
            {error != null && (
              <div className="text-sm text-destructive">Could not load error events.</div>
            )}
            {!isLoading && !error && newestFirst.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No client errors reported. That's either great news, or crashReporter.ts isn't wired up — check src/lib/crashReporter.ts.
              </div>
            )}
            {newestFirst.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelected(event)}
                className="w-full text-left flex items-center justify-between gap-4 rounded-lg border border-border/40 bg-background/40 hover:bg-muted/40 transition-colors px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate">{event.message}</span>
                    {event.user_role && (
                      <Badge variant="outline" className="text-[10px]">{event.user_role}</Badge>
                    )}
                    {event.browser_family && (
                      <Badge variant="secondary" className="text-[10px]">{event.browser_family}</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {event.route} · first seen {formatDistanceToNow(new Date(event.first_seen_at), { addSuffix: true })}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-lg font-bold text-foreground">{event.occurrence_count}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">occurrences</div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(event.last_seen_at), { addSuffix: true })}
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={selected != null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-destructive" />
              {selected?.message}
            </DialogTitle>
            <DialogDescription>
              {selected?.route} · {selected?.occurrence_count} occurrences · release {selected?.release ?? "unknown"}
            </DialogDescription>
          </DialogHeader>
          <pre className="text-xs bg-muted/50 rounded-lg p-4 overflow-auto max-h-96 whitespace-pre-wrap break-words">
            {selected?.stack ?? "No stack trace captured."}
          </pre>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
