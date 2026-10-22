// GOALS: what your work serves. You write them; projects and single threads link to them.
import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, ChevronUp, Plus, XIcon } from "lucide-react";
import { By, post, Strip, toast } from "./lib";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { cn } from "./ui/cn";
import { Input, Label, NativeSelect, Textarea } from "./ui/input";
import { ConfirmButtons, send, smallSelectClass, threads, toggled, ViewNote } from "./views-shared";

type Data = any;
// What the form is open for: "team" | "personal" for a new goal, a goal id, or a draft.
type Edit = string | number | Data | null;

const asText = (value: unknown) => (value == null ? "" : String(value));
const scoreText = (score: number | null) => (score == null ? "–" : score.toFixed(2));
// Last quarter, this one and the next three.
function quarterChoices() {
  const now = new Date();
  const current = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
  return [-1, 0, 1, 2, 3].map((offset) => {
    const quarter = current + offset;
    return `${Math.floor(quarter / 4)}-Q${(quarter % 4) + 1}`;
  });
}
// Where a goal of this type is on track: committed must reach 1.0, aspirational 0.7.
const onTrackAt = (type: string) => (type === "committed" ? 1 : 0.7);
// The objective's score: the mean of its key results that have numbers.
const goalScore = (goal: Data) => {
  const scores = goal.keyResults
    .map((keyResult: Data) => keyResult.progress)
    .filter((progress: Data) => progress != null);
  if (!scores.length) return null;
  return scores.reduce((sum: number, progress: number) => sum + progress, 0) / scores.length;
};
const metricOf = (data: Data, key: string) =>
  data.metrics.find((metric: Data) => metric.key === key);
const milestoneOf = (data: Data, key: string) =>
  data.milestones.find((milestone: Data) => `milestone:${milestone.id}` === key);
const titleClass = "m-0 font-num font-extrabold uppercase text-balance";
const hintClass = "text-[12.5px] font-normal text-ink-3";
const shortWeek = (data: Data) => data.week.slice(5);

export function Goals({ focus }: { focus: string | null }) {
  const [data, setData] = useState<Data>(null);
  const [failed, setFailed] = useState(false);
  const [edit, setEdit] = useState<Edit>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [threadsOpen, setThreadsOpen] = useState(new Set<number>());
  const [openGoal, setOpenGoal] = useState<number | null>(null);
  const [draftIndex, setDraftIndex] = useState(0);
  // One goal is open on its own, and stays open when a second one comes.
  const load = async () => {
    const response = await fetch("/api/goals");
    if (!response.ok) return setFailed(true);
    const loaded = await response.json();
    if (loaded.goals.length === 1) setOpenGoal(loaded.goals[0].id);
    setData(loaded);
  };
  useEffect(() => {
    if (focus) {
      setThreadsOpen((set) => new Set(set).add(+focus));
      setOpenGoal(+focus);
    }
    load();
  }, [focus]);
  async function act(url: string, body: unknown, done: string) {
    if (!(await send(url, body))) return;
    toast(done);
    await load();
  }
  // A goal named after one of your projects, already linked, open for you to rename.
  async function seed(project: Data) {
    const created = await send("/api/goal", { title: project.name, kind: "team" });
    if (!created) return;
    const { id } = await created.json();
    await post("/api/goal-link", { goal_id: id, project_id: project.id, on: true });
    setEdit(id);
    toast(`Goal created from ${project.name}`);
    await load();
  }
  async function addDraft(goal: Data) {
    if (!goal.keyResults.length) return toast("Keep at least one key result");
    await act("/api/goal", goal, `Added: ${goal.title}`);
  }
  const skipDraft = (id: number) => act("/api/draft-dismiss", { id }, "Skipped. The draft is gone");
  const saved = async (id: number | null) => {
    setEdit(null);
    toast(id ? "Goal saved" : "Goal created");
    await load();
  };

  const goalActions = (goal: Data): CardActions => ({
    edit: () => setEdit(goal.id),
    askDelete: () => setDeleting(goal.id),
    keep: () => setDeleting(null),
    close: () => setOpenGoal(null),
    confirmDelete: () => {
      setDeleting(null);
      act("/api/goal", { id: goal.id, delete: true }, "Goal deleted");
    },
    toggleThreads: () => setThreadsOpen((set) => toggled(set, goal.id)),
    confidence: (confidence: number) =>
      act("/api/checkin", { goal_id: goal.id, confidence }, `Confidence ${confidence} saved`),
    link: (project: Data, on: boolean) =>
      act(
        "/api/goal-link",
        { goal_id: goal.id, project_id: project.id, on },
        on ? `Linked ${project.name}` : "Project unlinked",
      ),
  });
  const openRow = (id: number) => {
    setOpenGoal(id);
    requestAnimationFrame(() =>
      document.getElementById(`goal-${id}`)?.scrollIntoView({ block: "nearest" }),
    );
  };

  function body() {
    if (failed)
      return <ViewNote>Goals need the app server. Start it with bun app/server.ts.</ViewNote>;
    if (!data) return <ViewNote>Loading goals…</ViewNote>;
    const form = (goal: Data) => (
      <GoalForm
        key={goal.id ?? "new"}
        data={data}
        goal={goal}
        cancel={() => setEdit(null)}
        saved={saved}
      />
    );
    const list = (
      <GoalList
        data={data}
        editing={edit}
        deleting={deleting}
        openGoal={data.goals.length === 1 ? data.goals[0].id : openGoal}
        threadsOpen={threadsOpen}
        form={form}
        openRow={openRow}
        actions={goalActions}
      />
    );
    // A new goal or a draft opens the form above the list.
    const formGoal = typeof edit === "string" ? { kind: edit } : typeof edit === "object" && edit;
    if (formGoal)
      return (
        <>
          {form(formGoal)}
          {list}
        </>
      );
    if (!data.goals.length && !data.drafts.length)
      return <FirstGoal data={data} pick={setEdit} seed={seed} />;
    const index = Math.min(draftIndex, data.drafts.length - 1);
    return (
      <>
        {data.drafts.length > 0 && (
          <DraftCard
            key={data.drafts[index].id}
            data={data}
            index={index}
            keys={edit == null}
            go={setDraftIndex}
            add={addDraft}
            skip={skipDraft}
            editAll={(draft: Data) => setEdit({ ...draft, id: null, draft_id: draft.id })}
          />
        )}
        <Button
          variant="outline"
          className="justify-self-start border-brand/50 font-mono text-[13px] tracking-wider text-brand uppercase hover:bg-brand/10 hover:text-brand"
          onClick={() => setEdit("team")}
        >
          <Plus />
          new goal
        </Button>
        {list}
      </>
    );
  }
  return (
    <section className="view" id="v-goals">
      <div className="vhead">
        <h1>Goals</h1>
        <p>
          Link a project here, or one thread in review with <kbd>L</kbd>. North shows how much of
          your work serves each goal.
        </p>
      </div>
      <div className="grid gap-3.5">{body()}</div>
    </section>
  );
}

// Each goal is a form while you edit it, a card while open, a row otherwise.
function GoalList({
  data,
  editing,
  deleting,
  openGoal,
  threadsOpen,
  form,
  openRow,
  actions,
}: {
  data: Data;
  editing: Edit;
  deleting: number | null;
  openGoal: number | null;
  threadsOpen: Set<number>;
  form: (goal: Data) => React.ReactNode;
  openRow: (id: number) => void;
  actions: (goal: Data) => CardActions;
}) {
  const max = Math.max(
    1,
    ...data.goals.flatMap((goal: Data) =>
      Object.values(goal.weeks).map((list: Data) => list.length),
    ),
  );
  return (
    <div className="grid gap-2">
      {data.goals.map((goal: Data) => {
        if (editing === goal.id) return form(goal);
        if (openGoal !== goal.id && deleting !== goal.id)
          return <GoalRow key={goal.id} data={data} goal={goal} open={() => openRow(goal.id)} />;
        return (
          <GoalCard
            key={goal.id}
            data={data}
            goal={goal}
            max={max}
            deleting={deleting === goal.id}
            threadsOpen={threadsOpen.has(goal.id)}
            actions={actions(goal)}
          />
        );
      })}
    </div>
  );
}

// A key result names a metric the app measures, a milestone, or nothing: then you type "now".
function MeasureOptions({ data }: { data: Data }) {
  return (
    <>
      <option value="">I update it</option>
      <optgroup label="The app measures">
        {data.metrics.map((metric: Data) => (
          <option key={metric.key} value={metric.key}>
            {metric.label}
          </option>
        ))}
      </optgroup>
      {data.milestones.length > 0 && (
        <optgroup label="Linear milestone, % done">
          {data.milestones.map((milestone: Data) => (
            <option
              key={milestone.id}
              value={`milestone:${milestone.id}`}
            >{`${milestone.project} · ${milestone.name}`}</option>
          ))}
        </optgroup>
      )}
    </>
  );
}

// Two or more buttons, one pressed: a choice that is always visible.
function Choice({
  label,
  value,
  options,
  set,
}: {
  label: string;
  value: string;
  options: string[][];
  set: (value: string) => void;
}) {
  return (
    <div className="grid gap-1.5 text-sm text-ink-2">
      <span id={`go-${label}-l`}>{label === "kind" ? "For" : "Type"}</span>
      <div className="inline-flex gap-1" role="group" aria-labelledby={`go-${label}-l`}>
        {options.map(([key, text]) => (
          <Button
            key={key}
            type="button"
            variant="outline"
            aria-pressed={value === key}
            onClick={() => set(key!)}
            className="bg-secondary font-normal text-ink-2 aria-pressed:border-ink-2 aria-pressed:bg-s3 aria-pressed:text-ink"
          >
            {text}
          </Button>
        ))}
      </div>
    </div>
  );
}

type KeyResultFields = {
  text: string;
  metric: string;
  start: string;
  target: string;
  current: string;
};
const emptyKeyResult: KeyResultFields = {
  text: "",
  metric: "",
  start: "",
  target: "",
  current: "",
};

function KeyResultNumber({
  label,
  value,
  disabled,
  set,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  set: (value: string) => void;
}) {
  return (
    <Label className="text-[11.5px]">
      {label}
      <Input
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(event) => set(event.target.value)}
      />
    </Label>
  );
}

function KeyResultRow({
  data,
  keyResult,
  index,
  change,
  remove,
}: {
  data: Data;
  keyResult: KeyResultFields;
  index: number;
  change: (fields: Partial<KeyResultFields>) => void;
  remove: () => void;
}) {
  return (
    <div
      data-kr
      className="grid grid-cols-3 items-end gap-2 rounded-xl border border-line p-2.5 lg:grid-cols-[minmax(180px,2fr)_minmax(150px,1.3fr)_repeat(3,minmax(64px,.5fr))_auto] lg:border-0 lg:p-0"
    >
      <Input
        className="col-span-3 lg:col-span-1"
        aria-label={`Key result ${index + 1}`}
        maxLength={200}
        placeholder={index ? "Another number that proves it" : "3 teams use exports in production"}
        value={keyResult.text}
        onChange={(event) => change({ text: event.target.value })}
      />
      {/* An auto measure fills "now" for you; switching to manual leaves it for you to type. */}
      <NativeSelect
        className="col-span-3 lg:col-span-1"
        aria-label="How it is measured"
        value={keyResult.metric}
        onChange={(event) =>
          change(event.target.value ? { metric: event.target.value, current: "" } : { metric: "" })
        }
      >
        <MeasureOptions data={data} />
      </NativeSelect>
      <KeyResultNumber label="from" value={keyResult.start} set={(start) => change({ start })} />
      <KeyResultNumber
        label="target"
        value={keyResult.target}
        set={(target) => change({ target })}
      />
      <KeyResultNumber
        label="now"
        value={keyResult.current}
        disabled={!!keyResult.metric}
        set={(current) => change({ current })}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="col-start-3 justify-self-end text-brand lg:col-start-auto"
        aria-label={`Remove key result ${index + 1}`}
        onClick={remove}
      >
        <XIcon />
      </Button>
    </div>
  );
}

const formFields = (goal: Data) => ({
  title: goal.title ?? "",
  description: goal.description ?? goal.why ?? "",
  kind: goal.kind ?? "team",
  type: goal.type ?? "aspirational",
  quarter: goal.quarter ?? "",
  keyResults: (goal.keyResults?.length ? goal.keyResults : [{}]).map(
    (keyResult: Data): KeyResultFields => ({
      text: keyResult.text ?? "",
      metric: keyResult.metric ?? "",
      start: asText(keyResult.start),
      target: asText(keyResult.target),
      current: asText(keyResult.metric ? keyResult.value : keyResult.current),
    }),
  ),
});

function GoalForm({
  data,
  goal,
  cancel,
  saved,
}: {
  data: Data;
  goal: Data;
  cancel: () => void;
  saved: (id: number | null) => void;
}) {
  const [fields, setFields] = useState(() => formFields(goal));
  const [error, setError] = useState("");
  const [moved, setMoved] = useState<"add" | "del" | null>(null);
  const quarters = quarterChoices();
  if (goal.quarter && !quarters.includes(goal.quarter)) quarters.unshift(goal.quarter);
  useEffect(() => {
    document.getElementById("go-title")?.focus();
  }, []);
  // After adding a row, type in it; after removing one, stay on the form.
  useEffect(() => {
    if (!moved) return;
    const selector =
      moved === "add" ? "#go-form [data-kr]:last-of-type input" : "#kr-add, #go-title";
    (document.querySelector(selector) as HTMLElement)?.focus();
  }, [moved, fields.keyResults.length]);
  const setField = (patch: Partial<typeof fields>) => setFields({ ...fields, ...patch });
  const changeKeyResult = (index: number, patch: Partial<KeyResultFields>) =>
    setField({
      keyResults: fields.keyResults.map((keyResult: KeyResultFields, position: number) =>
        position === index ? { ...keyResult, ...patch } : keyResult,
      ),
    });
  const setKeyResults = (keyResults: KeyResultFields[], how: "add" | "del") => {
    setField({ keyResults });
    setError("");
    setMoved(how);
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = {
      id: goal.id ?? null,
      draft_id: goal.draft_id ?? null,
      ...fields,
      quarter: fields.quarter || null,
      keyResults: fields.keyResults
        .map((keyResult: KeyResultFields) => ({ ...keyResult, metric: keyResult.metric || null }))
        .filter((keyResult) => keyResult.text.trim() || keyResult.start || keyResult.target),
    };
    const response = await post("/api/goal", body);
    // Say what is wrong without clearing what you typed.
    if (!response.ok) return setError(await response.text());
    saved(goal.id ?? null);
  }
  return (
    <Card className="gap-3.5 shadow-none sm:p-5">
      <form className="grid gap-3.5" id="go-form" onSubmit={submit}>
        <Label>
          Objective
          <Input
            id="go-title"
            name="title"
            maxLength={120}
            required
            value={fields.title}
            onChange={(event) => setField({ title: event.target.value })}
            placeholder="Customers manage datasets as code"
            autoComplete="off"
          />
          <span className={hintClass}>An outcome, not a task: what is true when you are done?</span>
        </Label>
        <Label>
          Description
          <Textarea
            id="go-desc"
            maxLength={600}
            rows={3}
            placeholder="Why this matters now, and what done looks like"
            value={fields.description}
            onChange={(event) => setField({ description: event.target.value })}
          />
        </Label>
        <div className="flex flex-wrap items-end gap-3">
          <Choice
            label="kind"
            value={fields.kind}
            set={(kind) => setField({ kind })}
            options={[
              ["team", "Team or company"],
              ["personal", "Personal"],
            ]}
          />
          <Choice
            label="type"
            value={fields.type}
            set={(type) => setField({ type })}
            options={[
              ["committed", "Committed · must reach 1.0"],
              ["aspirational", "Aspirational · 0.7 is on track"],
            ]}
          />
          <Label>
            Quarter
            <NativeSelect
              id="go-q"
              name="quarter"
              className="min-w-35"
              value={fields.quarter}
              onChange={(event) => setField({ quarter: event.target.value })}
            >
              <option value="">No end</option>
              {quarters.map((quarter) => (
                <option key={quarter}>{quarter}</option>
              ))}
            </NativeSelect>
          </Label>
        </div>
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-1.5 grid gap-0.5 p-0 text-sm text-ink-2">
            Key results{" "}
            <span className={hintClass}>
              2 to 4. Each is a number with a start and a target, so you can tell when it is done.
            </span>
          </legend>
          {fields.keyResults.map((keyResult: KeyResultFields, index: number) => (
            <KeyResultRow
              key={index}
              data={data}
              keyResult={keyResult}
              index={index}
              change={(patch) => changeKeyResult(index, patch)}
              remove={() =>
                setKeyResults(
                  fields.keyResults.filter(
                    (_: KeyResultFields, position: number) => position !== index,
                  ),
                  "del",
                )
              }
            />
          ))}
          {fields.keyResults.length < 5 ? (
            <Button
              type="button"
              variant="outline"
              className="justify-self-start font-mono text-[13px] tracking-wider uppercase"
              id="kr-add"
              onClick={() => setKeyResults([...fields.keyResults, { ...emptyKeyResult }], "add")}
            >
              <Plus />
              key result
            </Button>
          ) : (
            <span className={hintClass}>Five is the most. More is a task list.</span>
          )}
        </fieldset>
        {error && (
          <p className="m-0 text-[13px] text-brand" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit">{goal.id ? "Save objective" : "Create objective"}</Button>
          <Button variant="outline" type="button" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

// "1 → 5 teams · now 3", or what is missing.
function keyResultRange(keyResult: Data, unit: string) {
  if (keyResult.start == null || keyResult.target == null) return "add a start and a target";
  const now = keyResult.value == null ? "–" : asText(keyResult.value);
  return `${asText(keyResult.start)} → ${asText(keyResult.target)} ${unit} · now ${now}`;
}
// Who measures it, and over which window.
function keyResultSource(name: string | undefined, isMilestone: boolean, metric: Data) {
  if (!name) return "you update it";
  if (isMilestone) return `measured: ${name}`;
  const window = metric?.aggregation === "total" ? ", this quarter so far" : ", last 4 weeks";
  return `measured: ${name}${window}`;
}

// One bar per key result: 0 at the start, 1 at the target. The tick is where this type is on track.
function KeyResult({ data, keyResult, type }: { data: Data; keyResult: Data; type: string }) {
  const progress = keyResult.progress;
  const onTrack = onTrackAt(type);
  const hit = progress != null && progress >= onTrack;
  const metric = keyResult.metric && metricOf(data, keyResult.metric);
  const isMilestone = !!keyResult.metric?.startsWith("milestone:");
  const name = keyResult.metric && (metric?.label ?? milestoneOf(data, keyResult.metric)?.name);
  const unit = metric?.unit ?? (isMilestone ? "%" : "");
  return (
    <li className="grid gap-1.5">
      <div className="flex justify-between gap-3 text-[14.5px]">
        <span>{keyResult.text}</span>
        <b className={cn("num text-base", hit && "text-ok")}>{scoreText(progress)}</b>
      </div>
      <div
        className="relative h-2 rounded bg-s3"
        role="img"
        aria-label={
          progress == null ? "no numbers yet" : `${Math.round(progress * 100)}% of the way`
        }
      >
        <i
          className={cn("absolute inset-y-0 left-0 rounded", hit ? "bg-ok" : "bg-ink-2")}
          style={{ width: `${(progress ?? 0) * 100}%` }}
        />
        <s
          className="absolute -top-0.75 -bottom-0.75 -ml-px w-0.5 bg-ink"
          style={{ left: `${onTrack * 100}%` }}
        />
      </div>
      <By>{`${keyResultRange(keyResult, unit)} · ${keyResultSource(name, isMilestone, metric)}`}</By>
    </li>
  );
}

// Closed: one line per goal, so five goals still fit a screen. Open one to see and change it.
function GoalRow({ data, goal, open }: { data: Data; goal: Data; open: () => void }) {
  const score = goalScore(goal);
  const onTrack = onTrackAt(goal.type);
  const confidence = goal.checkins.find((checkin: Data) => checkin.week === data.week)?.confidence;
  return (
    <button
      aria-expanded="false"
      aria-controls={`goal-${goal.id}`}
      onClick={open}
      className="grid cursor-pointer grid-cols-[1fr_48px_30px] items-center gap-2.5 rounded-xl border border-line bg-card px-4.5 py-3.5 text-left transition-colors hover:border-input hover:bg-secondary sm:grid-cols-[1fr_auto_56px_34px] sm:gap-4.5"
    >
      <span className="grid min-w-0 gap-0.5">
        <b className="truncate font-num text-lg leading-tight font-extrabold uppercase max-sm:whitespace-normal">
          {goal.title}
        </b>
        <By>{`${goal.kind} · ${goal.type}${goal.quarter ? ` · ${goal.quarter}` : ""}`}</By>
      </span>
      <span
        className="col-span-full row-start-2 flex gap-1 sm:col-auto sm:row-auto"
        aria-label={`${goal.keyResults.length} key results`}
      >
        {goal.keyResults.map((keyResult: Data, index: number) => (
          <i
            key={index}
            title={keyResult.text}
            className="h-1.5 w-7.5 overflow-hidden rounded-full bg-s3"
          >
            <i
              className={cn(
                "block h-full",
                keyResult.progress != null && keyResult.progress >= onTrack ? "bg-ok" : "bg-ink-2",
              )}
              style={{ width: `${(keyResult.progress ?? 0) * 100}%` }}
            />
          </i>
        ))}
      </span>
      <span
        className={cn(
          "num text-right text-xl font-bold",
          score != null && score >= onTrack && "text-ok",
        )}
        title="Mean of the key results"
      >
        {scoreText(score)}
      </span>
      <span
        className={cn(
          "grid size-7.5 place-items-center rounded-lg border border-input bg-secondary font-num text-sm font-semibold",
          !confidence && "border-dashed text-ink-3",
        )}
        title={
          confidence ? `Confidence ${shortWeek(data)}` : `No confidence for ${shortWeek(data)} yet`
        }
      >
        {confidence ?? "?"}
      </span>
    </button>
  );
}

type CardActions = {
  edit: () => void;
  askDelete: () => void;
  keep: () => void;
  close: () => void;
  confirmDelete: () => void;
  toggleThreads: () => void;
  confidence: (confidence: number) => void;
  link: (project: Data, on: boolean) => void;
};

function GoalCardHeader({ goal, actions }: { goal: Data; actions: CardActions }) {
  const personal = goal.kind === "personal";
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      <h2 className={cn(titleClass, "text-[22px] leading-tight")}>{goal.title}</h2>
      <Badge variant={personal ? "dashed" : "outline"}>{personal ? "personal" : "team"}</Badge>
      <Badge>{goal.type}</Badge>
      {goal.quarter && <By>{goal.quarter}</By>}
      <span className="ml-auto flex gap-2">
        <Button variant="dashed" size="xs" onClick={actions.edit}>
          edit
        </Button>
        <Button variant="dashed-destructive" size="xs" onClick={actions.askDelete}>
          delete
        </Button>
        <Button
          variant="dashed"
          size="xs"
          aria-expanded="true"
          aria-label={`Close ${goal.title}`}
          onClick={actions.close}
        >
          close
          <ChevronUp />
        </Button>
      </span>
    </div>
  );
}

// Confidence this week, 1 to 10, with the weeks before it.
function Confidence({
  data,
  goal,
  set,
}: {
  data: Data;
  goal: Data;
  set: (confidence: number) => void;
}) {
  const now = goal.checkins.find((checkin: Data) => checkin.week === data.week)?.confidence;
  const past = goal.checkins.filter((checkin: Data) => checkin.week !== data.week).slice(-7);
  return (
    <div className="grid gap-1.5">
      <span className="lbl">
        {now ? `Confidence ${shortWeek(data)}` : `How sure are you, ${shortWeek(data)}?`}
      </span>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Confidence this week, 1 to 10">
        {Array.from({ length: 10 }, (_, index) => (
          <Button
            key={index}
            variant="outline"
            size="icon-sm"
            aria-pressed={now === index + 1}
            onClick={() => set(index + 1)}
            className="bg-secondary font-num text-[13px] font-semibold text-ink-2 aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-background"
          >
            {index + 1}
          </Button>
        ))}
      </div>
      {past.length > 0 && (
        <By>{`before: ${past.map((checkin: Data) => `${checkin.week.slice(5)} ${checkin.confidence}`).join(" · ")}`}</By>
      )}
    </div>
  );
}

function LinkedProjects({
  data,
  goal,
  link,
}: {
  data: Data;
  goal: Data;
  link: (project: Data, on: boolean) => void;
}) {
  const linked = new Set(goal.projects.map((project: Data) => project.id));
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-3">
      {goal.projects.length ? (
        goal.projects.map((project: Data) => (
          <Badge
            key={project.id}
            variant="soft"
            className="gap-1 rounded-lg py-0.5 pr-0.5 font-mono"
          >
            {project.name}
            <Button
              variant="ghost"
              size="xs"
              className="size-5 p-0 text-ink-3 hover:text-brand"
              aria-label={`Unlink ${project.name}`}
              onClick={() => link(project, false)}
            >
              <XIcon className="size-3" />
            </Button>
          </Badge>
        ))
      ) : (
        <span>No project linked.</span>
      )}
      <NativeSelect
        aria-label={`Link a project to ${goal.title}`}
        value=""
        className={smallSelectClass}
        onChange={(event) => {
          const project = data.projects.find(
            (candidate: Data) => candidate.id === event.target.value,
          );
          if (project) link(project, true);
        }}
      >
        <option value="">＋ link a project…</option>
        {data.projects
          .filter((project: Data) => !linked.has(project.id))
          .map((project: Data) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
      </NativeSelect>
    </div>
  );
}

function ThreadLink({ thread, week }: { thread: Data; week: string }) {
  return (
    <a
      className="block rounded-lg px-2.5 py-1.5 no-underline hover:bg-secondary"
      href={`#/review?week=${week}&key=${encodeURIComponent(thread.key)}`}
    >
      <b className="font-medium">{thread.title ?? "Untitled"}</b>
      {thread.direct && <By className="ml-1.5">linked in review</By>}
      {thread.decided ? (
        <Check className="ml-1.5 inline size-3.5 text-ok" aria-label="decided" />
      ) : (
        <By className="ml-1.5 text-brand uppercase">to review</By>
      )}
    </a>
  );
}

function GoalThreads({
  data,
  goal,
  open,
  toggle,
}: {
  data: Data;
  goal: Data;
  open: boolean;
  toggle: () => void;
}) {
  const count = Object.values(goal.weeks).flat().length;
  const weeks = [...data.weeks].reverse().filter((week: string) => goal.weeks[week]);
  return (
    <>
      {count ? (
        <Button
          variant="link"
          className="h-auto justify-self-start p-0 font-normal"
          aria-expanded={open}
          onClick={toggle}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
          {threads(count)}
        </Button>
      ) : (
        <By>No threads yet. Link a project, or press L on a thread in review.</By>
      )}
      {open && (
        <div className="grid gap-2.5">
          {weeks.map((week: string) => (
            <div key={week} className="grid gap-1 sm:grid-cols-[40px_1fr] sm:gap-3">
              <span className="lbl pt-2">{week.slice(5)}</span>
              <ul className="m-0 grid list-none gap-1 p-0">
                {goal.weeks[week].map((thread: Data) => (
                  <li key={thread.key}>
                    <ThreadLink thread={thread} week={week} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function GoalCard({
  data,
  goal,
  max,
  deleting,
  threadsOpen,
  actions,
}: {
  data: Data;
  goal: Data;
  max: number;
  deleting: boolean;
  threadsOpen: boolean;
  actions: CardActions;
}) {
  return (
    <Card
      id={`goal-${goal.id}`}
      className={cn("scroll-mt-24 gap-3.5 sm:p-5.5", goal.kind === "personal" && "border-dashed")}
    >
      <GoalCardHeader goal={goal} actions={actions} />
      {deleting && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-brand/45 bg-secondary px-3.5 py-2.5 text-[13.5px] text-ink-2">
          Delete this goal? Its links go; projects and threads stay.
          <ConfirmButtons
            label="delete"
            destructive
            onConfirm={actions.confirmDelete}
            onCancel={actions.keep}
          />
        </div>
      )}
      {goal.description && (
        <p className="m-0 max-w-[65ch] text-[14.5px] leading-relaxed text-ink-2">
          {goal.description}
        </p>
      )}
      {goal.keyResults.length ? (
        <ol className="m-0 grid max-w-190 list-none gap-3 p-0">
          {goal.keyResults.map((keyResult: Data, index: number) => (
            <KeyResult key={index} data={data} keyResult={keyResult} type={goal.type} />
          ))}
        </ol>
      ) : (
        <p className="m-0 text-sm text-ink-2">
          No key results yet.{" "}
          <Button variant="dashed" size="xs" onClick={actions.edit}>
            add them
          </Button>
        </p>
      )}
      <Confidence data={data} goal={goal} set={actions.confidence} />
      <LinkedProjects data={data} goal={goal} link={actions.link} />
      {data.weeks.length > 0 && (
        <Strip
          weeks={data.weeks.slice(-8)}
          count={(week) => (goal.weeks[week] ?? []).length}
          max={max}
        />
      )}
      <GoalThreads data={data} goal={goal} open={threadsOpen} toggle={actions.toggleThreads} />
    </Card>
  );
}

const Ring = ({ dashed }: { dashed: boolean }) => (
  <svg viewBox="0 0 40 40" width="34" height="34" aria-hidden="true" className="row-span-2">
    <circle cx="20" cy="20" r="14" fill="none" stroke="var(--s3)" strokeWidth="6" />
    <circle
      cx="20"
      cy="20"
      r="14"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="6"
      strokeLinecap="round"
      pathLength={100}
      strokeDasharray={dashed ? "6 6" : "68 100"}
      transform="rotate(-90 20 20)"
    />
  </svg>
);

const kindCardClass =
  "grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3.5 gap-y-1 rounded-xl border border-input bg-secondary px-4.5 py-4 text-left transition hover:-translate-y-px hover:border-brand motion-reduce:transition-none motion-reduce:hover:translate-y-0";

// One of your busiest projects; one tap makes it a goal.
function SeedButton({ project, seed }: { project: Data; seed: (project: Data) => void }) {
  return (
    <button
      onClick={() => seed(project)}
      className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-input py-1.5 pr-2 pl-3.5 text-left text-sm font-medium hover:border-solid hover:border-brand"
    >
      <i
        className={cn(
          "size-2 rotate-45 rounded-xs",
          project.kind === "topic" ? "bg-(--m-solve)" : "bg-(--m-elevate)",
        )}
      />
      {project.name}
      <By>{`${project.threads} threads`}</By>
      <b className="grid size-5.5 place-items-center rounded-full bg-s3 text-brand">
        <Plus className="size-3.5" />
      </b>
    </button>
  );
}

// No goals yet: pick a kind, or start from the work you already do.
function FirstGoal({
  data,
  pick,
  seed,
}: {
  data: Data;
  pick: (kind: string) => void;
  seed: (project: Data) => void;
}) {
  const busiest = data.projects
    .filter((project: Data) => project.threads)
    .sort((left: Data, right: Data) => right.threads - left.threads)
    .slice(0, 4);
  return (
    <Card className="gap-3.5">
      <h2 className={cn(titleClass, "text-[clamp(24px,3vw,34px)] leading-none")}>
        What does your work serve?
      </h2>
      <p className="m-0 max-w-[60ch] text-[14.5px] text-ink-2">
        Name two to four goals. North then shows how much of your work serves each one, and what
        serves none.
      </p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
        <button className={kindCardClass} onClick={() => pick("team")}>
          <Ring dashed={false} />
          <b className="text-base">Team or company goal</b>
          <span className="text-[13.5px] text-ink-2">
            “Exports API GA”. Usually served by projects.
          </span>
        </button>
        <button className={cn(kindCardClass, "border-dashed")} onClick={() => pick("personal")}>
          <Ring dashed />
          <b className="text-base">Personal goal</b>
          <span className="text-[13.5px] text-ink-2">
            “Grow two engineers to lead projects”. Usually single threads: a pairing, a review that
            taught.
          </span>
        </button>
      </div>
      {busiest.length > 0 && (
        <>
          <span className="lbl mt-2.5">Start from your work</span>
          <p className="m-0 text-[14.5px] text-ink-2">
            Your busiest projects. One tap makes it a goal, linked, and opens it so you can rename
            it.
          </p>
          <div className="flex flex-wrap gap-2">
            {busiest.map((project: Data) => (
              <SeedButton key={project.id} project={project} seed={seed} />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// The unit next to a draft's target.
function unitOf(data: Data, key: string) {
  if (!key) return "";
  if (key.startsWith("milestone:")) return "%";
  const metric = metricOf(data, key);
  if (!metric) return "";
  return metric.unit + (metric.aggregation === "total" ? " this quarter" : "");
}
// What measures a draft's key result.
function measuredBy(data: Data, key: string) {
  if (!key) return "you update it";
  const metric = metricOf(data, key);
  if (metric) return metric.label;
  const milestone = milestoneOf(data, key);
  return milestone ? `milestone · ${milestone.project} · ${milestone.name}` : "milestone";
}

type DraftKeyResult = { keep: boolean; start: string; target: string };
const bigNumberClass = "num h-9 w-16 px-2 text-right font-num text-xl font-bold";

function DraftKeyResultRow({
  data,
  keyResult,
  choice,
  change,
}: {
  data: Data;
  keyResult: Data;
  choice: DraftKeyResult;
  change: (patch: Partial<DraftKeyResult>) => void;
}) {
  return (
    <li
      data-off={choice.keep ? undefined : ""}
      className="group grid grid-cols-[auto_1fr] items-center gap-3.5 border-b border-line py-3 transition-opacity data-off:opacity-40 sm:grid-cols-[auto_1fr_auto]"
    >
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-pressed={choice.keep}
        aria-label="Keep this key result"
        onClick={() => change({ keep: !choice.keep })}
        className="border-ok bg-ok/15 text-ok aria-[pressed=false]:border-input aria-[pressed=false]:bg-transparent aria-[pressed=false]:text-ink-3"
      >
        {choice.keep ? <Check /> : <XIcon />}
      </Button>
      <div className="grid gap-0.5 text-[15px]">
        <span className="group-data-off:line-through">{keyResult.text}</span>
        <By>{measuredBy(data, keyResult.metric)}</By>
      </div>
      <div className="col-start-2 flex items-center gap-2 sm:col-start-auto">
        {keyResult.metric ? (
          <b className="num text-right text-xl font-bold" title="Where you are now, measured">
            {asText(keyResult.start) || "–"}
          </b>
        ) : (
          <Input
            className={bigNumberClass}
            inputMode="decimal"
            aria-label="Start"
            placeholder="?"
            value={choice.start}
            onChange={(event) => change({ start: event.target.value })}
          />
        )}
        <i
          className="relative h-0.5 w-11 bg-input after:absolute after:-top-1 after:-right-px after:border-y-[5px] after:border-l-[7px] after:border-y-transparent after:border-l-input"
          aria-hidden="true"
        />
        <Input
          className={bigNumberClass}
          inputMode="decimal"
          aria-label="Target"
          value={choice.target}
          onChange={(event) => change({ target: event.target.value })}
        />
        <span className="max-w-[11ch] min-w-[3ch] text-[12.5px] leading-tight text-ink-3">
          {unitOf(data, keyResult.metric)}
        </span>
      </div>
    </li>
  );
}

function DraftNav({
  drafts,
  index,
  go,
}: {
  drafts: Data[];
  index: number;
  go: (index: number) => void;
}) {
  const draft = drafts[index];
  const count = drafts.length;
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <span className="lbl">{`Claude drafted ${count} objective${count > 1 ? "s" : ""}${draft.quarter ? ` for ${draft.quarter}` : ""}`}</span>
      <span className="flex gap-1.5">
        {drafts.map((other: Data, position: number) => (
          <button
            key={other.id}
            type="button"
            aria-label={`Draft ${position + 1}: ${other.title}`}
            aria-current={position === index}
            onClick={() => go(position)}
            className="h-1.5 w-5.5 cursor-pointer rounded-full bg-s3 p-0 transition-all aria-[current=true]:w-9 aria-[current=true]:bg-ink"
          />
        ))}
      </span>
      <span className="num ml-auto text-[15px] font-semibold text-ink-3">{`${index + 1} of ${count}`}</span>
    </header>
  );
}

// Claude's drafts, one in focus: keep or drop each key result, fix a number, then add it.
function DraftCard({
  data,
  index,
  keys,
  go,
  add,
  skip,
  editAll,
}: {
  data: Data;
  index: number;
  keys: boolean;
  go: (index: number) => void;
  add: (goal: Data) => void;
  skip: (id: number) => void;
  editAll: (draft: Data) => void;
}) {
  const draft = data.drafts[index];
  const count = data.drafts.length;
  const [choices, setChoices] = useState<DraftKeyResult[]>(() =>
    draft.keyResults.map((keyResult: Data) => ({
      keep: true,
      start: asText(keyResult.start),
      target: asText(keyResult.target),
    })),
  );
  const change = (at: number, patch: Partial<DraftKeyResult>) =>
    setChoices(
      choices.map((choice, position) => (position === at ? { ...choice, ...patch } : choice)),
    );
  // The draft as you left it: only the key results you kept, with your numbers.
  const asGoal = () => ({
    title: draft.title,
    description: draft.why,
    kind: draft.kind,
    type: draft.type,
    quarter: draft.quarter,
    draft_id: draft.id,
    keyResults: draft.keyResults.flatMap((keyResult: Data, position: number) => {
      const choice = choices[position]!;
      if (!choice.keep) return [];
      const start = keyResult.metric ? keyResult.start : choice.start;
      return [{ text: keyResult.text, metric: keyResult.metric, start, target: choice.target }];
    }),
  });
  // Drafts by keyboard, only while you are not typing.
  useEffect(() => {
    if (!keys) return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        (event.target as HTMLElement).closest("input,select,textarea")
      )
        return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : -1;
        go((index + step + count) % count);
      } else if (event.key === "a") {
        event.preventDefault();
        add(asGoal());
      } else if (event.key === "s") {
        event.preventDefault();
        skip(draft.id);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });
  return (
    <section className="grid gap-2.5" aria-label="Drafts from Claude">
      <DraftNav drafts={data.drafts} index={index} go={go} />
      <Card className="animate-in gap-3.5">
        <div className="flex flex-wrap gap-2">
          <Badge>{draft.kind}</Badge>
          <Badge>
            {draft.type === "committed"
              ? "committed · must reach 1.0"
              : "aspirational · 0.7 is good"}
          </Badge>
        </div>
        <h2 className={cn(titleClass, "max-w-[40ch] text-[clamp(26px,3.4vw,40px)] leading-none")}>
          {draft.title}
        </h2>
        <p className="m-0 max-w-[62ch] text-[15.5px] leading-relaxed text-ink-2">{draft.why}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <By className="mr-1">from your data</By>
          {draft.based_on.map((source: string) => (
            <Badge key={source} variant="soft">
              {source}
            </Badge>
          ))}
        </div>
        <ol className="m-0 mt-1 grid list-none border-t border-line p-0">
          {draft.keyResults.map((keyResult: Data, position: number) => (
            <DraftKeyResultRow
              key={position}
              data={data}
              keyResult={keyResult}
              choice={choices[position]!}
              change={(patch) => change(position, patch)}
            />
          ))}
        </ol>
        <footer className="mt-1 flex flex-wrap items-center gap-x-4.5 gap-y-2.5">
          <Button size="lg" className="font-semibold" onClick={() => add(asGoal())}>
            Add as goal
          </Button>
          <Button variant="dashed" size="xs" onClick={() => editAll(draft)}>
            edit all fields
          </Button>
          <Button variant="dashed" size="xs" onClick={() => skip(draft.id)}>
            skip
          </Button>
          <span className="ml-auto hidden text-[12.5px] text-ink-3 sm:inline">
            <kbd>A</kbd> add · <kbd>S</kbd> skip · <kbd>←</kbd>
            <kbd>→</kbd>
          </span>
        </footer>
      </Card>
    </section>
  );
}

export const View = ({ p: params }: { p: URLSearchParams }) => <Goals focus={params.get("id")} />;
