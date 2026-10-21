/* SETUP: tools, who you are, first week. The form starts filled from gh and git. */
const SU = (() => {
const LEVELS = ["Software Engineer","Senior Engineer","Staff Engineer","Senior Staff Engineer","Principal Engineer","Distinguished Engineer"];
let s = null, err = "";
// Asking gh takes a second: show the steps right away, with the checks running.
function waiting(){
  const row = (t) => `<li><span class="spin" aria-hidden="true"></span>${t} <span class="lbl">checking…</span></li>`;
  $("#su").innerHTML = `<li aria-busy="true"><h2>Tools</h2><ul class="checks">${row("Claude Code")}${row("GitHub CLI, logged in")}</ul></li>
    <li aria-busy="true"><h2>About you</h2><div class="skel"><i></i><i></i><i></i><i style="width:40%"></i></div></li>
    <li aria-busy="true"><h2>Your first week</h2><div class="skel"><i style="width:30%"></i></div></li>`;
}
async function open(){ if(!s) waiting(); s = await (await fetch("/api/setup?guess=1")).json(); render(); }
function render(){
  const c = s.config ?? {}, g = s.guess, v = (k) => esc(c[k] ?? g[k] ?? "");
  const mark = (ok) => ok == null ? `<span class="unk">?</span>` : ok ? `<span class="ok">✓</span>` : `<span class="no">✕</span>`;
  $("#su").innerHTML = `
    <li class="${s.checks.gh && s.checks.claude ? "done" : ""}"><h2>Tools</h2>
      <ul class="checks">
        ${s.checks.host ? `<li>This app runs in a container. Check these on the machine that runs <code>./run.sh</code>:</li>` : ""}
        <li>${mark(s.checks.claude)} Claude Code ${s.checks.claude === false ? "· install it, then reload" : ""}</li>
        <li>${mark(s.checks.gh)} GitHub CLI, logged in ${s.checks.gh === false ? "· run <code>gh auth login</code>, then reload" : ""}</li>
        <li><span class="unk">?</span> In Claude, connect Linear, Slack, Google Calendar and Google Drive. This page cannot check them.</li></ul></li>
    <li class="${s.config ? "done" : ""}"><h2>About you</h2>
      <form id="su-form">
        <label for="su-name">Full name<small>As people write it in Slack. Finds the messages that mention you.</small><input id="su-name" name="name" value="${v("name")}" autocomplete="name" required></label>
        <label for="su-gh">GitHub login<input id="su-gh" name="github" value="${v("github")}" required></label>
        <fieldset class="orgs"><legend>Your company's GitHub orgs<small>Pick only your employer's. Review comments come from these; open source counts on its own.</small></legend>
          ${[...new Set([...(c.orgs ?? []), ...g.orgs])].map(o => `<label class="chip-ck"><input type="checkbox" name="org" value="${esc(o)}" ${(c.orgs ?? []).includes(o) ? "checked" : ""}>${esc(o)}</label>`).join("")}
          <input id="su-orgs" name="more" placeholder="Other orgs, comma-separated" aria-label="Other orgs"></fieldset>
        <label for="su-level">Level<small>Claude judges each thread against it.</small><input id="su-level" name="level" list="su-levels" value="${v("level")}" placeholder="Senior Engineer" required></label>
        <datalist id="su-levels">${LEVELS.map(l => `<option value="${l}">`).join("")}</datalist>
        ${err ? `<span class="err" role="alert">${esc(err)}</span>` : ""}
        <button class="save">${s.config ? "Save changes" : "Save"}</button></form></li>
    <li><h2>Your first week</h2>
      <p>In a terminal, in this folder:</p><pre>./run.sh</pre>
      <p>It collects this week. Then <a href="#/review">review it</a>: Claude suggests, you decide.</p></li>`;
}
$("#v-setup").addEventListener("submit", async e => {
  e.preventDefault(); const f = new FormData(e.target);
  const body = {name: f.get("name"), github: f.get("github"), level: f.get("level"), orgs: [...new Set([...f.getAll("org"), ...String(f.get("more")).split(",").map(x => x.trim()).filter(Boolean)])]};
  const r = await post("/api/setup", body);
  err = r.ok ? "" : await r.text();
  if(r.ok){ s.config = body; toast("Saved"); }
  render();
});
return {open};
})();
