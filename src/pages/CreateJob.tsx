import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCreateJob } from "@/hooks/useJobs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Loader2, Sparkles, AlertCircle, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface BiasAnalysis {
  score: number;
  issues: string[];
  suggestions: string[];
  analysis: string;
}

export default function CreateJob() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const createJob = useCreateJob();
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    requirements: "",
    responsibilities: "",
    location: "",
    job_type: "full-time",
    experience_level: "",
    department: "",
    salary_min: "",
    salary_max: "",
    salary_currency: "USD",
    skills_required: "",
    benefits: "",
    application_deadline: "",
  });

  const [biasAnalysis, setBiasAnalysis] = useState<BiasAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear bias analysis when content changes significantly
    if (field === "description" || field === "requirements") {
      setBiasAnalysis(null);
    }
  };

  const analyzeForBias = async () => {
    if (!formData.description && !formData.requirements) {
      toast.error("Please add a description or requirements to analyze");
      return;
    }

    setIsAnalyzing(true);
    try {
      const content = `
Job Title: ${formData.title}

Description:
${formData.description}

Requirements:
${formData.requirements}

Responsibilities:
${formData.responsibilities}
      `.trim();

      const { data, error } = await supabase.functions.invoke("ai-analyze", {
        body: { type: "job-bias", content },
      });

      if (error) throw error;

      // Parse the analysis response
      const analysisText = data.analysis;
      
      // Extract score (look for pattern like "Score: 85" or "Bias Score: 85")
      const scoreMatch = analysisText.match(/(?:Bias\s+)?Score[:\s]+(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 75;

      // Extract issues and suggestions from bullet points
      const issues: string[] = [];
      const suggestions: string[] = [];
      
      const issuesMatch = analysisText.match(/Issues Found[:\s]*\n([\s\S]*?)(?=\n\n|Suggested|$)/i);
      if (issuesMatch) {
        const issueLines = issuesMatch[1].split("\n").filter((line: string) => line.trim().startsWith("-") || line.trim().startsWith("•"));
        issues.push(...issueLines.map((line: string) => line.replace(/^[-•]\s*/, "").trim()).filter(Boolean));
      }

      const suggestionsMatch = analysisText.match(/Suggested Improvements[:\s]*\n([\s\S]*?)(?=\n\n|Rewritten|$)/i);
      if (suggestionsMatch) {
        const suggestionLines = suggestionsMatch[1].split("\n").filter((line: string) => line.trim().startsWith("-") || line.trim().startsWith("•"));
        suggestions.push(...suggestionLines.map((line: string) => line.replace(/^[-•]\s*/, "").trim()).filter(Boolean));
      }

      setBiasAnalysis({
        score,
        issues: issues.length > 0 ? issues : ["No major issues found"],
        suggestions: suggestions.length > 0 ? suggestions : ["Job posting looks good!"],
        analysis: analysisText,
      });

      toast.success("Bias analysis complete");
    } catch (error) {
      console.error("Error analyzing for bias:", error);
      toast.error("Failed to analyze job posting");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSubmit = async (status: "draft" | "published") => {
    if (!formData.title || !formData.description) {
      toast.error("Please fill in the title and description");
      return;
    }

    setIsSubmitting(true);
    try {
      await createJob.mutateAsync({
        title: formData.title,
        description: formData.description,
        requirements: formData.requirements || null,
        responsibilities: formData.responsibilities || null,
        location: formData.location || null,
        job_type: formData.job_type,
        experience_level: formData.experience_level || null,
        department: formData.department || null,
        salary_min: formData.salary_min ? parseInt(formData.salary_min) : null,
        salary_max: formData.salary_max ? parseInt(formData.salary_max) : null,
        salary_currency: formData.salary_currency,
        skills_required: formData.skills_required ? formData.skills_required.split(",").map((s) => s.trim()).filter(Boolean) : null,
        benefits: formData.benefits ? formData.benefits.split(",").map((s) => s.trim()).filter(Boolean) : null,
        application_deadline: formData.application_deadline ? new Date(formData.application_deadline).toISOString() : null,
        status,
        ai_bias_score: biasAnalysis?.score || null,
        ai_bias_feedback: biasAnalysis?.analysis || null,
      });

      toast.success(status === "published" ? "Job published successfully!" : "Job saved as draft");
      navigate("/jobs");
    } catch (error) {
      console.error("Error creating job:", error);
      toast.error("Failed to create job");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (role !== "employer") {
    navigate("/dashboard");
    return null;
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-primary";
    if (score >= 60) return "text-yellow-500";
    return "text-destructive";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    return "Needs Improvement";
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/jobs")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold text-foreground">Create New Job</h2>
          <p className="text-muted-foreground mt-1">Post a new job opening with AI-powered bias detection</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="col-span-2 space-y-6">
          {/* Basic Info */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
              <CardDescription>Essential details about the position</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Senior Software Engineer"
                  className="bg-background"
                  value={formData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    placeholder="e.g., Engineering"
                    className="bg-background"
                    value={formData.department}
                    onChange={(e) => handleChange("department", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    placeholder="e.g., Remote, New York, NY"
                    className="bg-background"
                    value={formData.location}
                    onChange={(e) => handleChange("location", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job_type">Job Type</Label>
                  <Select value={formData.job_type} onValueChange={(v) => handleChange("job_type", v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full-time">Full-Time</SelectItem>
                      <SelectItem value="part-time">Part-Time</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="internship">Internship</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experience_level">Experience Level</Label>
                  <Select value={formData.experience_level} onValueChange={(v) => handleChange("experience_level", v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entry">Entry Level</SelectItem>
                      <SelectItem value="mid">Mid Level</SelectItem>
                      <SelectItem value="senior">Senior Level</SelectItem>
                      <SelectItem value="lead">Lead / Principal</SelectItem>
                      <SelectItem value="executive">Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Description */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Job Details</CardTitle>
              <CardDescription>Describe the role and what you're looking for</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the role, team, and what makes this opportunity exciting..."
                  className="bg-background min-h-[150px]"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="responsibilities">Responsibilities</Label>
                <Textarea
                  id="responsibilities"
                  placeholder="List the key responsibilities and day-to-day tasks..."
                  className="bg-background min-h-[100px]"
                  value={formData.responsibilities}
                  onChange={(e) => handleChange("responsibilities", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="requirements">Requirements</Label>
                <Textarea
                  id="requirements"
                  placeholder="List the required skills, experience, and qualifications..."
                  className="bg-background min-h-[100px]"
                  value={formData.requirements}
                  onChange={(e) => handleChange("requirements", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="skills">Required Skills</Label>
                <Input
                  id="skills"
                  placeholder="JavaScript, React, Node.js, PostgreSQL..."
                  className="bg-background"
                  value={formData.skills_required}
                  onChange={(e) => handleChange("skills_required", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Separate skills with commas</p>
              </div>
            </CardContent>
          </Card>

          {/* Compensation */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Compensation & Benefits</CardTitle>
              <CardDescription>Salary range and perks</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="salary_currency">Currency</Label>
                  <Select value={formData.salary_currency} onValueChange={(v) => handleChange("salary_currency", v)}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                      <SelectItem value="CAD">CAD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary_min">Minimum Salary</Label>
                  <Input
                    id="salary_min"
                    type="number"
                    placeholder="50000"
                    className="bg-background"
                    value={formData.salary_min}
                    onChange={(e) => handleChange("salary_min", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary_max">Maximum Salary</Label>
                  <Input
                    id="salary_max"
                    type="number"
                    placeholder="80000"
                    className="bg-background"
                    value={formData.salary_max}
                    onChange={(e) => handleChange("salary_max", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="benefits">Benefits</Label>
                <Input
                  id="benefits"
                  placeholder="Health insurance, 401k, Remote work, Unlimited PTO..."
                  className="bg-background"
                  value={formData.benefits}
                  onChange={(e) => handleChange("benefits", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Separate benefits with commas</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline">Application Deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  className="bg-background"
                  value={formData.application_deadline}
                  onChange={(e) => handleChange("application_deadline", e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - AI Bias Detection */}
        <div className="space-y-6">
          <Card className="bg-card border-border sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Bias Detection
              </CardTitle>
              <CardDescription>
                Analyze your job posting for inclusive language
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={analyzeForBias}
                disabled={isAnalyzing || (!formData.description && !formData.requirements)}
                className="w-full gap-2"
                variant="outline"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analyze for Bias
                  </>
                )}
              </Button>

              {biasAnalysis && (
                <div className="space-y-4">
                  <Separator />
                  
                  {/* Score */}
                  <div className="text-center">
                    <div className={`text-4xl font-bold ${getScoreColor(biasAnalysis.score)}`}>
                      {biasAnalysis.score}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Inclusivity Score
                    </div>
                    <Badge className={`mt-2 ${
                      biasAnalysis.score >= 80 
                        ? "bg-primary/20 text-primary" 
                        : biasAnalysis.score >= 60 
                        ? "bg-yellow-500/20 text-yellow-500"
                        : "bg-destructive/20 text-destructive"
                    }`}>
                      {getScoreLabel(biasAnalysis.score)}
                    </Badge>
                  </div>

                  <Progress value={biasAnalysis.score} className="h-2" />

                  {/* Issues */}
                  {biasAnalysis.issues.length > 0 && biasAnalysis.issues[0] !== "No major issues found" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        Issues Found
                      </div>
                      <ul className="space-y-1">
                        {biasAnalysis.issues.slice(0, 3).map((issue, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <X className="h-3 w-3 mt-0.5 text-destructive flex-shrink-0" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggestions */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      Suggestions
                    </div>
                    <ul className="space-y-1">
                      {biasAnalysis.suggestions.slice(0, 3).map((suggestion, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <CheckCircle2 className="h-3 w-3 mt-0.5 text-primary flex-shrink-0" />
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              <Button
                onClick={() => handleSubmit("published")}
                disabled={isSubmitting || !formData.title || !formData.description}
                className="w-full"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Publish Job
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSubmit("draft")}
                disabled={isSubmitting || !formData.title}
                className="w-full"
              >
                Save as Draft
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
