#!/usr/bin/env bash
# One-time setup on Farouk's Mac: installs the nightly digest (daily 06:47) and the Sunday review
# (18:13) as launchd agents. If the Mac is asleep at that time, launchd runs the job on wake.
# Usage: scripts/autopilot/install-mac.sh [--run-now] [--with-design]
#   --run-now      run the nightly digest once right away to test it
#   --with-design  also install Playwright's Chromium for design screenshots
# Undo: scripts/autopilot/uninstall-mac.sh. Pause without uninstalling: touch ~/.otakuleague/paused
set -euo pipefail
[[ "$(uname)" == "Darwin" ]] || { echo "macOS only."; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/.otakuleague/logs"
mkdir -p "$AGENTS" "$LOGS"

missing=()
for tool in git gh jq node pnpm claude; do command -v "$tool" >/dev/null || missing+=("$tool"); done
if ((${#missing[@]})); then
  echo "Missing: ${missing[*]}. Install them first (e.g. brew install ${missing[*]/claude/}; claude: see code.claude.com)."
  exit 1
fi
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first."; exit 1; }

# launchd starts jobs with a minimal PATH: pin the directories of the tools found now.
path_dirs=""
for tool in git gh jq node pnpm claude osascript; do
  dir=$(dirname "$(command -v "$tool")")
  [[ ":$path_dirs:" == *":$dir:"* ]] || path_dirs="${path_dirs:+$path_dirs:}$dir"
done
path_dirs="$path_dirs:/usr/bin:/bin:/usr/sbin:/sbin"

write_plist() { # write_plist <label> <script> <calendar xml>
  cat >"$AGENTS/$1.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$HERE/$2</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$path_dirs</string></dict>
  <key>StartCalendarInterval</key>$3
  <key>StandardOutPath</key><string>$LOGS/$1.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$1.log</string>
</dict></plist>
PLIST
  launchctl bootout "gui/$(id -u)/$1" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$1.plist"
  echo "installed $1"
}

write_plist com.otakuleague.nightly nightly.sh '<dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>47</integer></dict>'
write_plist com.otakuleague.weekly weekly.sh '<dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>18</integer><key>Minute</key><integer>13</integer></dict>'

if [[ " $* " == *" --with-design "* ]]; then
  npx --yes playwright install chromium
fi

cat <<MSG

Done. Digests land in ${OTAKU_DIGEST_DIR:-$HOME/OtakuLeague/digests} (set OTAKU_DIGEST_DIR in the plist to change).
Logs: $LOGS. Pause: touch ~/.otakuleague/paused. Remove: $HERE/uninstall-mac.sh

Optional, inside Claude Code (user level, reviewed in ADR 0011):
  /plugin marketplace add pbakaus/impeccable    then install it from /plugin
  and add  "env": {"DO_NOT_TRACK": "1"}  to ~/.claude/settings.json to turn its telemetry off.
MSG

if [[ " $* " == *" --run-now "* ]]; then
  echo "Running the nightly digest once..."
  bash "$HERE/nightly.sh"
fi
