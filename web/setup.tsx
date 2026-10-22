// SETUP: tools, who you are, first week. The form starts filled from gh and git.
import { useEffect, useState } from "react";
import { Check, CircleHelp, X } from "lucide-react";
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
const Mark = ({ ok }: { ok: boolean | null }) =>
  ok == null ? (
    <CircleHelp className="size-4 self-center text-ink-3" aria-label="unknown" />
  ) : ok ? (
    <Check className="size-4 self-center text-ok" aria-label="ok" />
  ) : (
    <X className="size-4 self-center text-brand" aria-label="missing" />
  );
const Hint = (p: React.ComponentProps<"small">) => (
  <small className="block text-[12.5px] text-ink-3" {...p} />
);

// One numbered step. Done steps show a check instead of the number.
function Step({
  n,
  title,
  done,
  busy,
  children,
}: {
  n: number;
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
            {done ? <Check className="size-3.5" /> : n}
          </span>
          {title}
        </h2>
        {children}
      </Card>
    </li>
  );
}
const Skel = ({ w = "100%" }: { w?: string }) => (
  <i className="block h-9.5 max-w-105 animate-pulse rounded-lg bg-s3" style={{ width: w }} />
);

export function Setup() {
  const [s, setS] = useState<any>(null),
    [err, setErr] = useState(""),
    [saved, setSaved] = useState(0);
  useEffect(() => {
    fetch("/api/setup?guess=1")
      .then((r) => r.json())
      .then(setS);
  }, []);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: f.get("name"),
      github: f.get("github"),
      level: f.get("level"),
      orgs: [
        ...new Set([
          ...f.getAll("org"),
          ...String(f.get("more"))
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        ]),
      ],
    };
    const r = await post("/api/setup", body);
    setErr(r.ok ? "" : await r.text());
    // A new key redraws the form from what was saved: typed orgs become chips.
    if (r.ok) {
      setS({ ...s, config: body });
      setSaved((n) => n + 1);
      toast("Saved");
    }
  }
  const c = s?.config ?? {},
    g = s?.guess,
    v = (k: string) => c[k] ?? g[k] ?? "";
  const field = "max-w-105";
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
        {!s ? (
          <>
            <Step n={1} title="Tools" busy>
              <ul className="grid gap-2 text-sm text-ink-2">
                {["Claude Code", "GitHub CLI, logged in"].map((t) => (
                  <li key={t} className="flex items-center gap-2.5">
                    <span
                      className="size-3 animate-spin rounded-full border-2 border-input border-t-brand"
                      aria-hidden="true"
                    />
                    {t} <span className="lbl">checking…</span>
                  </li>
                ))}
              </ul>
            </Step>
            <Step n={2} title="About you" busy>
              <div className="grid gap-2.5">
                <Skel />
                <Skel />
                <Skel />
                <Skel w="40%" />
              </div>
            </Step>
            <Step n={3} title="Your first week" busy>
              <Skel w="30%" />
            </Step>
          </>
        ) : (
          <>
            <Step n={1} title="Tools" done={s.checks.gh && s.checks.claude}>
              <ul className="grid gap-2 text-sm text-ink-2">
                {s.checks.host && (
                  <li>
                    This app runs in a container. Check these on the machine that runs{" "}
                    <code>./run.sh</code>:
                  </li>
                )}
                <li className="flex gap-2.5">
                  <Mark ok={s.checks.claude} />
                  {`Claude Code ${s.checks.claude === false ? "· install it, then reload" : ""}`}
                </li>
                <li className="flex gap-2.5">
                  <Mark ok={s.checks.gh} />
                  <span>
                    GitHub CLI, logged in{" "}
                    {s.checks.gh === false && (
                      <>
                        · run <code>gh auth login</code>, then reload
                      </>
                    )}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Mark ok={null} />
                  In Claude, connect Linear, Slack, Google Calendar and Google Drive. This page
                  cannot check them.
                </li>
              </ul>
            </Step>
            <Step n={2} title="About you" done={!!s.config}>
              <form className="grid gap-3.5" key={saved} onSubmit={save}>
                <Label htmlFor="su-name" className="text-ink">
                  Full name
                  <Hint>As people write it in Slack. Finds the messages that mention you.</Hint>
                  <Input
                    id="su-name"
                    name="name"
                    className={field}
                    defaultValue={v("name")}
                    autoComplete="name"
                    required
                  />
                </Label>
                <Label htmlFor="su-gh" className="text-ink">
                  GitHub login
                  <Input
                    id="su-gh"
                    name="github"
                    className={field}
                    defaultValue={v("github")}
                    required
                  />
                </Label>
                <fieldset className="m-0 flex flex-wrap items-center gap-1.5 border-0 p-0">
                  <legend className="mb-2 p-0 text-sm text-ink">
                    Your company's GitHub orgs
                    <Hint className="mt-1.5 block text-[12.5px] text-ink-3">
                      Pick only your employer's. Review comments come from these; open source counts
                      on its own.
                    </Hint>
                  </legend>
                  {[...new Set<string>([...(c.orgs ?? []), ...g.orgs])].map((o) => (
                    <label
                      key={o}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-secondary px-2.5 py-1 font-mono text-[12.5px] font-medium text-ink-2 has-checked:border-brand has-checked:bg-s3 has-checked:text-ink"
                    >
                      <input
                        type="checkbox"
                        name="org"
                        value={o}
                        className="m-0 accent-(--accent)"
                        defaultChecked={(c.orgs ?? []).includes(o)}
                      />
                      {o}
                    </label>
                  ))}
                  <Input
                    id="su-orgs"
                    name="more"
                    className={`${field} mt-1 basis-full`}
                    placeholder="Other orgs, comma-separated"
                    aria-label="Other orgs"
                  />
                </fieldset>
                <Label htmlFor="su-level" className="text-ink">
                  Level<Hint>Claude judges each thread against it.</Hint>
                  <Input
                    id="su-level"
                    name="level"
                    className={field}
                    list="su-levels"
                    defaultValue={v("level")}
                    placeholder="Senior Engineer"
                    required
                  />
                </Label>
                <datalist id="su-levels">
                  {LEVELS.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
                {err && (
                  <span className="text-[13.5px] text-brand" role="alert">
                    {err}
                  </span>
                )}
                <Button className="justify-self-start">{s.config ? "Save changes" : "Save"}</Button>
              </form>
            </Step>
            <Step n={3} title="Your first week">
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
          </>
        )}
      </ol>
    </section>
  );
}

export const View = ({ p }: { p: URLSearchParams }) => <Setup />;
