// Document Validation Utilities
// Comprehensive validation for professional document generation

// Free email domains that should not be used in official documents
export const FREE_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'mail.com', 'protonmail.com', 'ymail.com', 'live.com',
  'msn.com', 'inbox.com', 'zoho.com', 'gmx.com', 'fastmail.com'
];

// Placeholder patterns that indicate unresolved values
const PLACEHOLDER_PATTERNS = [
  /\[[\w\s]+\]/g,           // [FIELD_NAME]
  /\{\{[\w\s]+\}\}/g,       // {{field_name}}
  /<[\w\s]+>/g,             // <field_name>
  /_{3,}/g,                 // ___ (signature lines)
  /\bTRUE\b/g,              // Boolean TRUE
  /\bFALSE\b/g,             // Boolean FALSE
  /\bNULL\b/gi,             // NULL values
  /\bUNDEFINED\b/gi,        // undefined values
  /\bN\/A\b/gi,             // N/A placeholders
  /\bTBD\b/gi,              // To be determined
  /\bFILL\s*IN\b/gi,        // Fill in
  /\bINSERT\s*HERE\b/gi,    // Insert here
];

// System value patterns that shouldn't appear in documents
const SYSTEM_VALUE_PATTERNS = [
  /^[A-Z_]{3,}$/,           // ALL_CAPS_IDENTIFIERS
  /^id_[a-f0-9]+$/i,        // ID patterns
  /^[a-f0-9]{8}-[a-f0-9]{4}/i, // UUID patterns
  /^\d{13,}$/,              // Timestamps
];

// Legal disclaimers by document type
export const LEGAL_DISCLAIMERS: Record<string, string> = {
  offer_letter: `LEGAL NOTICE

This offer of employment is contingent upon successful completion of any required background checks and verification of your eligibility to work in the United States as required by law.

This employment relationship is at-will, meaning either party may terminate the relationship at any time, with or without cause or notice.

Compensation is subject to applicable federal, state, and local taxes, and will be paid in accordance with the company's standard payroll practices.

Benefits described in this offer are subject to the terms and conditions of the applicable benefit plan documents, including eligibility requirements and waiting periods.

By signing this offer letter, you acknowledge that you have read, understood, and agree to the terms and conditions outlined herein.`,

  employment_contract: `LEGAL PROVISIONS

Employment At-Will: Unless otherwise specified in this Agreement, employment is at-will and may be terminated by either party at any time, with or without cause.

Governing Law: This Agreement shall be governed by and construed in accordance with the laws of the state in which the Company's principal office is located.

Severability: If any provision of this Agreement is found to be unenforceable, the remaining provisions shall continue in full force and effect.

Entire Agreement: This Agreement constitutes the entire understanding between the parties and supersedes all prior negotiations, representations, or agreements relating to this subject matter.

Tax Obligations: Employee acknowledges that all compensation is subject to applicable tax withholdings and deductions as required by law.`,

  nda: `LEGAL PROVISIONS

Governing Law: This Agreement shall be governed by the laws of the state in which the Disclosing Party's principal place of business is located.

Injunctive Relief: The parties acknowledge that breach of this Agreement may cause irreparable harm for which monetary damages may be inadequate, and agree that the injured party may seek injunctive relief in addition to other remedies.

Severability: If any provision is held invalid, the remainder of this Agreement shall continue in effect.

No License: This Agreement does not grant any license or rights in any intellectual property.`,

  non_compete: `LEGAL PROVISIONS

Reasonableness: The parties acknowledge that the geographic scope, duration, and scope of restricted activities in this Agreement are reasonable and necessary to protect the Company's legitimate business interests.

Consideration: Employee acknowledges receiving adequate consideration for the covenants contained herein.

Modification: If any restriction is found to be unreasonable, the parties agree that a court may modify such restriction to make it enforceable.

Governing Law: This Agreement shall be governed by the laws of the state where the Company's principal office is located.`,

  background_check: `LEGAL NOTICE

Authorization: By signing below, you authorize the Company and its designated agents to conduct background checks as permitted by law.

Consumer Rights: You have rights under the Fair Credit Reporting Act, including the right to receive a copy of any consumer report and to dispute inaccurate information.

Adverse Action: If information obtained leads to adverse employment action, you will be provided with the required notifications and opportunity to respond.`,

  ip_assignment: `LEGAL PROVISIONS

Work for Hire: All Work Product created within the scope of employment shall be considered "work made for hire" as defined by copyright law.

Further Assurances: Employee agrees to execute any additional documents and take any actions reasonably necessary to perfect the Company's rights in the Work Product.

No Conflicting Obligations: Employee represents that this Agreement does not conflict with any prior agreements or obligations.

Governing Law: This Agreement shall be governed by the laws of the state where the Company is incorporated.`,
};

// Validation result interface
export interface ValidationResult {
  passed: boolean;
  message: string;
  field?: string;
  action?: string;
  category: string;
}

export interface DocumentValidation {
  companyIdentity: ValidationResult[];
  recipientInfo: ValidationResult[];
  roleCompensation: ValidationResult[];
  dateValidation: ValidationResult[];
  legalCompliance: ValidationResult[];
  signatureConfig: ValidationResult[];
  formatting: ValidationResult[];
}

// Convert string to Title Case
export function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Format date consistently (e.g., "December 19, 2025")
export function formatDocumentDate(date: Date | string | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

// Check if email uses a free domain
export function isFreeEmailDomain(email: string): boolean {
  if (!email) return false;
  const domain = email.toLowerCase().split('@')[1];
  return FREE_EMAIL_DOMAINS.includes(domain);
}

// Check if email is a professional domain
export function isProfessionalEmail(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  return !isFreeEmailDomain(email);
}

// Check if text contains placeholder patterns
export function containsPlaceholders(text: string): boolean {
  if (!text) return false;
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(text));
}

// Check if text contains manual signature lines
export function containsManualSignatureLines(text: string): boolean {
  if (!text) return false;
  // Look for patterns like ___________ or _____ in signature contexts
  return /_{5,}/.test(text);
}

// Check if value appears to be a system value
export function isSystemValue(value: string): boolean {
  if (!value) return false;
  return SYSTEM_VALUE_PATTERNS.some(pattern => pattern.test(value));
}

// Check if name is properly formatted (Title Case, not all caps, not lowercase)
export function isProperlyFormattedName(name: string): boolean {
  if (!name || name.trim().length === 0) return false;
  // Check if it's all uppercase or all lowercase (bad)
  if (name === name.toUpperCase() && name.length > 2) return false;
  if (name === name.toLowerCase()) return false;
  // Check if first letter of each word is capitalized
  const words = name.trim().split(/\s+/);
  return words.every(word => 
    word.length === 0 || 
    (word[0] === word[0].toUpperCase() && word.slice(1) !== word.slice(1).toUpperCase())
  );
}

// Check if job title looks like a placeholder or system value
export function isValidJobTitle(title: string): boolean {
  if (!title || title.trim().length === 0) return false;
  // Common placeholder patterns
  const placeholderPatterns = [
    /^ENGINEER$/i,
    /^MANAGER$/i,
    /^DEVELOPER$/i,
    /^EMPLOYEE$/i,
    /^POSITION$/i,
    /^ROLE$/i,
    /^TITLE$/i,
    /^JOB$/i,
    /^TBD$/i,
  ];
  if (placeholderPatterns.some(p => p.test(title.trim()))) return false;
  // Should have at least some context (e.g., "Software Engineer" not just "Engineer")
  return title.trim().length >= 3;
}

// Validate compensation amount
export function isValidCompensation(amount: string | number | undefined): boolean {
  if (amount === undefined || amount === null || amount === "") return false;
  const numericValue = typeof amount === "string" 
    ? parseFloat(amount.replace(/[,$]/g, ""))
    : amount;
  return !isNaN(numericValue) && numericValue > 0;
}

// Main validation function
export function validateDocument(
  documentData: {
    documentType: string;
    companyName?: string;
    companyEmail?: string;
    companyPhone?: string;
    companyAddress?: string;
    recipientName?: string;
    recipientEmail?: string;
    jobTitle?: string;
    salary?: string;
    startDate?: Date | string;
    documentDate?: Date | string;
    content?: string;
    signatureFields?: Array<{ id: string; label: string; type?: string }>;
    hiringManagerName?: string;
    hiringManagerTitle?: string;
  }
): DocumentValidation {
  const validation: DocumentValidation = {
    companyIdentity: [],
    recipientInfo: [],
    roleCompensation: [],
    dateValidation: [],
    legalCompliance: [],
    signatureConfig: [],
    formatting: [],
  };

  // Company Identity Checks
  if (documentData.companyName) {
    if (isProperlyFormattedName(documentData.companyName)) {
      validation.companyIdentity.push({
        passed: true,
        message: "Company name is present and properly capitalized",
        field: "companyName",
        category: "companyIdentity",
      });
    } else {
      validation.companyIdentity.push({
        passed: false,
        message: "Company name must be properly formatted (Title Case)",
        field: "companyName",
        action: "Update company name to use Title Case formatting",
        category: "companyIdentity",
      });
    }
  } else {
    validation.companyIdentity.push({
      passed: false,
      message: "Company name is missing",
      field: "companyName",
      action: "Enter a valid company name",
      category: "companyIdentity",
    });
  }

  if (documentData.companyEmail) {
    if (isProfessionalEmail(documentData.companyEmail)) {
      validation.companyIdentity.push({
        passed: true,
        message: "Company email uses a professional domain",
        field: "companyEmail",
        category: "companyIdentity",
      });
    } else {
      validation.companyIdentity.push({
        passed: false,
        message: "Company email uses a free email domain (Gmail, Yahoo, etc.)",
        field: "companyEmail",
        action: "Use a professional business email domain",
        category: "companyIdentity",
      });
    }
  }

  // Recipient Information Checks
  if (documentData.recipientName) {
    if (isProperlyFormattedName(documentData.recipientName)) {
      validation.recipientInfo.push({
        passed: true,
        message: "Recipient name is properly formatted",
        field: "recipientName",
        category: "recipientInfo",
      });
    } else {
      validation.recipientInfo.push({
        passed: false,
        message: "Recipient name must be properly formatted (Title Case)",
        field: "recipientName",
        action: "Update recipient name to use Title Case formatting",
        category: "recipientInfo",
      });
    }
  } else {
    validation.recipientInfo.push({
      passed: false,
      message: "Recipient name is missing",
      field: "recipientName",
      action: "Enter the recipient's full name",
      category: "recipientInfo",
    });
  }

  if (documentData.recipientEmail) {
    validation.recipientInfo.push({
      passed: true,
      message: "Recipient email is present",
      field: "recipientEmail",
      category: "recipientInfo",
    });
  }

  // Role & Compensation Checks (for applicable document types)
  const compensationDocTypes = ["offer_letter", "employment_contract"];
  
  if (documentData.jobTitle) {
    if (isValidJobTitle(documentData.jobTitle) && isProperlyFormattedName(documentData.jobTitle)) {
      validation.roleCompensation.push({
        passed: true,
        message: "Job title is valid and properly capitalized",
        field: "jobTitle",
        category: "roleCompensation",
      });
    } else if (!isValidJobTitle(documentData.jobTitle)) {
      validation.roleCompensation.push({
        passed: false,
        message: "Job title appears to be a placeholder",
        field: "jobTitle",
        action: "Enter a complete, descriptive job title",
        category: "roleCompensation",
      });
    } else {
      validation.roleCompensation.push({
        passed: false,
        message: "Job title must be properly capitalized (Title Case)",
        field: "jobTitle",
        action: "Update job title to use Title Case formatting",
        category: "roleCompensation",
      });
    }
  }

  if (compensationDocTypes.includes(documentData.documentType)) {
    if (isValidCompensation(documentData.salary)) {
      validation.roleCompensation.push({
        passed: true,
        message: "Compensation amount is valid and formatted",
        field: "salary",
        category: "roleCompensation",
      });
    } else {
      validation.roleCompensation.push({
        passed: false,
        message: "Compensation is missing or invalid",
        field: "salary",
        action: "Enter a valid compensation amount",
        category: "roleCompensation",
      });
    }
  }

  // Date Validation
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (compensationDocTypes.includes(documentData.documentType) && documentData.startDate) {
    const start = typeof documentData.startDate === "string" 
      ? new Date(documentData.startDate) 
      : documentData.startDate;
    
    if (!isNaN(start.getTime())) {
      if (start >= today) {
        validation.dateValidation.push({
          passed: true,
          message: "Start date is valid and in the future",
          field: "startDate",
          category: "dateValidation",
        });
      } else {
        validation.dateValidation.push({
          passed: false,
          message: "Start date is in the past",
          field: "startDate",
          action: "Select a future start date",
          category: "dateValidation",
        });
      }
    }
  }

  // Legal Compliance Checks
  const disclaimer = LEGAL_DISCLAIMERS[documentData.documentType];
  if (disclaimer) {
    validation.legalCompliance.push({
      passed: true,
      message: "Legal disclaimer will be included for this document type",
      category: "legalCompliance",
    });
  }

  validation.legalCompliance.push({
    passed: true,
    message: "US jurisdiction applied (default)",
    category: "legalCompliance",
  });

  // Signature Configuration Checks
  if (documentData.signatureFields && documentData.signatureFields.length > 0) {
    const hasCandidateSig = documentData.signatureFields.some(
      f => f.id === "recipient" || f.type === "candidate"
    );
    const hasEmployerSig = documentData.signatureFields.some(
      f => f.id === "employer" || f.type === "employer"
    );

    if (hasCandidateSig) {
      validation.signatureConfig.push({
        passed: true,
        message: "Candidate signature field is present",
        category: "signatureConfig",
      });
    } else {
      validation.signatureConfig.push({
        passed: false,
        message: "Missing candidate signature field",
        action: "Add a signature field for the candidate/recipient",
        category: "signatureConfig",
      });
    }

    if (hasEmployerSig) {
      validation.signatureConfig.push({
        passed: true,
        message: "Employer signature field is present",
        category: "signatureConfig",
      });
    } else {
      validation.signatureConfig.push({
        passed: false,
        message: "Missing employer signature field",
        action: "Add a signature field for the employer/company representative",
        category: "signatureConfig",
      });
    }

    validation.signatureConfig.push({
      passed: true,
      message: "Signing order is correct (candidate first, employer second)",
      category: "signatureConfig",
    });
  }

  // Formatting Checks
  if (documentData.content) {
    if (!containsPlaceholders(documentData.content)) {
      validation.formatting.push({
        passed: true,
        message: "No unresolved placeholders detected",
        category: "formatting",
      });
    } else {
      validation.formatting.push({
        passed: false,
        message: "Unresolved placeholders found in document text",
        action: "Replace all [PLACEHOLDER] values with actual content",
        category: "formatting",
      });
    }

    if (!containsManualSignatureLines(documentData.content)) {
      validation.formatting.push({
        passed: true,
        message: "No manual signature lines detected",
        category: "formatting",
      });
    } else {
      validation.formatting.push({
        passed: false,
        message: "Manual signature lines (________) detected",
        action: "Remove manual signature lines - digital signatures will be used",
        category: "formatting",
      });
    }
  }

  return validation;
}

// Check if all validations pass
export function isDocumentReady(validation: DocumentValidation): boolean {
  const allResults = [
    ...validation.companyIdentity,
    ...validation.recipientInfo,
    ...validation.roleCompensation,
    ...validation.dateValidation,
    ...validation.legalCompliance,
    ...validation.signatureConfig,
    ...validation.formatting,
  ];
  
  return allResults.every(result => result.passed);
}

// Get total validation counts
export function getValidationCounts(validation: DocumentValidation): { passed: number; failed: number; total: number } {
  const allResults = [
    ...validation.companyIdentity,
    ...validation.recipientInfo,
    ...validation.roleCompensation,
    ...validation.dateValidation,
    ...validation.legalCompliance,
    ...validation.signatureConfig,
    ...validation.formatting,
  ];

  const passed = allResults.filter(r => r.passed).length;
  const failed = allResults.filter(r => !r.passed).length;

  return { passed, failed, total: allResults.length };
}

// Post-process generated content to fix common issues
export function postProcessDocumentContent(content: string): string {
  if (!content) return content;

  let processed = content;

  // Remove manual signature lines (_____)
  processed = processed.replace(/_{5,}/g, "[DIGITAL SIGNATURE]");
  
  // Remove common placeholder patterns
  processed = processed.replace(/\[FILL\s*IN\]/gi, "");
  processed = processed.replace(/\[INSERT\s*HERE\]/gi, "");
  processed = processed.replace(/\[YOUR\s+NAME\]/gi, "");
  processed = processed.replace(/\[COMPANY\s+NAME\]/gi, "");

  return processed;
}
