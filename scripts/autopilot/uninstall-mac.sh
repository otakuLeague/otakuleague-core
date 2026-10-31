#!/usr/bin/env bash
# Removes the launchd agents installed by install-mac.sh. Digests and logs are kept.
set -uo pipefail
for label in com.otakuleague.nightly com.otakuleague.weekly; do
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
  echo "removed $label"
done
