import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Check, 
  Copy, 
  Share2, 
  MapPin, 
  Briefcase,
  ExternalLink,
  Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { useEffect } from "react";

interface JobPublishedDialogProps {
  open: boolean;
  onClose: () => void;
  job: {
    id: string;
    title: string;
    location?: string | null;
    job_type?: string | null;
    job_code?: string | null;
  } | null;
}

export function JobPublishedDialog({ open, onClose, job }: JobPublishedDialogProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const applyLink = job?.job_code 
    ? `${window.location.origin}/apply?code=${job.job_code}` 
    : "";

  useEffect(() => {
    if (open && job) {
      // Trigger confetti celebration
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [open, job]);

  const copyToClipboard = async (text: string, type: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
      toast.success(`${type === "code" ? "Job code" : "Link"} copied!`);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleShare = async () => {
    if (navigator.share && job) {
      try {
        await navigator.share({
          title: `Apply for ${job.title}`,
          text: `Apply for ${job.title} using code: ${job.job_code}`,
          url: applyLink
        });
      } catch (err) {
        // User cancelled or share failed
        if ((err as Error).name !== "AbortError") {
          copyToClipboard(applyLink, "link");
        }
      }
    } else {
      copyToClipboard(applyLink, "link");
    }
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", bounce: 0.5 }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
          >
            <Sparkles className="h-8 w-8 text-primary" />
          </motion.div>
          <DialogTitle className="text-2xl font-bold text-center">
            Job Published Successfully!
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Job Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-lg border bg-muted/30 p-4"
          >
            <h3 className="font-semibold text-lg">{job.title}</h3>
            <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {job.location}
                </span>
              )}
              {job.job_type && (
                <Badge variant="secondary" className="font-normal">
                  <Briefcase className="h-3 w-3 mr-1" />
                  {job.job_type}
                </Badge>
              )}
            </div>
          </motion.div>

          {/* Job Code */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-2"
          >
            <label className="text-sm font-medium text-muted-foreground">
              Application Code
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border bg-background px-4 py-3 font-mono text-lg font-bold tracking-wider">
                {job.job_code || "N/A"}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => job.job_code && copyToClipboard(job.job_code, "code")}
                disabled={!job.job_code}
              >
                {copiedCode ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </motion.div>

          {/* Candidate Portal Link */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-2"
          >
            <label className="text-sm font-medium text-muted-foreground">
              Candidate Portal Link
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-lg border bg-background px-3 py-2.5 text-sm truncate text-muted-foreground">
                {applyLink || "N/A"}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(applyLink, "link")}
                disabled={!applyLink}
              >
                {copiedLink ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleShare}
                disabled={!applyLink}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>

          {/* QR Code */}
          {applyLink && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <div className="rounded-xl border bg-white p-4">
                <QRCodeSVG
                  value={applyLink}
                  size={140}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Scan to apply directly
              </p>
            </motion.div>
          )}

          {/* Helpful tip */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-center text-sm text-muted-foreground"
          >
            Share this code or link with candidates to apply!
          </motion.p>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
          <Button onClick={() => window.open(`/jobs/${job.id}`, "_blank")}>
            <ExternalLink className="h-4 w-4 mr-2" />
            View Job Details
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
