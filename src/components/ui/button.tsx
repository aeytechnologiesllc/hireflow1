import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { buttonVariants } from "./button-variants";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onPointerDown, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent<HTMLButtonElement>) => {
        hapticLight();
        onPointerDown?.(e);
      },
      [onPointerDown]
    );
    
    return (
      <Comp 
        className={cn(buttonVariants({ variant, size, className }))} 
        ref={ref} 
        onPointerDown={handlePointerDown}
        {...props} 
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
