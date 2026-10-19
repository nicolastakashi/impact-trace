#!/usr/bin/env bash
# Eval for grouping: how many multi-event threads mix unrelated work, per week.
# Usage: evals/check-threads.sh <label> 2026-W35 2026-W36 ...   → data/eval/<label>/<week>.json
set -euo pipefail
cd "$(dirname "$0")/.."
label=$1; shift
mkdir -p "data/eval/$label"
for W in "$@"; do
  bun -e 'import { open } from "./ingest/ingest"; import { reviewThreads } from "./ingest/review";
    console.log(JSON.stringify(reviewThreads(open(), process.argv[1]).filter((t) => t.events.length > 1)
      .map(({ key, events }) => ({ key, events: events.map(({ kind, title, text }) => ({ kind, title, text })) }))))' "$W" |
    claude -p "/check-threads $W" --model sonnet --output-format json --json-schema "$(cat schemas/check.json)" \
    > "data/eval/$label/$W.json"
  python3 -c 'import json,sys; o=json.load(open(sys.argv[1]))["structured_output"]["threads"]; print(sys.argv[2], len(o), "multi-event,", sum(t["mixed"] for t in o), "mixed")' "data/eval/$label/$W.json" "$W"
done
