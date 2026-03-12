import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Shield, CheckCircle, XCircle, FileText, Clock, User, Hash, AlertTriangle } from "lucide-react";
import { StaggeredBarsLoader } from "@/components/animations/StaggeredBarsLoader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";

interface VerificationData {
  documentCode: string;
  documentName: string;
  status: string;
  completionTimestamp: string | null;
  finalHash: string | null;
  signingOrder: string;
  signers: {
    name: string;
    role: string;
    signedAt: string | null;
  }[];
  verified: boolean;
  errorMessage?: string;
}

export default function VerifyDocument() {
  const { documentCode } = useParams<{ documentCode: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VerificationData | null>(null);

  useEffect(() => {
    if (documentCode) {
      verifyDocument(documentCode);
    }
  }, [documentCode]);

  const verifyDocument = async (code: string) => {
    setLoading(true);
    
    try {
      const { data: response, error } = await supabase.functions.invoke('verify-document', {
        body: { documentCode: code }
      });

      if (error) {
        setData({
          documentCode: code,
          documentName: "Unknown",
          status: "error",
          completionTimestamp: null,
          finalHash: null,
          signingOrder: "unknown",
          signers: [],
          verified: false,
          errorMessage: error.message || "Failed to verify document"
        });
      } else if (response) {
        setData(response as VerificationData);
      }
    } catch (err) {
      setData({
        documentCode: code,
        documentName: "Unknown",
        status: "error",
        completionTimestamp: null,
        finalHash: null,
        signingOrder: "unknown",
        signers: [],
        verified: false,
        errorMessage: "Failed to connect to verification service"
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dark min-h-[100dvh] bg-[hsl(220,18%,10%)] text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <StaggeredBarsLoader size="lg" />
          <p className="text-muted-foreground">Verifying document...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dark min-h-[100dvh] bg-[hsl(220,18%,10%)] text-white flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Document Not Found</h2>
            <p className="text-muted-foreground">
              The document code provided could not be found in our system.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-gradient-to-b from-[hsl(220,18%,10%)] to-[hsl(220,18%,14%)] text-white py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${
            data.verified ? 'bg-success/20' : 'bg-destructive/20'
          }`}>
            {data.verified ? (
              <Shield className="h-10 w-10 text-success" />
            ) : (
              <AlertTriangle className="h-10 w-10 text-destructive" />
            )}
          </div>
          <h1 className="text-2xl font-bold">Document Verification</h1>
          <p className="text-muted-foreground">
            Read-only verification of document authenticity
          </p>
        </div>

        {/* Verification Status */}
        <Card className={data.verified ? 'border-success/50' : 'border-destructive/50'}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                {data.verified ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-success" />
                    Verification Successful
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-destructive" />
                    Verification Failed
                  </>
                )}
              </CardTitle>
              <Badge variant={data.verified ? "default" : "destructive"}>
                {data.status === 'signed' ? 'Fully Executed' : data.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {data.verified ? (
              <p className="text-sm text-muted-foreground">
                This information matches the finalized signed document. The document's integrity 
                has been verified via SHA-256 hash matching.
              </p>
            ) : (
              <p className="text-sm text-destructive">
                {data.errorMessage || "Integrity verification failed. The document may have been modified."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Document Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Document ID</p>
                <p className="font-mono font-medium">{data.documentCode}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Document Title</p>
                <p className="font-medium">{data.documentName}</p>
              </div>
            </div>
            
            <Separator />
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Execution Status</p>
                <Badge variant={data.status === 'signed' ? "default" : "secondary"}>
                  {data.status === 'signed' ? 'Fully Executed' : data.status}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Signing Order</p>
                <p className="font-medium capitalize">{data.signingOrder.replace(/_/g, ' → ')}</p>
              </div>
            </div>

            {data.completionTimestamp && (
              <>
                <Separator />
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Completion Timestamp (UTC)</p>
                    <p className="font-mono text-sm">
                      {format(new Date(data.completionTimestamp), "yyyy-MM-dd HH:mm:ss 'UTC'")}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Hash Verification */}
        {data.finalHash && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Hash className="h-5 w-5" />
                Cryptographic Verification
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Hash Algorithm</p>
                <p className="font-medium">SHA-256</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Final Document Hash</p>
                <p className="font-mono text-xs break-all bg-muted p-2 rounded">
                  {data.finalHash}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Integrity verified via SHA-256 hash matching the finalized document.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Signers */}
        {data.signers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5" />
                Signers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.signers.map((signer, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{signer.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{signer.role}</p>
                      </div>
                    </div>
                    {signer.signedAt && (
                      <div className="text-right">
                        <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Signed
                        </Badge>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>This is a read-only verification page.</p>
          <p>Document content is not exposed for security reasons.</p>
        </div>
      </div>
    </div>
  );
}
