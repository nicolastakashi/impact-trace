#!/usr/bin/env bash
# Collect on a schedule with launchd (macOS): weekdays at 18:00.
# Usage: ./schedule.sh install | remove | run
# launchd runs in your login session, so claude -p reaches your login and connectors.
set -euo pipefail
cd "$(dirname "$0")"
label=com.impact-trace.collect
plist="$HOME/Library/LaunchAgents/$label.plist"

case "${1:-}" in
  install)
    # launchd starts with an empty PATH: keep the one where the tools are now.
    path=$(for t in claude gh bun python3; do dirname "$(command -v "$t")"; done | sort -u | paste -sd: -):/usr/bin:/bin
    days=$(for d in 1 2 3 4 5; do echo "<dict><key>Weekday</key><integer>$d</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>0</integer></dict>"; done)
    mkdir -p "$(dirname "$plist")" data/logs
    cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array><string>$PWD/schedule.sh</string><string>run</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$path</string></dict>
  <key>StartCalendarInterval</key><array>$days</array>
  <key>StandardOutPath</key><string>$PWD/data/logs/launchd.log</string>
  <key>StandardErrorPath</key><string>$PWD/data/logs/launchd.log</string>
</dict></plist>
PLIST
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$plist"
    echo "Scheduled: weekdays 18:00. Logs in data/logs/. Remove with ./schedule.sh remove"
    ;;
  remove)
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    rm -f "$plist"; echo "Removed"
    ;;
  run)
    # Monday closes last week, weekend included. Other days collect this week so far.
    mkdir -p data/logs
    if [ "$(date +%u)" = 1 ]; then monday=$(date -v-7d +%F); else monday=$(date -v-$(( $(date +%u) - 1 ))d +%F); fi
    ./run.sh "$monday" > "data/logs/$(date +%F).log" 2>&1
    ;;
  *) echo "usage: ./schedule.sh install | remove | run" >&2; exit 2 ;;
esac
