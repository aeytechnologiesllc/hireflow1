import { type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Settings as SettingsIcon, User as UserIcon, LogOut } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useCockpitAccount } from "../hooks/useCockpitData";

/**
 * The cockpit account menu — wraps any trigger (the sidebar account button or
 * the top-bar chip) and exposes Settings, Profile and Logout. Like every
 * floating panel in the system it sits on --surface, a step above the page
 * ground, so it never lands the same colour as what is behind it in Night.
 */
export function AccountMenu({
  children,
  align = "end",
  side = "top",
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { account } = useCockpitAccount();

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("Signed out");
    } catch {
      // signOut already clears local state; navigate regardless.
    } finally {
      navigate("/auth", { replace: true });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={8}
        className="w-60 p-1.5"
        style={{
          // Elevation comes from the shadow token, which is authored per theme —
          // a raw black shadow would smear in Day and vanish into the ground in Night.
          background: "var(--surface)",
          border: "1px solid var(--line)",
          boxShadow: "var(--shadow-md)",
          color: "var(--hf-text)",
        }}
      >
        <DropdownMenuLabel className="px-2.5 py-2">
          <div className="text-[14px] font-semibold" style={{ color: "var(--hf-text)" }}>
            {account.name}
          </div>
          <div className="text-[12px] font-normal" style={{ color: "var(--hf-text-muted)" }}>
            Owner workspace
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator style={{ background: "var(--hf-border-strong)" }} />
        <DropdownMenuItem
          onSelect={() => navigate("/settings")}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] focus:bg-[var(--surface-2)]"
        >
          <SettingsIcon className="h-[18px] w-[18px]" style={{ color: "var(--hf-text-muted)" }} />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => navigate("/profile")}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] focus:bg-[var(--surface-2)]"
        >
          <UserIcon className="h-[18px] w-[18px]" style={{ color: "var(--hf-text-muted)" }} />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator style={{ background: "var(--hf-border-strong)" }} />
        <DropdownMenuItem
          onSelect={handleLogout}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] focus:bg-[color-mix(in_srgb,var(--hf-danger)_18%,transparent)]"
          style={{ color: "var(--hf-danger)" }}
        >
          <LogOut className="h-[18px] w-[18px]" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AccountMenu;
