import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  SlidersHorizontal,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  CheckCheck,
  Paperclip,
  Smile,
  Sparkles,
  CalendarCheck,
  Clock,
  FileText,
  UserRound,
  Star,
  ChevronLeft,
  ListFilter,
} from "lucide-react";
import AvaOrb from "@/components/ava/AvaOrb";
import { PageHeader } from "../components/PageHeader";
import { CandidateMark } from "../components/CandidateMark";
import { useCockpitMessages, useCockpitAccount, useCockpitCandidates } from "../hooks/useCockpitData";
import { getInitials } from "../lib/mappers";

const QUICK_ICONS = [CalendarCheck, Clock, FileText];
const QUICK_REPLIES = ["Confirm interview", "Ask availability", "Send documents"];

function ConversationList({
  activeId,
  onPick,
  conversations,
  accountName,
}: {
  activeId: string;
  onPick: (id: string) => void;
  conversations: ReturnType<typeof useCockpitMessages>["conversations"];
  accountName: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pt-3 md:hidden">
        <h1 className="font-display text-[24px]" style={{ color: "hsl(150 32% 95%)", fontWeight: 500 }}>Messages</h1>
        <button
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
          style={{ background: "hsl(156 16% 9% / 0.8)", border: "1px solid hsl(150 12% 16% / 0.9)", color: "hsl(150 28% 88%)" }}
        >
          <span className="text-[12.5px] font-medium">{accountName}</span>
          <ChevronDown className="h-3.5 w-3.5" style={{ color: "hsl(150 10% 58%)" }} />
        </button>
      </div>
      <div className="flex items-center gap-2 p-3">
        <div className="ck-input flex h-9 flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4" style={{ color: "hsl(150 10% 55%)" }} />
          <input placeholder="Search messages…" className="w-full bg-transparent text-[13px] outline-none" style={{ color: "hsl(150 28% 90%)" }} />
        </div>
        <button className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ border: "1px solid hsl(150 12% 16%)", color: "hsl(150 12% 60%)" }}>
          <SlidersHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="ck-scroll flex-1 overflow-y-auto px-2">
        {conversations.length === 0 ? (
          <p className="p-4 text-center text-[13px]" style={{ color: "hsl(150 10% 56%)" }}>No conversations yet.</p>
        ) : (
          conversations.map((c) => {
            const active = c.id === activeId;
            return (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                className="mb-1 flex w-full items-start gap-3 rounded-xl p-3 text-left"
                style={active ? { background: "hsl(156 18% 11%)", boxShadow: "inset 2px 0 0 hsl(152 46% 50%)" } : undefined}
              >
                <CandidateMark who={c.avatar} initials={getInitials(c.name)} size={42} variant="calm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold" style={{ color: "hsl(150 30% 91%)" }}>{c.name}</span>
                    <span className="shrink-0 text-[11px]" style={{ color: "hsl(150 10% 50%)" }}>{c.time}</span>
                  </div>
                  <div className="text-[12px]" style={{ color: "hsl(150 10% 54%)" }}>{c.role}</div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="truncate text-[12.5px]" style={{ color: "hsl(150 12% 60%)" }}>{c.preview}</span>
                    {c.unread ? (
                      <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold" style={{ background: "hsl(152 46% 42%)", color: "hsl(150 30% 96%)" }}>{c.unread}</span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Thread({
  contactId,
  contactName,
  contactRole,
  thread,
  accountInitials,
  onBack,
  onSend,
}: {
  contactId: string;
  contactName: string;
  contactRole: string;
  thread: ReturnType<typeof useCockpitMessages>["thread"];
  accountInitials: string;
  onBack?: () => void;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 p-3" style={{ borderBottom: "1px solid hsl(150 12% 13%)" }}>
        {onBack && (
          <>
            <button className="md:hidden" onClick={onBack} style={{ color: "hsl(150 20% 78%)" }}><ChevronLeft className="h-5 w-5" /></button>
            <button className="md:hidden" onClick={onBack} style={{ color: "hsl(150 14% 60%)" }}><ListFilter className="h-[18px] w-[18px]" /></button>
          </>
        )}
        <CandidateMark who={contactId} initials={getInitials(contactName)} size={38} variant="quiet" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px]">
            <span className="font-semibold" style={{ color: "hsl(150 30% 92%)" }}>{contactName}</span>
            <span className="hidden md:inline" style={{ color: "hsl(150 12% 62%)" }}> · {contactRole}</span>
          </div>
        </div>
        <button className="hidden md:block" style={{ color: "hsl(150 10% 56%)" }}><MoreVertical className="h-4 w-4" /></button>
      </div>

      <div className="ck-scroll flex-1 space-y-4 overflow-y-auto p-4">
        <div className="text-center text-[12px]" style={{ color: "hsl(150 10% 48%)" }}>Conversation</div>
        {thread.map((m) =>
          m.from === "them" ? (
            <div key={m.id} className="flex items-end gap-2">
              <div className="max-w-[78%] rounded-2xl rounded-bl-sm px-3.5 py-2.5" style={{ background: "hsl(156 16% 12%)" }}>
                <p className="text-[13.5px]" style={{ color: "hsl(150 24% 86%)" }}>{m.text}</p>
                <div className="mt-1 text-[10.5px]" style={{ color: "hsl(150 10% 48%)" }}>{m.time}</div>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex items-end justify-end gap-2">
              <div className="max-w-[78%] rounded-2xl rounded-br-sm px-3.5 py-2.5" style={{ background: "hsl(152 26% 16%)" }}>
                <p className="text-[13.5px]" style={{ color: "hsl(150 26% 88%)" }}>{m.text}</p>
                <div className="mt-1 flex items-center justify-end gap-1 text-[10.5px]" style={{ color: "hsl(150 12% 54%)" }}>
                  {m.time}<CheckCheck className="h-3 w-3" style={{ color: "hsl(152 50% 56%)" }} />
                </div>
              </div>
              <span className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "hsl(45 30% 80%)", color: "hsl(150 30% 14%)" }}>{accountInitials}</span>
            </div>
          )
        )}
      </div>

      <div className="p-3" style={{ borderTop: "1px solid hsl(150 12% 13%)" }}>
        <div className="mb-2 text-[12px]" style={{ color: "hsl(150 10% 54%)" }}>Quick replies</div>
        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_REPLIES.map((q, i) => {
            const Icon = QUICK_ICONS[i % QUICK_ICONS.length];
            return (
              <button
                key={q}
                type="button"
                onClick={() => setDraft(q)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px]"
                style={{ border: "1px solid hsl(150 12% 16%)", color: "hsl(150 18% 74%)" }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: "hsl(150 12% 56%)" }} />{q}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" style={{ color: "hsl(150 10% 54%)" }}><Paperclip className="h-4 w-4" /></button>
          <div className="ck-input flex h-10 flex-1 items-center gap-2 px-3">
            <input
              placeholder="Write a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
              className="w-full bg-transparent text-[13.5px] outline-none"
              style={{ color: "hsl(150 28% 90%)" }}
            />
            <Smile className="h-4 w-4" style={{ color: "hsl(150 10% 54%)" }} />
          </div>
          <button type="button" className="ck-btn ck-btn-brass !px-5" onClick={handleSend}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default function CockpitMessages() {
  const [searchParams] = useSearchParams();
  const candidateParam = searchParams.get("candidate");
  const { account } = useCockpitAccount();
  const { candidates } = useCockpitCandidates();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"thread" | "list">("thread");

  const contactId = activeId;
  const { conversations, thread, rawThread, send, markRead, isLoading } = useCockpitMessages(contactId);

  useEffect(() => {
    if (candidateParam) setActiveId(candidateParam);
    else if (!activeId && conversations[0]) setActiveId(conversations[0].id);
  }, [candidateParam, conversations, activeId]);

  useEffect(() => {
    const unread = rawThread.filter((m) => !m.is_read).map((m) => m.id);
    if (unread.length) void markRead(unread);
  }, [rawThread, markRead]);

  const activeConv = conversations.find((c) => c.id === contactId);
  const activeCandidate = candidates.find((c) => c.avatar === contactId);

  if (isLoading && !conversations.length) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(152_46%_50%)] border-t-transparent" /></div>;
  }

  const handleSend = (text: string) => {
    if (!contactId) return;
    void send(text, contactId);
  };

  return (
    <div className="space-y-4">
      <div className="hidden md:block"><PageHeader title="Messages" /></div>

      <div
        className="ck-card hidden overflow-hidden md:grid"
        style={{ gridTemplateColumns: "300px 1fr 280px", height: "calc(100dvh - 168px)" }}
      >
        <div style={{ borderRight: "1px solid hsl(150 12% 13%)" }}>
          <ConversationList activeId={contactId ?? ""} onPick={setActiveId} conversations={conversations} accountName={account.name} />
        </div>
        {contactId && activeConv ? (
          <Thread
            contactId={contactId}
            contactName={activeConv.name}
            contactRole={activeConv.role}
            thread={thread}
            accountInitials={account.initials}
            onSend={handleSend}
          />
        ) : (
          <div className="flex items-center justify-center text-[13px]" style={{ color: "hsl(150 10% 56%)" }}>Select a conversation</div>
        )}
        <div style={{ borderLeft: "1px solid hsl(150 12% 13%)" }} className="p-4">
          <div className="flex justify-center"><AvaOrb size={100} reflection={false} amp={0.22} flow={0.5} /></div>
          {activeCandidate && (
            <p className="mt-3 text-[12.5px]" style={{ color: "hsl(150 12% 62%)" }}>
              {activeCandidate.name} · {activeCandidate.stage} · {activeCandidate.overall}% match
            </p>
          )}
        </div>
      </div>

      <div className="ck-card -mt-1 overflow-hidden md:hidden" style={{ height: "calc(100dvh - 92px)" }}>
        {mobileView === "list" ? (
          <ConversationList
            activeId={contactId ?? ""}
            onPick={(id) => { setActiveId(id); setMobileView("thread"); }}
            conversations={conversations}
            accountName={account.name}
          />
        ) : contactId && activeConv ? (
          <Thread
            contactId={contactId}
            contactName={activeConv.name}
            contactRole={activeConv.role}
            thread={thread}
            accountInitials={account.initials}
            onBack={() => setMobileView("list")}
            onSend={handleSend}
          />
        ) : null}
      </div>
    </div>
  );
}
