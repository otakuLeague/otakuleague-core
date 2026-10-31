#!/usr/bin/env bash
# Notification and Stop hook: a macOS notification so you can step away while Claude works.
# Silent no-op off macOS or when OTAKU_NOTIFY=0. Never blocks.
set -uo pipefail

[[ "${OTAKU_NOTIFY:-1}" == "0" ]] && exit 0
command -v osascript >/dev/null 2>&1 || exit 0
input=$(cat 2>/dev/null || true)
event=$(jq -r '.hook_event_name // empty' <<<"$input" 2>/dev/null || true)
case "$event" in
Notification) message=$(jq -r '.message // "Claude needs your input"' <<<"$input" 2>/dev/null) ;;
*) message="Claude finished, your turn" ;;
esac
message=${message//\"/\'}
osascript -e "display notification \"${message:0:180}\" with title \"OtakuLeague\" sound name \"Glass\"" >/dev/null 2>&1 || true
exit 0
