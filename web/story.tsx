// STORY: the Wrapped recap. Full-screen slides: the period, the totals, each phase, the modes, the open question.
import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { cnt, MODES, reduced, useEvent, useNorth, type North } from "./lib";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

const PHASE_BG = ["linear-gradient(160deg,#2a1406,#ff7a45)", "linear-gradient(160deg,#ff7a45,#c8326a)", "linear-gradient(160deg,#2a2406,#c9a400 70%,#ffe37a)", "linear-gradient(160deg,#0d1a2a,#5b47d6 60%,#b3a1ff)", "linear-gradient(160deg,#5b47d6,#ff4d52)"];
const K = ({ children }: { children: React.ReactNode }) => <span className="font-num text-sm font-bold tracking-[.2em] uppercase opacity-80">{children}</span>;
const H = ({ children }: { children: React.ReactNode }) => <p className="m-0 font-num text-[clamp(36px,6vw,72px)] leading-[.92] font-extrabold text-balance uppercase">{children}</p>;
const Huge = ({ n }: { n: number }) => <span data-huge className="font-num text-[clamp(90px,20vw,220px)] leading-[.8] font-extrabold tracking-[-.02em] tabular-nums">{n}</span>;
const By = ({ className = "", ...p }: React.ComponentProps<"span">) => <span className={`text-[13px] text-white/75 ${className}`} {...p} />;
const pill = "rounded-full border border-white/25 bg-black/20 px-3.5 py-2 text-sm font-semibold";

function slides(d: North, close: () => void): { bg: string; body: React.ReactNode }[] {
  const m = cnt(d.ITEMS, (i) => i.mode), mx = Math.max(1, ...Object.values(m)), answered = d.ITEMS.filter((i) => i.wm).length;
  return [
    { bg: "linear-gradient(160deg,#16161d,#3a0d12 60%,#ff4d52)", body: <><K>{d.PERIOD}</K><Huge n={d.WEEKS.length} /><H>weeks of work, with a trace</H></> },
    { bg: "linear-gradient(160deg,#2a0b1a,#ff4f8f)", body: <><K>In total</K><Huge n={d.ITEMS.length} /><H>{`threads with evidence. ${d.REC.length} times people praised your work.`}</H></> },
    ...(d.PHASES as any[]).map((p, n) => {
      const r = p.rec != null ? d.REC[p.rec] : null;
      return { bg: PHASE_BG[n % PHASE_BG.length]!, body: r
        ? <><K>{p.k}</K><p className="m-0 text-[clamp(22px,3.2vw,36px)] leading-[1.2] font-bold tracking-[-.015em] text-balance">{`“${r.t}”`}</p><By>{r.who}{r.role ? ` · ${r.role}` : ""}</By></>
        : <><K>{p.k}</K><H>{p.h}</H><div className="flex flex-wrap gap-2.5">{d.ITEMS.filter((i) => i.w >= p.from && i.w <= p.to).map((i) => <span key={i.id} className={pill}>{i.title}</span>)}</div></> };
    }),
    { bg: "linear-gradient(160deg,#08230f,#12854a 60%,#7dffa8)", body: <><K>How you delivered</K><div className="grid gap-2.5">{Object.keys(MODES).map((k) =>
      <div key={k} className="grid grid-cols-[120px_1fr_30px] items-center gap-3 font-num text-lg font-bold uppercase max-[480px]:grid-cols-[88px_1fr_24px]">
        <span>{MODES[k]}</span><span className="h-4 overflow-hidden rounded-lg bg-black/25"><i data-bar className="block h-full rounded-lg bg-white" style={{ width: `${(m[k] ?? 0) / mx * 100}%` }} /></span><span>{m[k] ?? 0}</span></div>)}</div></> },
    { bg: "linear-gradient(160deg,#16161d,#2c2c38)", body: <><K>The open question</K><H>Without you, which of these would have happened?</H>
      <By className="text-[15px]">{`${answered} of ${d.ITEMS.length} answered. Only you know the answer.`}</By>
      <div className="flex flex-wrap gap-2.5"><button className={`${pill} cursor-pointer text-white`} onClick={() => { close(); location.hash = "#/review"; }}>Open review →</button></div></> },
  ];
}

// Each slide comes in, its bars grow and its big number counts up. Reduced motion: it just shows.
// Its own component: the dialog portal mounts a render late, so the animation waits for this mount.
function Slide({ bar, children }: { bar: React.RefObject<HTMLElement | null>; children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (reduced()) return;
    const ctx = gsap.context(() => {
      gsap.from(el.current!.children, { y: 30, opacity: 0, duration: .6, stagger: .08, ease: "power3.out", clearProps: "all" });
      gsap.from("[data-bar]", { width: 0, duration: 1, stagger: .08, ease: "power3.out", delay: .2 });
      const h = el.current!.querySelector<HTMLElement>("[data-huge]");
      if (h) { const end = +h.textContent!, o = { v: 0 }; gsap.to(o, { v: end, duration: 1.2, ease: "power3.out", onUpdate: () => { h.textContent = String(Math.round(o.v)); } }); }
      if (bar.current) gsap.fromTo(bar.current, { width: 0 }, { width: "100%", duration: .9, ease: "power1.out" });
    }, el);
    return () => ctx.revert();
  }, []);
  // Taps pass through to the sides; only a button on the slide (Open review) takes clicks.
  return <div ref={el} className="pointer-events-none grid w-[min(820px,100%)] gap-5.5 px-7 pt-20 pb-15 [&_button]:pointer-events-auto [&_button]:relative [&_button]:z-2">{children}</div>;
}

export function Story() {
  const [d] = useNorth(), [open, setOpen] = useState(false), [i, setI] = useState(0);
  const bar = useRef<HTMLElement>(null), box = useRef<HTMLDivElement>(null);
  useEvent("open-story", () => { setI(0); setOpen(true); });
  const all = d ? slides(d, () => setOpen(false)) : [], n = all.length;
  const step = (k: number) => setI((x) => Math.max(0, Math.min(n - 1, x + k)));
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowLeft") step(-1);
  };
  const s = all[i];
  return <Dialog open={open && !!s} onOpenChange={setOpen}>
    {s && <DialogContent ref={box} aria-describedby={undefined} onKeyDown={keys}
      // Focus the slide, not the close button: Space steps on, it does not close.
      onOpenAutoFocus={(e) => { e.preventDefault(); box.current?.focus(); }}
      className="inset-0 m-0 block max-h-none w-full max-w-none overflow-hidden rounded-none border-0 p-0 pt-[env(safe-area-inset-top,0px)] text-white shadow-none">
      <DialogTitle className="sr-only">Recap</DialogTitle>
      <div className="absolute inset-0 transition-[background] duration-600" style={{ background: s.bg }} />
      <div className="absolute inset-x-4 top-[calc(14px+env(safe-area-inset-top,0px))] z-2 flex gap-1" aria-hidden="true">
        {all.map((_, k) => <i key={k} className="h-0.75 flex-1 overflow-hidden rounded-xs bg-white/30">
          <b ref={k === i ? bar : undefined} className="block h-full bg-white" style={{ width: k <= i ? "100%" : 0 }} /></i>)}</div>
      <button className="absolute top-[calc(28px+env(safe-area-inset-top,0px))] right-4 z-3 cursor-pointer rounded-full border border-white/30 bg-black/25 px-3 py-1.5 font-mono text-xs font-medium text-white"
        onClick={() => setOpen(false)}>close · esc</button>
      <button className="absolute inset-y-0 left-0 z-1 w-[35%] cursor-pointer" aria-label="previous" onClick={() => step(-1)} />
      <button className="absolute inset-y-0 right-0 z-1 w-[35%] cursor-pointer" aria-label="next" onClick={() => step(1)} />
      <div className="relative grid h-full place-items-center">
        <Slide key={i} bar={bar}>{s.body}</Slide>
      </div>
      <div className="absolute inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom,0px))] z-2 text-center font-mono text-[11px] font-medium opacity-70">{`← → or tap the sides · ${i + 1}/${n}`}</div>
    </DialogContent>}
  </Dialog>;
}

export const View = (_: { p: URLSearchParams }) => <Story />;
