#!/usr/bin/env bash
# Claude drafts objectives from your data. They wait on the Goals page until you use or dismiss them.
# Usage: ./draft-goals.sh   (the app must run: docker compose up -d)
set -euo pipefail
cd "$(dirname "$0")"
out="data/raw/drafts"; mkdir -p "$out"
bun ingest/drafts.ts emit > "$out/in.json"
# Judgment, like labels: only the input, no collectors.
claude -p "/draft-goals" --model sonnet --output-format json \
  --json-schema "$(cat schemas/drafts.json)" < "$out/in.json" > "$out/run.json"
bun ingest/drafts.ts save "$out/run.json" "$out/in.json"
echo "Open http://127.0.0.1:4317/#/goals"
