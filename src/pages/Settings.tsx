import { useAuth } from "@/hooks/useAuth";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User, CreditCard, Loader2 } from "lucide-react";
import SubscriptionSettings from "@/components/subscription/SubscriptionSettings";
import SubscriptionSuccessModal from "@/components/subscription/SubscriptionSuccessModal";
import { useEmailPreferences, useUpdateEmailPreferences, type EmailPreferences } from "@/hooks/useEmailPreferences";
import { useSubscription } from "@/hooks/useSubscription";
import { Skeleton } from "@/components/ui/skeleton";

export default function Settings() {
  const { user, role, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEmployer = role === "employer";
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSubscriptionSuccess, setShowSubscriptionSuccess] = useState(false);
  const [successPlanType, setSuccessPlanType] = useState("growth");
  const syncAttempted = useRef(false);
  
  const { data: emailPrefs, isLoading: prefsLoading } = useEmailPreferences();
  const updatePrefs = useUpdateEmailPreferences();
  const { syncSubscription, refetch } = useSubscription();
  
  const [localPrefs, setLocalPrefs] = useState<EmailPreferences>({
    email_notifications_enabled: true,
    email_new_applications: true,
    email_messages: true,
    email_interview_reminders: true,
    email_document_updates: true,
    email_phase_updates: true,
  });

  // Handle subscription success callback from Stripe
  useEffect(() => {
    if (!user) return;
    const subscriptionParam = searchParams.get("subscription");
    
    if (subscriptionParam === "success" && !syncAttempted.current) {
      syncAttempted.current = true;
      setIsSyncing(true);
      
      // Sync subscription with Stripe
      syncSubscription.mutateAsync()
        .then((result) => {
          console.log("[Settings] Subscription synced:", result);
          const storageKey = `subscription_success_shown_${user?.id}`;
          if (!localStorage.getItem(storageKey)) {
            localStorage.setItem(storageKey, "true");
            setSuccessPlanType(result?.subscription?.plan_type || "growth");
            setShowSubscriptionSuccess(true);
          }
          setSearchParams((prev) => {
            prev.delete("subscription");
            return prev;
          });
          refetch();
        })
        .catch((error) => {
          console.error("[Settings] Sync error:", error);
          toast.error("Failed to verify subscription", {
            description: "Please refresh the page or contact support.",
          });
        })
        .finally(() => {
          setIsSyncing(false);
        });
    } else if (subscriptionParam === "canceled") {
      toast.info("Checkout canceled");
      setSearchParams((prev) => {
        prev.delete("subscription");
        return prev;
      });
    }
  }, [searchParams, setSearchParams, syncSubscription, refetch, user]);

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

  const activeTab = searchParams.get("tab") || "account";

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    const currentRole = role; // Save role before sign out
    try {
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

  // Candidate Settings - Simple view (no subscription tab)
  if (!isEmployer) {
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
                  Permanently delete your account and all data
                </p>
              </div>
              <Button variant="destructive">Delete Account</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Employer Settings - Tabbed view with Account and Subscription
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">Settings</h2>
        <p className="text-muted-foreground mt-1">Manage your account and subscription</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger 
            value="account" 
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <User className="h-4 w-4 mr-2" />
            Account
          </TabsTrigger>
          <TabsTrigger 
            value="subscription"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Subscription
          </TabsTrigger>
        </TabsList>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6 mt-6">
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
              <div className="space-y-2">
                <Label>Account ID</Label>
                <Input 
                  value={user?.id?.slice(0, 8) + "..." || ""} 
                  className="bg-background font-mono text-sm" 
                  disabled 
                />
              </div>
              <Separator />
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
              <CardDescription>Configure how you receive email notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Email Notifications</p>
                  <p className="text-sm text-muted-foreground">Master toggle for all email notifications</p>
                </div>
                <Switch 
                  className="shrink-0"
                  checked={localPrefs.email_notifications_enabled}
                  onCheckedChange={(checked) => handlePrefChange("email_notifications_enabled", checked)}
                  disabled={prefsLoading || updatePrefs.isPending}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">New Applications</p>
                  <p className="text-sm text-muted-foreground">Get notified when someone applies to your jobs</p>
                </div>
                <Switch 
                  className="shrink-0"
                  checked={localPrefs.email_new_applications}
                  onCheckedChange={(checked) => handlePrefChange("email_new_applications", checked)}
                  disabled={prefsLoading || updatePrefs.isPending || !localPrefs.email_notifications_enabled}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Messages</p>
                  <p className="text-sm text-muted-foreground">Get notified when you receive messages</p>
                </div>
                <Switch 
                  className="shrink-0"
                  checked={localPrefs.email_messages}
                  onCheckedChange={(checked) => handlePrefChange("email_messages", checked)}
                  disabled={prefsLoading || updatePrefs.isPending || !localPrefs.email_notifications_enabled}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Interview Reminders</p>
                  <p className="text-sm text-muted-foreground">Receive reminders before scheduled interviews</p>
                </div>
                <Switch 
                  className="shrink-0"
                  checked={localPrefs.email_interview_reminders}
                  onCheckedChange={(checked) => handlePrefChange("email_interview_reminders", checked)}
                  disabled={prefsLoading || updatePrefs.isPending || !localPrefs.email_notifications_enabled}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Document Updates</p>
                  <p className="text-sm text-muted-foreground">Get notified about document signatures</p>
                </div>
                <Switch 
                  className="shrink-0"
                  checked={localPrefs.email_document_updates}
                  onCheckedChange={(checked) => handlePrefChange("email_document_updates", checked)}
                  disabled={prefsLoading || updatePrefs.isPending || !localPrefs.email_notifications_enabled}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">Phase Updates</p>
                  <p className="text-sm text-muted-foreground">Get notified when candidates complete phases</p>
                </div>
                <Switch 
                  className="shrink-0"
                  checked={localPrefs.email_phase_updates}
                  onCheckedChange={(checked) => handlePrefChange("email_phase_updates", checked)}
                  disabled={prefsLoading || updatePrefs.isPending || !localPrefs.email_notifications_enabled}
                />
              </div>
            </CardContent>
          </Card>

          {/* Privacy Settings */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Privacy</CardTitle>
              <CardDescription>Manage your privacy preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Profile Visibility</p>
                  <p className="text-sm text-muted-foreground">Allow employers to find your profile</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Activity Status</p>
                  <p className="text-sm text-muted-foreground">Show when you're actively looking for jobs</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

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
                    Permanently delete your account and all associated data
                  </p>
                </div>
                <Button variant="destructive">Delete Account</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription" className="mt-6">
          <SubscriptionSettings />
        </TabsContent>
      </Tabs>

      {showSubscriptionSuccess && (
        <SubscriptionSuccessModal
          planType={successPlanType}
          onClose={() => setShowSubscriptionSuccess(false)}
        />
      )}
    </div>
  );
}
