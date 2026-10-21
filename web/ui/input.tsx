import { cn } from "./cn";

// shadcn's input, textarea and a native select in the same style.
// The select stays native: keyboard, phone pickers and tests work as on any form.
const field = "w-full min-w-0 rounded-lg border border-input bg-secondary text-sm text-foreground outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive";

export const Input = ({ className, ...props }: React.ComponentProps<"input">) =>
  <input data-slot="input" className={cn(field, "h-10 px-3", className)} {...props} />;

export const Textarea = ({ className, ...props }: React.ComponentProps<"textarea">) =>
  <textarea data-slot="textarea" className={cn(field, "min-h-16 resize-y px-3 py-2 leading-normal", className)} {...props} />;

export const NativeSelect = ({ className, ...props }: React.ComponentProps<"select">) =>
  <select data-slot="native-select" className={cn(field, "h-10 cursor-pointer px-3", className)} {...props} />;

export const Label = ({ className, ...props }: React.ComponentProps<"label">) =>
  <label data-slot="label" className={cn("grid gap-1.5 text-sm text-ink-2", className)} {...props} />;
