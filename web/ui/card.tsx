import { cn } from "./cn";

export const Card = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    data-slot="card"
    className={cn(
      "grid gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-card sm:p-7",
      className,
    )}
    {...props}
  />
);
