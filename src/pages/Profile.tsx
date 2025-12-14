import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const { user, role } = useAuth();
  const isEmployer = role === "employer";
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();

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
      });
    }
  }, [profile]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">Profile</h2>
        <p className="text-muted-foreground mt-1">Manage your public profile information</p>
      </div>

      {/* Avatar Section */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-24 w-24">
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <Button 
                size="icon" 
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full"
              >
                <Camera className="h-4 w-4" />
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

      {/* Basic Info */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg">Basic Information</CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
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
              placeholder="+1 (555) 123-4567" 
              className="bg-background"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
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
