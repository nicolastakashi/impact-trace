// SEARCH: the ⌘K box. Views, the recap and your threads, by title, project or person.
import { useRef, useState } from "react";
import { go, mc, type North, openItem, openStory, useEvent, useNorth } from "./lib";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

const VIEWS = [
  ["home", "North"],
  ["goals", "Goals"],
  ["projects", "Projects"],
  ["project", "Project"],
  ["trace", "Trace"],
  ["feedback", "Feedback"],
  ["review", "Review"],
  ["refs", "References"],
  ["setup", "Setup"],
];
// One row: a view, the recap or a thread. `tag` is the right-hand caption; `hay` what the query matches.
type Result = {
  id: string;
  label: string;
  tag: string;
  mode?: string;
  hay?: string;
  run: () => void;
};

function resultsOf(north: North | null): Result[] {
  if (!north) return [];
  return [
    ...VIEWS.map(([view, label]) => ({
      id: `v:${view}`,
      label: `Go to ${label}`,
      tag: "view",
      run: () => go(`#/${view}`),
    })),
    { id: "recap", label: "Open recap (Wrapped)", tag: "recap", run: openStory },
    ...north.ITEMS.map((i) => {
      const praisedBy = i.rec != null ? north.REC[i.rec].who : "";
      return {
        id: `i:${i.id}`,
        label: i.title,
        tag: north.WEEKS[i.w]!,
        mode: i.mode,
        run: () => openItem(i.id),
        hay: `${i.title} ${north.PROJECTS[i.s]?.name ?? ""} ${i.quote?.who ?? ""} ${praisedBy}`.toLowerCase(),
      };
    }),
  ];
}

export function Search() {
  const [north] = useNorth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  // A result moves focus on (a view, the sheet, the recap): then do not hand it back to the header.
  const went = useRef(false);
  // ⌘K again closes it.
  useEvent("open-search", () => {
    setOpen((o) => !o);
    setQuery("");
    setSelected("");
    went.current = false;
  });
  // Our own filter, not cmdk's fuzzy one: a plain substring, at most 12 results.
  const needle = query.toLowerCase();
  const results = resultsOf(north)
    .filter((r) => !query || (r.hay ?? r.label.toLowerCase()).includes(needle))
    .slice(0, 12);
  const active = results.some((r) => r.id === selected) ? selected : (results[0]?.id ?? "");
  const pick = (r: Result) => {
    went.current = true;
    setOpen(false);
    r.run();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        aria-describedby={undefined}
        className="top-[12vh] bottom-auto max-w-155 gap-0 overflow-hidden rounded-2xl p-0"
        onCloseAutoFocus={(e) => went.current && e.preventDefault()}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={false} value={active} onValueChange={setSelected}>
          <CommandInput
            placeholder="Search items, people, views…"
            value={query}
            onValueChange={(v) => {
              setQuery(v);
              setSelected("");
            }}
          />
          <CommandList>
            <CommandEmpty>Nothing found. Try a person or a stream name.</CommandEmpty>
            {results.map((r) => (
              <CommandItem key={r.id} value={r.id} onSelect={() => pick(r)}>
                <i
                  className="size-2.5 flex-none rounded-full"
                  style={{ background: r.mode ? mc(r.mode) : "var(--line-2)" }}
                />
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                <span className="font-mono text-[11px] font-medium text-ink-3">{r.tag}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export const View = (_: { p: URLSearchParams }) => <Search />;
