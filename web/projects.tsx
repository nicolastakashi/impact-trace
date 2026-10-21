// PROJECTS: Linear projects and your own topics, across weeks. A card opens the project page.
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { By, post, Strip, toast } from "./lib";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";
import { NativeSelect } from "./ui/input";

type D = any;
export const threads = (n: number) => `${n} thread${n === 1 ? "" : "s"}`;
// The diamond that says where a project comes from: Linear or a topic you made.
export const Src = ({ kind }: { kind: string }) => <i aria-hidden="true" className={cn("mr-1.5 inline-block size-2 flex-none rotate-45 rounded-xs", kind === "topic" ? "bg-(--m-solve)" : "bg-(--m-elevate)")} />;
export const small = "h-7 w-auto border-dashed bg-transparent px-1.5 font-mono text-[11.5px] text-ink-2";

function Line({ g, L }: { g: D; L: D }) {
  const merged = g.merged?.length ? ` · includes ${g.merged.map((m: D) => m.name).join(", ")}` : "";
  const topic = g.kind === "topic" || !L;
  return <By className="-mt-2"><Src kind={topic ? "topic" : "linear"} />{topic ? `topic${merged}` : `Linear${L.status ? ` · ${L.status}` : ""}${L.open ? ` · ${L.open} open` : ""}${merged}`}</By>;
}

function Projects() {
  const [d, setD] = useState<D>(null), [linear, setLinear] = useState(new Map<string, D>()), [fail, setFail] = useState(false);
  const [filter, setFilter] = useState("all"), [ask, setAsk] = useState<{ id: string; into?: string } | null>(null);
  // Always fresh: decisions made in review change the counts here.
  const load = async () => {
    const [g, l] = await Promise.all([fetch("/api/groups").then((r) => r.ok ? r.json() : null),
      fetch("/api/projects?weeks=").then((r) => r.ok ? r.json() : { projects: [] }).catch(() => ({ projects: [] }))]);
    if (!g) return setFail(true);
    setLinear(new Map(l.projects.map((x: D) => [x.id, x]))); setAsk(null); setD(g);
  };
  useEffect(() => { load(); }, []);
  async function go(url: string, body: unknown, done?: string) {
    setAsk(null);
    const r = await post(url, body);
    if (!r.ok) return toast(await r.text());
    if (done) toast(done);
    await load();
  }

  let body: React.ReactNode;
  if (fail) body = <p className="p-10 text-center text-ink-2">Projects need the app server. Start it with bun app/server.ts.</p>;
  else if (!d) body = <p className="p-10 text-center text-ink-2">Loading projects…</p>;
  else {
    const gs = d.groups.filter((g: D) => filter === "all" || g.kind === filter)
      .map((g: D) => ({ ...g, total: Object.values(g.weeks).reduce((a: number, ts: D) => a + ts.length, 0) }))
      .sort((a: D, b: D) => b.total - a.total || a.name.localeCompare(b.name));
    const max = Math.max(1, ...gs.flatMap((g: D) => Object.values(g.weeks).map((ts: D) => ts.length)));
    body = <>
      {gs.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(min(520px,100%),1fr))] items-start gap-3">{gs.map((g: D) => {
        const todo = Object.values(g.weeks).flat().filter((t: D) => !t.decided).length;
        return <Card key={g.id} className="gap-3.5 transition-colors hover:border-line-2 sm:p-5.5">
          <a className="grid gap-3.5 rounded-xl text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-6 focus-visible:outline-brand" href={`#/project?id=${encodeURIComponent(g.id)}`} aria-label={g.name}>
            <span className="flex items-baseline gap-x-3.5 gap-y-2"><h2 className="m-0 font-num text-[22px] leading-[1.02] font-extrabold text-balance uppercase">{g.name}</h2>
              {todo > 0 && <span className="font-mono text-[11px] font-medium tracking-wider text-brand uppercase">{todo} to review</span>}
              <ChevronRight className="ml-auto size-4 self-center text-ink-3" /></span>
            <Line g={g} L={linear.get(g.id)} />
            <Strip weeks={d.weeks} count={(w) => (g.weeks[w] ?? []).length} max={max} /></a>
          {/* Merge and delete ask once, inline, and name what will happen. */}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[13.5px] text-ink-2">{ask?.id === g.id && ask!.into ? <>
              {`Merge ${g.name} into ${d.groups.find((x: D) => x.id === ask!.into)?.name}? Its ${threads(g.total)} move there. You can split it out again.`}
              <span className="ml-auto flex gap-2"><Button variant="dashed" size="xs" onClick={() => go("/api/merge", { from: g.id, into: ask!.into }, "Merged")}>merge</Button>
                <Button variant="dashed" size="xs" onClick={() => setAsk(null)}>cancel</Button></span></>
            : ask?.id === g.id ? <>
              {`Delete ${g.name}? ${threads(g.total)} will have no project${g.merged?.length ? ", and the merged projects stand alone again" : ""}. You can restore it below.`}
              <span className="ml-auto flex gap-2"><Button variant="dashed-destructive" size="xs" onClick={() => go("/api/delete", { id: g.id }, "Deleted")}>delete</Button>
                <Button variant="dashed" size="xs" onClick={() => setAsk(null)}>cancel</Button></span></>
            : <>
              <NativeSelect className={small} value="" aria-label={`Merge ${g.name} into another project`} onChange={(e) => e.target.value && setAsk({ id: g.id, into: e.target.value })}>
                <option value="">merge into…</option>{d.groups.filter((x: D) => x.id !== g.id).map((x: D) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect>
              <Button variant="dashed-destructive" size="xs" className="ml-auto" onClick={() => setAsk({ id: g.id })}>delete</Button></>}</div>
        </Card>; })}</div>
        : <p className="p-10 text-center text-ink-2">No projects yet. In review, press P on a thread to pick one or create a topic.</p>}
      {d.deleted.length > 0 && <details><summary className="lbl cursor-pointer">{`Deleted · ${d.deleted.length}`}</summary>
        <ul className="m-0 mt-2.5 grid list-none gap-2 p-0">{d.deleted.map((p: D) => <li key={p.id} className="flex items-center gap-2.5 text-sm text-ink-2">
          <span><Src kind={p.kind} />{p.name}</span><Button variant="dashed" size="xs" onClick={() => go("/api/restore", { id: p.id })}>restore</Button></li>)}</ul></details>}
    </>;
  }
  return <section className="view" id="v-projects">
    <div className="vhead"><h1>Projects <em>across weeks</em></h1>
      <div className="flex gap-1.5" role="group" aria-label="Kind of project">{[["all", "All"], ["linear", "Linear"], ["topic", "Topics"]].map(([k, t]) =>
        <Button key={k} variant="outline" size="xs" aria-pressed={filter === k} onClick={() => setFilter(k!)}
          className="px-2.5 font-mono text-xs text-ink-2 aria-pressed:border-ink-2 aria-pressed:bg-s3 aria-pressed:text-ink">{t}</Button>)}</div></div>
    <div className="grid gap-3.5">{body}</div>
  </section>;
}

export const ready = true;
// The old address #/projects?p=<id> opens that project.
export function View({ p }: { p: URLSearchParams }) {
  const id = p.get("p");
  useEffect(() => { if (id) location.replace(`#/project?id=${encodeURIComponent(id)}`); }, [id]);
  return id ? null : <Projects />;
}
