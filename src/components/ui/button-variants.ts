import { cva } from "class-variance-authority";

/**
 * Split out of button.tsx (react-refresh/only-export-components: that file
 * should export only the Button component). alert-dialog.tsx,
 * calendar.tsx and pagination.tsx import this directly (not through
 * button.tsx).
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium ring-offset-background transition-all duration-[110ms] ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 max-w-full hover:-translate-y-px active:translate-y-0 active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md hover:brightness-110",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10 flex-shrink-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
