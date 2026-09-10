import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors font-mono tracking-tight",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-rose-border bg-rose-soft text-rose-text",
        outline: "text-foreground border-border",
        success: "border-mint-border bg-mint-soft text-mint-text",
        warning: "border-transparent bg-copper text-white",
        info: "border-aqua-border bg-aqua-soft text-aqua-text",
        muted: "border-border bg-muted/50 text-muted-foreground",
        lavender: "border-lavender-border bg-lavender-soft text-lavender-text",
        peach: "border-peach-border bg-peach-soft text-peach-text",
        aqua: "border-aqua-border bg-aqua-soft text-aqua-text",
        mint: "border-mint-border bg-mint-soft text-mint-text",
        rose: "border-rose-border bg-rose-soft text-rose-text",
        beige: "border-beige-border bg-beige-soft text-beige-text",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge, badgeVariants };
