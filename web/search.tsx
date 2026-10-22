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
// One row: a view, the recap or a thread. `tag` is the right-hand caption; `haystack` what the query matches.
type Result = {
  id: string;
  label: string;
  tag: string;
  mode?: string;
  haystack?: string;
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
    ...north.threads.map((thread) => {
      const praisedBy = thread.praiseIndex != null ? north.praise[thread.praiseIndex].who : "";
      return {
        id: `i:${thread.id}`,
        label: thread.title,
        tag: north.weeks[thread.weekIndex]!,
        mode: thread.mode,
        run: () => openItem(thread.id),
        haystack:
          `${thread.title} ${north.projects[thread.projectId]?.name ?? ""} ${thread.quote?.who ?? ""} ${praisedBy}`.toLowerCase(),
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
    setOpen((wasOpen) => !wasOpen);
    setQuery("");
    setSelected("");
    went.current = false;
  });
  // Our own filter, not cmdk's fuzzy one: a plain substring, at most 12 results.
  const needle = query.toLowerCase();
  const results = resultsOf(north)
    .filter((result) => !query || (result.haystack ?? result.label.toLowerCase()).includes(needle))
    .slice(0, 12);
  const active = results.some((result) => result.id === selected)
    ? selected
    : (results[0]?.id ?? "");
  const pick = (result: Result) => {
    went.current = true;
    setOpen(false);
    result.run();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        aria-describedby={undefined}
        className="top-[12vh] bottom-auto max-w-155 gap-0 overflow-hidden rounded-2xl p-0"
        onCloseAutoFocus={(event) => went.current && event.preventDefault()}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={false} value={active} onValueChange={setSelected}>
          <CommandInput
            placeholder="Search items, people, views…"
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setSelected("");
            }}
          />
          <CommandList>
            <CommandEmpty>Nothing found. Try a person or a stream name.</CommandEmpty>
            {results.map((result) => (
              <CommandItem key={result.id} value={result.id} onSelect={() => pick(result)}>
                <i
                  className="size-2.5 flex-none rounded-full"
                  style={{ background: result.mode ? mc(result.mode) : "var(--line-2)" }}
                />
                <span className="min-w-0 flex-1 truncate">{result.label}</span>
                <span className="font-mono text-[11px] font-medium text-ink-3">{result.tag}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export const View = (_: { p: URLSearchParams }) => <Search />;
