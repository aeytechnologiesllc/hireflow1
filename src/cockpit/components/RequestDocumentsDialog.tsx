import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useOfferPeople, type OfferPerson } from "../hooks/useOfferLetter";
import { useApplicantRequests, useSendRequests, type NewRequest } from "../hooks/useApplicantRequests";
import { DUE_CHOICES, ID_KEEP_DAYS, REQUEST_KINDS } from "@/lib/documentRequests";
import { addDays, dayOf, longDate } from "../lib/offerLetter";

/**
 * Ask an applicant for documents (src/lib/documentRequests.ts;
 * docs/DOCUMENT-REQUESTS.md).
 *
 * The owner, 2026-10-10: "how do I ask them for things like their driver
 * license or a government ID? And banking information for salary ... have it
 * encrypted in some way?" A short Philippines-first list to tick, a "something
 * else", a due date and a note; beside it, what the applicant will be asked.
 * No bank account numbers: they give the email they use on Wise or PayPal.
 *
 * It emails the applicant, so the button is pressed twice, like the offer
 * letter. Portalled to <body> like the cockpit's other dialogs.
 */

const INPUT = "ck-input w-full px-3 py-2 !text-[16px] md:!text-[14px]";
const STAGE_WORDS: Record<string, string> = { hired: "Hired", offered: "Offer out", interview: "Interviewed", reviewing: "In review" };
/** Documents are usually asked for once someone is offered or hired; earlier stages can be searched. */
const REQUEST_STAGES = ["offered", "hired", "interview", "reviewing"] as const;

export function RequestDocumentsDialog({ open, applicationId, onClose }: { open: boolean; applicationId?: string | null; onClose: () => void }) {
  const { data: people = [], isLoading } = useOfferPeople(open, REQUEST_STAGES);
  const send = useSendRequests();
  const today = useMemo(() => dayOf(new Date()), []);

  const [pickedId, setPickedId] = useState<string | null>(applicationId ?? null);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [dueDays, setDueDays] = useState<number>(5);
  const [note, setNote] = useState("");
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (open) setPickedId(applicationId ?? null);
  }, [open, applicationId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !send.isPending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, send.isPending]);

  const person: OfferPerson | null = people.find((p) => p.applicationId === pickedId) ?? null;
  // What is already asked and not yet approved cannot be asked twice.
  const { data: existing = [] } = useApplicantRequests(open ? person?.applicationId : null);
  const openKinds = useMemo(() => new Set(existing.filter((r) => r.status !== "approved").map((r) => r.document_type)), [existing]);
  const first = person?.name.trim().split(/\s+/)[0] || "them";
  const dueDate = addDays(today, dueDays);

  const items: NewRequest[] = useMemo(() => {
    const chosen: NewRequest[] = REQUEST_KINDS.filter((k) => picked.includes(k.key) && !openKinds.has(k.key)).map((k) => ({ documentType: k.key, ask: k.ask }));
    if (other.trim()) chosen.push({ documentType: "custom", customName: other.trim().slice(0, 80), ask: "" });
    return chosen;
  }, [picked, other, openKinds]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? people.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)) : people;
    return list.slice(0, 8);
  }, [people, search]);

  if (!open) return null;

  const toggle = (key: string) => {
    setPicked((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));
    setArmed(false);
  };
  const busy = send.isPending;
  const count = items.length;
  const armWords = count === 0 ? "Choose what to ask for" : `Request ${count === 1 ? "1 document" : `${count} documents`}`;

  const run = async () => {
    if (!person || count === 0) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    try {
      await send.mutateAsync({ applicationId: person.applicationId, candidateId: person.candidateId, items, note, dueDate: new Date(`${dueDate}T23:59:59`).toISOString() });
      toast.success(`Request sent to ${first}`, { description: `They have until ${longDate(dueDate)}. You will see what they send on their page.` });
      setPicked([]);
      setOther("");
      setNote("");
      setArmed(false);
      onClose();
    } catch (error) {
      setArmed(false);
      toast.error("The request was not sent", { description: (error as Error).message });
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-4">
      <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--hf-bg) 70%, transparent)", backdropFilter: "blur(2px)" }} onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ck-request-title"
        data-request-documents
        className="ck-card relative flex max-h-[calc(100dvh-24px)] w-full max-w-[860px] flex-col p-0"
        style={{ animation: "ck-rise 0.22s cubic-bezier(0.4,0,0.2,1) both" }}
      >
        <div className="border-b px-5 pb-3.5 pt-5" style={{ borderColor: "var(--line)" }}>
          <button onClick={onClose} disabled={busy} className="absolute right-3 top-3 p-1 disabled:opacity-40" style={{ color: "var(--hf-text-muted)" }} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
          <h2 id="ck-request-title" className="pr-8 font-display text-[19px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>
            Request documents
          </h2>
          <p className="mt-0.5 pr-8 text-[13px]" style={{ color: "var(--hf-text-soft)" }}>
            Tick what you need. They send it from their phone, and you see it on their page.
          </p>
        </div>

        <div className="ck-scroll grid min-h-0 flex-1 gap-x-6 gap-y-5 overflow-y-auto px-5 pb-5 pt-4 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            {person ? (
              <div className="flex items-center gap-3 rounded-[12px] border px-3 py-2.5" style={{ borderColor: "var(--line)", background: "var(--surface-2)" }} data-request-person>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>
                    {person.name}
                  </div>
                  <div className="truncate text-[12px]" style={{ color: "var(--ink-3)" }}>
                    {[STAGE_WORDS[person.status], person.jobTitle].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {!applicationId && (
                  <button type="button" className="ck-btn ck-btn-ghost !px-2 !py-1.5 !text-[12.5px]" disabled={busy} onClick={() => setPickedId(null)}>
                    Change
                  </button>
                )}
              </div>
            ) : (
              <div>
                <label htmlFor="ck-request-search" className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>
                  Who is it for?
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--ink-3)" }} aria-hidden />
                  <input id="ck-request-search" className={`${INPUT} !pl-9`} placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
                </div>
                <ul className="mt-2 overflow-hidden rounded-[12px] border" style={{ borderColor: "var(--line)" }}>
                  {isLoading && <li className="px-3 py-3 text-[13px]" style={{ color: "var(--ink-3)" }}>Loading your applicants...</li>}
                  {!isLoading && matches.length === 0 && <li className="px-3 py-3 text-[13px]" style={{ color: "var(--ink-3)" }}>Nobody in review, at interview, offered or hired yet.</li>}
                  {matches.map((p, i) => (
                    <li key={p.applicationId} className={i > 0 ? "border-t" : ""} style={{ borderColor: "var(--line)" }}>
                      <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-2)]" onClick={() => setPickedId(p.applicationId)} data-request-option>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium" style={{ color: "var(--hf-text)" }}>{p.name}</span>
                          <span className="block truncate text-[12px]" style={{ color: "var(--ink-3)" }}>{p.jobTitle}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {person && (
              <>
                <fieldset className="flex flex-col gap-2" data-request-kinds>
                  <legend className="mb-1.5 text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>
                    What do you need?
                  </legend>
                  {REQUEST_KINDS.map((kind) => {
                    const asked = openKinds.has(kind.key);
                    const on = !asked && picked.includes(kind.key);
                    return (
                      <label
                        key={kind.key}
                        htmlFor={`ck-request-${kind.key}`}
                        className={`flex items-start gap-3 rounded-[12px] border px-3 py-2.5 transition-colors ${asked ? "cursor-default opacity-60" : "cursor-pointer"}`}
                        style={{ borderColor: on ? "var(--jade)" : "var(--line)", background: on ? "var(--jade-soft)" : "transparent" }}
                        data-request-kind={kind.key}
                        data-already-asked={asked ? "" : undefined}
                      >
                        <input id={`ck-request-${kind.key}`} type="checkbox" className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--jade)]" checked={on} disabled={busy || asked} onChange={() => toggle(kind.key)} />
                        <span className="min-w-0">
                          <span className="block text-[14px] font-medium" style={{ color: "var(--hf-text)" }}>
                            {kind.label}
                            <span className="ml-2 text-[11.5px] font-normal" style={{ color: "var(--ink-3)" }}>
                              {asked ? "already asked" : kind.answer === "text" ? "they type it" : "photo or PDF"}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: "var(--ink-3)" }}>
                            {kind.ask}
                          </span>
                          {kind.deleteAfterDays !== null && (
                            <span className="mt-1 block text-[11.5px] leading-snug" style={{ color: "var(--jade-soft-fg)" }}>
                              Deleted {ID_KEEP_DAYS} days after you approve it.
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                  <div className="rounded-[12px] border px-3 py-2.5" style={{ borderColor: other.trim() ? "var(--jade)" : "var(--line)" }}>
                    <label htmlFor="ck-request-other" className="block text-[14px] font-medium" style={{ color: "var(--hf-text)" }}>
                      Something else
                      <span className="ml-2 text-[11.5px] font-normal" style={{ color: "var(--ink-3)" }}>optional, a photo or PDF</span>
                    </label>
                    <input id="ck-request-other" className={`${INPUT} mt-1.5`} value={other} maxLength={80} disabled={busy} placeholder="A signed copy of the house rules" onChange={(e) => { setOther(e.target.value); setArmed(false); }} autoComplete="off" />
                  </div>
                </fieldset>

                <div>
                  <div className="mb-1 text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>Due in</div>
                  <div role="radiogroup" aria-label="Due in" className="inline-flex w-full rounded-[10px] p-[3px]" style={{ background: "var(--surface-2)" }}>
                    {DUE_CHOICES.map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={dueDays === d}
                        disabled={busy}
                        onClick={() => { setDueDays(d); setArmed(false); }}
                        className="min-w-0 flex-1 rounded-[8px] px-2 py-1.5 text-[13px]"
                        style={dueDays === d ? { background: "var(--hf-surface)", color: "var(--hf-text)", fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,0.12)" } : { color: "var(--ink-2)" }}
                      >
                        {d} days
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[12px]" style={{ color: "var(--ink-3)" }}>By {longDate(dueDate)}.</p>
                </div>

                <div>
                  <label htmlFor="ck-request-note" className="mb-1 block text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>
                    A note <span className="font-normal" style={{ color: "var(--ink-3)" }}>optional</span>
                  </label>
                  <textarea id="ck-request-note" className={`${INPUT} min-h-[64px] resize-y leading-snug`} value={note} maxLength={300} disabled={busy} placeholder="Before your first day, please send these." onChange={(e) => { setNote(e.target.value); setArmed(false); }} />
                </div>
              </>
            )}
          </div>

          <div className="min-w-0 md:sticky md:top-0 md:self-start">
            <div className="mb-1.5 text-[12.5px] font-semibold" style={{ color: "var(--hf-text)" }}>What {first} will be asked</div>
            <div className="rounded-[12px] border px-4 py-4 text-[13.5px] leading-[1.55]" style={{ borderColor: "var(--line)", background: "var(--hf-surface)", color: "var(--hf-text)", opacity: person ? 1 : 0.55 }} data-request-preview>
              {count === 0 ? (
                <p style={{ color: "var(--ink-3)" }}>Tick what you need, and it shows here as they will see it.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {items.map((item) => (
                    <li key={`${item.documentType}:${item.customName ?? ""}`}>
                      <div className="font-semibold">{item.customName || REQUEST_KINDS.find((k) => k.key === item.documentType)?.label}</div>
                      {item.ask && <div style={{ color: "var(--ink-2)" }}>{item.ask}</div>}
                    </li>
                  ))}
                  {note.trim() && <li style={{ color: "var(--ink-2)" }}>{note.trim()}</li>}
                  <li className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>Due {longDate(dueDate)}.</li>
                </ul>
              )}
            </div>
            <div className="mt-3 flex gap-2.5 rounded-[12px] px-3 py-2.5 text-[12.5px] leading-snug" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}>
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>Files are private: only you and {first} can open them, through a link that lasts five minutes, and every opening is recorded. IDs are deleted {ID_KEEP_DAYS} days after you approve them. Never ask for bank account numbers here; the payment email is enough to pay them on Wise or PayPal.</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3" style={{ borderColor: "var(--line)" }}>
          <span className="min-w-0 flex-1 text-[12px] leading-snug" style={{ color: "var(--ink-3)" }} role="status">
            {busy ? "Sending. Keep this open." : armed ? `This emails ${first} and adds it to their documents.` : "Nothing is sent until you confirm."}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button type="button" className="ck-btn ck-btn-ghost !py-2 !text-[13px]" onClick={armed && !busy ? () => setArmed(false) : onClose} disabled={busy}>
              {armed && !busy ? "Back" : "Cancel"}
            </button>
            <button type="button" className={`ck-btn !py-2 !text-[13px] ${armed || busy ? "ck-btn-primary" : "ck-btn-outline"}`} onClick={() => void run()} disabled={busy || !person || count === 0} data-request-send={armed ? "armed" : "idle"}>
              {busy ? "Sending..." : armed ? "Yes, send the request" : armWords}
            </button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
