import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ApplicationWithCandidate } from "./useApplications";

export interface RankedCandidate {
  rank: number;
  candidateName: string;
  aiScore: number | null;
  keyDifferentiator: string;
  strengths: string[];
  concerns: string[];
  recommendation: "strong_yes" | "yes" | "maybe" | "no";
  scorecard?: {
    overallScore: number;
    confidence: number;
    recommendedAction: "advance" | "review" | "reject";
    decisionState?: "ready_for_decision" | "needs_more_evidence";
    pendingHighSignalPhases?: string[];
    autopilotAction?: "advance" | "reject" | "defer";
    dimensionScores: {
      hardRequirements: number;
      roleCompetency: number;
      communication: number;
      reliability: number;
      workStyleFit: number;
      evidenceQuality: number;
    };
    riskFlags: string[];
    rationale: string;
  };
  applicationId?: string;
}

export interface ShortlistResult {
  rankedCandidates: RankedCandidate[];
  comparativeInsights: string[];
  quickDecision: {
    interviewImmediately: string[];
    considerWithReservations: string[];
    pass: string[];
  };
  summaryStatement: string;
  scorecardSummary?: {
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    strongestCategory: string;
    commonRiskFlags: string[];
  };
  jobId: string;
  jobTitle: string;
  candidateCount: number;
  generatedAt: string;
}

export function useAIShortlist() {
  const [isLoading, setIsLoading] = useState(false);
  const [shortlist, setShortlist] = useState<ShortlistResult | null>(null);

  const generateShortlist = async (
    jobId: string,
    jobTitle: string,
    jobDescription: string | null,
    applications: ApplicationWithCandidate[]
  ) => {
    if (applications.length < 2) {
      toast.error("Need at least 2 applicants to generate a shortlist");
      return null;
    }

    setIsLoading(true);
    setShortlist(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-shortlist', {
        body: {
          jobId,
          jobTitle,
          jobDescription,
          applications: applications.map(app => ({
            id: app.id,
            ai_score: app.ai_score,
            ai_analysis: app.ai_analysis,
            phase: app.phase,
            status: app.status,
            notes: app.notes,
            voice_interview_result: app.voice_interview_result,
            profiles: app.profiles ? {
              full_name: app.profiles.full_name,
              email: app.profiles.email,
              experience_years: app.profiles.experience_years,
              location: app.profiles.location,
            } : null,
          })),
        },
      });

      if (error) {
        throw error;
      }

      // Map application IDs to ranked candidates
      const result = data.shortlist as ShortlistResult;
      result.rankedCandidates = result.rankedCandidates.map(candidate => {
        const matchingApp = applications.find(
          app => app.profiles?.full_name?.toLowerCase() === candidate.candidateName.toLowerCase()
        );
        return {
          ...candidate,
          applicationId: matchingApp?.id,
          aiScore: matchingApp?.ai_score ?? candidate.aiScore,
        };
      });

      result.jobId = jobId;
      result.jobTitle = jobTitle;
      result.candidateCount = applications.length;
      result.generatedAt = new Date().toISOString();

      setShortlist(result);
      toast.success("Shortlist generated successfully!");
      return result;
    } catch (error: any) {
      console.error('Error generating shortlist:', error);
      toast.error(error.message || "Failed to generate shortlist");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const clearShortlist = () => {
    setShortlist(null);
  };

  return { generateShortlist, shortlist, isLoading, clearShortlist };
}
