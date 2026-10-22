// STORY: the Wrapped recap. Full-screen slides: the period, the totals, each phase, the modes, the open question.
import { useRef, useState } from "react";
import gsap from "gsap";
import { cnt, countUp, go, MODES, useEvent, useMotion, useNorth, type North } from "./lib";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

const PHASE_BG = [
  "linear-gradient(160deg,#2a1406,#ff7a45)",
  "linear-gradient(160deg,#ff7a45,#c8326a)",
  "linear-gradient(160deg,#2a2406,#c9a400 70%,#ffe37a)",
  "linear-gradient(160deg,#0d1a2a,#5b47d6 60%,#b3a1ff)",
  "linear-gradient(160deg,#5b47d6,#ff4d52)",
];
const Kicker = ({ children }: { children: React.ReactNode }) => (
  <span className="font-num text-sm font-bold tracking-[.2em] uppercase opacity-80">
    {children}
  </span>
);
const Headline = ({ children }: { children: React.ReactNode }) => (
  <p className="m-0 font-num text-[clamp(36px,6vw,72px)] leading-[.92] font-extrabold text-balance uppercase">
    {children}
  </p>
);
const Huge = ({ n }: { n: number }) => (
  <span
    data-huge
    className="font-num text-[clamp(90px,20vw,220px)] leading-[.8] font-extrabold tracking-[-.02em] tabular-nums"
  >
    {n}
  </span>
);
// White on the slide's color; lib's By is for the app's ground.
const Caption = ({ className = "", ...p }: React.ComponentProps<"span">) => (
  <span className={`text-[13px] text-white/75 ${className}`} {...p} />
);
const pill = "rounded-full border border-white/25 bg-black/20 px-3.5 py-2 text-sm font-semibold";

// A phase shows its praise if it has one, else its headline and threads.
function PhaseSlide({ north, phase }: { north: North; phase: any }) {
  const praise = phase.rec != null ? north.REC[phase.rec] : null;
  if (praise)
    return (
      <>
        <Kicker>{phase.k}</Kicker>
        <p className="m-0 text-[clamp(22px,3.2vw,36px)] leading-[1.2] font-bold tracking-[-.015em] text-balance">{`“${praise.t}”`}</p>
        <Caption>
          {praise.who}
          {praise.role ? ` · ${praise.role}` : ""}
        </Caption>
      </>
    );
  return (
    <>
      <Kicker>{phase.k}</Kicker>
      <Headline>{phase.h}</Headline>
      <div className="flex flex-wrap gap-2.5">
        {north.ITEMS.filter((i) => i.w >= phase.from && i.w <= phase.to).map((i) => (
          <span key={i.id} className={pill}>
            {i.title}
          </span>
        ))}
      </div>
    </>
  );
}

function ModesSlide({ north }: { north: North }) {
  const byMode = cnt(north.ITEMS, (i) => i.mode);
  const longest = Math.max(1, ...Object.values(byMode));
  return (
    <>
      <Kicker>How you delivered</Kicker>
      <div className="grid gap-2.5">
        {Object.keys(MODES).map((mode) => (
          <div
            key={mode}
            className="grid grid-cols-[120px_1fr_30px] items-center gap-3 font-num text-lg font-bold uppercase max-[480px]:grid-cols-[88px_1fr_24px]"
          >
            <span>{MODES[mode]}</span>
            <span className="h-4 overflow-hidden rounded-lg bg-black/25">
              <i
                data-bar
                className="block h-full rounded-lg bg-white"
                style={{ width: `${((byMode[mode] ?? 0) / longest) * 100}%` }}
              />
            </span>
            <span>{byMode[mode] ?? 0}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function slides(north: North, close: () => void): { bg: string; body: React.ReactNode }[] {
  const answered = north.ITEMS.filter((i) => i.wm).length;
  return [
    {
      bg: "linear-gradient(160deg,#16161d,#3a0d12 60%,#ff4d52)",
      body: (
        <>
          <Kicker>{north.PERIOD}</Kicker>
          <Huge n={north.WEEKS.length} />
          <Headline>weeks of work, with a trace</Headline>
        </>
      ),
    },
    {
      bg: "linear-gradient(160deg,#2a0b1a,#ff4f8f)",
      body: (
        <>
          <Kicker>In total</Kicker>
          <Huge n={north.ITEMS.length} />
          <Headline>{`threads with evidence. ${north.REC.length} times people praised your work.`}</Headline>
        </>
      ),
    },
    ...(north.PHASES as any[]).map((phase, n) => ({
      bg: PHASE_BG[n % PHASE_BG.length]!,
      body: <PhaseSlide north={north} phase={phase} />,
    })),
    {
      bg: "linear-gradient(160deg,#08230f,#12854a 60%,#7dffa8)",
      body: <ModesSlide north={north} />,
    },
    {
      bg: "linear-gradient(160deg,#16161d,#2c2c38)",
      body: (
        <>
          <Kicker>The open question</Kicker>
          <Headline>Without you, which of these would have happened?</Headline>
          <Caption className="text-[15px]">{`${answered} of ${north.ITEMS.length} answered. Only you know the answer.`}</Caption>
          <div className="flex flex-wrap gap-2.5">
            <button
              className={`${pill} cursor-pointer text-white`}
              onClick={() => {
                close();
                go("#/review");
              }}
            >
              Open review →
            </button>
          </div>
        </>
      ),
    },
  ];
}

// Each slide comes in, its bars grow and its big number counts up. Reduced motion: it just shows.
// Its own component: the dialog portal mounts a render late, so the animation waits for this mount.
function Slide({
  bar,
  children,
}: {
  bar: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  useMotion(el, () => {
    gsap.from(el.current!.children, {
      y: 30,
      opacity: 0,
      duration: 0.6,
      stagger: 0.08,
      ease: "power3.out",
      clearProps: "all",
    });
    gsap.from("[data-bar]", {
      width: 0,
      duration: 1,
      stagger: 0.08,
      ease: "power3.out",
      delay: 0.2,
    });
    const huge = el.current!.querySelector<HTMLElement>("[data-huge]");
    if (huge) countUp(huge, +huge.textContent!, 1.2);
    if (bar.current)
      gsap.fromTo(bar.current, { width: 0 }, { width: "100%", duration: 0.9, ease: "power1.out" });
  }, []);
  // Taps pass through to the sides; only a button on the slide (Open review) takes clicks.
  return (
    <div
      ref={el}
      className="pointer-events-none grid w-[min(820px,100%)] gap-5.5 px-7 pt-20 pb-15 [&_button]:pointer-events-auto [&_button]:relative [&_button]:z-2"
    >
      {children}
    </div>
  );
}

export function Story() {
  const [north] = useNorth();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const bar = useRef<HTMLElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEvent("open-story", () => {
    setI(0);
    setOpen(true);
  });
  const all = north ? slides(north, () => setOpen(false)) : [];
  const n = all.length;
  const step = (k: number) => setI((x) => Math.max(0, Math.min(n - 1, x + k)));
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") step(-1);
  };
  const slide = all[i];
  return (
    <Dialog open={open && !!slide} onOpenChange={setOpen}>
      {slide && (
        <DialogContent
          ref={box}
          aria-describedby={undefined}
          onKeyDown={keys}
          // Focus the slide, not the close button: Space steps on, it does not close.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            box.current?.focus();
          }}
          className="inset-0 m-0 block max-h-none w-full max-w-none overflow-hidden rounded-none border-0 p-0 pt-[env(safe-area-inset-top,0px)] text-white shadow-none"
        >
          <DialogTitle className="sr-only">Recap</DialogTitle>
          <div
            className="absolute inset-0 transition-[background] duration-600"
            style={{ background: slide.bg }}
          />
          <div
            className="absolute inset-x-4 top-[calc(14px+env(safe-area-inset-top,0px))] z-2 flex gap-1"
            aria-hidden="true"
          >
            {all.map((_, k) => (
              <i key={k} className="h-0.75 flex-1 overflow-hidden rounded-xs bg-white/30">
                <b
                  ref={k === i ? bar : undefined}
                  className="block h-full bg-white"
                  style={{ width: k <= i ? "100%" : 0 }}
                />
              </i>
            ))}
          </div>
          <button
            className="absolute top-[calc(28px+env(safe-area-inset-top,0px))] right-4 z-3 cursor-pointer rounded-full border border-white/30 bg-black/25 px-3 py-1.5 font-mono text-xs font-medium text-white"
            onClick={() => setOpen(false)}
          >
            close · esc
          </button>
          <button
            className="absolute inset-y-0 left-0 z-1 w-[35%] cursor-pointer"
            aria-label="previous"
            onClick={() => step(-1)}
          />
          <button
            className="absolute inset-y-0 right-0 z-1 w-[35%] cursor-pointer"
            aria-label="next"
            onClick={() => step(1)}
          />
          <div className="relative grid h-full place-items-center">
            <Slide key={i} bar={bar}>
              {slide.body}
            </Slide>
          </div>
          <div className="absolute inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom,0px))] z-2 text-center font-mono text-[11px] font-medium opacity-70">{`← → or tap the sides · ${i + 1}/${n}`}</div>
        </DialogContent>
      )}
    </Dialog>
  );
}

export const View = (_: { p: URLSearchParams }) => <Story />;
