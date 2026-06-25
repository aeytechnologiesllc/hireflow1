import {
  Users,
  Mail,
  Eye,
  UserPlus,
  MoreHorizontal,
  MoreVertical,
  Briefcase,
  Sparkles,
  CalendarDays,
  FileText,
  Check,
  Minus,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { CkAvatar } from "../components/Avatar";
import { useCockpitTeam } from "../hooks/useCockpitData";

const ROW_ICONS = { briefcase: Briefcase, sparkle: Sparkles, calendar: CalendarDays, doc: FileText, users: Users };

function TeamKpi({ k }: { k: ReturnType<typeof useCockpitTeam>["team"]["kpis"][number] }) {
  const Icon = k.icon === "users" ? Users : k.icon === "mail" ? Mail : Eye;
  const dotColor = k.dot === "jade" ? "hsl(152 50% 52%)" : k.dot === "brass" ? "hsl(38 64% 64%)" : "hsl(150 10% 52%)";
  return (
    <div className="ck-card flex items-center gap-4 p-5">
      <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ border: "1px solid hsl(152 30% 28% / 0.5)", color: "hsl(152 46% 60%)", background: "hsl(152 40% 18% / 0.2)" }}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-[13px]" style={{ color: "hsl(150 10% 60%)" }}>{k.label}</div>
        <div className="ck-num leading-none" style={{ fontSize: 32, color: "hsl(150 30% 93%)" }}>{k.value}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: "hsl(150 10% 56%)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
          {k.note}
        </div>
      </div>
    </div>
  );
}

export default function CockpitTeam() {
  const { team, isLoading } = useCockpitTeam();

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(152_46%_50%)] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team"
        subtitle="Manage who can help with hiring."
        actions={<button className="ck-btn ck-btn-brass max-md:w-full"><UserPlus className="h-4 w-4" />Invite teammate</button>}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {team.kpis.map((k) => <TeamKpi key={k.label} k={k} />)}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* left column */}
        <div className="space-y-5">
          {/* members */}
          <div className="ck-card p-5">
            <div className="font-display text-[18px]" style={{ color: "hsl(150 30% 92%)", fontWeight: 500 }}>Team members</div>
            <div className="mt-4 hidden grid-cols-[2fr_1fr_1.4fr_1fr] gap-2 text-[12px] md:grid" style={{ color: "hsl(150 10% 54%)" }}>
              <div>Member</div><div>Role</div><div>Permissions</div><div>Status</div>
            </div>
            <div className="mt-1">
              {team.members.map((m) => (
                <div key={m.id} className="grid grid-cols-[1.4fr_auto] items-center gap-2 py-3 md:grid-cols-[2fr_1fr_1.4fr_1fr]" style={{ borderTop: "1px solid hsl(150 12% 13% / 0.6)" }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CkAvatar who={m.avatar} size={36} />
                    <div className="min-w-0"><div className="truncate text-[13.5px] font-semibold" style={{ color: "hsl(150 28% 89%)" }}>{m.name}</div><div className="truncate text-[11.5px]" style={{ color: "hsl(150 10% 52%)" }}>{m.email}</div></div>
                  </div>
                  <div className="hidden text-[13px] md:block" style={{ color: "hsl(150 16% 70%)" }}>{m.role}</div>
                  <div className="hidden md:block">
                    <span className="ck-pill" style={m.permissionTone === "jade" ? { color: "hsl(152 50% 62%)", background: "hsl(152 46% 40% / 0.14)", borderColor: "hsl(152 46% 45% / 0.25)" } : { color: "hsl(150 16% 72%)", background: "hsl(150 10% 30% / 0.2)", borderColor: "hsl(150 10% 40% / 0.25)" }}>{m.permission}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2 md:justify-between">
                    <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "hsl(150 16% 72%)" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: "hsl(152 50% 52%)" }} />Active</span>
                    <button style={{ color: "hsl(150 10% 52%)" }}><MoreHorizontal className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* pending invites */}
          <div className="ck-card p-5">
            <div className="font-display text-[18px]" style={{ color: "hsl(150 30% 92%)", fontWeight: 500 }}>Pending invites</div>
            <div className="mt-4 hidden grid-cols-[2fr_1.2fr_1fr_1fr_1fr_auto] gap-2 text-[12px] md:grid" style={{ color: "hsl(150 10% 54%)" }}>
              <div>Invitee</div><div>Invited by</div><div>Role</div><div>Status</div><div>Expires</div><div />
            </div>
            <div className="mt-1">
              {team.invites.map((inv) => (
                <div key={inv.id} className="grid grid-cols-[1.6fr_auto] items-center gap-2 py-3 md:grid-cols-[2fr_1.2fr_1fr_1fr_1fr_auto]" style={{ borderTop: "1px solid hsl(150 12% 13% / 0.6)" }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CkAvatar who={null} initials={inv.initials} size={36} />
                    <div className="min-w-0"><div className="truncate text-[13.5px] font-semibold" style={{ color: "hsl(150 28% 89%)" }}>{inv.name}</div><div className="truncate text-[11.5px]" style={{ color: "hsl(150 10% 52%)" }}>{inv.email}</div></div>
                  </div>
                  <div className="hidden text-[12.5px] md:block" style={{ color: "hsl(150 14% 66%)" }}>{inv.invitedBy}</div>
                  <div className="hidden text-[12.5px] md:block" style={{ color: "hsl(150 14% 66%)" }}>{inv.role}</div>
                  <div className="hidden md:block"><span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "hsl(38 60% 66%)" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: "hsl(38 64% 62%)" }} />Invited</span></div>
                  <div className="hidden text-[12.5px] md:block" style={{ color: "hsl(150 14% 66%)" }}>{inv.expires}</div>
                  <button className="justify-self-end" style={{ color: "hsl(150 10% 52%)" }}><MoreVertical className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[12px]" style={{ color: "hsl(150 10% 50%)" }}>Showing 2 of 2 pending invites</div>
          </div>
        </div>

        {/* right: permissions matrix */}
        <div className="ck-card p-5">
          <div className="font-display text-[18px]" style={{ color: "hsl(150 30% 92%)", fontWeight: 500 }}>Permissions at a glance</div>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "hsl(150 10% 56%)" }}>See what each role can do in Hireflow.</p>

          <div className="ck-scroll mt-4 overflow-x-auto">
            <div style={{ minWidth: 520 }}>
              <div className="grid items-end gap-2 pb-3" style={{ gridTemplateColumns: "1.6fr repeat(5, 1fr)", borderBottom: "1px solid hsl(150 12% 14%)" }}>
                <div className="text-[12px]" style={{ color: "hsl(150 10% 54%)" }}>Permissions</div>
                {team.permissionCols.map((c) => (
                  <div key={c.title} className="text-center">
                    <div className="text-[12px] font-semibold" style={{ color: "hsl(150 24% 84%)" }}>{c.title}</div>
                    <div className="text-[10.5px] leading-tight" style={{ color: "hsl(150 10% 50%)", whiteSpace: "pre-line" }}>{c.sub}</div>
                  </div>
                ))}
              </div>
              {team.permissionRows.map((row) => {
                const Icon = ROW_ICONS[row.icon];
                return (
                  <div key={row.label} className="grid items-center gap-2 py-3" style={{ gridTemplateColumns: "1.6fr repeat(5, 1fr)", borderBottom: "1px solid hsl(150 12% 12% / 0.6)" }}>
                    <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "hsl(150 20% 80%)" }}>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "hsl(152 28% 13%)", color: "hsl(152 46% 58%)" }}><Icon className="h-3.5 w-3.5" /></span>
                      {row.label}
                    </div>
                    {row.allow.map((a, i) => (
                      <div key={i} className="flex justify-center">
                        {a ? <Check className="h-4 w-4" style={{ color: "hsl(152 50% 56%)" }} /> : <Minus className="h-4 w-4" style={{ color: "hsl(150 10% 38%)" }} />}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ck-inset mt-4 flex items-start gap-2.5 p-3.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "hsl(152 46% 58%)" }} />
            <p className="text-[12.5px]" style={{ color: "hsl(150 12% 62%)" }}>Owner (Full Admin) has all permissions and can manage billing, team access, and organization settings.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
