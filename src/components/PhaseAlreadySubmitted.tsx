import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, ArrowLeft } from "lucide-react";

interface PhaseAlreadySubmittedProps {
  applicationId: string;
  phaseName: string;
  submittedAt?: string;
  score?: number;
  isManualMode?: boolean;
}

export function PhaseAlreadySubmitted({
  applicationId,
  phaseName,
  submittedAt,
  score,
  isManualMode = true,
}: PhaseAlreadySubmittedProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="bg-card border-border max-w-md w-full">
        <CardContent className="p-8 text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-success/20 flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-success" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              {phaseName} Submitted
            </h2>
            <p className="text-muted-foreground">
              Thank you for completing this phase. Your submission has been recorded.
            </p>
          </div>

          {score !== undefined && (
            <div className="bg-muted/30 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Your Score</p>
              <p className="text-2xl font-bold text-foreground">{score}%</p>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm">
              {isManualMode 
                ? "Awaiting employer review" 
                : "Your application is being processed"}
            </span>
          </div>

          {submittedAt && (
            <p className="text-xs text-muted-foreground">
              Submitted on {new Date(submittedAt).toLocaleString()}
            </p>
          )}

          <Button 
            onClick={() => navigate(`/applications/${applicationId}`)} 
            className="w-full gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Application
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
