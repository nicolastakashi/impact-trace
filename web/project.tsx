// PROJECT: one project, all of it. Sources on top; every thread opens to its events.
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, ChevronRight } from "lucide-react";
import { By, Strip, toast } from "./lib";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";
import { NativeSelect } from "./ui/input";
import {
  ConfirmButtons,
  crumbClass,
  eventKind,
  NoGoalsLink,
  send,
  smallSelectClass,
  Src,
  threads,
  toggled,
  toReviewClass,
  ViewNote,
} from "./views-shared";

type Data = any;
type Act = (url: string, body: unknown, done: string) => void;

const reviewLink = (thread: Data, projectId: string) =>
  `#/review?week=${thread.week}&key=${encodeURIComponent(thread.key)}&from=${encodeURIComponent(projectId)}`;
const bannerClass =
  "flex flex-wrap items-center gap-2.5 rounded-xl border border-line-2 bg-secondary px-3.5 py-2.5 text-[13.5px] text-ink-2";

const Crumb = () => (
  <a className={cn(crumbClass, "justify-self-start")} href="#/projects">
    ← Projects
  </a>
);
const Head = ({ name, children }: { name: string; children?: React.ReactNode }) => (
  <div className="vhead -mt-3">
    <h1 className="text-[clamp(28px,3.6vw,44px)]">{name}</h1>
    {children}
  </div>
);
const ProjectOptions = ({ projects }: { projects: Data[] }) =>
  projects.map((project: Data) => (
    <option key={project.id} value={project.id}>
      {project.name}
    </option>
  ));

// Picking a project shows a button that names exactly what will happen; pressing it confirms.
function MergeIn({
  id,
  others,
  merging,
  setMerging,
  pick,
  setPick,
  act,
}: {
  id: string;
  others: Data[];
  merging: boolean;
  setMerging: (on: boolean) => void;
  pick: string;
  setPick: (id: string) => void;
  act: Act;
}) {
  const pickedName = others.find((project: Data) => project.id === pick)?.name;
  if (!merging)
    return (
      others.length > 0 && (
        <Button variant="dashed" size="xs" onClick={() => setMerging(true)}>
          ＋ merge another project in
        </Button>
      )
    );
  return (
    <>
      <NativeSelect
        autoFocus
        aria-label="Project to merge in"
        className="h-8 w-auto px-2 font-mono text-xs"
        value={pick}
        onChange={(e) => setPick(e.target.value)}
      >
        <option value="">Pick a project to merge in…</option>
        <ProjectOptions projects={others} />
      </NativeSelect>
      {pickedName && (
        <Button
          variant="dashed"
          size="xs"
          onClick={() => act("/api/merge", { from: pick, into: id }, `Merged ${pickedName}`)}
        >{`merge ${pickedName} in`}</Button>
      )}
      <Button
        variant="dashed"
        size="xs"
        onClick={() => {
          setMerging(false);
          setPick("");
        }}
      >
        cancel
      </Button>
    </>
  );
}

function Sources({ data, act, children }: { data: Data; act: Act; children: React.ReactNode }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {data.sources.map((source: Data, index: number) => (
        <li key={source.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            <Src kind={source.kind} />
            {source.name}
          </span>
          <span className="lbl">{source.kind === "topic" ? "topic" : "Linear"}</span>
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener"
              aria-label="Open in Linear"
              className="text-ink-3 hover:text-brand"
            >
              <ArrowUpRight className="size-4" />
            </a>
          )}
          {index > 0 && (
            <Button
              variant="dashed"
              size="xs"
              onClick={() => act("/api/unmerge", { from: source.id }, "Split out again")}
            >
              split out
            </Button>
          )}
        </li>
      ))}
      <li className="flex flex-wrap items-center gap-2">{children}</li>
    </ul>
  );
}

function DeleteProject({
  name,
  liveCount,
  merged,
  deleting,
  setDeleting,
  onDelete,
}: {
  name: string;
  liveCount: number;
  merged: boolean;
  deleting: boolean;
  setDeleting: (on: boolean) => void;
  onDelete: () => void;
}) {
  if (!deleting)
    return (
      <Button
        variant="dashed-destructive"
        size="xs"
        className="justify-self-start"
        onClick={() => setDeleting(true)}
      >
        delete project
      </Button>
    );
  const unmerged = merged ? ", and the merged projects stand alone again" : "";
  return (
    <div className={cn(bannerClass, "border-brand/45")}>
      {`Delete ${name}? ${threads(liveCount)} will have no project${unmerged}. You can restore it from the list.`}
      <ConfirmButtons
        label="delete"
        destructive
        onConfirm={onDelete}
        onCancel={() => setDeleting(false)}
      />
    </div>
  );
}

function GoalsAndFacts({ data, id, act }: { data: Data; id: string; act: Act }) {
  const project = data.project;
  const facts = [
    project.status,
    data.open ? `${data.open} open issues` : "",
    project.lead ? `lead ${project.lead}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="grid content-start gap-2.5">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label="Goals this project serves"
      >
        <span className="lbl">Serves</span>
        {data.goals.length ? (
          data.goals.map((goal: Data) => (
            <Button
              key={goal.id}
              variant="outline"
              size="xs"
              aria-pressed={!!goal.on_}
              className="rounded-full border-dashed bg-transparent px-2.5 text-xs font-medium text-ink-2 aria-pressed:border-solid aria-pressed:border-ink-2 aria-pressed:bg-s3 aria-pressed:text-ink"
              onClick={() =>
                act(
                  "/api/goal-link",
                  { goal_id: goal.id, project_id: id, on: !goal.on_ },
                  goal.on_ ? `No longer serves ${goal.title}` : `Serves ${goal.title}`,
                )
              }
            >
              {goal.title}
            </Button>
          ))
        ) : (
          <NoGoalsLink />
        )}
      </div>
      {facts && <By className="text-xs">{facts}</By>}
      {data.ms.map((milestone: Data) => (
        <div
          key={milestone.name}
          className="grid grid-cols-[1fr_90px_40px] items-center gap-2.5 text-[12.5px] text-ink-2"
        >
          <span>{milestone.name}</span>
          <span className="h-1.5 overflow-hidden rounded-sm bg-s3">
            <i
              className="block h-full rounded-sm bg-brand"
              style={{ width: `${milestone.progress || 0}%` }}
            />
          </span>
          <b className="text-right font-num text-[13px] font-bold text-ink">
            {milestone.progress == null ? "—" : `${milestone.progress}%`}
          </b>
        </div>
      ))}
    </div>
  );
}

function ThreadState({ thread }: { thread: Data }) {
  if (thread.discarded) return <span className="lbl">discarded</span>;
  if (thread.decided)
    return (
      <Check className="size-3.5 flex-none self-center text-ok" aria-label="You decided this" />
    );
  return <span className={toReviewClass}>to review</span>;
}

function ThreadEvents({ thread, sources }: { thread: Data; sources: Map<string, Data> | null }) {
  return (
    <ul className="m-0 list-none border-t border-line px-3.5 py-0">
      {thread.events.map((event: Data) => {
        // Only a merged project says which source each event came from.
        const source = sources?.get(event.source);
        return (
          <li
            key={event.id}
            className="grid gap-0.5 border-t border-line py-2 text-[13.5px] first:border-t-0 md:grid-cols-[110px_minmax(0,1fr)_auto] md:gap-3"
          >
            <By className="pt-0.5 text-[11px]">{eventKind(event.kind)}</By>
            <span className="wrap-anywhere">
              {event.url ? (
                <a href={event.url} target="_blank" rel="noopener" className="hover:text-brand">
                  {event.title ?? event.id}
                  <ArrowUpRight className="ml-0.5 inline size-3.5 text-ink-3" />
                </a>
              ) : (
                (event.title ?? event.id)
              )}
            </span>
            {source ? (
              <By className="inline-flex items-center whitespace-nowrap text-[11px]">
                <Src kind={source.kind} />
                {source.name}
              </By>
            ) : (
              <span />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ThreadItem({
  thread,
  id,
  open,
  toggle,
  sources,
  others,
  act,
}: {
  thread: Data;
  id: string;
  open: boolean;
  toggle: () => void;
  sources: Map<string, Data> | null;
  others: Data[];
  act: Act;
}) {
  const chevron = "size-3.5 flex-none self-center text-ink-3";
  return (
    <li className={cn("rounded-xl border border-line bg-card", thread.discarded && "opacity-55")}>
      <button
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full cursor-pointer items-baseline gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] focus-visible:outline-2 focus-visible:outline-brand"
      >
        {open ? <ChevronDown className={chevron} /> : <ChevronRight className={chevron} />}
        <b className="font-medium">{thread.title ?? "Untitled"}</b>
        <By>{thread.events.length}</By>
        <ThreadState thread={thread} />
      </button>
      {open && (
        <>
          <ThreadEvents thread={thread} sources={sources} />
          <div className="flex flex-wrap items-center gap-2.5 border-t border-line px-3.5 py-2.5">
            <Button asChild variant="dashed" size="xs">
              <a href={reviewLink(thread, id)} className="no-underline">
                open in review →
              </a>
            </Button>
            <NativeSelect
              className={smallSelectClass}
              value=""
              aria-label="Move this thread"
              onChange={(e) => {
                const target = others.find((project: Data) => project.id === e.target.value);
                if (target)
                  act(
                    "/api/group",
                    { week: thread.week, key: thread.key, group_id: target.id },
                    `Moved to ${target.name}`,
                  );
              }}
            >
              <option value="">Move to another project…</option>
              <ProjectOptions projects={others} />
            </NativeSelect>
          </div>
        </>
      )}
    </li>
  );
}

function Project({ pid }: { pid: string }) {
  const [id, setId] = useState(pid);
  const [data, setData] = useState<Data>(null);
  const [allGroups, setAllGroups] = useState<Data[]>([]);
  const [missing, setMissing] = useState(false);
  const [openThreads, setOpenThreads] = useState(new Set<string>());
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [merging, setMerging] = useState(false);
  const [pick, setPick] = useState("");
  const [deleting, setDeleting] = useState(false);
  async function load(at: string) {
    const r = await fetch(`/api/project?id=${encodeURIComponent(at)}`);
    if (!r.ok) return setMissing(true);
    const loaded = await r.json();
    // A merged project lives inside another one now: go there.
    if (loaded.into) {
      history.replaceState(null, "", `#/project?id=${encodeURIComponent(loaded.into)}`);
      setId(loaded.into);
      return load(loaded.into);
    }
    setAllGroups((await (await fetch("/api/groups")).json()).groups);
    setData(loaded);
  }
  useEffect(() => {
    setId(pid);
    setData(null);
    setMissing(false);
    setOpenThreads(new Set());
    setShowDiscarded(false);
    setMerging(false);
    setDeleting(false);
    load(pid);
  }, [pid]);
  async function act(url: string, body: unknown, done: string) {
    if (!(await send(url, body))) return;
    toast(done);
    setMerging(false);
    setPick("");
    await load(id);
  }
  async function deleteProject() {
    if (!(await send("/api/delete", { id }))) return;
    toast(`Deleted ${data.project.name}`);
    location.hash = "#/projects";
  }

  if (missing)
    return (
      <ViewNote>
        This project does not exist.{" "}
        <a className="underline" href="#/projects">
          Back to projects
        </a>
      </ViewNote>
    );
  if (!data) return <ViewNote>Loading project…</ViewNote>;
  const project = data.project;
  if (data.deleted)
    return (
      <>
        <Crumb />
        <Head name={project.name} />
        <div className={bannerClass}>
          You deleted this project, so its threads have no project.{" "}
          <Button
            variant="dashed"
            size="xs"
            onClick={() => act("/api/restore", { id }, "Restored")}
          >
            restore
          </Button>
        </div>
      </>
    );

  const merged = data.sources.length > 1;
  const sources = merged ? new Map(data.sources.map((s: Data) => [s.id, s])) : null;
  const live = data.threads.filter((thread: Data) => !thread.discarded);
  const discardedCount = data.threads.length - live.length;
  const shown = showDiscarded ? data.threads : live;
  const next = live.find((thread: Data) => !thread.decided);
  const todo = live.filter((thread: Data) => !thread.decided).length;
  const liveIn = (week: string) => live.filter((thread: Data) => thread.week === week).length;
  const max = Math.max(1, ...data.weeks.map(liveIn));
  const others = allGroups.filter((group: Data) => group.id !== project.id);
  const weeks = data.weeks.filter((week: string) =>
    shown.some((thread: Data) => thread.week === week),
  );
  return (
    <>
      <Crumb />
      <Head name={project.name}>
        {next ? (
          <a
            href={reviewLink(next, id)}
            className="rounded-lg border border-brand/50 px-3 py-2 font-mono text-[13px] font-medium tracking-wider text-brand uppercase no-underline hover:bg-brand/10"
          >{`${todo} to review →`}</a>
        ) : (
          <span className="lbl">all reviewed ✓</span>
        )}
      </Head>
      <Card className="grid-cols-1 gap-x-7 gap-y-4 shadow-none sm:p-5.5 md:grid-cols-2">
        <div className="grid content-start gap-2.5">
          <span className="lbl">Sources</span>
          <Sources data={data} act={act}>
            <MergeIn
              id={id}
              others={others}
              merging={merging}
              setMerging={setMerging}
              pick={pick}
              setPick={setPick}
              act={act}
            />
          </Sources>
          <DeleteProject
            name={project.name}
            liveCount={live.length}
            merged={merged}
            deleting={deleting}
            setDeleting={setDeleting}
            onDelete={deleteProject}
          />
        </div>
        <GoalsAndFacts data={data} id={id} act={act} />
      </Card>
      <Strip weeks={data.weeks} count={liveIn} max={max} />
      <div className="grid gap-3.5">
        {weeks.length ? (
          weeks.map((week: string) => (
            <div key={week} className="grid gap-1 md:grid-cols-[44px_1fr] md:gap-3">
              <span className="lbl pt-3">{week.slice(5)}</span>
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {shown
                  .filter((thread: Data) => thread.week === week)
                  .map((thread: Data) => (
                    <ThreadItem
                      key={thread.key}
                      thread={thread}
                      id={id}
                      open={openThreads.has(thread.key)}
                      toggle={() => setOpenThreads((set) => toggled(set, thread.key))}
                      sources={sources}
                      others={others}
                      act={act}
                    />
                  ))}
              </ul>
            </div>
          ))
        ) : (
          <span className="lbl">
            No threads yet. Pick this project for a thread in review with P.
          </span>
        )}
      </div>
      {discardedCount > 0 && (
        <Button
          variant="dashed"
          size="xs"
          className="justify-self-start"
          onClick={() => setShowDiscarded(!showDiscarded)}
        >{`${showDiscarded ? "hide" : "show"} ${discardedCount} discarded`}</Button>
      )}
    </>
  );
}

export const View = ({ p }: { p: URLSearchParams }) => (
  <section className="view" id="v-project">
    <div className="grid gap-5">
      <Project pid={p.get("id") ?? ""} />
    </div>
  </section>
);
