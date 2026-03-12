import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer group relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full border overflow-hidden transition-all duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=unchecked]:border-[rgba(255,255,255,0.06)] data-[state=unchecked]:bg-[rgba(255,255,255,0.08)] data-[state=checked]:border-transparent data-[state=checked]:shadow-[0_0_8px_rgba(0,210,160,0.4)]",
      className,
    )}
    style={{
      background:
        undefined, // handled below via data attribute
    }}
    {...props}
    ref={ref}
  >
    {/* Gradient overlay for checked state */}
    <span
      className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-data-[state=checked]:opacity-100"
      style={{
        background: "linear-gradient(135deg, #00d2a0, #00a8ff)",
      }}
      aria-hidden
    />
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none relative z-10 block h-[20px] w-[20px] rounded-full bg-white ring-0 transition-transform duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] data-[state=unchecked]:translate-x-[3px] data-[state=checked]:translate-x-[23px]",
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
