import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { careersPathFor, useBusinessPageFor, useOwnBusiness } from "@/hooks/useBusinessPage";
import { candidateOrigin } from "@/lib/hosts";

/**
 * "Your careers page" in Settings (the 2026-10-11 mock-ups, #3): the
 * business's careers address, to copy and open, and its one line about
 * itself. The address can change until the first job goes live; after that
 * it stays so shared links keep working (the database says so too:
 * business_pages_address_rules). The home business's page is /careers.
 */

export const ABOUT_MAX = 140;

/** What someone types, as an address: small letters, numbers, single dashes. */
export function cleanAddress(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 50);
}

/** A refusal from the database, in the words the person reads. */
export function addressSaveProblem(error: { code?: string; message?: string } | null | undefined): string {
  const message = error?.message ?? "";
  if (error?.code === "23505" || /duplicate key|unique/i.test(message)) return "That address is taken. Try another.";
  if (/small letters|kept for HireFlow|can't change once|140 letters/.test(message)) return message;
  return "That didn't save. Please try again.";
}

export function CareersPageCard() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  // useOwnBusiness makes the page the first time (ensure_business_page), so
  // a business that just signed up already has its address here.
  const { data: own } = useOwnBusiness();
  const { data: page, isLoading } = useBusinessPageFor(own?.employerId === user?.id ? user?.id : null);
  const { data: locked } = useQuery({
    queryKey: ["careers-address-locked", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("employer_id", user!.id)
        .in("status", ["published", "closed"]);
      return (count ?? 0) > 0;
    },
  });
  const [slug, setSlug] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!page) return;
    setSlug(page.slug);
    setAbout(page.about ?? "");
  }, [page]);

  if (isLoading || !page) return null;
  const path = careersPathFor(page) ?? `/c/${page.slug}`;
  const link = `${candidateOrigin()}${path}`;
  const addressLocked = page.home_alias || !!locked;
  const changed = slug !== page.slug || about.trim() !== (page.about ?? "");
  const company = (profile?.company_name ?? "").trim() || "Your business";

  const save = async () => {
    const next = cleanAddress(slug).replace(/-+$/, "");
    if (next.length < 2) {
      toast.error("Use at least 2 letters or numbers.");
      return;
    }
    setSaving(true);
    const update: Record<string, string | null> = { about: about.trim() || null };
    if (!addressLocked && next !== page.slug) update.slug = next;
    const { error } = await supabase.from("business_pages" as never).update(update as never).eq("employer_id", user!.id);
    setSaving(false);
    if (error) {
      toast.error(addressSaveProblem(error));
      return;
    }
    setSlug(update.slug ?? page.slug);
    await queryClient.invalidateQueries({ queryKey: ["business-page"] });
    toast.success(update.slug ? `Saved. Your careers page is now hireflownow.com/c/${update.slug}.` : "Saved.");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy. Select the address and copy it.");
    }
  };

  return (
    <Card className="bg-card border-border" data-careers-page-card>
      <CardHeader>
        <CardTitle className="text-lg">Your careers page</CardTitle>
        <CardDescription>Where applicants see all your open jobs.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="careers-address">Address</Label>
            {page.home_alias ? (
              <Input id="careers-address" value="hireflownow.com/careers" disabled className="bg-muted" />
            ) : (
              <div className="flex min-w-0 items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                <span className="shrink-0 pl-3 text-sm text-muted-foreground">hireflownow.com/c/</span>
                <input
                  id="careers-address"
                  value={slug}
                  onChange={(e) => setSlug(cleanAddress(e.target.value))}
                  disabled={addressLocked || saving}
                  className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  aria-describedby="careers-address-hint"
                  data-careers-address
                />
              </div>
            )}
            <p id="careers-address-hint" className="text-xs text-muted-foreground" data-careers-address-hint={addressLocked ? "locked" : "open"}>
              {addressLocked
                ? "Your address stays the same now that a job has gone live, so the links you shared keep working. Message us in Help if you need it changed."
                : "You can change it until your first job goes live. After that it stays, so the links you shared keep working."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="careers-about">One line about your business</Label>
            <Input
              id="careers-about"
              value={about}
              maxLength={ABOUT_MAX}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Friendly chat support for online games, 24/7."
              disabled={saving}
              data-careers-about
            />
            <p className="text-xs text-muted-foreground">Shown under your name. {ABOUT_MAX - about.length} letters left.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={!changed || saving} data-careers-save>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <Button variant="outline" onClick={() => void copy()}>
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </Button>
            <Button variant="outline" asChild>
              <a href={link} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open page
              </a>
            </Button>
          </div>
        </div>
        <div className="rounded-xl border border-border p-4" aria-label="What applicants see">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">What applicants see</div>
          <div className="flex items-center gap-3">
            {profile?.company_logo ? (
              <img src={profile.company_logo} alt="" className="h-11 w-11 rounded-xl object-cover" />
            ) : (
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary font-display text-base font-semibold text-primary-foreground">
                {company.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <div className="truncate font-display text-lg leading-tight text-foreground">{company}</div>
              {about.trim() && <div className="truncate text-xs text-muted-foreground">{about.trim()}</div>}
            </div>
          </div>
          <div className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Open roles</div>
          <div className="mt-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">Your live jobs show here, each with Apply.</div>
        </div>
      </CardContent>
    </Card>
  );
}
