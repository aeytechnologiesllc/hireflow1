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
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "../components/PageHeader";
import { CkAvatar } from "../components/Avatar";
import { ActionDialog } from "../components/ActionDialog";
import { useCockpitTeam } from "../hooks/useCockpitData";
import { useDeleteTeamMember } from "@/hooks/useTeamMembers";
import { useDeleteInvitation } from "@/hooks/useTeam";
import { TeamInviteWizard } from "@/components/team/TeamInviteWizard";

const ROW_ICONS = { briefcase: Briefcase, sparkle: Sparkles, calendar: CalendarDays, doc: FileText, users: Users };

function TeamKpi({ k }: { k: ReturnType<typeof useCockpitTeam>["team"]["kpis"][number] }) {
  const Icon = k.icon === "users" ? Users : k.icon === "mail" ? Mail : Eye;
  const dotColor = k.dot === "jade" ? "var(--hf-green)" : k.dot === "brass" ? "var(--hf-gold)" : "var(--hf-text-muted)";
  return (
    <div className="ck-card flex items-center gap-4 p-5">
      <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ border: "1px solid color-mix(in srgb, var(--hf-green-border) 50%, transparent)", color: "var(--hf-green)", background: "color-mix(in srgb, var(--hf-green-soft) 20%, transparent)" }}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-[13px]" style={{ color: "var(--hf-text-muted)" }}>{k.label}</div>
        <div className="ck-num leading-none" style={{ fontSize: 32, color: "var(--hf-text)" }}>{k.value}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--hf-text-muted)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />
          {k.note}
        </div>
      </div>
    </div>
  );
}

export default function CockpitTeam() {
  const { team, isLoading } = useCockpitTeam();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "member" | "invite"; id: string; name: string } | null>(null);
  const queryClient = useQueryClient();
  const deleteMember = useDeleteTeamMember();
  const deleteInvite = useDeleteInvitation();
  const onInviteSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["team-invitations"] });
    queryClient.invalidateQueries({ queryKey: ["team-members"] });
  };
  const confirmRemoval = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === "member") {
        await deleteMember.mutateAsync(confirm.id);
        toast.success("Team member removed");
      } else {
        await deleteInvite.mutateAsync(confirm.id);
        toast.success("Invite revoked");
      }
    } catch {
      toast.error("Could not complete that action");
    }
    setConfirm(null);
  };

  if (isLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--hf-green)] border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Team"
        subtitle="Manage who can help with hiring."
        actions={<button className="ck-btn ck-btn-primary max-md:w-full" onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4" />Invite teammate</button>}
      />
      <TeamInviteWizard open={inviteOpen} onOpenChange={setInviteOpen} onSuccess={onInviteSuccess} />
      <ActionDialog
        open={!!confirm}
        title={confirm?.kind === "member" ? `Remove ${confirm?.name}?` : `Revoke invite to ${confirm?.name}?`}
        description={confirm?.kind === "member"
          ? "They will immediately lose access to your hiring workspace."
          : "The invite link will stop working. You can always invite them again later."}
        confirmLabel={confirm?.kind === "member" ? "Remove member" : "Revoke invite"}
        tone="danger"
        busy={deleteMember.isPending || deleteInvite.isPending}
        onConfirm={() => void confirmRemoval()}
        onClose={() => setConfirm(null)}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {team.kpis.map((k) => <TeamKpi key={k.label} k={k} />)}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* left column */}
        <div className="space-y-5">
          {/* members */}
          <div className="ck-card p-5">
            <div className="font-display text-[18px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>Team members</div>
            <div className="mt-4 hidden grid-cols-[2fr_1fr_1.4fr_1fr] gap-2 text-[12px] md:grid" style={{ color: "var(--hf-text-muted)" }}>
              <div>Member</div><div>Role</div><div>Permissions</div><div>Status</div>
            </div>
            <div className="mt-1">
              {team.members.map((m) => (
                <div key={m.id} className="grid grid-cols-[1.4fr_auto] items-center gap-2 py-3 md:grid-cols-[2fr_1fr_1.4fr_1fr]" style={{ borderTop: "1px solid color-mix(in srgb, var(--hf-surface-raised) 60%, transparent)" }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CkAvatar who={m.avatar} size={36} />
                    <div className="min-w-0"><div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--hf-text)" }}>{m.name}</div><div className="truncate text-[11.5px]" style={{ color: "var(--hf-text-muted)" }}>{m.email}</div></div>
                  </div>
                  <div className="hidden text-[13px] md:block" style={{ color: "var(--hf-text-soft)" }}>{m.role}</div>
                  <div className="hidden md:block">
                    <span className="ck-pill" style={m.permissionTone === "jade" ? { color: "var(--hf-text-soft)", background: "color-mix(in srgb, var(--hf-green) 14%, transparent)", borderColor: "color-mix(in srgb, var(--hf-green) 25%, transparent)" } : { color: "var(--hf-text-soft)", background: "color-mix(in srgb, var(--hf-text-muted) 20%, transparent)", borderColor: "color-mix(in srgb, var(--hf-text-muted) 25%, transparent)" }}>{m.permission}</span>
                  </div>
                  <div className="relative flex items-center justify-end gap-2 md:justify-between">
                    <span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--hf-text-soft)" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--hf-green)" }} />Active</span>
                    <button style={{ color: "var(--hf-text-muted)" }} onClick={() => setMenuId(menuId === `m-${m.id}` ? null : `m-${m.id}`)}><MoreHorizontal className="h-4 w-4" /></button>
                    {menuId === `m-${m.id}` && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuId(null)} />
                        <div className="absolute right-0 top-8 z-50 min-w-[170px] overflow-hidden rounded-xl py-1" style={{ background: "var(--hf-surface-raised)", border: "1px solid var(--hf-border-strong)", boxShadow: "0 16px 40px hsl(0 0% 0% / 0.5)" }}>
                          <button className="block w-full px-3.5 py-2 text-left text-[13px]" style={{ color: "var(--hf-danger)" }} onClick={() => { setMenuId(null); setConfirm({ kind: "member", id: m.id, name: m.name }); }}>Remove from team</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* pending invites */}
          <div className="ck-card p-5">
            <div className="font-display text-[18px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>Pending invites</div>
            <div className="mt-4 hidden grid-cols-[2fr_1.2fr_1fr_1fr_1fr_auto] gap-2 text-[12px] md:grid" style={{ color: "var(--hf-text-muted)" }}>
              <div>Invitee</div><div>Invited by</div><div>Role</div><div>Status</div><div>Expires</div><div />
            </div>
            <div className="mt-1">
              {team.invites.length === 0 ? (
                <p className="py-6 text-center text-[13px]" style={{ color: "var(--hf-text-muted)" }}>
                  No pending invites. Team invites will appear here when you add teammates.
                </p>
              ) : (
                team.invites.map((inv) => (
                <div key={inv.id} className="grid grid-cols-[1.6fr_auto] items-center gap-2 py-3 md:grid-cols-[2fr_1.2fr_1fr_1fr_1fr_auto]" style={{ borderTop: "1px solid color-mix(in srgb, var(--hf-surface-raised) 60%, transparent)" }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CkAvatar who={null} initials={inv.initials} size={36} />
                    <div className="min-w-0"><div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--hf-text)" }}>{inv.name}</div><div className="truncate text-[11.5px]" style={{ color: "var(--hf-text-muted)" }}>{inv.email}</div></div>
                  </div>
                  <div className="hidden text-[12.5px] md:block" style={{ color: "var(--hf-text-soft)" }}>{inv.invitedBy}</div>
                  <div className="hidden text-[12.5px] md:block" style={{ color: "var(--hf-text-soft)" }}>{inv.role}</div>
                  <div className="hidden md:block"><span className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--hf-gold)" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--hf-gold)" }} />Invited</span></div>
                  <div className="hidden text-[12.5px] md:block" style={{ color: "var(--hf-text-soft)" }}>{inv.expires}</div>
                  <div className="relative justify-self-end">
                    <button style={{ color: "var(--hf-text-muted)" }} onClick={() => setMenuId(menuId === `i-${inv.id}` ? null : `i-${inv.id}`)}><MoreVertical className="h-4 w-4" /></button>
                    {menuId === `i-${inv.id}` && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setMenuId(null)} />
                        <div className="absolute right-0 top-8 z-50 min-w-[150px] overflow-hidden rounded-xl py-1" style={{ background: "var(--hf-surface-raised)", border: "1px solid var(--hf-border-strong)", boxShadow: "0 16px 40px hsl(0 0% 0% / 0.5)" }}>
                          <button className="block w-full px-3.5 py-2 text-left text-[13px]" style={{ color: "var(--hf-danger)" }} onClick={() => { setMenuId(null); setConfirm({ kind: "invite", id: inv.id, name: inv.name }); }}>Revoke invite</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))
              )}
            </div>
            {team.invites.length > 0 && (
            <div className="mt-3 text-[12px]" style={{ color: "var(--hf-text-muted)" }}>Showing {team.invites.length} pending invite{team.invites.length === 1 ? "" : "s"}</div>
            )}
          </div>
        </div>

        {/* right: permissions matrix */}
        <div className="ck-card p-5">
          <div className="font-display text-[18px]" style={{ color: "var(--hf-text)", fontWeight: 500 }}>Permissions at a glance</div>
          <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--hf-text-muted)" }}>See what each role can do in Hireflow.</p>

          <div className="ck-scroll mt-4 overflow-x-auto">
            <div style={{ minWidth: 520 }}>
              <div className="grid items-end gap-2 pb-3" style={{ gridTemplateColumns: "1.6fr repeat(5, 1fr)", borderBottom: "1px solid var(--hf-border-strong)" }}>
                <div className="text-[12px]" style={{ color: "var(--hf-text-muted)" }}>Permissions</div>
                {team.permissionCols.map((c) => (
                  <div key={c.title} className="text-center">
                    <div className="text-[12px] font-semibold" style={{ color: "var(--hf-text)" }}>{c.title}</div>
                    <div className="text-[10.5px] leading-tight" style={{ color: "var(--hf-text-muted)", whiteSpace: "pre-line" }}>{c.sub}</div>
                  </div>
                ))}
              </div>
              {team.permissionRows.map((row) => {
                const Icon = ROW_ICONS[row.icon];
                return (
                  <div key={row.label} className="grid items-center gap-2 py-3" style={{ gridTemplateColumns: "1.6fr repeat(5, 1fr)", borderBottom: "1px solid color-mix(in srgb, var(--hf-surface-raised) 60%, transparent)" }}>
                    <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--hf-text)" }}>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "var(--hf-surface-raised)", color: "var(--hf-green)" }}><Icon className="h-3.5 w-3.5" /></span>
                      {row.label}
                    </div>
                    {row.allow.map((a, i) => (
                      <div key={i} className="flex justify-center">
                        {a ? <Check className="h-4 w-4" style={{ color: "var(--hf-green)" }} /> : <Minus className="h-4 w-4" style={{ color: "var(--hf-text-muted)" }} />}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ck-inset mt-4 flex items-start gap-2.5 p-3.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--hf-green)" }} />
            <p className="text-[12.5px]" style={{ color: "var(--hf-text-soft)" }}>Owner (Full Admin) has all permissions and can manage billing, team access, and organization settings.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
