// SEARCH: the ⌘K box. Views, the recap and your threads, by title, project or person.
import { useRef, useState } from "react";
import { mc, openItem, openStory, useEvent, useNorth } from "./lib";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

const VIEWS = [["home", "North"], ["goals", "Goals"], ["projects", "Projects"], ["project", "Project"], ["trace", "Trace"], ["feedback", "Feedback"], ["review", "Review"], ["refs", "References"], ["setup", "Setup"]];
type R = { id: string; label: string; t: string; m?: string; hay?: string; run: () => void };

export function Search() {
  const [d] = useNorth(), [open, setOpen] = useState(false), [q, setQ] = useState(""), [sel, setSel] = useState("");
  // A result moves focus on (a view, the sheet, the recap): then do not hand it back to the header.
  const went = useRef(false);
  // ⌘K again closes it, like the old app.
  useEvent("open-search", () => { setOpen((o) => !o); setQ(""); setSel(""); went.current = false; });
  const all: R[] = !d ? [] : [
    ...VIEWS.map(([v, l]) => ({ id: `v:${v}`, label: `Go to ${l}`, t: "view", run: () => { location.hash = `#/${v}`; } })),
    { id: "recap", label: "Open recap (Wrapped)", t: "recap", run: openStory },
    ...d.ITEMS.map((i) => ({ id: `i:${i.id}`, label: i.title, t: d.WEEKS[i.w]!, m: i.mode, run: () => openItem(i.id),
      hay: `${i.title} ${d.PROJECTS[i.s]?.name ?? ""} ${i.quote?.who ?? ""} ${i.rec != null ? d.REC[i.rec].who : ""}`.toLowerCase() })),
  ];
  // Our own filter, not cmdk's fuzzy one: a plain substring, at most 12 results.
  const res = all.filter((r) => !q || (r.hay ?? r.label.toLowerCase()).includes(q.toLowerCase())).slice(0, 12);
  const cur = res.some((r) => r.id === sel) ? sel : res[0]?.id ?? "";
  const pick = (r: R) => { went.current = true; setOpen(false); r.run(); };
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent aria-describedby={undefined} className="top-[12vh] bottom-auto max-w-155 gap-0 overflow-hidden rounded-2xl p-0"
      onCloseAutoFocus={(e) => went.current && e.preventDefault()}>
      <DialogTitle className="sr-only">Search</DialogTitle>
      <Command shouldFilter={false} value={cur} onValueChange={setSel}>
        <CommandInput placeholder="Search items, people, views…" value={q} onValueChange={(v) => { setQ(v); setSel(""); }} />
        <CommandList>
          <CommandEmpty>Nothing found. Try a person or a stream name.</CommandEmpty>
          {res.map((r) => <CommandItem key={r.id} value={r.id} onSelect={() => pick(r)}>
            <i className="size-2.5 flex-none rounded-full" style={{ background: r.m ? mc(r.m) : "var(--line-2)" }} />
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
            <span className="font-mono text-[11px] font-medium text-ink-3">{r.t}</span>
          </CommandItem>)}
        </CommandList>
      </Command>
    </DialogContent>
  </Dialog>;
}

export const ready = true;
export const View = (_: { p: URLSearchParams }) => <Search />;
