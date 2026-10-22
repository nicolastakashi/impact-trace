import { Command as C } from "cmdk";
import { Search } from "lucide-react";
import { cn } from "./cn";

// shadcn's command menu, on cmdk: the list follows the arrow keys, Enter picks.
export const Command = ({ className, ...props }: React.ComponentProps<typeof C>) => (
  <C
    data-slot="command"
    className={cn(
      "flex size-full flex-col overflow-hidden bg-card text-card-foreground",
      className,
    )}
    {...props}
  />
);

export const CommandInput = ({ className, ...props }: React.ComponentProps<typeof C.Input>) => (
  <div
    data-slot="command-input-wrapper"
    className="flex items-center gap-2.5 border-b border-line px-4.5"
  >
    <Search className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
    <C.Input
      data-slot="command-input"
      className={cn(
        "h-13 w-full bg-transparent text-base font-medium text-ink outline-none placeholder:text-ink-3",
        className,
      )}
      {...props}
    />
  </div>
);

export const CommandList = ({ className, ...props }: React.ComponentProps<typeof C.List>) => (
  <C.List
    data-slot="command-list"
    className={cn("max-h-[50vh] overflow-x-hidden overflow-y-auto p-1.5", className)}
    {...props}
  />
);

export const CommandEmpty = ({ className, ...props }: React.ComponentProps<typeof C.Empty>) => (
  <C.Empty
    data-slot="command-empty"
    className={cn("p-3.5 text-sm text-ink-3", className)}
    {...props}
  />
);

export const CommandItem = ({ className, ...props }: React.ComponentProps<typeof C.Item>) => (
  <C.Item
    data-slot="command-item"
    className={cn(
      "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none select-none data-[selected=true]:bg-s3",
      className,
    )}
    {...props}
  />
);
