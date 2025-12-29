import { supabase } from "@/integrations/supabase/client";
import { convertPdfFileToImages, base64ToBlob } from "@/utils/pdfToImage";
import { detectResumeUrl, parseApplicationNotes } from "@/utils/detectResumeUrl";

interface RepairResult {
  success: boolean;
  error?: string;
  resumeUrl?: string;
  imageUrls?: string[];
}

/**
 * Repairs resume data for existing applications that are missing resumeImageUrls.
 * This allows the backend to perform vision-based resume analysis on older applications.
 * 
 * Steps:
 * 1. Detect resume URL from application data
 * 2. Download the PDF
 * 3. Convert PDF to PNG pages
 * 4. Upload PNG pages to storage
 * 5. Update application record with resume_url and notes.resumeImageUrls
 */
export async function repairResumeForAnalysis(applicationId: string): Promise<RepairResult> {
  try {
    console.log("[repairResumeForAnalysis] Starting repair for application:", applicationId);
    
    // Fetch the application
    const { data: application, error: fetchError } = await supabase
      .from("applications")
      .select("id, candidate_id, resume_url, notes")
      .eq("id", applicationId)
      .single();
    
    if (fetchError || !application) {
      return { success: false, error: "Application not found" };
    }
    
    // Parse notes
    const parsedNotes = parseApplicationNotes(application.notes);
    
    // Check if resume images already exist
    if (parsedNotes.resumeImageUrls?.length > 0) {
      console.log("[repairResumeForAnalysis] Resume images already exist, skipping repair");
      return { 
        success: true, 
        resumeUrl: application.resume_url || undefined,
        imageUrls: parsedNotes.resumeImageUrls,
      };
    }
    
    // Detect resume URL
    const resumeUrl = detectResumeUrl(application.resume_url, parsedNotes);
    
    if (!resumeUrl) {
      return { success: false, error: "No resume URL found in application data" };
    }
    
    console.log("[repairResumeForAnalysis] Found resume URL:", resumeUrl);
    
    // Only process PDFs
    const isPdf = resumeUrl.toLowerCase().includes(".pdf") || 
                  resumeUrl.toLowerCase().includes("/pdf") ||
                  resumeUrl.includes("resumes/"); // Our storage paths
    
    if (!isPdf) {
      return { success: false, error: "Resume is not a PDF file. Only PDFs can be converted for AI analysis." };
    }
    
    // Download the PDF
    console.log("[repairResumeForAnalysis] Downloading PDF...");
    const response = await fetch(resumeUrl);
    
    if (!response.ok) {
      return { success: false, error: `Failed to download resume: ${response.status} ${response.statusText}` };
    }
    
    const blob = await response.blob();
    const file = new File([blob], "repair-resume.pdf", { type: "application/pdf" });
    
    // Convert PDF to images
    console.log("[repairResumeForAnalysis] Converting PDF to images...");
    const imageBase64s = await convertPdfFileToImages(file, 2); // First 2 pages
    
    if (imageBase64s.length === 0) {
      return { success: false, error: "PDF conversion returned 0 pages. The PDF may be corrupt or password-protected." };
    }
    
    console.log("[repairResumeForAnalysis] Converted", imageBase64s.length, "pages");
    
    // Upload images to storage
    const imageUrls: string[] = [];
    
    for (let i = 0; i < imageBase64s.length; i++) {
      const imgBlob = base64ToBlob(imageBase64s[i], "image/png");
      const imagePath = `${application.candidate_id}/repair-resume-${Date.now()}_page${i + 1}.png`;
      
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(imagePath, imgBlob, { upsert: true });
      
      if (uploadError) {
        console.error("[repairResumeForAnalysis] Upload error for page", i + 1, ":", uploadError);
        continue;
      }
      
      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(imagePath);
      
      imageUrls.push(urlData.publicUrl);
    }
    
    if (imageUrls.length === 0) {
      return { success: false, error: "Failed to upload converted resume images to storage" };
    }
    
    console.log("[repairResumeForAnalysis] Uploaded", imageUrls.length, "images");
    
    // Update application record with a more flexible type
    const updatedNotes: Record<string, any> = {
      ...parsedNotes,
      resumeImageUrls: imageUrls,
    };
    
    // Also update fileUploads if there's a resume question
    if (parsedNotes.applicationAnswers?.length > 0) {
      const resumeAnswer = parsedNotes.applicationAnswers.find(
        (a: any) => {
          const q = (a.question || "").toLowerCase();
          return ['resume', 'cv', 'curriculum'].some(kw => q.includes(kw));
        }
      );
      
      if (resumeAnswer) {
        // Handle both old (id) and new (questionId) schema
        const questionId = (resumeAnswer as any).questionId || (resumeAnswer as any).id;
        if (questionId) {
          updatedNotes.fileUploads = updatedNotes.fileUploads || {};
          updatedNotes.fileUploads[questionId] = {
            url: resumeUrl,
            imageUrls: imageUrls,
          };
        }
      }
    }
    
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        resume_url: resumeUrl, // Ensure canonical resume_url is set
        notes: JSON.stringify(updatedNotes),
      })
      .eq("id", applicationId);
    
    if (updateError) {
      return { success: false, error: `Failed to update application: ${updateError.message}` };
    }
    
    console.log("[repairResumeForAnalysis] Successfully repaired resume for application:", applicationId);
    
    return {
      success: true,
      resumeUrl,
      imageUrls,
    };
  } catch (error) {
    console.error("[repairResumeForAnalysis] Error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error during resume repair" 
    };
  }
}
