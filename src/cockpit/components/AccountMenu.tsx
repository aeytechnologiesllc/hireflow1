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
 * the top-bar chip) and exposes Settings, Profile and Logout. Solid Deep-Jade
 * surface (no glass) to match the cockpit shell.
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
        className="w-60 border-0 p-1.5 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.7)]"
        style={{
          background: "hsl(156 22% 7%)",
          border: "1px solid hsl(150 12% 16%)",
          color: "hsl(150 24% 88%)",
        }}
      >
        <DropdownMenuLabel className="px-2.5 py-2">
          <div className="text-[14px] font-semibold" style={{ color: "hsl(150 30% 92%)" }}>
            {account.name}
          </div>
          <div className="text-[12px] font-normal" style={{ color: "hsl(150 10% 56%)" }}>
            Owner workspace
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator style={{ background: "hsl(150 12% 14%)" }} />
        <DropdownMenuItem
          onSelect={() => navigate("/settings")}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] focus:bg-[hsl(152_28%_13%)]"
        >
          <SettingsIcon className="h-[18px] w-[18px]" style={{ color: "hsl(150 14% 60%)" }} />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => navigate("/profile")}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] focus:bg-[hsl(152_28%_13%)]"
        >
          <UserIcon className="h-[18px] w-[18px]" style={{ color: "hsl(150 14% 60%)" }} />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator style={{ background: "hsl(150 12% 14%)" }} />
        <DropdownMenuItem
          onSelect={handleLogout}
          className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2.5 text-[14px] focus:bg-[hsl(0_40%_16%)]"
          style={{ color: "hsl(6 70% 72%)" }}
        >
          <LogOut className="h-[18px] w-[18px]" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AccountMenu;
