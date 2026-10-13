#!/usr/bin/env bash
input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
base=$(basename "$path")
if [[ "$base" == ".env" || ( "$base" == .env.* && "$base" != ".env.example" ) ]]; then
  echo "Blocked: never edit real env files. Edit .env.example instead." >&2
  exit 2
fi
exit 0
