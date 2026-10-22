import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "./cn";

// shadcn's dialog: focus stays inside, Esc and the backdrop close it.
export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm data-[state=open]:animate-[fade_.2s_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-4 bottom-4 z-50 mx-auto grid max-h-[calc(100dvh-2rem)] w-auto max-w-220 gap-4.5 overflow-y-auto rounded-[22px] border bg-card p-6 shadow-[0_40px_80px_-30px_rgba(0,0,0,.6)] outline-none data-[state=open]:animate-in",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
