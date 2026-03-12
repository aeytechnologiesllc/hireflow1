import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, checked, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full border transition-all duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    checked={checked}
    {...props}
    ref={ref}
    style={{
      background: checked
        ? "linear-gradient(135deg, #00d2a0, #00a8ff)"
        : "rgba(255,255,255,0.08)",
      borderColor: checked ? "transparent" : "rgba(255,255,255,0.06)",
      boxShadow: checked ? "0 0 8px rgba(0,210,160,0.4)" : "none",
      ...((props as any).style || {}),
    }}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[20px] w-[20px] rounded-full bg-white ring-0 transition-transform duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] data-[state=unchecked]:translate-x-[3px] data-[state=checked]:translate-x-[23px]",
      )}
      style={{
        boxShadow:
          "0 2px 6px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.6)",
      }}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
