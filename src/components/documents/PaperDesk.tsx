import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Document, Page } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import { ArrowDown, X } from "lucide-react";
import { servePdfWorkerFromThisSite } from "@/lib/pdfWorker";
import { LetterText } from "./LetterText";
import { SignaturePad } from "./SignaturePad";

/**
 * The signing screens' one look (the owner, 2026-11-05, on the old viewer:
 * "The big container, then another container, and then you have another
 * container that scrolls a PDF ... You need to come up with something that's
 * free floating. Scroll, you sign."). So:
 *   - the desk: the app dims and blurs behind, and the document's own pages
 *     lie on it. No card, no frame, no second scroll: the desk scrolls, once.
 *   - the pages: a PDF is drawn page by page as paper (react-pdf, from the
 *     very bytes that were hashed, src/lib/shownPdf.ts), a written letter as
 *     one sheet. The signatures already made are drawn on the page where they
 *     go, and the place waiting for this person says "Sign here".
 *   - under the last page, the signing itself, on the desk; while it is out
 *     of sight, one floating button takes them to it.
 * On a phone the desk is the app's bottom sheet (.ck-modal, src/styles/phone.css).
 */

export type PaperField = { type?: string; page?: number; x?: number; y?: number; width?: number; height?: number };
export type PaperMark = { value: string; at?: string | null };
/** One signature place on the paper: the mark made there, else who signs it. */
export type PaperSpot = {
  mark: PaperMark | null;
  /** This person's own place, still to sign: "Sign here", and their name as they type it. */
  mine?: boolean;
  preview?: string | null;
  /** Who signs here, while it waits on someone else ("Ana signs here"). */
  waitingLabel?: string;
};

// A page's paper: white whatever the theme, as a printed page is.
const PAPER: CSSProperties = {
  background: "#fff",
  color: "#1f2a26",
  colorScheme: "light",
  boxShadow: "0 1px 2px rgba(18, 30, 24, 0.10), 0 18px 48px -18px rgba(18, 30, 24, 0.45)",
  // LetterText's headings read --ink-3; on paper it is the paper's own grey.
  ["--ink-3" as string]: "#5d6862",
};

const SIGNED = (at: string) => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : `Signed ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
};

function Mark({ value, preview = false }: { value: string; preview?: boolean }) {
  return value.startsWith("data:image") ? (
    <img src={value} alt="" className="h-full w-full object-contain object-left-bottom" style={preview ? { opacity: 0.75 } : undefined} />
  ) : (
    <span
      className="block truncate font-signature leading-none"
      style={{ fontSize: "min(72cqh, 15cqw)", color: preview ? "var(--action)" : "#1b2f6b", opacity: preview ? 0.85 : 1 }}
    >
      {value}
    </span>
  );
}

/** A signature place drawn on the paper. `pageWidth` sizes its small print.
 *  Above the page's text layer (react-pdf's, z-index 2), or it takes the taps. */
function Spot({ spot, style, pageWidth, onSignHere }: { spot: PaperSpot; style: CSSProperties; pageWidth: number; onSignHere?: () => void }) {
  const small = Math.max(8, Math.min(11.5, pageWidth * 0.0138));
  if (spot.mark) {
    return (
      <div className="pointer-events-none absolute z-[3] flex items-end [container-type:size]" style={style} data-paper-mark>
        <Mark value={spot.mark.value} />
        {spot.mark.at && (
          <span className="absolute left-0 top-full mt-[1px] whitespace-nowrap" style={{ fontSize: small, color: "#5d6862" }}>
            {SIGNED(spot.mark.at)}
          </span>
        )}
      </div>
    );
  }
  if (spot.mine) {
    return (
      <button
        type="button"
        onClick={onSignHere}
        className="hf-sign-here absolute z-[3] flex items-end rounded-[4px] [container-type:size]"
        style={{ ...style, outline: "1.5px dashed var(--action)", outlineOffset: 2, background: "color-mix(in srgb, var(--action) 9%, transparent)" }}
        aria-label="Sign here"
        data-paper-sign-here
      >
        {/* Their name as they type it, in the place it will go; "Sign here" until it is signed. */}
        {spot.preview && <Mark value={spot.preview} preview />}
        {/* Under the box, where the signed copy prints the name and date: above it, it covered the letter's own words. */}
        <span className="absolute left-0 top-full mt-[3px] inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px] font-semibold text-white" style={{ fontSize: Math.max(10, small), background: "var(--action)" }}>
          Sign here
        </span>
      </button>
    );
  }
  if (spot.waitingLabel) {
    return (
      <div className="pointer-events-none absolute z-[3] flex items-end rounded-[4px] px-1" style={{ ...style, outline: "1px dashed #b9c2bc", outlineOffset: 2 }}>
        <span className="truncate" style={{ fontSize: small, color: "#7b867f" }}>
          {spot.waitingLabel}
        </span>
      </div>
    );
  }
  return null;
}

function useColumnWidth(max: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setWidth(Math.floor(Math.min(max, el.clientWidth)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [max]);
  return [ref, width] as const;
}

/**
 * An uploaded PDF as paper, page by page, with its signature places: the
 * first field of each side, as the signing function places them
 * (document-signing, the countersign's overlays).
 */
export function PaperPdf({
  src,
  fields,
  spots,
  labels,
  onSignHere,
}: {
  /** A blob: address of the bytes that were hashed (useShownPdf). */
  src: string;
  fields: PaperField[] | undefined;
  spots: { candidate?: PaperSpot; employer?: PaperSpot };
  /** Who signs on each side, for a file with no signature places of its own. */
  labels: { candidate: string; employer: string };
  onSignHere?: () => void;
}) {
  servePdfWorkerFromThisSite();
  // One object for one address, or react-pdf loads it again on every render.
  const file = useMemo(() => ({ url: src }), [src]);
  const [ref, width] = useColumnWidth(816);
  const [pages, setPages] = useState(0);
  const [failed, setFailed] = useState(false);
  // Sharp enough to pinch in on a phone.
  const dpr = typeof window === "undefined" ? 1 : Math.min(3, (window.devicePixelRatio || 1) * (width < 600 ? 1.6 : 1));
  const places = (["candidate", "employer"] as const).flatMap((side) => {
    const field = fields?.find((f) => f.type === side);
    const spot = spots[side];
    return field && spot ? [{ side, field, spot }] : [];
  });
  // A file with no place for a side gets its signatures on a slip of paper after the last page.
  const unplaced = (["employer", "candidate"] as const).filter((side) => !fields?.some((f) => f.type === side) && footShows(spots[side]));

  return (
    <div ref={ref} className="w-full">
      {failed ? (
        <p className="py-16 text-center text-[14px]" style={{ color: "var(--ink-2)" }}>
          This document could not be shown just now. Close it and open it again.
        </p>
      ) : (
        <Document
          file={file}
          onLoadSuccess={({ numPages }) => setPages(numPages)}
          onLoadError={() => setFailed(true)}
          loading={<div className="mx-auto animate-pulse rounded-[3px]" style={{ ...PAPER, width: width || "100%", aspectRatio: "8.5 / 11", opacity: 0.6 }} />}
          error={<span />}
          className="flex flex-col items-center gap-4 sm:gap-7"
        >
          {width > 0 &&
            Array.from({ length: pages }, (_, i) => (
              <div key={i} className="ck-rise relative overflow-hidden rounded-[3px]" style={{ ...PAPER, width, animationDelay: `${Math.min(i, 4) * 70}ms` }} data-paper-page={i + 1}>
                <Page
                  pageNumber={i + 1}
                  width={width}
                  devicePixelRatio={dpr}
                  renderAnnotationLayer={false}
                  renderTextLayer
                  loading={<div style={{ width, aspectRatio: "8.5 / 11" }} />}
                />
                {places
                  .filter(({ field }) => (field.page ?? 1) === i + 1)
                  .map(({ side, field, spot }) => (
                    <Spot
                      key={side}
                      spot={spot}
                      pageWidth={width}
                      onSignHere={onSignHere}
                      style={{ left: `${field.x ?? 0}%`, top: `${field.y ?? 0}%`, width: `${field.width ?? 25}%`, height: `${field.height ?? 6}%` }}
                    />
                  ))}
              </div>
            ))}
        </Document>
      )}
      {pages > 0 && width > 0 && unplaced.length > 0 && (
        <div className="ck-rise mx-auto mt-4 rounded-[3px] px-6 py-6 sm:mt-7 sm:px-16 sm:py-9" style={{ ...PAPER, width }} data-paper-slip>
          <SignatureFoot sides={unplaced.map((side) => ({ who: labels[side], spot: spots[side]! }))} onSignHere={onSignHere} />
        </div>
      )}
    </div>
  );
}

/** Who signs where, at the foot of the paper: a line each, the mark on it. */
function SignatureFoot({ sides, onSignHere }: { sides: { who: string; spot: PaperSpot }[]; onSignHere?: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-6 sm:gap-12" data-paper-signatures>
      {sides.map(({ who, spot }) => (
        <div key={who} className="min-w-0">
          <div className="relative h-[54px] border-b" style={{ borderColor: "#c9cfca" }}>
            {spot.mark ? (
              <div className="absolute inset-x-0 bottom-1 top-1 flex items-end [container-type:size]">
                <Mark value={spot.mark.value} />
              </div>
            ) : spot.mine ? (
              <button type="button" onClick={onSignHere} className="hf-sign-here absolute inset-0 flex items-end rounded-[4px] px-1 [container-type:size]" style={{ outline: "1.5px dashed var(--action)", background: "color-mix(in srgb, var(--action) 9%, transparent)" }} aria-label="Sign here" data-paper-sign-here>
                {spot.preview ? <Mark value={spot.preview} preview /> : <span className="mb-1.5 text-[12px] font-semibold" style={{ color: "var(--action)" }}>Sign here</span>}
              </button>
            ) : null}
          </div>
          <div className="mt-1.5 truncate text-[12.5px] font-semibold">{who}</div>
          <div className="text-[11.5px]" style={{ color: "#5d6862" }}>
            {spot.mark?.at ? SIGNED(spot.mark.at) : spot.mine ? "Your signature" : spot.waitingLabel ?? "Not signed"}
          </div>
        </div>
      ))}
    </div>
  );
}

const footShows = (spot: PaperSpot | undefined) => !!spot && (!!spot.mark || !!spot.mine || !!spot.waitingLabel);

/** A written letter as one sheet of paper, its signatures at the foot. */
export function PaperLetter({
  text,
  candidate,
  employer,
  onSignHere,
}: {
  text: string;
  candidate: { who: string; spot: PaperSpot };
  employer: { who: string; spot: PaperSpot };
  onSignHere?: () => void;
}) {
  const sides = [employer, candidate];
  return (
    <article className="ck-rise mx-auto w-full max-w-[816px] rounded-[3px] px-6 py-8 text-[14.5px] leading-[1.65] sm:px-16 sm:py-14" style={PAPER} data-paper-letter>
      <LetterText text={text} />
      {sides.some(({ spot }) => footShows(spot)) && (
        <div className="mt-10">
          <SignatureFoot sides={sides} onSignHere={onSignHere} />
        </div>
      )}
    </article>
  );
}

/** Where to sign, found and filled: the place scrolls into view and its box takes the typing. */
export function goToSignPlace(id: string) {
  const target = window.document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => target.querySelector<HTMLElement>("input[data-signature-line]")?.focus({ preventScroll: true }), 520);
}

/** A signature written on a line, as on paper: the name typed in a hand, or drawn. */
export function SignatureLineInput({
  id,
  how,
  onHow,
  typed,
  onTyped,
  onDrawn,
}: {
  id: string;
  how: "typed" | "drawn";
  onHow: (how: "typed" | "drawn") => void;
  typed: string;
  onTyped: (value: string) => void;
  onDrawn: (value: string | null) => void;
}) {
  return (
    <div className="mt-6">
      {how === "typed" ? (
        <input
          id={id}
          data-signature-line
          className="w-full border-0 border-b-2 bg-transparent px-1 pb-1 text-center font-signature text-[42px] leading-tight outline-none transition-colors focus:border-[var(--action)]"
          style={{ borderColor: "var(--line)", color: "var(--hf-text)" }}
          value={typed}
          maxLength={120}
          placeholder="Your full name"
          onChange={(e) => onTyped(e.target.value)}
          autoComplete="name"
          aria-label="Type your full name"
        />
      ) : (
        <SignaturePad onChange={onDrawn} />
      )}
      <div className="mt-2 flex items-center justify-between gap-3 text-[12.5px]">
        <span style={{ color: "var(--ink-3)" }}>{how === "typed" ? "Type your full name" : "Draw your signature"}</span>
        <button type="button" className="underline underline-offset-2" style={{ color: "var(--ink-2)" }} onClick={() => onHow(how === "typed" ? "drawn" : "typed")}>
          {how === "typed" ? "Draw it instead" : "Type it instead"}
        </button>
      </div>
    </div>
  );
}

/**
 * The desk itself: a header that floats at the top (what it is, where it
 * stands, close), the paper, then whatever the screen puts under it. While
 * `signPlaceId` is out of sight, one button floats at the bottom to it.
 */
export function PaperDesk({
  open,
  busy = false,
  onClose,
  titleId,
  eyebrow,
  title,
  status,
  aside,
  signPlaceId,
  signLabel = "Sign",
  children,
  data,
}: {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  titleId: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  status?: ReactNode;
  /** A quiet link in the header (the signing record). */
  aside?: ReactNode;
  /** The id of the place to sign, while there is one. */
  signPlaceId?: string | null;
  signLabel?: string;
  children: ReactNode;
  /** data-* attributes for the dialog. */
  data?: Record<string, string>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [signInView, setSignInView] = useState(true);

  // Escape closes; the page under it stays put; focus comes back after.
  useEffect(() => {
    if (!open) return;
    const back = window.document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.document.body.style.overflow = overflow;
      back?.focus?.({ preventScroll: true });
    };
  }, [open, busy, onClose]);

  // The floating "Sign" shows while the place to sign is out of sight.
  useEffect(() => {
    if (!open || !signPlaceId) {
      setSignInView(true);
      return;
    }
    let observer: IntersectionObserver | null = null;
    const frame = window.requestAnimationFrame(() => {
      const target = window.document.getElementById(signPlaceId);
      if (!target || !scrollRef.current) return;
      observer = new IntersectionObserver(([entry]) => setSignInView(entry.isIntersecting), { root: scrollRef.current, threshold: 0.15 });
      observer.observe(target);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [open, signPlaceId]);

  if (!open) return null;

  const goToSign = () => {
    if (signPlaceId) goToSignPlace(signPlaceId);
  };

  return createPortal(
    <div className="ck-modal fixed inset-0 z-[60] flex items-stretch justify-center">
      <div
        className="absolute inset-0"
        style={{ background: "color-mix(in srgb, var(--hf-bg) 84%, transparent)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", animation: "hf-scrim-in 220ms ease both" }}
        onClick={() => !busy && onClose()}
      />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="hf-paper-desk relative flex h-full w-full flex-col" {...data}>
        <header className="relative z-[2] shrink-0 px-4 pb-2 pt-5 sm:px-8 sm:pb-3 sm:pt-6">
          <div className="mx-auto flex w-full max-w-[880px] items-start gap-3">
            <div className="min-w-0 flex-1">
              {eyebrow && (
                <div className="text-[12px] font-medium" style={{ color: "var(--ink-3)" }}>
                  {eyebrow}
                </div>
              )}
              <h2 id={titleId} className="truncate font-display text-[21px] leading-tight sm:text-[26px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
                {title}
              </h2>
              {status && <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">{status}</div>}
            </div>
            {aside && <div className="hidden shrink-0 pt-1.5 sm:block">{aside}</div>}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              disabled={busy}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-40"
              style={{ background: "color-mix(in srgb, var(--surface) 78%, transparent)", color: "var(--hf-text)", boxShadow: "var(--shadow-sm)" }}
              aria-label="Close"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>
        <div
          ref={scrollRef}
          className="ck-scroll hf-paper-scroll min-h-0 flex-1 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) onClose();
          }}
        >
          <div className="mx-auto w-full max-w-[880px] px-3 pb-[calc(env(safe-area-inset-bottom,0px)+120px)] pt-3 sm:px-8 sm:pt-4">
            {aside && <div className="mb-3 flex justify-end sm:hidden">{aside}</div>}
            {children}
          </div>
        </div>
        {signPlaceId && !signInView && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] z-[3] flex justify-center">
            <button
              type="button"
              onClick={goToSign}
              className="ck-btn ck-btn-primary pointer-events-auto !rounded-full !px-6 !py-3 !text-[15px]"
              style={{ boxShadow: "var(--shadow-xl)", animation: "ck-rise 0.28s cubic-bezier(0.22,1,0.36,1) both" }}
              data-paper-go-to-sign
            >
              {signLabel}
              <ArrowDown className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>,
    window.document.body,
  );
}
