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

# Read-only tools per source. The skill forbids write flags on `gh api`; the prefix
# pattern alone cannot. ponytail: prompt-level guard, move to a wrapper script if it slips.
linear_tools="mcp__claude_ai_Linear__list_issues,mcp__claude_ai_Linear__get_issue,mcp__claude_ai_Linear__list_projects"
github_tools="Bash(gh search prs:*),Bash(gh api --paginate repos/:*)"

collect() { # source tools
  echo "▶ $1 $week"
  claude -p "/collect-$1 $monday" \
    --model haiku \
    --allowedTools "$2" \
    --output-format json \
    --json-schema "$(cat "schemas/$1.json")" \
    > "$out/$1.run.json"
}

collect linear "$linear_tools"
collect github "$github_tools"

# Independent count for GitHub, to catch rows Claude dropped.
gh search prs --author nicolastakashi --merged --merged-at "$monday..$sunday" --limit 200 \
  --json repository --jq '[.[]|select(.repository.nameWithOwner|startswith("nicolastakashi/")|not)]|length' \
  > "$out/github.expected"

bun ingest/ingest.ts "$week"
