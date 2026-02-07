import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Send, 
  Loader2, 
  AlertCircle,
  Briefcase,
  KeyRound
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ApplyWithCode() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = searchParams.get("code") || "";
  
  const [jobCode, setJobCode] = useState(initialCode);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState("");

  const isEmployer = role === "employer";

  const handleSearch = async () => {
    if (!jobCode.trim()) {
      setError("Please enter an application code");
      return;
    }

    setIsSearching(true);
    setError("");

    try {
      const { data, error: fetchError } = await supabase
        .from("jobs")
        .select("id")
        .eq("job_code", jobCode.trim().toUpperCase())
        .eq("status", "published")
        .single();

      if (fetchError || !data) {
        setError("No job found with this code. Please check and try again.");
        return;
      }

      // Navigate to the full job details page
      navigate(`/job/${data.id}`);
    } catch (err) {
      setError("An error occurred while searching. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  if (isEmployer) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="bg-card border-border max-w-md">
          <CardContent className="p-8 text-center">
            <Briefcase className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Candidate Access Only</h2>
            <p className="text-muted-foreground">
              This page is for job seekers. Use the Jobs section to manage your job postings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-4">
          <KeyRound className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-foreground">Enter Job Code</h1>
        <p className="text-muted-foreground mt-2 max-w-md">
          Enter the application code you received from the employer to view and apply for the position
        </p>
      </motion.div>

      {/* Code Entry Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-md"
      >
        <Card className="bg-card border-border">
          <CardContent className="p-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="job-code" className="text-base font-medium">
                  Job Application Code
                </Label>
                <Input
                  id="job-code"
                  value={jobCode}
                  onChange={(e) => {
                    setJobCode(e.target.value.toUpperCase());
                    setError("");
                  }}
                  onKeyDown={handleKeyPress}
                  placeholder="Enter code (e.g., ABC123)"
                  className="text-xl font-mono tracking-[0.3em] uppercase text-center h-14"
                />
              </div>

              <Button 
                onClick={handleSearch} 
                disabled={isSearching || !jobCode.trim()}
                size="lg"
                className="w-full h-12 text-lg"
              >
                {isSearching ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" />
                    Find Position
                  </>
                )}
              </Button>

              {/* Error State */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="text-sm">{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <p className="text-sm text-muted-foreground text-center">
                The employer will provide you with this code
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}