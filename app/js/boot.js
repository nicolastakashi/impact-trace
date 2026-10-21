renderAll(); route(); loadPending();
if(typeof SAMPLE !== "undefined") document.querySelectorAll(".sample-note, .sample-tag").forEach(x => x.hidden = false);
// First run: nobody to collect for yet, so start at setup.
fetch("/api/setup").then(r => r.json()).then(s => { if(!s.config && !location.hash.startsWith("#/setup")) show("setup"); }).catch(() => {});
