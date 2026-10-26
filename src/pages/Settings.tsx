import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, Loader2, Bell, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DeviceNotifications } from "@/components/settings/DeviceNotifications";
import { removeThisDeviceBeforeSignOut } from "@/lib/webPush";
import { useEmailPreferences, useUpdateEmailPreferences, type EmailPreferences } from "@/hooks/useEmailPreferences";
import { Skeleton } from "@/components/ui/skeleton";
import { getSignedOutRoute } from "@/lib/authRouting";
import { CareersPageCard } from "@/components/business/CareersPageCard";
import { TipsSettingCard } from "@/cockpit/tips/TipsSettingCard";
import { TwoStepSignIn } from "@/components/settings/TwoStepSignIn";
import { usePlatformAdminAccount } from "@/hooks/usePlatformAdmin";
import { deleteAccountWords } from "@/content/deleteAccount";

export default function Settings() {
  const { user, role, loading, isTeamMember } = useAuth();
  const voiceAccount = usePlatformAdminAccount();
  const navigate = useNavigate();
  const isEmployer = role === "employer";
  const isDeveloper = role === "developer";
  // Staff settings for the hiring side: the owner and the business's team
  // members. A team member was shown the applicant's page (no email
  // preferences, no tips). The careers page card below stays the owner's.
  const isStaff = isEmployer || isTeamMember || role === "team_member";
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Deleting asks for the password again (supabase/functions/delete-account).
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: emailPrefs, isLoading: prefsLoading } = useEmailPreferences();
  const updatePrefs = useUpdateEmailPreferences();
  
  const [localPrefs, setLocalPrefs] = useState<EmailPreferences>({
    email_notifications_enabled: true,
    email_new_applications: true,
    email_messages: true,
    email_interview_reminders: true,
    email_document_updates: true,
    email_phase_updates: true,
  });

  useEffect(() => {
    if (emailPrefs) {
      setLocalPrefs(emailPrefs);
    }
  }, [emailPrefs]);

  if (loading || !user || role === null) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const handlePrefChange = async (key: keyof EmailPreferences, value: boolean) => {
    setLocalPrefs(prev => ({ ...prev, [key]: value }));
    try {
      await updatePrefs.mutateAsync({ [key]: value });
      toast.success("Preference updated");
    } catch {
      setLocalPrefs(prev => ({ ...prev, [key]: !value }));
      toast.error("Failed to update preference");
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const currentRole = role; // Save role before sign out
    try {
      // This phone stops getting this person's notifications (deleted while still signed in).
      await removeThisDeviceBeforeSignOut();
      await supabase.auth.signOut();
      toast.success("Signed out successfully");
      // Navigate based on saved role - candidates go to /candidate, employers to /auth
      navigate(currentRole === "candidate" ? "/candidate" : "/auth");
    } catch (error) {
      toast.error("Failed to sign out");
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    const signedOutRoute = getSignedOutRoute(role);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Your session expired. Please sign in again before deleting your account.");
      }

      const { error } = await supabase.functions.invoke('delete-account', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: { password: deletePassword },
      });

      if (error) {
        // A wrong or missing password is said in the dialog, which stays open.
        const status = (error as { context?: { status?: number } }).context?.status;
        if (status === 401) {
          const reply = await (error as { context?: Response }).context?.json?.().catch(() => null);
          setDeleteError(
            reply?.code === "wrong_password"
              ? "That password is not right."
              : reply?.code === "password_required"
                ? "Enter your password to delete your account."
                : "Your sign-in has ended. Sign out, sign in again, then try once more.",
          );
          return;
        }
        throw error;
      }

      toast.success("Account deleted successfully");

      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch (signOutError) {
        console.warn("Local sign out after delete failed:", signOutError);
      }

      window.location.replace(signedOutRoute);
      return;
    } catch (error) {
      console.error("Delete account error:", error);
      toast.error("Failed to delete account. Please try again or contact support.");
    } finally {
      setIsDeleting(false);
    }
  };

  // One dialog for both layouts (applicants and the hiring team). What goes
  // and what stays, by who is deleting, as delete-account does it: a business
  // (its jobs go too), a team member (their chats and sent documents go to the
  // owner), an applicant.
  const deleteWords = deleteAccountWords(isEmployer ? "business" : isTeamMember || role === "team_member" ? "team" : "applicant");
  const deleteAccountDialog = (
    <AlertDialog
      open={deleteOpen}
      onOpenChange={(open) => {
        setDeleteOpen(open);
        if (!open) {
          setDeletePassword("");
          setDeleteError(null);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={isDeleting}>
          {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deleting...</> : "Delete Account"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete Account
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action is permanent and cannot be undone. {deleteWords.deleted} You can register again with the same email afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* What stays, as the Privacy Policy says (the twelfth Phase 5 review:
            this said everything was deleted). */}
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>What stays:</p>
          <ul className="list-disc space-y-1 pl-5">
            {deleteWords.kept.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <Label htmlFor="delete-account-password">Your password</Label>
          <Input
            id="delete-account-password"
            type="password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => {
              setDeletePassword(e.target.value);
              setDeleteError(null);
            }}
            aria-invalid={!!deleteError}
            aria-describedby={deleteError ? "delete-account-password-error" : undefined}
          />
          {deleteError && (
            <p id="delete-account-password-error" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={() => {
              if (!deletePassword) {
                setDeleteError("Enter your password to delete your account.");
                return;
              }
              void handleDeleteAccount();
            }}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Deleting...</> : "Yes, Delete My Account"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Candidate Settings - Simple view (no subscription tab)
  if (!isStaff) {
    return (
      <div className="space-y-6 max-w-2xl">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-foreground">Settings</h2>
          <p className="text-muted-foreground mt-1">Manage your account</p>
        </div>

        {/* Account Settings */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Account</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                value={user?.email || ""} 
                className="bg-background" 
                disabled 
              />
              <p className="text-xs text-muted-foreground">
                This is the email you use to sign in
              </p>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Sign Out</p>
                <p className="text-sm text-muted-foreground">Sign out of your account</p>
              </div>
              <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
                {isSigningOut ? "Signing out..." : "Sign Out"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notifications on this phone or browser */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg">Notifications</CardTitle>
            <CardDescription>Hear back as soon as there's news</CardDescription>
          </CardHeader>
          <CardContent>
            <DeviceNotifications audience="applicant" />
          </CardContent>
        </Card>

        {/* Delete Account */}
        <Card className="bg-card border-destructive/50">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Delete Account</p>
                <p className="text-sm text-muted-foreground">
                  {deleteWords.summary}
                </p>
              </div>
              {deleteAccountDialog}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Employer Settings
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground mt-1">Manage your account</p>
      </div>

      <Tabs value="account" className="w-full">

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6 mt-6">
          {/* The business's careers page (owners; the 2026-10-11 mock-ups, #3). */}
          {isEmployer && !isTeamMember && <CareersPageCard />}

          {/* Account Settings */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Account</CardTitle>
              <CardDescription>Manage your account settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={user?.email || ""} 
                  className="bg-background" 
                  disabled 
                />
                <p className="text-xs text-muted-foreground">
                  Your email address is used for authentication and cannot be changed.
                </p>
              </div>
              {isDeveloper && (
                <>
                  <div className="space-y-2">
                    <Label>Account ID</Label>
                    <Input
                      value={user?.id?.slice(0, 8) + "..." || ""}
                      className="bg-background font-mono text-sm"
                      disabled
                    />
                  </div>
                  <Separator />
                </>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Sign Out</p>
                  <p className="text-sm text-muted-foreground">Sign out of your account on this device</p>
                </div>
                <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
                  {isSigningOut ? "Signing out..." : "Sign Out"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notification Settings */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Notifications</CardTitle>
              <CardDescription>Choose how HireFlow reaches you</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-5 sm:px-6">
              {/* On a phone or in a browser, even with the app closed. The second
                  way to turn them on, for anyone who missed the first-time card. */}
              <DeviceNotifications audience="staff" />
              <Separator />
              <div className="flex items-center justify-between gap-4 pr-1">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Email Notifications</p>
                  <p className="text-sm text-muted-foreground">Master toggle for all email notifications</p>
                </div>
                <Switch 
                  className="shrink-0 ml-3"
                  checked={localPrefs.email_notifications_enabled}
                  onCheckedChange={(checked) => handlePrefChange("email_notifications_enabled", checked)}
                  disabled={prefsLoading || updatePrefs.isPending}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4 pr-1">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">New Applications</p>
                  <p className="text-sm text-muted-foreground">Get notified when someone applies to your jobs</p>
                </div>
                <Switch 
                  className="shrink-0 ml-3"
                  checked={localPrefs.email_new_applications}
                  onCheckedChange={(checked) => handlePrefChange("email_new_applications", checked)}
                  disabled={prefsLoading || updatePrefs.isPending || !localPrefs.email_notifications_enabled}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4 pr-1">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Messages</p>
                  <p className="text-sm text-muted-foreground">Get notified when you receive messages</p>
                </div>
                <Switch 
                  className="shrink-0 ml-3"
                  checked={localPrefs.email_messages}
                  onCheckedChange={(checked) => handlePrefChange("email_messages", checked)}
                  disabled={prefsLoading || updatePrefs.isPending || !localPrefs.email_notifications_enabled}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4 pr-1">
                <div className="min-w-0 flex-1">
                  {/* What it controls (send-notification-email getPreferenceField):
                      an applicant picking a time, confirming, or asking for
                      another. Reminders go to the applicant, not here. */}
                  <p className="font-medium text-foreground">Interview replies</p>
                  <p className="text-sm text-muted-foreground">When an applicant picks a time, confirms, or asks for another time</p>
                </div>
                <Switch 
                  className="shrink-0 ml-3"
                  checked={localPrefs.email_interview_reminders}
                  onCheckedChange={(checked) => handlePrefChange("email_interview_reminders", checked)}
                  disabled={prefsLoading || updatePrefs.isPending || !localPrefs.email_notifications_enabled}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4 pr-1">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Document Updates</p>
                  <p className="text-sm text-muted-foreground">Get notified about document signatures</p>
                </div>
                <Switch 
                  className="shrink-0 ml-3"
                  checked={localPrefs.email_document_updates}
                  onCheckedChange={(checked) => handlePrefChange("email_document_updates", checked)}
                  disabled={prefsLoading || updatePrefs.isPending || !localPrefs.email_notifications_enabled}
                />
              </div>
              {/* "Phase Updates" only for the platform's own account: the one
                  email it controls comes from the voice interview, which is off
                  for every other business (the second Phase 7 product audit:
                  everyone else had a switch for an email that never comes). */}
              {voiceAccount && (
                <>
              <Separator />
              <div className="flex items-center justify-between gap-4 pr-1">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Phase Updates</p>
                  <p className="text-sm text-muted-foreground">Get notified when candidates finish the voice interview</p>
                </div>
                <Switch 
                  className="shrink-0 ml-3"
                  checked={localPrefs.email_phase_updates}
                  onCheckedChange={(checked) => handlePrefChange("email_phase_updates", checked)}
                  disabled={prefsLoading || updatePrefs.isPending || !localPrefs.email_notifications_enabled}
                />
              </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* One-time tips (a business or team member who joined from 2026-10-11). */}
          <TipsSettingCard />

          {/* The platform admin's two-step sign-in (shows for that account only). */}
          <TwoStepSignIn />

          {/* Danger Zone */}
          <Card className="bg-card border-destructive/50">
            <CardHeader>
              <CardTitle className="text-lg text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Delete Account</p>
                  <p className="text-sm text-muted-foreground">
                    {deleteWords.summary}
                  </p>
                </div>
                {deleteAccountDialog}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
