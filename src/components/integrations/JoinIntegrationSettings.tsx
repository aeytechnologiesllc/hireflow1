import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Loader2, PlugZap, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useDisconnectJoinIntegration, useJoinIntegration, useSaveJoinIntegration } from "@/hooks/useJoinIntegration";

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function JoinIntegrationSettings() {
  const [apiToken, setApiToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const statusQuery = useJoinIntegration();
  const saveConnection = useSaveJoinIntegration();
  const disconnectConnection = useDisconnectJoinIntegration();

  const connection = statusQuery.data;
  const isConnected = connection?.connected ?? false;
  const savedDate = useMemo(() => formatDate(connection?.connectedAt ?? null), [connection?.connectedAt]);
  const canSubmit = apiToken.trim().length >= 12 && !saveConnection.isPending;

  useEffect(() => {
    if (saveConnection.isSuccess) {
      setApiToken("");
      setShowToken(false);
      toast.success("JOIN connection saved");
    }
  }, [saveConnection.isSuccess]);

  useEffect(() => {
    if (disconnectConnection.isSuccess) {
      toast.success("JOIN connection removed");
    }
  }, [disconnectConnection.isSuccess]);

  const handleSave = async () => {
    if (!canSubmit) return;
    try {
      await saveConnection.mutateAsync(apiToken.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save JOIN connection";
      toast.error(message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectConnection.mutateAsync();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not remove JOIN connection";
      toast.error(message);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border overflow-hidden">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <PlugZap className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-lg">JOIN multiposting</CardTitle>
                  <CardDescription>Connect an API-enabled JOIN account for approved posting workflows.</CardDescription>
                </div>
              </div>
            </div>
            <Badge variant="outline" className={isConnected ? "w-fit border-emerald-500/30 text-emerald-500" : "w-fit border-border text-muted-foreground"}>
              {statusQuery.isFetching ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : isConnected ? (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isConnected ? "Connected" : "Not connected"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <Alert className="border-primary/20 bg-primary/5">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <AlertTitle>API-enabled JOIN account required</AlertTitle>
            <AlertDescription>
              Use a company JOIN account on Advanced or Enterprise with System Admin access to generate API credentials. Some channels, including Indeed and premium boards, may still require board approval or paid board products.
            </AlertDescription>
          </Alert>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm">
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
              <div>
                <p className="font-medium text-foreground">Use the company/admin JOIN account</p>
                <p className="text-muted-foreground">Choose the account that owns billing, job slots, board access, and API credentials.</p>
              </div>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
              <div>
                <p className="font-medium text-foreground">Confirm Advanced/Enterprise API access</p>
                <p className="text-muted-foreground">The JOIN user generating the token should be a System Admin with API Credentials visible in settings.</p>
              </div>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
              <div>
                <p className="font-medium text-foreground">Save the token in HireFlow</p>
                <p className="text-muted-foreground">Saving connects the account; jobs still go through your review and approval.</p>
              </div>
            </div>
          </div>

          <Separator />

          {isConnected && (
            <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Saved JOIN token</p>
                <p className="text-sm text-muted-foreground">
                  {connection?.tokenPreview ?? "Token saved"}{savedDate ? ` · connected ${savedDate}` : ""}
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove JOIN connection?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Ava will stop using this JOIN account for future multiposting. You can reconnect with a new API token any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Remove connection
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="join-api-token">JOIN API token/key</Label>
                <div className="relative">
                  <Input
                    id="join-api-token"
                    type={showToken ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={isConnected ? "Paste a new token to replace the saved one" : "Paste your JOIN API token/key"}
                    value={apiToken}
                    onChange={(event) => setApiToken(event.target.value)}
                    className="bg-background pr-11 font-mono text-sm"
                  />
                  <button
                    type="button"
                    aria-label={showToken ? "Hide JOIN API token" : "Show JOIN API token"}
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => setShowToken((value) => !value)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button className="gap-2 sm:w-auto" disabled={!canSubmit} onClick={handleSave}>
                {saveConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {isConnected ? "Update token" : "Save connection"}
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              If JOIN does not show API Credentials, the account likely is not on an API-enabled plan or the user is not a System Admin. HireFlow only shows a masked preview after saving.
            </p>
          </div>

          {statusQuery.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Connection service unavailable</AlertTitle>
              <AlertDescription>
                We could not reach the JOIN connection service. Try again in a moment or contact support if this keeps happening.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">What this connection does</p>
                <p className="text-sm text-muted-foreground">
                  Saving a key does not publish jobs by itself. It lets HireFlow use that JOIN account from the job or Ava flow, where you review the role before anything goes live.
                </p>
              </div>
            </div>
            <a
              href="https://help.join.com/integrations/automation-tools"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              JOIN API requirements <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
