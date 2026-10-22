import * as D from "@radix-ui/react-dialog";
import { cn } from "./cn";

// shadcn's dialog: focus stays inside, Esc and the backdrop close it.
export const Dialog = D.Root,
  DialogTitle = D.Title,
  DialogDescription = D.Description,
  DialogClose = D.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm data-[state=open]:animate-[fade_.2s_ease-out]" />
      <D.Content
        className={cn(
          "fixed inset-x-4 bottom-4 z-50 mx-auto grid max-h-[calc(100dvh-2rem)] w-auto max-w-220 gap-4.5 overflow-y-auto rounded-[22px] border bg-card p-6 shadow-[0_40px_80px_-30px_rgba(0,0,0,.6)] outline-none data-[state=open]:animate-in",
          className,
        )}
        {...props}
      >
        {children}
      </D.Content>
    </D.Portal>
  );
}
