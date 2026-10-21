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
# Reviews by when you submitted them: search can only filter PRs by their last update.
collect reviews "$github_tools" "$login"
# Who asked you: GitHub keeps a request on the PR timeline, searches only show pending ones.
collect requests "$github_tools" "$login"
# One call per pass and per day: a single call skipped the mention pass, and a week in one
# call came back as its first page only (11 pages read, 20 rows returned).
for i in 0 1 2 3 4 5 6; do
  day=$(python3 -c 'import datetime as d,sys; print(d.date.fromisoformat(sys.argv[1])+d.timedelta(int(sys.argv[2])))' "$monday" "$i")
  # A day that has not happened has no messages; Haiku answered those with today's.
  [[ "$day" > "$(date +%F)" ]] && continue
  collect "slack_own_$((i + 1))" "$slack_tools" "own $day"
  collect "slack_mention_$((i + 1))" "$slack_tools" "mention $day $name"
done
collect calendar "$calendar_tools"
collect drive "$drive_tools"

# Independent count for GitHub, to catch rows Claude dropped.
gh search prs --author "$login" --merged --merged-at "$monday..$sunday" --limit 200 \
  --json repository --jq "[.[]|select(.repository.nameWithOwner|startswith(\"$login/\")|not)]|length" \
  > "$out/github.expected"
gh search prs --author "$login" --created "$monday..$sunday" --limit 200 \
  --json repository --jq "[.[]|select(.repository.nameWithOwner|startswith(\"$login/\")|not)]|length" \
  > "$out/github_opened.expected"
gh search prs --reviewed-by "$login" --updated ">=$monday" --limit 1000 \
  --json author --jq "[.[]|select(.author.login!=\"$login\")]|length" > "$out/reviews.expected"
# PRs that asked you or your teams, or that you reviewed; and your teams, for the ingest filter.
{ gh search prs --review-requested "$login" --updated ">=$monday" --limit 1000 --json url,author
  gh search prs --reviewed-by "$login" --updated ">=$monday" --limit 1000 --json url,author; } |
  jq -s "[add[]|select(.author.login!=\"$login\")|.url]|unique|length" > "$out/requests.expected"
gh api --paginate user/teams --jq '.[]|"team:\(.organization.login)/\(.slug)"' > "$out/teams.txt"

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

# Feedback on how you show up, from your own messages: Claude quotes, the code checks quotes and counts.
# Once per week, after it ends: the weekday runs would pay for feedback on half a week.
if [[ "$(date +%F)" > "$sunday" ]]; then
  echo "▶ feedback $week"
  if [ "$(bun ingest/feedback.ts count "$week")" = 0 ]; then bun ingest/feedback.ts empty "$week"; else
  bun ingest/feedback.ts emit "$week" > "$out/feedback.json"
  claude -p "/weekly-feedback $week" --model sonnet --output-format json \
    --json-schema "$(cat schemas/feedback.json)" < "$out/feedback.json" > "$out/feedback.run.json"
  bun ingest/feedback.ts save "$week" "$out/feedback.run.json"; fi
fi
