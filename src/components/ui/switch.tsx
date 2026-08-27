import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer group relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer items-center rounded-full border overflow-hidden transition-all duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=unchecked]:border-[var(--hf-border)] data-[state=unchecked]:bg-[var(--hf-surface-strong)] data-[state=checked]:border-transparent",
      className,
    )}
    {...props}
    ref={ref}
  >
    {/* "On" is jade, the action colour. It used to be a teal-to-blue gradient
        with a neon glow — neither colour is in the palette. */}
    <span
      className="pointer-events-none absolute inset-0 rounded-full opacity-0 transition-opacity duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-data-[state=checked]:opacity-100"
      style={{ background: "var(--hf-green)" }}
      aria-hidden
    />
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none relative z-10 block h-[20px] w-[20px] rounded-full ring-0 transition-transform duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)] data-[state=unchecked]:translate-x-[3px] data-[state=checked]:translate-x-[23px]",
      )}
      style={{
        // --slab-ink is the one warm off-white that is the same in both themes,
        // so the knob reads on the pale "off" track and on jade alike.
        background: "var(--slab-ink)",
        boxShadow: "var(--shadow-sm)",
      }}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
