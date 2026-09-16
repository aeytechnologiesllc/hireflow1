import * as React from "react";

/**
 * Split out of sidebar.tsx (react-refresh/only-export-components: that file
 * should export only components), which imports both back — SidebarProvider
 * provides this context, and several of the file's other components call
 * useSidebar().
 */

export type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

export const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}
