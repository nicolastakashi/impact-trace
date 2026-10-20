// Fictional example data, so the app works without a local collection.
const SAMPLE = true;
// The server builds the real version from the threads you keep in review.
const WEEKS = ["W35","W36","W37","W38","W39","W40","W41","W42"];
const REVIEWS = [28,19,22,27,17,27,15,10];
const PERIOD = "2026-W35 – 2026-W42";
const GOALS = [
  {id:"o1", short:"Self-serve", title:"Customers manage their whole setup as code", color:"var(--m-solve)"},
  {id:"o2", short:"Trusted alerts", title:"Alerts customers trust", color:"var(--m-clarify)"},
  {id:"o3", short:"Industry voice", title:"A voice in the open-source community", color:"var(--m-elevate)"},
];
const PROJECTS = {
  access:{name:"Access model for shared assets", url:null, lead:null, status:"In Progress", goal:"o1", done:[2,3,4,5,7,4,3,2], open:6, ms:[]},
  exports:{name:"Exports API", url:null, lead:"Sam Rivera", status:"Completed", goal:"o1", done:[0,0,0,0,0,1,4,9], open:2, ms:[{name:"Safe delete", progress:90}]},
  runners:{name:"Private runners", url:null, lead:"Alex Kim", status:"In Progress", goal:"o1", done:[0,1,4,1,3,1,0,0], open:1, ms:[]},
  silences:{name:"Silences", url:null, lead:"Jordan Lee", status:"In Progress", goal:"o2", done:[0,0,0,0,0,0,0,0], open:0, ms:[{name:"Silence one failed check", progress:70},{name:"Maintenance windows", progress:5}]},
  up:{name:"Upstream and talks", url:null, lead:null, status:"outside the tracker", goal:"o3", done:null, open:0, ms:[], note:"PRs on GitHub and talks. No tracker project."},
  none:{name:"No project", url:null, lead:null, status:"—", goal:null, done:[1,1,0,1,2,0,1,1], open:12, ms:[], note:"Ideas, support, people work and open gaps."},
};
const REC = [
  {w:2, who:"Morgan (manager)", role:"director", where:"#kudos", t:"Huge thanks for getting private runners to v0. A customer saw it the next day."},
  {w:4, who:"Riley", role:"peer", where:"#kudos", t:"The release animation in the changelog is lovely."},
  {w:5, who:"Casey", role:"own team", where:"PR review", t:"We started this months ago and never finished. Thank you!"},
  {w:6, who:"Morgan (manager)", role:"director", where:"#project-exports", t:"With this design and the tickets, I think we can build it quickly."},
  {w:6, who:"Taylor", role:"principal, other team", where:"PR review", t:"praise: Good call."},
  {w:7, who:"Riley", role:"peer", where:"#kudos", t:"Worked through the whole offsite to unblock a key customer."},
];
const ITEMS = [
  {id:"2026-W35-i01", w:0, s:"up", title:"Three upstream PRs in one week", mode:"external", pillar:"big", wm:"wouldnt", links:[], ev:[["pr_open", "2026-08-24T10:12:00", "otel-collector: add exemplar support to the spanmetrics connector", null], ["pr_open", "2026-08-25T15:40:00", "prometheus: fix staleness markers on remote write retry", null], ["review_comment", null, "Maintainer review on the spanmetrics PR", null], ["pr_merged", "2026-08-27T11:05:00", "otel-collector: add exemplar support to the spanmetrics connector", null], ["pr_merged", "2026-08-28T16:20:00", "prometheus: fix staleness markers on remote write retry", null]], p:{external:.9,build:.1}},
  {id:"2026-W37-i01", w:2, s:"runners", title:"Private runners v0 shipped, shown to a customer the next day", mode:"build", pillar:"exec", wm:"wouldnt", rec:0, links:[], ev:[["issue_completed", "2026-09-07T09:40:00", "Runner registers with a one-time token", null], ["pr_merged", "2026-09-07T17:10:00", "feat(runners): register with a one-time token", null], ["slack_message", "2026-09-08T11:02:00", "#team-runners", null], ["pr_merged", "2026-09-09T14:33:00", "feat(runners): run checks from a private network", null], ["meeting", "2026-09-10T15:00:00", "Private runners demo with the customer", null], ["issue_completed", "2026-09-10T16:48:00", "Private runners v0", null]], p:{build:.85,solve:.15}},
  {id:"2026-W37-i02", w:2, s:"silences", ms:"Maintenance windows", title:"Challenged the maintenance-window model in review; the decision was reopened", mode:"clarify", pillar:"big", wm:"slower",
   quote:{t:"A window should be its own asset that creates and aggregates silences.", who:"Example, design review"}, links:[], ev:[["review_comment", null, "Design review: maintenance windows", null], ["doc_edited", "2026-09-09T10:15:00", "Maintenance windows: design", null], ["slack_message", "2026-09-09T13:30:00", "#team-alerting", null], ["meeting", "2026-09-11T14:00:00", "Maintenance windows: decision review", null]], p:{clarify:.8,prevent:.2}},
  {id:"2026-W39-i01", w:4, s:"none", title:"Release animation in the in-app changelog", mode:"build", pillar:"exec", wm:"slower", rec:1, links:[], ev:[["pr_open", "2026-09-22T10:05:00", "feat(ui): release animation in the changelog", null], ["pr_merged", "2026-09-23T16:42:00", "feat(ui): release animation in the changelog", null]], p:{build:.9,clarify:.1}},
  {id:"2026-W40-i01", w:5, s:"none", title:"The memory spike was not what the team assumed", mode:"prevent", pillar:"big", wm:"same",
   quote:{t:"A series cap is not the right tool here. The problem is fat labels.", who:"Example, Slack"}, links:[], ev:[["slack_mention", "2026-09-29T09:12:00", "#incident-memory", null], ["slack_message", "2026-09-29T09:58:00", "#incident-memory", null], ["doc_created", "2026-09-29T15:30:00", "Memory spike: what we found", null], ["pr_merged", "2026-09-30T11:20:00", "fix(ingest): bound the label cache", null]], p:{prevent:.6,clarify:.4}},
  {id:"2026-W40-i02", w:5, s:"none", title:"Told a new teammate to push back on anything over-engineered", mode:"elevate", pillar:"level", wm:"same",
   quote:{t:"Feel free to push back on whatever you see as overengineered.", who:"Example, Slack"}, links:[], ev:[["slack_message", "2026-10-01T16:05:00", "DM", null]], p:{elevate:.9,clarify:.1}},
  {id:"2026-W40-i03", w:5, s:"access", title:"Finished work on rules that had stalled for months", mode:"build", pillar:"exec", wm:"same", rec:2, links:[], ev:[["pr_merged", "2026-09-28T13:00:00", "feat(rules): evaluate rules per tenant", null], ["issue_completed", "2026-09-29T10:30:00", "Rules evaluate per tenant", null], ["pr_merged", "2026-10-01T12:15:00", "feat(rules): migrate stalled rules", null], ["issue_completed", "2026-10-02T17:40:00", "Stalled rules migrated", null]], p:{build:.8,solve:.2}},
  {id:"2026-W41-i01", w:6, s:"exports", title:"Opened the exports project: channel, design and tickets on day one", mode:"solve", pillar:"big", wm:"wouldnt", rec:3, links:[], ev:[["slack_message", "2026-10-05T09:20:00", "#project-exports", null], ["doc_created", "2026-10-05T11:00:00", "Exports API: design", null], ["issue_open", null, "Exports: DELETE endpoint", null], ["issue_open", null, "Exports: Terraform resource", null], ["meeting", "2026-10-06T14:00:00", "Exports kickoff", null]], p:{solve:.6,clarify:.4}},
  {id:"2026-W41-i02", w:6, s:"runners", title:"Review on the operator, praised by a principal on another team", mode:"clarify", pillar:"level", wm:"slower", rec:4, links:[], ev:[["pr_merged", "2026-10-07T10:44:00", "operator: reconcile dashboards on resync", null], ["slack_mention", "2026-10-07T18:02:00", "#engineering", null]], p:{clarify:.5,elevate:.5}},
  {id:"2026-W42-i01", w:7, s:"exports", ms:"Safe delete", title:"Exports API released before a customer escalation", mode:"solve", pillar:"exec", wm:"wouldnt", rec:5, links:[], ev:[["pr_merged", "2026-10-12T10:30:00", "feat(exports): soft delete behind a flag", null], ["pr_merged", "2026-10-13T15:12:00", "feat(exports): restore keeps the origin", null], ["issue_completed", "2026-10-14T09:50:00", "Exports API GA", null], ["slack_mention", "2026-10-14T13:05:00", "#customer-escalations", null]], p:{solve:.8,build:.2}},
  {id:"2026-W42-i02", w:7, s:"up", title:"Conference talk on metric contracts", mode:"external", pillar:"big", wm:"wouldnt", links:[], ev:[["doc_created", "2026-10-13T09:00:00", "Talk: metric contracts", null], ["meeting", "2026-10-16T11:00:00", "Conference talk on metric contracts", null]], p:{external:.95,clarify:.05}},
];
const HIGHLIGHT = {item:"2026-W42-i01", when:"2026-10-16"};
const PHASES = [
  {k:"Phase 1 · W35–W38", h:"Runners and the access model", from:0, to:3},
  {k:"Phase 1 · W37", rec:0},
  {k:"Phase 2 · W39–W40", h:"Ideas, and one assumption corrected", from:4, to:5},
  {k:"Phase 3 · W41–W42", h:"Exports, and a customer unblocked", from:6, to:7},
  {k:"Phase 3 · W42", rec:5},
];
// Fictional feedback, the shape bun ingest/feedback.ts saves: quotes checked, counts made by code.
const FEEDBACK = [{
  week:"2026-W42", weeks:["2026-W35","2026-W36","2026-W37","2026-W38","2026-W39","2026-W40","2026-W41","2026-W42"], messages:[48,61,55,40,52,70,58,63],
  patterns:[
    {name:"Asking sign-off on your own calls", why:"You own exports. Ending a plan with a question hands the decision to someone else, and the plan reads like a draft.",
     markers:["any objection","wdyt","is that ok"], trend:[0,0,0,0,0,1,1,1], matches:[
      {text:"Thinking we move the sync to Tuesdays, is that ok with everyone?", week:"2026-W40", at:"2026-10-01T11:15:00", channel:"#team-api", url:null}], evidence:[
      {quote:"I'm thinking of dropping the v1 endpoint next sprint, any objection?", instead:"I'm dropping the v1 endpoint next sprint; tell me by Thursday if that breaks you.", week:"2026-W42", at:"2026-10-13T10:12:00", channel:"#project-exports", url:null},
      {quote:"Plan is to cut the release Friday, wdyt?", instead:"We cut the release Friday.", week:"2026-W41", at:"2026-10-07T16:40:00", channel:"#team-api", url:null}]},
    {name:"Making your own asks smaller", why:"Saying \"no rush\" on work that gates a release gives reviewers a reason to wait, and your dates slip.",
     markers:["no rush","not urgent"], trend:[0,0,0,0,0,0,1,1], matches:[], evidence:[
      {quote:"No rush, but could someone look at the retry PR", instead:"The retry PR gates Friday's release; I need a review by Wednesday.", week:"2026-W42", at:"2026-10-14T09:05:00", channel:"#team-api", url:null},
      {quote:"not urgent at all", instead:"This blocks the Terraform resource, please review it this week.", week:"2026-W41", at:"2026-10-07T14:20:00", channel:"DM", url:null}]}],
  strength:{name:"Closing threads with a decision", why:"When a discussion stalls you write the decision and the reason, and the thread ends.", evidence:[
    {quote:"Decision: soft delete stays behind the flag until the restore path ships.", week:"2026-W42", at:"2026-10-15T11:30:00", channel:"#project-exports", url:null}]},
  experiment:{pattern:"Asking sign-off on your own calls", do:"On your own projects, write each decision as \"I'm doing X, tell me by <day> if you object.\" Do not end it with a question.", markers:["any objection","wdyt","is that ok"], trend:[0,0,0,0,0,1,1,1]},
  last_experiment:"You put a date on 2 review asks this week, but \"no rush\" stayed at 1.",
  previous:{week:"2026-W41", pattern:"Making your own asks smaller", do:"Put the date and the reason on every review ask that gates a release.", markers:["no rush","not urgent"], before:1, after:1},
}];
