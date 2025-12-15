import { format } from "date-fns";
import { Shield, FileCheck, Clock, MapPin, Hash, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface AuditEntry {
  id: string;
  action: string;
  created_at: string;
  signer_name?: string;
  signer_email?: string;
  signer_role?: string;
  ip_address?: string;
  location_city?: string;
  location_region?: string;
  location_country?: string;
  document_hash?: string;
  signature_method?: string;
  consent_confirmed?: boolean;
  user_agent?: string;
}

interface AuditCertificateProps {
  documentId: string;
  documentName: string;
  documentHash: string | null;
  completedAt: string | null;
  auditLogs: AuditEntry[];
}

const getActionLabel = (action: string): string => {
  const labels: Record<string, string> = {
    created: 'Created',
    viewed: 'Viewed',
    edited: 'Edited',
    candidate_signed: 'Signed',
    employer_countersigned: 'Countersigned',
    completed: 'Completed',
    declined: 'Declined',
    downloaded: 'Downloaded',
    voided: 'Voided'
  };
  return labels[action] || action;
};

const getActionColor = (action: string): string => {
  const colors: Record<string, string> = {
    created: 'bg-blue-500',
    viewed: 'bg-gray-500',
    edited: 'bg-yellow-500',
    candidate_signed: 'bg-green-500',
    employer_countersigned: 'bg-green-600',
    completed: 'bg-emerald-500',
    declined: 'bg-red-500',
    downloaded: 'bg-purple-500',
    voided: 'bg-red-600'
  };
  return colors[action] || 'bg-gray-500';
};

export function AuditCertificate({
  documentId,
  documentName,
  documentHash,
  completedAt,
  auditLogs
}: AuditCertificateProps) {
  return (
    <div className="space-y-6 p-6 bg-background">
      {/* Header */}
      <div className="text-center border-b border-border pb-6">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-primary/10 rounded-full">
            <Shield className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Certificate of Completion</h1>
        <p className="text-muted-foreground mt-2">Electronic Signature Audit Trail</p>
      </div>

      {/* Document Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileCheck className="h-5 w-5" />
            Document Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Document Title</p>
              <p className="font-medium">{documentName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Document ID</p>
              <p className="font-mono text-sm">{documentId}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Final Document Hash (SHA-256)</p>
              <p className="font-mono text-xs break-all">{documentHash || 'Pending completion'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completion Timestamp</p>
              <p className="font-medium">
                {completedAt 
                  ? format(new Date(completedAt), "PPpp 'UTC'")
                  : 'Not yet completed'
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Trail */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            Chronological Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Signer</TableHead>
                  <TableHead>Timestamp (UTC)</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Hash Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Badge className={`${getActionColor(log.action)} text-white`}>
                        {getActionLabel(log.action)}
                      </Badge>
                      {log.signature_method && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({log.signature_method})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{log.signer_name || 'System'}</p>
                          <p className="text-xs text-muted-foreground">{log.signer_email || '-'}</p>
                          {log.signer_role && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {log.signer_role}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.ip_address || '-'}
                    </TableCell>
                    <TableCell>
                      {log.location_city && log.location_city !== 'Unknown' ? (
                        <div className="flex items-center gap-1 text-xs">
                          <MapPin className="h-3 w-3" />
                          {log.location_city}, {log.location_region}, {log.location_country}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {log.document_hash ? (
                        <div className="flex items-center gap-1">
                          <Hash className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono text-xs">
                            {log.document_hash.substring(0, 12)}...
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Compliance Notice */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="text-center text-sm text-muted-foreground space-y-2">
            <p className="font-medium">Compliance Statement</p>
            <p>
              This audit trail is generated in compliance with the Electronic Signatures in Global 
              and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA).
            </p>
            <p>
              All entries are immutable and cannot be modified or deleted after creation.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
