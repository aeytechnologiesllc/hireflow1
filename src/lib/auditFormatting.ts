/**
 * Audit Trail Formatting Utilities
 * Provides consistent, professional formatting for audit trail display
 */

import { format } from "date-fns";

/**
 * Standardized action labels with consistent capitalization
 */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // Core events
  created: "Document Created",
  document_created: "Document Created",
  sent: "Document Sent",
  viewed: "Document Viewed",
  document_viewed: "Document Viewed",
  edited: "Document Edited",
  
  // Signing events
  signing_session_started: "Signing Session Started",
  electronic_consent_confirmed: "Electronic Consent Confirmed",
  candidate_signed: "Signed by Candidate",
  employer_review_confirmed: "Employer Review Confirmed",
  employer_countersigned: "Countersigned by Employer",
  document_completed: "Document Completed",
  
  // Terminal events
  declined: "Document Declined",
  document_declined: "Document Declined",
  voided: "Document Voided",
  document_voided: "Document Voided",
  
  // Other events
  downloaded: "Document Downloaded",
  document_downloaded: "Document Downloaded",
  completed: "Document Completed",
};

/**
 * Get standardized action label
 */
export function formatAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] || action
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Standardized action badge colors
 */
export const AUDIT_ACTION_COLORS: Record<string, string> = {
  // Creation/Send
  created: "bg-primary",
  document_created: "bg-primary",
  sent: "bg-primary",

  // Viewing
  viewed: "bg-muted-foreground",
  document_viewed: "bg-muted-foreground",

  // Editing
  edited: "bg-brass",

  // Signing flow
  signing_session_started: "bg-muted-foreground",
  electronic_consent_confirmed: "bg-muted-foreground",
  candidate_signed: "bg-primary",
  employer_review_confirmed: "bg-muted-foreground",
  employer_countersigned: "bg-primary",
  document_completed: "bg-success",
  completed: "bg-success",

  // Terminal events
  declined: "bg-destructive",
  document_declined: "bg-destructive",
  voided: "bg-destructive",
  document_voided: "bg-destructive",

  // Download
  downloaded: "bg-muted-foreground",
  document_downloaded: "bg-muted-foreground",
};

/**
 * Get action badge color class
 */
export function getAuditActionColor(action: string): string {
  return AUDIT_ACTION_COLORS[action] || "bg-muted";
}

/**
 * Format timestamp consistently across all audit displays
 * Standard format: "January 15, 2025 at 3:45:23 PM UTC"
 */
export function formatAuditTimestamp(timestamp: string | Date): string {
  try {
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    return format(date, "MMMM d, yyyy 'at' h:mm:ss a 'UTC'");
  } catch {
    return "Invalid timestamp";
  }
}

/**
 * Format timestamp for compact display (tables, lists)
 * Format: "Jan 15, 2025 3:45 PM"
 */
export function formatAuditTimestampCompact(timestamp: string | Date): string {
  try {
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    return format(date, "MMM d, yyyy h:mm a");
  } catch {
    return "Invalid";
  }
}

/**
 * Format timestamp for technical/log display
 * Format: "2025-01-15 15:45:23"
 */
export function formatAuditTimestampTechnical(timestamp: string | Date): string {
  try {
    const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    return format(date, "yyyy-MM-dd HH:mm:ss");
  } catch {
    return "Invalid";
  }
}

/**
 * Format signer role with proper capitalization
 */
export function formatSignerRole(role: string | undefined | null): string {
  if (!role) return "System";
  
  const roleLabels: Record<string, string> = {
    candidate: "Candidate",
    employer: "Employer",
    system: "System",
  };
  
  return roleLabels[role.toLowerCase()] || role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

/**
 * Format signature method for display
 */
export function formatSignatureMethod(method: string | undefined | null): string {
  if (!method) return "Electronic";
  
  const methodLabels: Record<string, string> = {
    drawn: "Drawn Signature",
    typed: "Typed Signature",
    click_to_sign: "Click to Sign",
    electronic: "Electronic Signature",
  };
  
  return methodLabels[method.toLowerCase()] || method;
}

/**
 * Format location string from components
 */
export function formatLocation(
  city: string | null | undefined,
  region: string | null | undefined,
  country: string | null | undefined
): string {
  const parts = [city, region, country].filter(
    part => part && part !== "Unknown" && part.trim() !== ""
  );
  return parts.length > 0 ? parts.join(", ") : "Location not available";
}

/**
 * Format IP address for display with fallback
 */
export function formatIPAddress(ip: string | null | undefined): string {
  if (!ip || ip === "unknown" || ip === "Unknown") {
    return "IP not recorded";
  }
  return ip;
}

/**
 * Format hash for display (truncated with ellipsis)
 */
export function formatHashDisplay(hash: string | null | undefined, length: number = 16): string {
  if (!hash) return "Not available";
  if (hash.length <= length) return hash;
  return `${hash.substring(0, length)}...`;
}

/**
 * Generate human-readable event description
 */
export function formatAuditEventDescription(
  action: string,
  details?: Record<string, unknown> | null,
  signerRole?: string,
  signatureMethod?: string
): string {
  const role = formatSignerRole(signerRole);
  const method = signatureMethod === "drawn" ? "drawn signature" : "electronic signature";
  
  switch (action) {
    case "document_created":
    case "created":
      return "Document created and ready for signing workflow.";
    case "document_viewed":
    case "viewed":
      return `Document opened for viewing by ${role.toLowerCase()}.`;
    case "signing_session_started":
      return `${role} initiated signing session.`;
    case "electronic_consent_confirmed":
      return "Electronic signature consent confirmed. Signer acknowledged legal equivalence of electronic signature.";
    case "candidate_signed":
      return `Candidate signed the document using ${method}. Document hash updated.`;
    case "employer_review_confirmed":
      return "Employer reviewed document and verified candidate signature before countersigning.";
    case "employer_countersigned":
      return `Employer countersigned the document using ${method}. Document is now fully executed.`;
    case "document_completed":
    case "completed":
      return "All signatures collected. Document is now fully executed and locked from further changes.";
    case "document_declined":
    case "declined":
      const reason = details?.decline_reason || details?.reason || "Not specified";
      return `Document was declined. Reason: ${reason}`;
    case "sent":
      return "Document was sent to the recipient for review and signing.";
    case "downloaded":
    case "document_downloaded":
      return "Document was downloaded.";
    case "voided":
    case "document_voided":
      const voidReason = details?.void_reason || details?.reason || "Not specified";
      return `Document was voided. Reason: ${voidReason}`;
    default:
      return details?.event ? String(details.event) : "Activity recorded.";
  }
}
