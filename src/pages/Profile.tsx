import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Loader2, Upload, FileText, X, CheckCircle2, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ProfileCompleteness } from "@/components/ProfileCompleteness";

export default function Profile() {
  const { user, role } = useAuth();
  const isEmployer = role === "employer";
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

  // File input refs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  // Upload states
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingResume, setIsUploadingResume] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    location: "",
    bio: "",
    company_name: "",
    company_description: "",
    portfolio_url: "",
    linkedin_url: "",
    skills: "",
    experience_years: "",
    avatar_url: "",
    resume_url: "",
  });

  // Load profile data into form
  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        location: profile.location || "",
        bio: profile.bio || "",
        company_name: profile.company_name || "",
        company_description: profile.company_description || "",
        portfolio_url: profile.portfolio_url || "",
        linkedin_url: profile.linkedin_url || "",
        skills: profile.skills?.join(", ") || "",
        experience_years: profile.experience_years?.toString() || "",
        avatar_url: profile.avatar_url || "",
        resume_url: profile.resume_url || "",
      });
    }
  }, [profile]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      // Update profile with new avatar URL
      await updateProfile.mutateAsync({ avatar_url: urlData.publicUrl });
      setFormData((prev) => ({ ...prev, avatar_url: urlData.publicUrl }));
      toast.success("Profile photo updated!");
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast.error("Failed to upload photo");
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // PDF only for resume uploads
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be less than 10MB");
      return;
    }

    setIsUploadingResume(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/profile-resume-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("resumes")
        .getPublicUrl(fileName);

      // Update profile with new resume URL
      await updateProfile.mutateAsync({ resume_url: urlData.publicUrl });
      setFormData((prev) => ({ ...prev, resume_url: urlData.publicUrl }));
      toast.success("Resume uploaded!");
    } catch (error) {
      console.error("Resume upload error:", error);
      toast.error("Failed to upload resume");
    } finally {
      setIsUploadingResume(false);
      if (resumeInputRef.current) {
        resumeInputRef.current.value = "";
      }
    }
  };

  const removeResume = async () => {
    try {
      await updateProfile.mutateAsync({ resume_url: null });
      setFormData((prev) => ({ ...prev, resume_url: "" }));
      toast.success("Resume removed");
    } catch (error) {
      toast.error("Failed to remove resume");
    }
  };

  const handleSave = async () => {
    try {
      const updates: any = {
        full_name: formData.full_name || null,
        phone: formData.phone || null,
        location: formData.location || null,
        bio: formData.bio || null,
      };

      if (isEmployer) {
        updates.company_name = formData.company_name || null;
        updates.company_description = formData.company_description || null;
      } else {
        updates.portfolio_url = formData.portfolio_url || null;
        updates.linkedin_url = formData.linkedin_url || null;
        updates.skills = formData.skills ? formData.skills.split(",").map((s) => s.trim()).filter(Boolean) : null;
        updates.experience_years = formData.experience_years ? parseInt(formData.experience_years) : null;
      }

      await updateProfile.mutateAsync(updates);
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error("Failed to update profile");
    }
  };

  const userInitials = formData.full_name
    ? formData.full_name.split(" ").map((n) => n[0]).join("").toUpperCase()
    : user?.email?.[0]?.toUpperCase() || "U";

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Visibility Notice - Candidates Only */}
      {!isEmployer && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Eye className="h-4 w-4 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Your profile is visible to employers</span> when they review your job applications. Keep it complete and up-to-date!
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Profile</h2>
          <p className="text-muted-foreground mt-1">Manage your public profile information</p>
        </div>
        
        {/* Profile Completeness - Candidates Only */}
        {!isEmployer && (
          <ProfileCompleteness profile={profile} compact />
        )}
      </div>

      {/* Avatar Section */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-24 w-24">
                {formData.avatar_url && (
                  <AvatarImage src={formData.avatar_url} alt="Profile" />
                )}
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <Button 
                size="icon" 
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
              >
                {isUploadingAvatar ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {formData.full_name || "Your Name"}
              </h3>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <p className="text-sm text-primary capitalize mt-1">{role}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Completeness - Full (Candidates Only) */}
      {!isEmployer && (
        <ProfileCompleteness profile={profile} />
      )}

      {/* Resume Upload - Candidates Only */}
      {!isEmployer && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Default Resume</CardTitle>
            <CardDescription>
              Employers will see this resume when reviewing your applications. Keep it updated!
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={resumeInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleResumeUpload}
            />
            
            {formData.resume_url ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      Profile Resume
                    </span>
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ready to use in applications
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(formData.resume_url, "_blank")}
                  >
                    View
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={removeResume}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => resumeInputRef.current?.click()}
              >
                {isUploadingResume ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Uploading...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
                      <Upload className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Upload your resume
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF or Word document, max 10MB
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Basic Info */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Basic Information</CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input 
                id="full_name" 
                placeholder="John Doe" 
                className="bg-background"
                value={formData.full_name}
                onChange={(e) => handleChange("full_name", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input 
              id="phone" 
              type="tel" 
              placeholder="555-123-4567" 
              className="bg-background"
              value={formData.phone}
              onChange={(e) => {
                const numbers = e.target.value.replace(/\D/g, "");
                if (numbers.length <= 3) {
                  handleChange("phone", numbers);
                } else if (numbers.length <= 6) {
                  handleChange("phone", `${numbers.slice(0, 3)}-${numbers.slice(3)}`);
                } else {
                  handleChange("phone", `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`);
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input 
              id="location" 
              placeholder="San Francisco, CA" 
              className="bg-background"
              value={formData.location}
              onChange={(e) => handleChange("location", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea 
              id="bio" 
              placeholder="Tell us about yourself..." 
              className="bg-background min-h-[100px]"
              value={formData.bio}
              onChange={(e) => handleChange("bio", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Professional Info - Employer */}
      {isEmployer && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Company Information</CardTitle>
            <CardDescription>Details about your organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input 
                id="companyName" 
                placeholder="Acme Inc." 
                className="bg-background"
                value={formData.company_name}
                onChange={(e) => handleChange("company_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyDescription">Company Description</Label>
              <Textarea 
                id="companyDescription" 
                placeholder="Describe your company..." 
                className="bg-background min-h-[100px]"
                value={formData.company_description}
                onChange={(e) => handleChange("company_description", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Professional Info - Candidate */}
      {!isEmployer && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Professional Information</CardTitle>
            <CardDescription>Showcase your experience and skills</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="skills">Skills</Label>
              <Input 
                id="skills" 
                placeholder="JavaScript, React, Node.js..." 
                className="bg-background"
                value={formData.skills}
                onChange={(e) => handleChange("skills", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Separate skills with commas</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="experience">Years of Experience</Label>
              <Input 
                id="experience" 
                type="number" 
                placeholder="5" 
                className="bg-background"
                value={formData.experience_years}
                onChange={(e) => handleChange("experience_years", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn URL</Label>
              <Input 
                id="linkedin" 
                type="url" 
                placeholder="https://linkedin.com/in/yourprofile" 
                className="bg-background"
                value={formData.linkedin_url}
                onChange={(e) => handleChange("linkedin_url", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="portfolio">Portfolio URL</Label>
              <Input 
                id="portfolio" 
                type="url" 
                placeholder="https://yourportfolio.com" 
                className="bg-background"
                value={formData.portfolio_url}
                onChange={(e) => handleChange("portfolio_url", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          disabled={updateProfile.isPending}
          className="min-w-32"
        >
          {updateProfile.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </div>
  );
}
