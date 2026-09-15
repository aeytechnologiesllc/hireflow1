import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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
  ExternalLink,
  CheckCircle2,
  Globe,
  Download,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const publicJobLink = job ? `${window.location.origin}/candidate/job/${job.id}` : "";
  const directApplyLink = job?.job_code
    ? `${window.location.origin}/candidate/apply?code=${job.job_code}` 
    : publicJobLink;
  const shareLink = publicJobLink || directApplyLink;

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

  const downloadQRCode = () => {
    const svg = document.getElementById("job-qr-code");
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `${job?.job_code || "job"}-qr-code.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
      toast.success("QR code downloaded!");
    };
    
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden border-border/50 bg-card p-0 sm:max-w-lg">
        {/* Success Header */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-4">
          <DialogHeader className="text-center space-y-3">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", bounce: 0.5, duration: 0.6 }}
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/20 ring-4 ring-primary/10"
            >
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <DialogTitle className="text-xl font-semibold text-foreground">
                Your job is live
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Your HireFlow apply page is ready.
              </p>
            </motion.div>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(100dvh-9rem)] space-y-5 overflow-y-auto px-6 pb-6">
          {/* Job Info */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50"
          >
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-foreground truncate">{job.title}</h3>
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {job.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {job.location}
                  </span>
                )}
                {job.job_type && (
                  <Badge variant="secondary" className="text-xs py-0 px-1.5">
                    {job.job_type}
                  </Badge>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => job.job_code && copyToClipboard(job.job_code, "code")}
              className="group ml-3 flex shrink-0 flex-col items-end rounded-lg border border-transparent px-3 py-2 text-right transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label={job.job_code ? `Copy job code ${job.job_code}` : "Copy job code"}
            >
              <span className="text-xs text-muted-foreground transition-colors group-hover:text-primary">
                {copiedCode ? "Copied" : "Code"}
              </span>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono font-bold text-foreground">{job.job_code}</span>
                {copiedCode ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                )}
              </div>
              <span className="mt-1 text-[11px] text-muted-foreground/80 transition-colors group-hover:text-primary/90">
                Click to copy
              </span>
            </button>
          </motion.div>

          {/* Share your job */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-2"
          >
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Share2 className="h-4 w-4 text-primary" />
              Share your job
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Your job page is live and Google has already been told. Share the link anywhere you like.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="gap-2" onClick={() => copyToClipboard(shareLink, "link")}>
                {copiedLink ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                Copy link
              </Button>
              <Button variant="outline" className="gap-2" asChild>
                <a href={shareLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  View job page
                </a>
              </Button>
            </div>
          </motion.div>

          {/* QR Code Section */}
          {shareLink && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-border/50"
            >
              <div className="bg-white rounded-lg p-2 shrink-0">
                <QRCodeSVG
                  id="job-qr-code"
                  value={shareLink}
                  size={72}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">QR Code</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Print for job fairs, flyers, or office postings
                </p>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="mt-1.5 h-7 px-2 text-xs gap-1.5"
                  onClick={downloadQRCode}
                >
                  <Download className="h-3 w-3" />
                  Download
                </Button>
              </div>
            </motion.div>
          )}

          {/* What's Next */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="space-y-2"
          >
            <label className="text-sm font-medium text-foreground">What's Next?</label>
            <div className="grid gap-2 text-sm">
              <div className="flex items-start gap-2.5 text-muted-foreground">
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Globe className="h-3 w-3 text-primary" />
                </div>
                <span>Google Jobs can pick up your public job page when it is indexed, but traffic is never guaranteed</span>
              </div>
              <div className="flex items-start gap-2.5 text-muted-foreground">
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Users className="h-3 w-3 text-primary" />
                </div>
                <span>Review incoming applications from your Applicants dashboard</span>
              </div>
            </div>
          </motion.div>

          {/* Footer Actions */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex gap-2 pt-2"
          >
            <Button variant="outline" onClick={onClose} className="flex-1">
              Done
            </Button>
            <Button onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["employer-jobs"] });
              queryClient.invalidateQueries({ queryKey: ["jobs"] });
              onClose();
              navigate("/jobs");
            }} className="flex-1 gap-2">
              <ExternalLink className="h-4 w-4" />
              View Jobs
            </Button>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
