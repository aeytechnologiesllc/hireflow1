/**
 * Unified resume URL detection utility
 * Finds resume URL from multiple sources in priority order:
 * 1. application.resume_url (canonical field)
 * 2. File answers in applicationAnswers that look like resumes
 */

interface ApplicationAnswer {
  question: string;
  answer: string;
}

interface ParsedNotes {
  applicationAnswers?: ApplicationAnswer[];
  [key: string]: any;
}

// Keywords that indicate a resume/CV upload question
const RESUME_KEYWORDS = [
  'resume',
  'cv',
  'curriculum vitae',
  'curriculum',
  'résumé',
];

// Check if a URL looks like a file URL (uploaded document)
const isFileUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  
  // Check for common storage patterns
  const filePatterns = [
    '/storage/v1/object/',
    '/resumes/',
    '/documents/',
    '.pdf',
    '.doc',
    '.docx',
  ];
  
  const lowerUrl = url.toLowerCase();
  return filePatterns.some(pattern => lowerUrl.includes(pattern));
};

// Check if a question text indicates it's asking for a resume
const isResumeQuestion = (questionText: string): boolean => {
  if (!questionText || typeof questionText !== 'string') return false;
  const lowerQuestion = questionText.toLowerCase();
  return RESUME_KEYWORDS.some(keyword => lowerQuestion.includes(keyword));
};

/**
 * Detects the best available resume URL from application data
 * @param resumeUrlField - The application.resume_url field value
 * @param parsedNotes - Parsed notes object containing applicationAnswers
 * @returns The detected resume URL or null if none found
 */
export function detectResumeUrl(
  resumeUrlField: string | null | undefined,
  parsedNotes: ParsedNotes | null | undefined
): string | null {
  // Priority 1: Use canonical resume_url field if it exists and is valid
  if (resumeUrlField && typeof resumeUrlField === 'string' && resumeUrlField.trim()) {
    console.log('[detectResumeUrl] Using canonical resume_url field:', resumeUrlField);
    return resumeUrlField.trim();
  }

  // Priority 2: Look for resume in applicationAnswers
  const answers = parsedNotes?.applicationAnswers;
  if (!answers || !Array.isArray(answers)) {
    console.log('[detectResumeUrl] No applicationAnswers found');
    return null;
  }

  // First pass: Look for answers that are file URLs AND have resume-related question text
  for (const answer of answers) {
    if (isFileUrl(answer.answer) && isResumeQuestion(answer.question)) {
      console.log('[detectResumeUrl] Found resume in applicationAnswers (resume question):', answer.answer);
      return answer.answer;
    }
  }

  // Second pass: If only one file URL exists, treat it as the resume
  const fileUrlAnswers = answers.filter(a => isFileUrl(a.answer));
  if (fileUrlAnswers.length === 1) {
    console.log('[detectResumeUrl] Found single file upload, treating as resume:', fileUrlAnswers[0].answer);
    return fileUrlAnswers[0].answer;
  }

  // Third pass: Look for any answer that is a URL containing /resumes/ bucket
  for (const answer of answers) {
    if (answer.answer && typeof answer.answer === 'string' && 
        answer.answer.toLowerCase().includes('/resumes/')) {
      console.log('[detectResumeUrl] Found file in resumes bucket:', answer.answer);
      return answer.answer;
    }
  }

  console.log('[detectResumeUrl] No resume URL found');
  return null;
}

/**
 * Parse notes JSON safely
 * @param notes - The notes field from application (could be string or object)
 * @returns Parsed object or empty object
 */
export function parseApplicationNotes(notes: string | object | null | undefined): ParsedNotes {
  if (!notes) return {};
  
  if (typeof notes === 'object') {
    return notes as ParsedNotes;
  }
  
  try {
    return JSON.parse(notes);
  } catch {
    return {};
  }
}
