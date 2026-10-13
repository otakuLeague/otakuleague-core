#!/usr/bin/env bash
input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
if printf '%s' "$cmd" | grep -qiE 'git +(commit|push)|gh +pr' && printf '%s' "$cmd" | grep -qiE 'co-authored-by|generated with'; then
  echo "Blocked: remove AI attribution (Co-Authored-By / Generated with) from the commit or PR text." >&2
  exit 2
fi
exit 0
