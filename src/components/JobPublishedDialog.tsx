import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Check, 
  Copy, 
  Share2, 
  MapPin, 
  Briefcase,
  ExternalLink,
  CheckCircle2,
  Linkedin,
  Facebook,
  Globe,
  Download,
  Megaphone,
  Users,
  BarChart3
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
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const applyLink = job?.job_code 
    ? `${window.location.origin}/apply?code=${job.job_code}` 
    : "";

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

  const shareToJobBoard = (platform: string) => {
    const encodedTitle = encodeURIComponent(job?.title || "");
    const encodedUrl = encodeURIComponent(applyLink);
    const encodedDescription = encodeURIComponent(`Apply for ${job?.title || "this position"} - ${applyLink}`);
    
    const urls: Record<string, string> = {
      indeed: `https://www.indeed.com/hire/post-a-job?title=${encodedTitle}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedDescription}`,
      monster: `https://hiring.monster.com/employer/post-jobs`,
      ziprecruiter: `https://www.ziprecruiter.com/post-a-job`,
    };

    window.open(urls[platform], "_blank", "noopener,noreferrer");
    toast.success(`Opening ${platform.charAt(0).toUpperCase() + platform.slice(1)}...`);
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
      <DialogContent className="sm:max-w-lg border-border/50 bg-card p-0 overflow-hidden">
        {/* Success Header */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent px-6 pt-6 pb-4">
          <DialogHeader className="text-center space-y-3">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", bounce: 0.5, duration: 0.6 }}
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 ring-4 ring-emerald-500/10"
            >
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <DialogTitle className="text-xl font-semibold text-foreground">
                Your Job is Live!
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Start attracting candidates now
              </p>
            </motion.div>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 space-y-5">
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
            <div className="text-right">
              <span className="text-xs text-muted-foreground">Code</span>
              <div className="font-mono font-bold text-foreground">{job.job_code}</div>
            </div>
          </motion.div>

          {/* Share to Job Boards */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-2"
          >
            <label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Share to Job Boards
            </label>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="default" className="flex-1 gap-2">
                    <Share2 className="h-4 w-4" />
                    Post to Job Boards
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-56">
                  <DropdownMenuItem onClick={() => shareToJobBoard("indeed")} className="gap-3 cursor-pointer">
                    <div className="h-5 w-5 rounded bg-[#003A9B] flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white">in</span>
                    </div>
                    <span>Indeed</span>
                    <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shareToJobBoard("linkedin")} className="gap-3 cursor-pointer">
                    <Linkedin className="h-5 w-5 text-[#0A66C2]" />
                    <span>LinkedIn</span>
                    <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shareToJobBoard("ziprecruiter")} className="gap-3 cursor-pointer">
                    <div className="h-5 w-5 rounded bg-[#5BA51E] flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white">Z</span>
                    </div>
                    <span>ZipRecruiter</span>
                    <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shareToJobBoard("monster")} className="gap-3 cursor-pointer">
                    <div className="h-5 w-5 rounded bg-[#6E45A5] flex items-center justify-center">
                      <Globe className="h-3 w-3 text-white" />
                    </div>
                    <span>Monster</span>
                    <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shareToJobBoard("facebook")} className="gap-3 cursor-pointer">
                    <Facebook className="h-5 w-5 text-[#1877F2]" />
                    <span>Facebook</span>
                    <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => copyToClipboard(applyLink, "link")} className="gap-3 cursor-pointer">
                    {copiedLink ? (
                      <Check className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <Copy className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span>Copy Link</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="icon"
                onClick={() => job.job_code && copyToClipboard(job.job_code, "code")}
                className="shrink-0"
              >
                {copiedCode ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </motion.div>

          {/* QR Code Section */}
          {applyLink && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 border border-border/50"
            >
              <div className="bg-white rounded-lg p-2 shrink-0">
                <QRCodeSVG
                  id="job-qr-code"
                  value={applyLink}
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
                  <Megaphone className="h-3 w-3 text-primary" />
                </div>
                <span>Share to job boards like Indeed or LinkedIn to reach more candidates</span>
              </div>
              <div className="flex items-start gap-2.5 text-muted-foreground">
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Users className="h-3 w-3 text-primary" />
                </div>
                <span>Review incoming applications from your Applicants dashboard</span>
              </div>
              <div className="flex items-start gap-2.5 text-muted-foreground">
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <BarChart3 className="h-3 w-3 text-primary" />
                </div>
                <span>Track your hiring pipeline and candidate progress</span>
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
