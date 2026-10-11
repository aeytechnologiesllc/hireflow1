import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { TIPS_OFF, nextTip, placeTip, tipsEligible, tipsForPage, type Tip } from "./tipRules";
import "./tips.css";

/**
 * The guided tips, drawn (rules and words: ./tipRules.ts). Mounted once in
 * each staff layout (AppLayout); it reads the page it is on and shows that
 * page's next unseen tip once the thing it explains is on screen, still, and
 * nobody is typing or has a dialog open. "Got it" (or Escape) puts it away
 * for good, on every device (public.ui_tips_seen); "No more tips" turns them
 * all off.
 */

const PREVIEW_KEY = "hf-preview-tips";

/** The offline preview's switch (?__previewTips=1), kept for the visit. */
function previewForced(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("__previewTips") === "1") window.sessionStorage.setItem(PREVIEW_KEY, "1");
    return window.sessionStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether this person sees tips, which they've put away, and the two switches. */
export function useGuidedTipsState() {
  const { user, role, isTeamMember } = useAuth();
  const isPlatformAdmin = usePlatformAdmin();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  const eligible =
    !!userId &&
    tipsEligible({
      createdAt: (user as { created_at?: string } | null)?.created_at,
      isPlatformAdmin,
      role,
      isTeamMember,
      forced: previewForced(),
    });
  const query = useQuery({
    queryKey: ["ui-tips", userId],
    enabled: eligible,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from("ui_tips_seen" as never).select("tip").eq("user_id", userId!);
      if (error) throw error;
      return ((data ?? []) as { tip: string }[]).map((r) => r.tip);
    },
  });
  const seen = useMemo(() => new Set(query.data ?? []), [query.data]);

  const putAway = useCallback(
    async (tip: string) => {
      if (!userId) return;
      // Gone at once; the database catches up. If it can't, it stays gone for this visit.
      queryClient.setQueryData<string[]>(["ui-tips", userId], (old) => (old?.includes(tip) ? old : [...(old ?? []), tip]));
      const { error } = await supabase
        .from("ui_tips_seen" as never)
        .upsert({ user_id: userId, tip } as never, { onConflict: "user_id,tip", ignoreDuplicates: true });
      if (error) console.warn("[tips] could not save", tip, error.message);
    },
    [queryClient, userId],
  );

  const bringBack = useCallback(async () => {
    if (!userId) return;
    queryClient.setQueryData<string[]>(["ui-tips", userId], (old) => (old ?? []).filter((t) => t !== TIPS_OFF));
    const { error } = await supabase.from("ui_tips_seen" as never).delete().eq("user_id", userId).eq("tip", TIPS_OFF);
    if (error) {
      await queryClient.invalidateQueries({ queryKey: ["ui-tips", userId] });
      throw error;
    }
  }, [queryClient, userId]);

  return { eligible, ready: eligible && query.isSuccess, seen, off: seen.has(TIPS_OFF), putAway, turnOff: () => putAway(TIPS_OFF), bringBack };
}

export function GuidedTips() {
  const { pathname } = useLocation();
  const { role } = useAuth();
  const state = useGuidedTipsState();
  // The tip before this one on the page was put away with "Next".
  const [followed, setFollowed] = useState<string | null>(null);
  const tips = useMemo(() => tipsForPage(pathname, { canAskForPapers: role === "employer" }), [pathname, role]);
  const tip = state.ready ? nextTip(tips, state.seen) : null;
  if (!tip) return null;
  return (
    <TipWhenReady
      key={`${pathname}|${tip.key}`}
      tip={tip}
      cameFromNext={followed === tip.key}
      onGotIt={() => {
        const after = tips[tips.findIndex((t) => t.key === tip.key) + 1];
        setFollowed(tip.next && after ? after.key : null);
        void state.putAway(tip.key);
      }}
      onNoMore={() => void state.turnOff()}
    />
  );
}

function findAnchor(selectors: string[]): HTMLElement | null {
  for (const s of selectors) {
    const el = document.querySelector<HTMLElement>(s);
    if (el) return el;
  }
  return null;
}

function onScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

/** On a phone the card spans the screen (top or bottom), so what it explains
 *  only needs to be on the page; the ring shows when they scroll to it. */
function readyToExplain(el: HTMLElement): boolean {
  if (window.innerWidth >= PHONE) return onScreen(el);
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function someoneTyping(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return false;
  if (a.isContentEditable || a.tagName === "TEXTAREA" || a.tagName === "SELECT") return true;
  return a.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "reset"].includes((a as HTMLInputElement).type);
}

function dialogOpen(): boolean {
  return !!document.querySelector('[role="dialog"]:not([data-guided-tip]), [role="alertdialog"]');
}

const PHONE = 768;

function TipWhenReady({ tip, cameFromNext, onGotIt, onNoMore }: { tip: Tip; cameFromNext: boolean; onGotIt: () => void; onNoMore: () => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [place, setPlace] = useState<{ top: number; left: number; side: "below" | "above"; arrowX: number } | null>(null);
  const [phoneSide, setPhoneSide] = useState<"bottom" | "top">("bottom");
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.innerWidth < PHONE);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // Wait for the moment: the thing it explains on the page and on screen,
  // still for two looks in a row, nobody typing, no dialog open. While it
  // shows, it goes away (without counting as seen) if that thing leaves the
  // page or a dialog opens over it.
  useEffect(() => {
    let found: HTMLElement | null = null;
    let steady = 0;
    let shown: HTMLElement | null = null;
    const look = () => {
      const el = findAnchor(tip.anchors);
      if (shown) {
        if (!shown.isConnected || dialogOpen()) {
          shown = null;
          found = null;
          steady = 0;
          setAnchor(null);
        }
        return;
      }
      if (el && cameFromNext && !scrolled.current && !onScreen(el)) {
        // They pressed Next: bring the next thing into view rather than wait.
        scrolled.current = true;
        el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }
      const ok = !!el && readyToExplain(el) && !someoneTyping() && !dialogOpen();
      steady = ok && el === found ? steady + 1 : ok ? 1 : 0;
      found = ok ? el : null;
      if (steady >= (cameFromNext ? 1 : 2) && el) {
        shown = el;
        setAnchor(el);
      }
    };
    look();
    const timer = window.setInterval(look, 450);
    return () => window.clearInterval(timer);
  }, [tip, cameFromNext]);

  // Where it goes, kept beside the anchor as the page scrolls or resizes.
  const reposition = useCallback(() => {
    if (!anchor || !cardRef.current) return;
    const isPhone = window.innerWidth < PHONE;
    setPhone(isPhone);
    const r = anchor.getBoundingClientRect();
    if (isPhone) {
      setPhoneSide(r.top + r.height / 2 > window.innerHeight * 0.55 ? "top" : "bottom");
      return;
    }
    const card = cardRef.current.getBoundingClientRect();
    setPlace(placeTip({ top: r.top, left: r.left, width: r.width, height: r.height }, { width: card.width, height: card.height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [anchor]);

  useLayoutEffect(() => {
    if (!anchor) return;
    reposition();
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reposition);
    };
    window.addEventListener("resize", soon);
    document.addEventListener("scroll", soon, true);
    const timer = window.setInterval(reposition, 600); // a list that moves under it
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", soon);
      document.removeEventListener("scroll", soon, true);
      window.clearInterval(timer);
    };
  }, [anchor, reposition]);

  // The ring on what it explains.
  useEffect(() => {
    if (!anchor) return;
    anchor.classList.add("ck-tip-target");
    return () => anchor.classList.remove("ck-tip-target");
  }, [anchor]);

  // Escape puts it away, unless they're in a box or a dialog.
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !someoneTyping() && !dialogOpen()) onGotIt();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [anchor, onGotIt]);

  if (!anchor) return null;
  const titleId = `ck-tip-${tip.key}-title`;
  const bodyId = `ck-tip-${tip.key}-body`;
  const className = phone ? (phoneSide === "top" ? "ck-tip ck-tip--sheet-top" : "ck-tip ck-tip--sheet") : `ck-tip ck-tip--${place?.side ?? "below"}`;
  const style = phone
    ? undefined
    : ({ top: place?.top ?? -9999, left: place?.left ?? -9999, visibility: place ? "visible" : "hidden", ["--tip-arrow-x" as string]: `${place?.arrowX ?? 26}px` } as CSSProperties);
  return createPortal(
    <div ref={cardRef} className={className} style={style} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-describedby={bodyId} aria-live="polite" data-guided-tip={tip.key}>
      <div className="ck-tip__kick">
        <i aria-hidden />
        {tip.kicker}
      </div>
      <h4 id={titleId} className="ck-tip__title">
        {tip.title}
      </h4>
      <p id={bodyId} className="ck-tip__body">
        {tip.body}
      </p>
      <div className="ck-tip__row">
        <button type="button" className="ck-tip__off" onClick={onNoMore} data-tip-off>
          No more tips
        </button>
        <button type="button" className="ck-tip__got" onClick={onGotIt} data-tip-got>
          {tip.next ? "Next" : "Got it"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
