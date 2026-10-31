#!/usr/bin/env bash
# PreToolUse hook (Bash): block force-pushes, pushes to main/master, and skipping git hooks.
# Exit 2 blocks the call and shows stderr to Claude. Fails closed. Tests: hooks.test.sh.
# Plain feature-branch pushes stay allowed; .githooks/pre-push also blocks main for terminal pushes.
set -uo pipefail

block() {
  echo "Blocked: $1" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || block "jq is not installed, so the git guard cannot check this command."
command=$(jq -r '.tool_input.command // empty' 2>/dev/null) || block "unreadable hook input."
[[ -n "$command" ]] || exit 0

# Split on shell separators so `git status && git push -f` is checked part by part.
while IFS= read -r part; do
  part="${part#"${part%%[![:space:]]*}"}"
  [[ "$part" =~ ^(sudo[[:space:]]+|command[[:space:]]+|[A-Z_]+=[^[:space:]]*[[:space:]]+)*([^[:space:]]*/)?git[[:space:]] ]] || continue

  if [[ "$part" =~ (^|[[:space:]])--no-verify([[:space:]]|$) ]]; then
    block "--no-verify skips the repo's git hooks (attribution check, main protection)."
  fi

  [[ "$part" =~ (^|[[:space:]])push([[:space:]]|$) ]] || continue
  if [[ "$part" =~ [[:space:]](-f|--force|--force-with-lease|--force-if-includes|--mirror|--delete|-d)([[:space:]=]|$) ]] ||
    [[ "$part" =~ [[:space:]]-[a-zA-Z]*f[a-zA-Z]*([[:space:]]|$) ]] ||
    [[ "$part" =~ [[:space:]]\+[^[:space:]]+ ]] ||
    [[ "$part" =~ [[:space:]]:[^[:space:]]+ ]]; then
    block "force-push, mirror or delete. Rewriting or deleting remote history needs Farouk, in a terminal."
  fi
  if [[ "$part" =~ [[:space:]:](main|master)([[:space:]]|$) ]] || [[ "$part" =~ HEAD:(refs/heads/)?(main|master) ]]; then
    block "push to main. Push the feature branch and open a PR instead."
  fi
done < <(printf '%s\n' "$command" | sed -E 's/(\&\&|\|\||;|\|)/\n/g')

exit 0
