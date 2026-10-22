// Shared by the views.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Button } from "./ui/button";
import { cn } from "./ui/cn";

// One JSON POST: the server takes a write only with this exact content-type.
export const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// Undecided threads per week. No answer counts as nothing left.
export const loadPending = (): Promise<Record<string, number>> =>
  fetch("/api/pending")
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}));

export const go = (hash: string) => {
  location.hash = hash;
};

let show: (message: string, duration: number) => void = () => {};
export const toast = (message: string, duration = 1800) => show(message, duration);
export function Toast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    show = (text, duration) => {
      setMessage(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), duration);
    };
  }, []);
  return (
    <div
      role="status"
      hidden={message == null}
      className="fixed bottom-[calc(20px+env(safe-area-inset-bottom,0px))] left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-3.5 py-2 font-mono text-[13px] font-medium text-background shadow-card"
    >
      {message}
    </div>
  );
}

// Threads per week, one cell each: the more threads, the redder.
export function Strip({
  weeks,
  count,
  max,
}: {
  weeks: string[];
  count: (week: string) => number;
  max: number;
}) {
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(26px, 1fr))` }}
    >
      {weeks.map((week) => {
        const threads = count(week);
        return (
          <i
            key={week}
            title={`${week}: ${threads}`}
            className="grid h-6.5 place-items-center rounded-md bg-s3 font-mono text-[11px] text-ink-3 not-italic tabular-nums data-[on]:text-ink"
            data-on={threads ? "" : undefined}
            style={
              threads
                ? {
                    background: `color-mix(in srgb, var(--accent) ${25 + (threads / max) * 60}%, var(--s3))`,
                  }
                : undefined
            }
          >
            {threads || ""}
          </i>
        );
      })}
      {weeks.map((week) => (
        <span key={week} className="text-center font-mono text-[10px] text-ink-3">
          {shortWeek(week)}
        </span>
      ))}
    </div>
  );
}

// A small mono caption: units, sources, "measured: …".
export const By = ({ className = "", ...props }: React.ComponentProps<"span">) => (
  <span className={`font-mono text-[11.5px] font-medium text-ink-3 ${className}`} {...props} />
);

// Shown while North, Trace and Feedback draw the fictional sample, not your data.
export const SampleNote = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a
    className="block rounded-xl border border-dashed border-line-2 bg-s2 px-3.5 py-2.5 text-[13.5px] text-ink-2 no-underline"
    href={href}
  >
    {children}
  </a>
);

// The side panel's and the sheet's close button. Esc closes them too.
export const CloseButton = ({
  className = "",
  onClick,
}: {
  className?: string;
  onClick: () => void;
}) => (
  <Button
    variant="outline"
    size="xs"
    className={cn(className, "rounded-full font-mono text-xs text-ink-2")}
    onClick={onClick}
  >
    close <kbd>esc</kbd>
  </Button>
);

// North, Trace, Feedback and Search read one object: your kept threads, or the sample.
// Same shape as app/sample.json; SAMPLE is true only for the sample.
export type North = Record<string, any> & {
  WEEKS: string[];
  ITEMS: any[];
  GOALS: any[];
  PROJECTS: Record<string, any>;
  REC: any[];
  FEEDBACK: any[];
  SAMPLE?: boolean;
};
let north: Promise<North> | null = null;
export const loadNorth = (fresh = false) =>
  (!fresh && north) || (north = fetch("/api/north").then((response) => response.json()));
export function useNorth(): [North | null, () => void] {
  const [data, setData] = useState<North | null>(null);
  useEffect(() => {
    loadNorth().then(setData);
  }, []);
  return [data, () => loadNorth(true).then(setData)];
}

export const MODES: Record<string, string> = {
  clarify: "clarify",
  prevent: "prevent",
  solve: "solve",
  build: "build",
  elevate: "elevate",
  external: "external",
};
export const PILLAR: Record<string, string> = {
  big: "big-picture",
  exec: "execution",
  level: "leveling-up",
};
export const WMS: Record<string, string> = {
  wouldnt: "wouldn't happen",
  slower: "slower",
  same: "same",
};
export const mc = (mode: string) => `var(--m-${mode})`;
export const cnt = <T,>(values: T[], keyOf: (value: T) => string) =>
  values.reduce(
    (counts, value) => {
      const key = keyOf(value);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );
export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
export const mean = (values: number[]) => sum(values) / values.length;
// A whole-number share; nothing of nothing is 0%.
export const percent = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 100) : 0;
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// "2026-W43" → "W43".
export const shortWeek = (week: string) => week.slice(5);
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// "Tue 09:05", in this browser's time zone.
export const fmtWhen = (time: number) => {
  const date = new Date(time);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${DOW[(date.getDay() + 6) % 7]} ${hours}:${minutes}`;
};

// The goals a thread serves. The sample names one goal per project instead.
export const goalsOf = (north: North, thread: any): string[] =>
  thread.g ?? (north.PROJECTS[thread.s]?.goal ? [north.PROJECTS[thread.s].goal] : []);
// The ISO year of a week index: a window across New Year starts in the old year.
export const yearOf = (north: North, week: number) =>
  +north.PERIOD.slice(0, 4) + (+north.WEEKS[week]!.slice(1) < +north.WEEKS[0]!.slice(1) ? 1 : 0);
// Where you change a thread's answers.
export const reviewHref = (north: North, thread: any) =>
  `#/review?week=${yearOf(north, thread.w)}-${north.WEEKS[thread.w]}&key=${encodeURIComponent(thread.id)}`;

// Count axis: a step of 1, 2 or 5 times a power of ten, at most 5 gridlines above zero.
export const axis = (max: number) => {
  const rough = Math.max(1, max) / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  const step = Math.max(1, nice * power);
  const top = Math.ceil(Math.max(1, max) / step) * step;
  return { top, ticks: Array.from({ length: top / step + 1 }, (_, index) => index * step) };
};

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// Run a gsap animation scoped to `scope`, undone on unmount. Reduced motion: nothing moves.
export function useMotion(
  scope: React.RefObject<HTMLElement | null>,
  animate: () => void,
  deps: React.DependencyList,
) {
  useLayoutEffect(() => {
    if (reduced() || !scope.current) return;
    const context = gsap.context(animate, scope);
    return () => context.revert();
  }, deps);
}
// A big number counts up from 0 to `end`.
export const countUp = (element: HTMLElement, end: number, duration: number) => {
  const tween = { value: 0 };
  gsap.to(tween, {
    value: end,
    duration,
    ease: "power3.out",
    onUpdate: () => {
      element.textContent = String(Math.round(tween.value));
    },
  });
};

// Overlays any view can open: one thread's sheet, the Wrapped story, search.
export const openItem = (id: string) => dispatchEvent(new CustomEvent("open-item", { detail: id }));
export const openStory = () => dispatchEvent(new Event("open-story"));
export const openSearch = () => dispatchEvent(new Event("open-search"));
export function useEvent<T = unknown>(name: string, on: (detail: T) => void) {
  useEffect(() => {
    const handler = (event: Event) => on((event as CustomEvent).detail);
    addEventListener(name, handler);
    return () => removeEventListener(name, handler);
  });
}
