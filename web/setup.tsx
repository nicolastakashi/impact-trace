// SETUP: tools, who you are, first week. The form starts filled from gh and git.
import { useEffect, useState } from "react";
import { post, toast } from "./lib";

const LEVELS = ["Software Engineer", "Senior Engineer", "Staff Engineer", "Senior Staff Engineer", "Principal Engineer", "Distinguished Engineer"];
const Mark = ({ ok }: { ok: boolean | null }) => ok == null ? <span className="unk">?</span> : ok ? <span className="ok">✓</span> : <span className="no">✕</span>;

// Asking gh takes a second: show the steps right away, with the checks running.
const Waiting = () => {
  const row = (t: string) => <li><span className="spin" aria-hidden="true"></span>{t} <span className="lbl">checking…</span></li>;
  return <>
    <li aria-busy="true"><h2>Tools</h2><ul className="checks">{row("Claude Code")}{row("GitHub CLI, logged in")}</ul></li>
    <li aria-busy="true"><h2>About you</h2><div className="skel"><i></i><i></i><i></i><i style={{ width: "40%" }}></i></div></li>
    <li aria-busy="true"><h2>Your first week</h2><div className="skel"><i style={{ width: "30%" }}></i></div></li>
  </>;
};

export function Setup() {
  const [s, setS] = useState<any>(null), [err, setErr] = useState(""), [saved, setSaved] = useState(0);
  useEffect(() => { fetch("/api/setup?guess=1").then((r) => r.json()).then(setS); }, []);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const body = { name: f.get("name"), github: f.get("github"), level: f.get("level"),
      orgs: [...new Set([...f.getAll("org"), ...String(f.get("more")).split(",").map((x) => x.trim()).filter(Boolean)])] };
    const r = await post("/api/setup", body);
    setErr(r.ok ? "" : await r.text());
    // A new key redraws the form from what was saved: typed orgs become chips.
    if (r.ok) { setS({ ...s, config: body }); setSaved((n) => n + 1); toast("Saved"); }
  }
  const c = s?.config ?? {}, g = s?.guess, v = (k: string) => c[k] ?? g[k] ?? "";
  return <section className="view" id="v-setup">
    <div className="vhead"><h1>Set <em>up</em></h1><p>Three steps. Everything stays on this machine.</p></div>
    <ol className="steps" id="su">{!s ? <Waiting /> : <>
      <li className={s.checks.gh && s.checks.claude ? "done" : ""}><h2>Tools</h2>
        <ul className="checks">
          {s.checks.host && <li>This app runs in a container. Check these on the machine that runs <code>./run.sh</code>:</li>}
          <li><Mark ok={s.checks.claude} />{` Claude Code ${s.checks.claude === false ? "· install it, then reload" : ""}`}</li>
          <li><Mark ok={s.checks.gh} /> GitHub CLI, logged in {s.checks.gh === false ? <>· run <code>gh auth login</code>, then reload</> : ""}</li>
          <li><span className="unk">?</span> In Claude, connect Linear, Slack, Google Calendar and Google Drive. This page cannot check them.</li></ul></li>
      <li className={s.config ? "done" : ""}><h2>About you</h2>
        <form id="su-form" key={saved} onSubmit={save}>
          <label htmlFor="su-name">Full name<small>As people write it in Slack. Finds the messages that mention you.</small><input id="su-name" name="name" defaultValue={v("name")} autoComplete="name" required /></label>
          <label htmlFor="su-gh">GitHub login<input id="su-gh" name="github" defaultValue={v("github")} required /></label>
          <fieldset className="orgs"><legend>Your company's GitHub orgs<small>Pick only your employer's. Review comments come from these; open source counts on its own.</small></legend>
            {[...new Set<string>([...(c.orgs ?? []), ...g.orgs])].map((o) => <label key={o} className="chip-ck"><input type="checkbox" name="org" value={o} defaultChecked={(c.orgs ?? []).includes(o)} />{o}</label>)}
            <input id="su-orgs" name="more" placeholder="Other orgs, comma-separated" aria-label="Other orgs" /></fieldset>
          <label htmlFor="su-level">Level<small>Claude judges each thread against it.</small><input id="su-level" name="level" list="su-levels" defaultValue={v("level")} placeholder="Senior Engineer" required /></label>
          <datalist id="su-levels">{LEVELS.map((l) => <option key={l} value={l} />)}</datalist>
          {err && <span className="err" role="alert">{err}</span>}
          <button className="save">{s.config ? "Save changes" : "Save"}</button></form></li>
      <li><h2>Your first week</h2>
        <p>In a terminal, in this folder:</p><pre>./run.sh</pre>
        <p>It collects this week. Then <a href="#/review">review it</a>: Claude suggests, you decide.</p></li>
    </>}</ol>
  </section>;
}
