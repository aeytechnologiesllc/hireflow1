import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { MediaPlayer } from "@/components/MediaPlayer";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer
} from "recharts";
import { jsPDF } from "jspdf";
import {
  Download, FileText, Mic, Video, ShieldCheck, Shield, ShieldAlert,
  Star, AlertTriangle, HelpCircle, Clock, CheckCircle, AlertCircle,
  MessageSquare, TrendingUp, Zap
} from "lucide-react";

interface VoiceInterviewResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: any;
  transcript?: any[];
  recordingUrl?: string;
  videoEnabled?: boolean;
  candidateName?: string;
  jobTitle?: string;
  applicationId?: string;
}

export function VoiceInterviewResultsDialog({
  open,
  onOpenChange,
  result,
  transcript,
  recordingUrl,
  videoEnabled = true,
  candidateName = "Candidate",
  jobTitle = "Position",
  applicationId
}: VoiceInterviewResultsDialogProps) {
  const [activeTab, setActiveTab] = useState("overview");

  if (!result) return null;

  // Prepare soft skills radar data
  const softSkillsData = result.soft_skills ? [
    { skill: 'Empathy', value: result.soft_skills.empathy || 0 },
    { skill: 'Confidence', value: result.soft_skills.confidence || 0 },
    { skill: 'Articulation', value: result.soft_skills.articulation || 0 },
    { skill: 'Listening', value: result.soft_skills.active_listening || 0 },
    { skill: 'Enthusiasm', value: result.soft_skills.enthusiasm || 0 },
    { skill: 'Professional', value: result.soft_skills.professionalism || 0 },
  ] : [];

  // Download transcript as text file
  const downloadTranscript = () => {
    if (!transcript || transcript.length === 0) return;
    
    const lines = transcript.map((m: any) => {
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `[${time}] ${m.role === 'user' ? candidateName : 'Ava'}: ${m.content}`;
    }).join('\n\n');

    const header = `${videoEnabled ? 'Video' : 'Voice'} Interview Transcript
Candidate: ${candidateName}
Position: ${jobTitle}
Date: ${new Date().toLocaleDateString()}

---

`;

    const blob = new Blob([header + lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-transcript-${applicationId || 'unknown'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export full PDF report
  const exportPDFReport = () => {
    const doc = new jsPDF();
    let yPos = 20;

    // Header
    doc.setFontSize(18);
    doc.text(`${videoEnabled ? 'Video' : 'Voice'} Interview Report`, 20, yPos);
    yPos += 15;

    // Candidate info
    doc.setFontSize(12);
    doc.text(`Candidate: ${candidateName}`, 20, yPos);
    yPos += 7;
    doc.text(`Position: ${jobTitle}`, 20, yPos);
    yPos += 7;
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, yPos);
    yPos += 15;

    // Overall Score
    doc.setFontSize(14);
    doc.text('Assessment Summary', 20, yPos);
    yPos += 10;
    doc.setFontSize(11);
    doc.text(`Overall Score: ${result.overall_score}/100`, 25, yPos);
    yPos += 7;
    doc.text(`Recommendation: ${result.recommendation?.replace('_', ' ').toUpperCase()}`, 25, yPos);
    yPos += 7;
    doc.text(`Credibility: ${result.credibility_rating?.toUpperCase()}`, 25, yPos);
    yPos += 12;

    // Executive Summary
    if (result.executive_summary) {
      doc.setFontSize(14);
      doc.text('Executive Summary', 20, yPos);
      yPos += 8;
      doc.setFontSize(10);
      const summaryLines = doc.splitTextToSize(result.executive_summary, 170);
      doc.text(summaryLines, 25, yPos);
      yPos += summaryLines.length * 5 + 10;
    }

    // Score Breakdown
    doc.setFontSize(14);
    doc.text('Score Breakdown', 20, yPos);
    yPos += 10;
    doc.setFontSize(10);
    doc.text(`Communication: ${result.communication_score ?? '—'}`, 25, yPos);
    yPos += 6;
    doc.text(`Technical: ${result.technical_score ?? '—'}`, 25, yPos);
    yPos += 6;
    doc.text(`Culture Fit: ${result.culture_fit_score ?? '—'}`, 25, yPos);
    yPos += 6;
    doc.text(`Problem Solving: ${result.problem_solving_score ?? '—'}`, 25, yPos);
    yPos += 6;
    doc.text(`Adaptability: ${result.adaptability_score ?? '—'}`, 25, yPos);
    yPos += 6;
    doc.text(`Leadership Potential: ${result.leadership_potential_score ?? '—'}`, 25, yPos);
    yPos += 12;

    // Strengths
    if (result.strengths?.length > 0) {
      doc.setFontSize(14);
      doc.text('Strengths', 20, yPos);
      yPos += 8;
      doc.setFontSize(10);
      result.strengths.forEach((s: string) => {
        const lines = doc.splitTextToSize(`• ${s}`, 165);
        doc.text(lines, 25, yPos);
        yPos += lines.length * 5 + 2;
      });
      yPos += 5;
    }

    // Concerns
    if (result.concerns?.length > 0) {
      if (yPos > 250) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14);
      doc.text('Concerns', 20, yPos);
      yPos += 8;
      doc.setFontSize(10);
      result.concerns.forEach((c: string) => {
        const lines = doc.splitTextToSize(`• ${c}`, 165);
        doc.text(lines, 25, yPos);
        yPos += lines.length * 5 + 2;
      });
      yPos += 5;
    }

    // Suggested Follow-ups
    if (result.suggested_followups?.length > 0) {
      if (yPos > 220) { doc.addPage(); yPos = 20; }
      doc.setFontSize(14);
      doc.text('Suggested Follow-up Questions', 20, yPos);
      yPos += 8;
      doc.setFontSize(10);
      result.suggested_followups.forEach((f: any) => {
        const lines = doc.splitTextToSize(`[${f.priority?.toUpperCase()}] ${f.question}`, 165);
        doc.text(lines, 25, yPos);
        yPos += lines.length * 5;
        if (f.reason) {
          const reasonLines = doc.splitTextToSize(`   Reason: ${f.reason}`, 160);
          doc.setTextColor(100);
          doc.text(reasonLines, 25, yPos);
          doc.setTextColor(0);
          yPos += reasonLines.length * 5;
        }
        yPos += 3;
      });
    }

    doc.save(`interview-report-${candidateName.replace(/\s+/g, '-')}.pdf`);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>{videoEnabled ? 'Video' : 'Voice'} Interview Analysis</span>
            <div className="flex gap-2">
              {transcript && transcript.length > 0 && (
                <Button variant="outline" size="sm" onClick={downloadTranscript} className="gap-2 min-h-[44px] sm:min-h-0">
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">Transcript</span>
                  <span className="sm:hidden">TXT</span>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={exportPDFReport} className="gap-2 min-h-[44px] sm:min-h-0">
                <Download className="h-4 w-4" />
                PDF
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="overview" className="flex-1 min-w-[80px]">Overview</TabsTrigger>
            <TabsTrigger value="questions" className="flex-1 min-w-[80px]">Questions</TabsTrigger>
            <TabsTrigger value="softskills" className="flex-1 min-w-[80px]">Skills</TabsTrigger>
            <TabsTrigger value="highlights" className="flex-1 min-w-[80px]">Highlights</TabsTrigger>
            <TabsTrigger value="followups" className="flex-1 min-w-[80px]">Follow-ups</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh] mt-4">
            {/* OVERVIEW TAB */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              {/* Recording */}
              {recordingUrl && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      {videoEnabled ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      Interview Recording
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <MediaPlayer 
                      src={recordingUrl} 
                      type={videoEnabled ? "video" : "audio"} 
                    />
                  </CardContent>
                </Card>
              )}

              {/* Score Summary */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-6">
                    <div className="text-center">
                      <p className="text-4xl font-bold text-primary">{result.overall_score !== undefined && result.overall_score !== null ? result.overall_score : "—"}</p>
                      <p className="text-xs text-muted-foreground">/100</p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className={
                          result.recommendation === "strong_hire" ? "bg-success" :
                          result.recommendation === "hire" ? "bg-success/80" :
                          result.recommendation === "maybe" ? "bg-warning" : "bg-destructive"
                        }>
                          {result.recommendation?.replace("_", " ").toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className={
                          result.credibility_rating === "high" ? "border-success text-success" :
                          result.credibility_rating === "medium" ? "border-warning text-warning" : "border-destructive text-destructive"
                        }>
                          {result.credibility_rating === "high" ? <ShieldCheck className="h-3 w-3 mr-1" /> :
                           result.credibility_rating === "medium" ? <Shield className="h-3 w-3 mr-1" /> :
                           <ShieldAlert className="h-3 w-3 mr-1" />}
                          {result.credibility_rating?.charAt(0).toUpperCase() + result.credibility_rating?.slice(1)} Credibility
                        </Badge>
                      </div>
                      {result.executive_summary && (
                        <p className="text-sm text-muted-foreground">{result.executive_summary}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Score Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Communication", value: result.communication_score },
                  { label: "Technical", value: result.technical_score },
                  { label: "Culture Fit", value: result.culture_fit_score },
                  { label: "Problem Solving", value: result.problem_solving_score },
                  { label: "Adaptability", value: result.adaptability_score },
                  { label: "Leadership", value: result.leadership_potential_score },
                ].map((item, i) => (
                  <Card key={i}>
                    <CardContent className="py-3 text-center">
                      <p className="text-xl font-bold">{item.value !== undefined && item.value !== null ? item.value : "—"}</p>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Communication Metrics */}
              {result.communication_metrics && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Communication Quality
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="text-center p-2 bg-muted/30 rounded">
                        <p className="text-lg font-bold">{result.communication_metrics.avg_response_time_seconds}s</p>
                        <p className="text-xs text-muted-foreground">Avg Response Time</p>
                      </div>
                      <div className="text-center p-2 bg-muted/30 rounded">
                        <p className="text-lg font-bold">{result.communication_metrics.clarity_score !== undefined && result.communication_metrics.clarity_score !== null ? result.communication_metrics.clarity_score : "—"}</p>
                        <p className="text-xs text-muted-foreground">Clarity Score</p>
                      </div>
                      <div className="text-center p-2 bg-muted/30 rounded">
                        <Badge variant={
                          result.communication_metrics.filler_word_frequency === "low" ? "default" :
                          result.communication_metrics.filler_word_frequency === "medium" ? "outline" : "destructive"
                        }>
                          {result.communication_metrics.filler_word_frequency} fillers
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">Filler Words</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Red Flags */}
              {result.inconsistencies?.length > 0 && (
                <Card className="border-destructive/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                      <ShieldAlert className="h-4 w-4" />
                      Red Flags ({result.inconsistencies.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.inconsistencies.map((item: any, i: number) => (
                      <div key={i} className="p-3 bg-destructive/5 rounded-lg border border-destructive/10">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={item.severity === "major" ? "destructive" : item.severity === "moderate" ? "outline" : "secondary"}>
                            {item.severity || "flagged"}
                          </Badge>
                          {item.follow_up_needed && (
                            <Badge variant="outline" className="text-xs">Follow-up needed</Badge>
                          )}
                        </div>
                        <p className="text-sm"><strong>Claim:</strong> {item.claim}</p>
                        <p className="text-sm text-muted-foreground"><strong>Evidence:</strong> {item.evidence}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Strengths & Concerns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {result.strengths?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-success">Strengths</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1">
                        {result.strengths.map((s: string, i: number) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
                {result.concerns?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-warning">Concerns</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1">
                        {result.concerns.map((c: string, i: number) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* QUESTIONS TAB */}
            <TabsContent value="questions" className="space-y-3 mt-0">
              {result.question_breakdown?.length > 0 ? (
                result.question_breakdown.map((q: any, i: number) => (
                  <Card key={i}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{q.question_type}</Badge>
                          {q.timestamp_seconds !== undefined && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTime(q.timestamp_seconds)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-2xl font-bold">{q.response_quality}</span>
                          <span className="text-sm text-muted-foreground">/10</span>
                        </div>
                      </div>
                      <p className="font-medium mb-3">{q.question}</p>
                      
                      {q.notable_quote && (
                        <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground mb-3">
                          "{q.notable_quote}"
                        </blockquote>
                      )}

                      {q.key_points_covered?.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs font-medium text-success mb-1">Key Points Covered:</p>
                          <div className="flex flex-wrap gap-1">
                            {q.key_points_covered.map((p: string, j: number) => (
                              <Badge key={j} variant="secondary" className="text-xs">{p}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {q.missed_opportunities?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-warning mb-1">Missed Opportunities:</p>
                          <div className="flex flex-wrap gap-1">
                            {q.missed_opportunities.map((m: string, j: number) => (
                              <Badge key={j} variant="outline" className="text-xs text-warning">{m}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <HelpCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No question breakdown available</p>
                </div>
              )}
            </TabsContent>

            {/* SOFT SKILLS TAB */}
            <TabsContent value="softskills" className="mt-0">
              {softSkillsData.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Soft Skills Radar
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[350px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={softSkillsData}>
                          <PolarGrid stroke="hsl(var(--border))" />
                          <PolarAngleAxis 
                            dataKey="skill" 
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                          />
                          <PolarRadiusAxis 
                            domain={[0, 100]} 
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} 
                          />
                          <Radar 
                            dataKey="value" 
                            fill="hsl(var(--primary))" 
                            fillOpacity={0.5} 
                            stroke="hsl(var(--primary))" 
                            strokeWidth={2}
                          />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                      {softSkillsData.map((item, i) => (
                        <div key={i} className="text-center p-2 bg-muted/30 rounded">
                          <p className="text-lg font-bold">{item.value}</p>
                          <p className="text-xs text-muted-foreground">{item.skill}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No soft skills data available</p>
                </div>
              )}
            </TabsContent>

            {/* HIGHLIGHTS TAB */}
            <TabsContent value="highlights" className="space-y-3 mt-0">
              {result.highlights?.length > 0 ? (
                result.highlights.map((h: any, i: number) => (
                  <Card key={i} className={
                    h.type === "strong_answer" ? "border-success/30" :
                    h.type === "red_flag" ? "border-destructive/30" :
                    h.type === "impressive_moment" ? "border-primary/30" : ""
                  }>
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Badge variant={
                          h.type === "strong_answer" ? "default" :
                          h.type === "red_flag" ? "destructive" :
                          h.type === "impressive_moment" ? "outline" : "secondary"
                        } className="shrink-0">
                          <Clock className="h-3 w-3 mr-1" />
                          {formatTime(h.timestamp_seconds || 0)}
                        </Badge>
                        <div>
                          <Badge variant="outline" className="mb-2 text-xs">
                            {h.type === "strong_answer" ? "Strong Answer" :
                             h.type === "red_flag" ? "Red Flag" :
                             h.type === "impressive_moment" ? "Impressive" : "Needs Clarification"}
                          </Badge>
                          <p className="text-sm">{h.description}</p>
                          {h.quote && (
                            <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground mt-2 text-sm">
                              "{h.quote}"
                            </blockquote>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Star className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No highlights recorded</p>
                </div>
              )}
            </TabsContent>

            {/* FOLLOW-UPS TAB */}
            <TabsContent value="followups" className="space-y-3 mt-0">
              {result.suggested_followups?.length > 0 ? (
                <>
                  <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20 mb-4">
                    <p className="text-sm text-blue-400">
                      <HelpCircle className="h-4 w-4 inline mr-2" />
                      These questions are suggested for your next interview round based on gaps identified by Ava.
                    </p>
                  </div>
                  {result.suggested_followups.map((f: any, i: number) => (
                    <Card key={i}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <Badge variant={
                            f.priority === "high" ? "destructive" :
                            f.priority === "medium" ? "outline" : "secondary"
                          } className="shrink-0">
                            {f.priority?.toUpperCase()}
                          </Badge>
                          <div>
                            <p className="font-medium mb-1">{f.question}</p>
                            <p className="text-sm text-muted-foreground">{f.reason}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <HelpCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No follow-up questions suggested</p>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
