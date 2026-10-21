import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap", {
  variants: {
    variant: {
      outline: "uppercase tracking-wider text-ink-3",
      dashed: "border-dashed uppercase tracking-wider text-ink-3",
      soft: "border-line bg-secondary font-sans text-xs text-ink-2",
    },
  },
  defaultVariants: { variant: "outline" },
});

export const Badge = ({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) =>
  <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
