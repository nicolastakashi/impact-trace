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
  {id:"2026-W35-i01", w:0, s:"up", title:"Three upstream PRs in one week", mode:"external", pillar:"big", wm:"wouldnt", links:[], p:{external:.9,build:.1}},
  {id:"2026-W37-i01", w:2, s:"runners", title:"Private runners v0 shipped, shown to a customer the next day", mode:"build", pillar:"exec", wm:"wouldnt", rec:0, links:[], p:{build:.85,solve:.15}},
  {id:"2026-W37-i02", w:2, s:"silences", ms:"Maintenance windows", title:"Challenged the maintenance-window model in review; the decision was reopened", mode:"clarify", pillar:"big", wm:"slower",
   quote:{t:"A window should be its own asset that creates and aggregates silences.", who:"Example, design review"}, links:[], p:{clarify:.8,prevent:.2}},
  {id:"2026-W39-i01", w:4, s:"none", title:"Release animation in the in-app changelog", mode:"build", pillar:"exec", wm:"slower", rec:1, links:[], p:{build:.9,clarify:.1}},
  {id:"2026-W40-i01", w:5, s:"none", title:"The memory spike was not what the team assumed", mode:"prevent", pillar:"big", wm:"same",
   quote:{t:"A series cap is not the right tool here. The problem is fat labels.", who:"Example, Slack"}, links:[], p:{prevent:.6,clarify:.4}},
  {id:"2026-W40-i02", w:5, s:"none", title:"Told a new teammate to push back on anything over-engineered", mode:"elevate", pillar:"level", wm:"same",
   quote:{t:"Feel free to push back on whatever you see as overengineered.", who:"Example, Slack"}, links:[], p:{elevate:.9,clarify:.1}},
  {id:"2026-W40-i03", w:5, s:"access", title:"Finished work on rules that had stalled for months", mode:"build", pillar:"exec", wm:"same", rec:2, links:[], p:{build:.8,solve:.2}},
  {id:"2026-W41-i01", w:6, s:"exports", title:"Opened the exports project: channel, design and tickets on day one", mode:"solve", pillar:"big", wm:"wouldnt", rec:3, links:[], p:{solve:.6,clarify:.4}},
  {id:"2026-W41-i02", w:6, s:"runners", title:"Review on the operator, praised by a principal on another team", mode:"clarify", pillar:"level", wm:"slower", rec:4, links:[], p:{clarify:.5,elevate:.5}},
  {id:"2026-W42-i01", w:7, s:"exports", ms:"Safe delete", title:"Exports API released before a customer escalation", mode:"solve", pillar:"exec", wm:"wouldnt", rec:5, links:[], p:{solve:.8,build:.2}},
  {id:"2026-W42-i02", w:7, s:"up", title:"Conference talk on metric contracts", mode:"external", pillar:"big", wm:"wouldnt", links:[], p:{external:.95,clarify:.05}},
];
const HIGHLIGHT = {item:"2026-W42-i01", when:"2026-10-16"};
const PHASES = [
  {k:"Phase 1 · W35–W38", h:"Runners and the access model", from:0, to:3},
  {k:"Phase 1 · W37", rec:0},
  {k:"Phase 2 · W39–W40", h:"Ideas, and one assumption corrected", from:4, to:5},
  {k:"Phase 3 · W41–W42", h:"Exports, and a customer unblocked", from:6, to:7},
  {k:"Phase 3 · W42", rec:5},
];
