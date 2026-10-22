// Shared by Goals, Projects, Project and Review.
import { post, toast } from "./lib";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";

// One write. A refusal shows the server's reason in a toast; you get the response only on success.
export async function send(url: string, body: unknown, failPrefix = "") {
  const response = await post(url, body);
  if (response.ok) return response;
  toast(failPrefix + (await response.text()));
  return null;
}

// Add the key if it is missing, remove it if it is there.
export const toggled = <T,>(set: Set<T>, key: T) => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

export const threads = (count: number) => `${count} thread${count === 1 ? "" : "s"}`;

// Event kinds as people say them.
const EVENT_KINDS: Record<string, string> = {
  pr_merged: "PR merged",
  pr_open: "PR open",
  issue_completed: "issue done",
  issue_open: "issue open",
  review_comment: "review received",
  reviews_given: "reviews given",
  slack_message: "Slack",
  slack_mention: "mention",
  meeting: "meeting",
  doc_created: "doc created",
  doc_edited: "doc edited",
};
export const eventKind = (kind: string) => EVENT_KINDS[kind] ?? kind;

export const crumbClass = "font-mono text-xs font-medium text-ink-3 no-underline hover:text-brand";
export const smallSelectClass =
  "h-7 w-auto border-dashed bg-transparent px-1.5 font-mono text-[11.5px] text-ink-2";
export const toReviewClass =
  "font-mono text-[11px] font-medium tracking-wider text-brand uppercase";

// A whole-view message: loading, no server, nothing here.
export const ViewNote = ({ children }: { children: React.ReactNode }) => (
  <p className="p-10 text-center text-ink-2">{children}</p>
);

export const NoGoalsLink = () => (
  <a className={crumbClass} href="#/goals">
    no goals yet · add one →
  </a>
);

// The diamond that says where a project comes from: Linear or a topic you made.
export const SourceDiamond = ({ kind }: { kind: string }) => (
  <i
    aria-hidden="true"
    className={cn(
      "mr-1.5 inline-block size-2 flex-none rotate-45 rounded-xs",
      kind === "topic" ? "bg-(--m-solve)" : "bg-(--m-elevate)",
    )}
  />
);

// The two buttons of an inline "are you sure?".
export function ConfirmButtons({
  label,
  destructive = false,
  onConfirm,
  onCancel,
  className,
}: {
  label: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  className?: string;
}) {
  return (
    <span className={cn("flex gap-2", className)}>
      <Button variant={destructive ? "dashed-destructive" : "dashed"} size="xs" onClick={onConfirm}>
        {label}
      </Button>
      <Button variant="dashed" size="xs" onClick={onCancel}>
        cancel
      </Button>
    </span>
  );
}
