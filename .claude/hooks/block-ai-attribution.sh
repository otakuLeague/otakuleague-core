#!/usr/bin/env bash
# PreToolUse hook (Bash): block AI attribution in commit and PR text. Exit 2 blocks the call.
# Only commands that write a commit or PR message are checked, so reading history
# (git log, gh pr view | grep ...) is never blocked. Fails closed. Tests: hooks.test.sh.
set -uo pipefail

block() {
  echo "Blocked: $1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || block "jq is not installed, so the attribution hook cannot check this command."
input=$(cat)
command=$(jq -r '.tool_input.command // empty' <<<"$input") || block "unreadable hook input."
cwd=$(jq -r '.cwd // empty' <<<"$input") || block "unreadable hook input."

WRITES_MESSAGE='(^|[^A-Za-z0-9_-])(git[[:space:]]+((-C|-c)[[:space:]]+[^[:space:]]+[[:space:]]+)*commit|gh[[:space:]]+pr[[:space:]]+(create|edit|comment|review|merge))([[:space:]]|$)'
grep -qE "$WRITES_MESSAGE" <<<"$command" || exit 0

# The message is in the command (-m, --body, heredoc) or in a file (-F, --file, --body-file).
message=$command
while IFS= read -r file; do
  [[ -z "$file" || "$file" == "-" ]] && continue
  [[ "$file" == /* ]] || file="$cwd/$file"
  # "$TMPDIR/msg", ~/msg or a file in a directory the command cd's into cannot be read here.
  [[ -f "$file" ]] || block "cannot read the message file $file to check it; pass a literal absolute path."
  message+=$'\n'"$(cat -- "$file")"
done < <(grep -oE '(--body-file|--file|-F)[=[:space:]]+[^[:space:];|&]+' <<<"$command" |
  sed -E 's/^(--body-file|--file|-F)[=[:space:]]+//; s/^["'\'']//; s/["'\'']$//')

ATTRIBUTION='co-authored-by:|generated (with|by)[^a-z0-9]*(claude|anthropic|chatgpt|openai|copilot|gemini|cursor)|noreply@anthropic\.com'
if grep -qiE "$ATTRIBUTION" <<<"$message"; then
  block "remove AI attribution (Co-Authored-By, \"Generated with ...\") from the commit or PR text."
fi
exit 0
