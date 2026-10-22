// SETUP: tools, who you are, first week. The form starts filled from gh and git.
import { useEffect, useState } from "react";
import { Check, CircleHelp, XIcon } from "lucide-react";
import { post, toast } from "./lib";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input, Label } from "./ui/input";

const LEVELS = [
  "Software Engineer",
  "Senior Engineer",
  "Staff Engineer",
  "Senior Staff Engineer",
  "Principal Engineer",
  "Distinguished Engineer",
];
// Whether a tool is there: yes, no, or this page cannot tell.
function StatusMark({ ok }: { ok: boolean | null }) {
  if (ok == null)
    return <CircleHelp className="size-4 self-center text-ink-3" aria-label="unknown" />;
  if (ok) return <Check className="size-4 self-center text-ok" aria-label="ok" />;
  return <XIcon className="size-4 self-center text-brand" aria-label="missing" />;
}
const Hint = (props: React.ComponentProps<"small">) => (
  <small className="block text-[12.5px] text-ink-3" {...props} />
);

// One numbered step. Done steps show a check instead of the number.
function Step({
  number,
  title,
  done,
  busy,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li aria-busy={busy || undefined}>
      <Card className="gap-3.5 sm:p-6">
        <h2 className="m-0 flex items-center gap-3 font-num text-[22px] leading-none font-extrabold uppercase">
          <span
            className={`grid size-7 place-items-center rounded-full font-mono text-[13px] font-semibold ${done ? "bg-ok/25 text-ink" : "bg-s3 text-ink-2"}`}
          >
            {done ? <Check className="size-3.5" /> : number}
          </span>
          {title}
        </h2>
        {children}
      </Card>
    </li>
  );
}
const Skeleton = ({ width = "100%" }: { width?: string }) => (
  <i className="block h-9.5 max-w-105 animate-pulse rounded-lg bg-s3" style={{ width }} />
);
const fieldClass = "max-w-105";
type SetupData = any;

export function Setup() {
  const [setup, setSetup] = useState<SetupData>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(0);
  useEffect(() => {
    fetch("/api/setup?guess=1")
      .then((response) => response.json())
      .then(setSetup);
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"),
      github: form.get("github"),
      level: form.get("level"),
      orgs: [
        ...new Set([
          ...form.getAll("org"),
          ...String(form.get("more"))
            .split(",")
            .map((org) => org.trim())
            .filter(Boolean),
        ]),
      ],
    };
    const response = await post("/api/setup", body);
    setError(response.ok ? "" : await response.text());
    // A new key redraws the form from what was saved: typed orgs become chips.
    if (response.ok) {
      setSetup({ ...setup, config: body });
      setSaved((count) => count + 1);
      toast("Saved");
    }
  }
  return (
    <section className="view" id="v-setup">
      <div className="vhead">
        <h1>
          Set <em>up</em>
        </h1>
        <p>Three steps. Everything stays on this machine.</p>
      </div>
      {/* Asking gh takes a second: show the steps right away, with the checks running. */}
      <ol className="m-0 grid max-w-190 list-none gap-3.5 p-0">
        {!setup && <LoadingSteps />}
        {setup && (
          <>
            <ToolsStep checks={setup.checks} />
            <AboutYouStep setup={setup} saved={saved} error={error} save={save} />
            <FirstWeekStep />
          </>
        )}
      </ol>
    </section>
  );
}

function LoadingSteps() {
  return (
    <>
      <Step number={1} title="Tools" busy>
        <ul className="grid gap-2 text-sm text-ink-2">
          {["Claude Code", "GitHub CLI, logged in"].map((tool) => (
            <li key={tool} className="flex items-center gap-2.5">
              <span
                className="size-3 animate-spin rounded-full border-2 border-input border-t-brand"
                aria-hidden="true"
              />
              {tool} <span className="lbl">checking…</span>
            </li>
          ))}
        </ul>
      </Step>
      <Step number={2} title="About you" busy>
        <div className="grid gap-2.5">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton width="40%" />
        </div>
      </Step>
      <Step number={3} title="Your first week" busy>
        <Skeleton width="30%" />
      </Step>
    </>
  );
}

function ToolsStep({ checks }: { checks: SetupData }) {
  return (
    <Step number={1} title="Tools" done={checks.github && checks.claude}>
      <ul className="grid gap-2 text-sm text-ink-2">
        {checks.host && (
          <li>
            This app runs in a container. Check these on the machine that runs <code>./run.sh</code>
            :
          </li>
        )}
        <li className="flex gap-2.5">
          <StatusMark ok={checks.claude} />
          {`Claude Code ${checks.claude === false ? "· install it, then reload" : ""}`}
        </li>
        <li className="flex gap-2.5">
          <StatusMark ok={checks.github} />
          <span>
            GitHub CLI, logged in{" "}
            {checks.github === false && (
              <>
                · run <code>gh auth login</code>, then reload
              </>
            )}
          </span>
        </li>
        <li className="flex gap-2.5">
          <StatusMark ok={null} />
          In Claude, connect Linear, Slack, Google Calendar and Google Drive. This page cannot check
          them.
        </li>
      </ul>
    </Step>
  );
}

function AboutYouStep({
  setup,
  saved,
  error,
  save,
}: {
  setup: SetupData;
  saved: number;
  error: string;
  save: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const config = setup.config ?? {};
  const guess = setup.guess;
  // What you saved, else what gh and git guessed.
  const initial = (field: string) => config[field] ?? guess[field] ?? "";
  const savedOrgs: string[] = config.orgs ?? [];
  return (
    <Step number={2} title="About you" done={!!setup.config}>
      <form className="grid gap-3.5" key={saved} onSubmit={save}>
        <Label htmlFor="su-name" className="text-ink">
          Full name
          <Hint>As people write it in Slack. Finds the messages that mention you.</Hint>
          <Input
            id="su-name"
            name="name"
            className={fieldClass}
            defaultValue={initial("name")}
            autoComplete="name"
            required
          />
        </Label>
        <Label htmlFor="su-gh" className="text-ink">
          GitHub login
          <Input
            id="su-gh"
            name="github"
            className={fieldClass}
            defaultValue={initial("github")}
            required
          />
        </Label>
        <fieldset className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0">
          <legend className="mb-2 p-0 text-sm text-ink">
            Your company's GitHub orgs
            <Hint className="mt-1.5 block text-[12.5px] text-ink-3">
              Pick only your employer's. Review comments come from these; open source counts on its
              own.
            </Hint>
          </legend>
          {[...new Set<string>([...savedOrgs, ...guess.orgs])].map((org) => (
            <label
              key={org}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-secondary px-2.5 py-1 font-mono text-[12.5px] font-medium text-ink-2 has-checked:border-brand has-checked:bg-s3 has-checked:text-ink"
            >
              <input
                type="checkbox"
                name="org"
                value={org}
                className="m-0 accent-(--accent)"
                defaultChecked={savedOrgs.includes(org)}
              />
              {org}
            </label>
          ))}
          <Input
            id="su-orgs"
            name="more"
            className={`${fieldClass} mt-1 basis-full`}
            placeholder="Other orgs, comma-separated"
            aria-label="Other orgs"
          />
        </fieldset>
        <Label htmlFor="su-level" className="text-ink">
          Level<Hint>Claude judges each thread against it.</Hint>
          <Input
            id="su-level"
            name="level"
            className={fieldClass}
            list="su-levels"
            defaultValue={initial("level")}
            placeholder="Senior Engineer"
            required
          />
        </Label>
        <datalist id="su-levels">
          {LEVELS.map((level) => (
            <option key={level} value={level} />
          ))}
        </datalist>
        {error && (
          <span className="text-[13.5px] text-brand" role="alert">
            {error}
          </span>
        )}
        <Button className="justify-self-start">{setup.config ? "Save changes" : "Save"}</Button>
      </form>
    </Step>
  );
}

const FirstWeekStep = () => (
  <Step number={3} title="Your first week">
    <p className="m-0 text-sm text-ink-2">In a terminal, in this folder:</p>
    <pre className="m-0 overflow-x-auto rounded-lg border border-line bg-secondary px-3.5 py-2.5 font-mono text-[13px]">
      ./run.sh
    </pre>
    <p className="m-0 text-sm text-ink-2">
      It collects this week. Then{" "}
      <a className="underline" href="#/review">
        review it
      </a>
      : Claude suggests, you decide.
    </p>
  </Step>
);

// The router passes the address parameters as `p`; Setup needs none.
export const View = (_: { p: URLSearchParams }) => <Setup />;
