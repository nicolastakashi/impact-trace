// PROJECTS: Linear projects and your own topics, across weeks. A card opens the project page.
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { By, Strip, toast } from "./lib";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { NativeSelect } from "./ui/input";
import {
  ConfirmButtons,
  send,
  smallSelectClass,
  SourceDiamond,
  threads,
  toReviewClass,
  ViewNote,
} from "./views-shared";

type Data = any;
// Merge or delete, waiting for you to confirm. `into` is set for a merge.
type Ask = { id: string; into?: string } | null;
type Run = (url: string, body: unknown, done?: string) => void;

const KINDS = [
  ["all", "All"],
  ["linear", "Linear"],
  ["topic", "Topics"],
];

const threadCount = (group: Data) =>
  Object.values(group.weeks).reduce((sum: number, list: Data) => sum + list.length, 0);

function SourceLine({ group, linear }: { group: Data; linear: Data }) {
  const merged = group.merged?.length
    ? ` · includes ${group.merged.map((mergedProject: Data) => mergedProject.name).join(", ")}`
    : "";
  if (group.kind === "topic" || !linear)
    return (
      <By className="-mt-2">
        <SourceDiamond kind="topic" />
        {`topic${merged}`}
      </By>
    );
  const status = linear.status ? ` · ${linear.status}` : "";
  const open = linear.open ? ` · ${linear.open} open` : "";
  return (
    <By className="-mt-2">
      <SourceDiamond kind="linear" />
      {`Linear${status}${open}${merged}`}
    </By>
  );
}

// Merge and delete ask once, inline, and name what will happen.
function CardActions({
  group,
  groups,
  ask,
  setAsk,
  run,
}: {
  group: Data;
  groups: Data[];
  ask: Ask;
  setAsk: (ask: Ask) => void;
  run: Run;
}) {
  const asking = ask?.id === group.id;
  if (asking && ask.into) {
    const into = ask.into;
    const intoName = groups.find((other: Data) => other.id === into)?.name;
    return (
      <>
        {`Merge ${group.name} into ${intoName}? Its ${threads(group.total)} move there. You can split it out again.`}
        <ConfirmButtons
          className="ml-auto"
          label="merge"
          onConfirm={() => run("/api/merge", { from: group.id, into }, "Merged")}
          onCancel={() => setAsk(null)}
        />
      </>
    );
  }
  if (asking) {
    const unmerged = group.merged?.length ? ", and the merged projects stand alone again" : "";
    return (
      <>
        {`Delete ${group.name}? ${threads(group.total)} will have no project${unmerged}. You can restore it below.`}
        <ConfirmButtons
          className="ml-auto"
          label="delete"
          destructive
          onConfirm={() => run("/api/delete", { id: group.id }, "Deleted")}
          onCancel={() => setAsk(null)}
        />
      </>
    );
  }
  return (
    <>
      <NativeSelect
        className={smallSelectClass}
        value=""
        aria-label={`Merge ${group.name} into another project`}
        onChange={(event) =>
          event.target.value && setAsk({ id: group.id, into: event.target.value })
        }
      >
        <option value="">merge into…</option>
        {groups
          .filter((other: Data) => other.id !== group.id)
          .map((other: Data) => (
            <option key={other.id} value={other.id}>
              {other.name}
            </option>
          ))}
      </NativeSelect>
      <Button
        variant="dashed-destructive"
        size="xs"
        className="ml-auto"
        onClick={() => setAsk({ id: group.id })}
      >
        delete
      </Button>
    </>
  );
}

function ProjectCard({
  group,
  data,
  linear,
  max,
  children,
}: {
  group: Data;
  data: Data;
  linear: Data;
  max: number;
  children: React.ReactNode;
}) {
  const todo = Object.values(group.weeks)
    .flat()
    .filter((thread: Data) => !thread.decided).length;
  return (
    <Card className="gap-3.5 transition-colors hover:border-line-2 sm:p-5.5">
      <a
        className="grid gap-3.5 rounded-xl text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-6 focus-visible:outline-brand"
        href={`#/project?id=${encodeURIComponent(group.id)}`}
        aria-label={group.name}
      >
        <span className="flex items-baseline gap-x-3.5 gap-y-2">
          <h2 className="m-0 font-num text-[22px] leading-[1.02] font-extrabold text-balance uppercase">
            {group.name}
          </h2>
          {todo > 0 && <span className={toReviewClass}>{todo} to review</span>}
          <ChevronRight className="ml-auto size-4 self-center text-ink-3" />
        </span>
        <SourceLine group={group} linear={linear} />
        <Strip weeks={data.weeks} count={(week) => (group.weeks[week] ?? []).length} max={max} />
      </a>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[13.5px] text-ink-2">
        {children}
      </div>
    </Card>
  );
}

function DeletedList({ deleted, run }: { deleted: Data[]; run: Run }) {
  return (
    <details>
      <summary className="lbl cursor-pointer">{`Deleted · ${deleted.length}`}</summary>
      <ul className="m-0 mt-2.5 grid list-none gap-2 p-0">
        {deleted.map((project: Data) => (
          <li key={project.id} className="flex items-center gap-2.5 text-sm text-ink-2">
            <span>
              <SourceDiamond kind={project.kind} />
              {project.name}
            </span>
            <Button
              variant="dashed"
              size="xs"
              onClick={() => run("/api/restore", { id: project.id })}
            >
              restore
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ProjectList({
  data,
  linear,
  filter,
  ask,
  setAsk,
  run,
}: {
  data: Data;
  linear: Map<string, Data>;
  filter: string;
  ask: Ask;
  setAsk: (ask: Ask) => void;
  run: Run;
}) {
  const groups = data.groups
    .filter((group: Data) => filter === "all" || group.kind === filter)
    .map((group: Data) => ({ ...group, total: threadCount(group) }))
    .sort(
      (left: Data, right: Data) => right.total - left.total || left.name.localeCompare(right.name),
    );
  const max = Math.max(
    1,
    ...groups.flatMap((group: Data) => Object.values(group.weeks).map((list: Data) => list.length)),
  );
  return (
    <>
      {groups.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(520px,100%),1fr))] items-start gap-3">
          {groups.map((group: Data) => (
            <ProjectCard
              key={group.id}
              group={group}
              data={data}
              linear={linear.get(group.id)}
              max={max}
            >
              <CardActions group={group} groups={data.groups} ask={ask} setAsk={setAsk} run={run} />
            </ProjectCard>
          ))}
        </div>
      ) : (
        <ViewNote>
          No projects yet. In review, press P on a thread to pick one or create a topic.
        </ViewNote>
      )}
      {data.deleted.length > 0 && <DeletedList deleted={data.deleted} run={run} />}
    </>
  );
}

function KindFilter({ filter, setFilter }: { filter: string; setFilter: (kind: string) => void }) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Kind of project">
      {KINDS.map(([kind, label]) => (
        <Button
          key={kind}
          variant="outline"
          size="xs"
          aria-pressed={filter === kind}
          onClick={() => setFilter(kind!)}
          className="px-2.5 font-mono text-xs text-ink-2 aria-pressed:border-ink-2 aria-pressed:bg-s3 aria-pressed:text-ink"
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

function Projects() {
  const [data, setData] = useState<Data>(null);
  const [linear, setLinear] = useState(new Map<string, Data>());
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [ask, setAsk] = useState<Ask>(null);
  // Always fresh: decisions made in review change the counts here.
  const load = async () => {
    const [groups, linearProjects] = await Promise.all([
      fetch("/api/groups").then((response) => (response.ok ? response.json() : null)),
      fetch("/api/projects?weeks=")
        .then((response) => (response.ok ? response.json() : { projects: [] }))
        .catch(() => ({ projects: [] })),
    ]);
    if (!groups) return setFailed(true);
    setLinear(new Map(linearProjects.projects.map((project: Data) => [project.id, project])));
    setAsk(null);
    setData(groups);
  };
  useEffect(() => {
    load();
  }, []);
  async function run(url: string, body: unknown, done?: string) {
    setAsk(null);
    if (!(await send(url, body))) return;
    if (done) toast(done);
    await load();
  }

  let body: React.ReactNode;
  if (failed)
    body = <ViewNote>Projects need the app server. Start it with bun app/server.ts.</ViewNote>;
  else if (!data) body = <ViewNote>Loading projects…</ViewNote>;
  else
    body = (
      <ProjectList
        data={data}
        linear={linear}
        filter={filter}
        ask={ask}
        setAsk={setAsk}
        run={run}
      />
    );
  return (
    <section className="view" id="v-projects">
      <div className="vhead">
        <h1>
          Projects <em>across weeks</em>
        </h1>
        <KindFilter filter={filter} setFilter={setFilter} />
      </div>
      <div className="grid gap-3.5">{body}</div>
    </section>
  );
}

// The old address #/projects?p=<id> opens that project.
export function View({ p: params }: { p: URLSearchParams }) {
  const id = params.get("p");
  useEffect(() => {
    if (id) location.replace(`#/project?id=${encodeURIComponent(id)}`);
  }, [id]);
  return id ? null : <Projects />;
}
