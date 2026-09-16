/**
 * Split out of PackageItemCard.tsx (react-refresh/only-export-components:
 * that file should export only the PackageItemCard component), which
 * imports this back for its own use.
 *
 * Not the same helper as src/hooks/useDocumentRequests.ts's own
 * getDocumentTypeLabel/DOCUMENT_TYPE_LABELS — that one is for document
 * *requests* (candidate-supplied docs), this one for document *packages*
 * (offer letters etc. sent to a candidate); the label sets differ and
 * PackageItemCard.tsx has never imported the other one.
 */
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  offer_letter: "Offer Letter",
  nda: "NDA",
  employment_contract: "Employment Contract",
  background_check: "Background Check Authorization",
  non_compete: "Non-Compete Agreement",
  ip_assignment: "IP Assignment",
  custom: "Custom Document",
  drivers_license: "Driver's License",
  ssn_card: "Social Security Card",
  passport: "Passport",
  work_authorization: "Work Authorization",
  tax_form: "Tax Form",
  id_card: "Government ID",
  proof_of_address: "Proof of Address",
  bank_details: "Bank Details",
};

export function getDocumentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}
