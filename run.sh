#!/usr/bin/env bash
# Collect one ISO week with Claude Code, then ingest it.
# Usage: ./run.sh [YYYY-MM-DD Monday]   (default: this week's Monday)
set -euo pipefail
cd "$(dirname "$0")"

monday=${1:-$(python3 -c 'import datetime as d; t=d.date.today(); print(t-d.timedelta(t.weekday()))')}
week=$(python3 -c '
import datetime as d, sys
m = d.date.fromisoformat(sys.argv[1])
if m.weekday() != 0: sys.exit(f"{m} is not a Monday")
y, w, _ = m.isocalendar(); print(f"{y}-W{w:02d}")' "$monday")
sunday=$(python3 -c 'import datetime as d,sys; print(d.date.fromisoformat(sys.argv[1])+d.timedelta(6))' "$monday")
out="data/raw/$week"; mkdir -p "$out"

# Who you are comes from the setup page.
[ -f data/config.json ] || { echo "No data/config.json yet. Run bun app/server.ts and open http://127.0.0.1:4317/#/setup" >&2; exit 1; }
cfg() { python3 -c 'import json,sys; v=json.load(open("data/config.json"))[sys.argv[1]]; print(",".join(v) if isinstance(v,list) else v)' "$1"; }
login=$(cfg github); orgs=$(cfg orgs); name=$(cfg name)

# Read-only tools per source. The skill forbids write flags on `gh api`; the prefix
# pattern alone cannot. ponytail: prompt-level guard, move to a wrapper script if it slips.
linear_tools="mcp__claude_ai_Linear__list_issues,mcp__claude_ai_Linear__get_issue,mcp__claude_ai_Linear__list_projects"
github_tools="Bash(gh search prs:*),Bash(gh api --paginate repos/:*)"
slack_tools="mcp__claude_ai_Slack__slack_search_public_and_private"
calendar_tools="mcp__claude_ai_Google_Calendar__list_events"
drive_tools="mcp__claude_ai_Google_Drive__search_files"

collect() { # source tools [skill args]: the raw file is named after the source
  echo "▶ $1 $week"
  claude -p "/collect-${1%%_*} $monday ${3:-}" \
    --model haiku \
    --allowedTools "$2" \
    --output-format json \
    --json-schema "$(cat "schemas/${1%%_*}.json")" \
    < /dev/null > "$out/$1.run.json"
}

collect linear "$linear_tools"
collect github "$github_tools" "$login ${orgs:--}"
# One call per pass: a single call skipped the mention pass. Own messages go one day per
# call: a busy week (338 rows) was too long for one answer.
for i in 0 1 2 3 4 5 6; do
  day=$(python3 -c 'import datetime as d,sys; print(d.date.fromisoformat(sys.argv[1])+d.timedelta(int(sys.argv[2])))' "$monday" "$i")
  collect "slack_own_$((i + 1))" "$slack_tools" "own $day"
done
collect slack_mention "$slack_tools" "mention $name"
collect calendar "$calendar_tools"
collect drive "$drive_tools"

# Independent count for GitHub, to catch rows Claude dropped.
gh search prs --author "$login" --merged --merged-at "$monday..$sunday" --limit 200 \
  --json repository --jq "[.[]|select(.repository.nameWithOwner|startswith(\"$login/\")|not)]|length" \
  > "$out/github.expected"

bun ingest/ingest.ts "$week"

# Place threads Linear does not put in a project, before labels, so labels see whole threads.
echo "▶ projects $week"
bun ingest/assign.ts emit "$week" > "$out/unplaced.json"
claude -p "/assign-projects $week" --model sonnet --output-format json \
  --json-schema "$(cat schemas/assign.json)" < "$out/unplaced.json" > "$out/assign.run.json"
bun ingest/assign.ts save "$week" "$out/assign.run.json"

# Labels are judgment, not lifting: a stronger model, no tools, only the threads as input.
echo "▶ labels $week"
bun ingest/review.ts emit "$week" > "$out/threads.json"
claude -p "/suggest-labels $week" --model sonnet --output-format json \
  --json-schema "$(cat schemas/labels.json)" < "$out/threads.json" > "$out/labels.run.json"
bun ingest/review.ts save "$week" "$out/labels.run.json"
