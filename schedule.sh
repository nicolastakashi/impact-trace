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
    # First close every ended week that has no feedback yet, oldest first: usually last week on
    # a Monday, but also a Monday the Mac slept through or a run that failed. launchd runs a missed
    # job on wake, on whatever day that is, so the day alone cannot decide. Then, after Monday,
    # collect this week so far. A failed week does not stop the others; tomorrow retries it.
    mkdir -p data/logs; log="data/logs/$(date +%F).log"; failed=0
    # A failure here must not read as "nothing pending".
    pending=$(bun jobs/feedback.ts pending) || { echo "✗ could not read pending weeks" >> "$log"; exit 1; }
    for monday in $pending; do
      echo "━━ close week of $monday" >> "$log"
      ./run.sh "$monday" >> "$log" 2>&1 || { echo "✗ week of $monday failed, retried next run" >> "$log"; failed=1; }
    done
    if [ "$(date +%u)" != 1 ]; then
      echo "━━ this week so far" >> "$log"
      ./run.sh "$(date -v-$(( $(date +%u) - 1 ))d +%F)" >> "$log" 2>&1 || failed=1
    fi
    # A failure retries on its own, but a broken login would fail every day in silence: say so,
    # and name the sources whose count was short, so you know what to check.
    if [ "$failed" != 0 ]; then
      short=$(sed -n 's/^✗ \([a-z_0-9]*\) [0-9]\{4\}-W[0-9]\{2\}: .*/\1/p' "$log" | sort -u | paste -sd, - | sed 's/,/, /g')
      message=${short:+"Short count: $short. Tomorrow retries. See $log"}
      osascript -e "display notification \"${message:-A run failed. See $log}\" with title \"impact-trace\"" 2>/dev/null || true
    fi
    exit $failed
    ;;
  *) echo "usage: ./schedule.sh install | remove | run" >&2; exit 2 ;;
esac
