#!/usr/bin/env bash
# PostToolUse hook (Edit/Write/MultiEdit): Prettier, then ESLint --fix, on the edited file only.
# Never blocks and prints nothing on success, so formatting costs zero tokens. Remaining lint
# errors surface in `pnpm lint` (/ship, CI). Skips files outside the project and ignored paths.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0
file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
[[ -n "$file" && -f "$file" ]] || exit 0
case "$file" in
"$root"/*) ;;
*) exit 0 ;;
esac
case "$file" in
*/node_modules/* | */dist/* | */.next/* | */generated/* | *pnpm-lock.yaml | */.env*) exit 0 ;;
esac

cd "$root" || exit 0
case "$file" in
*.ts | *.tsx | *.mts | *.cts | *.js | *.jsx | *.mjs | *.cjs | *.json | *.css | *.md | *.yml | *.yaml | *.html)
  timeout 20 pnpm exec prettier --write --log-level=silent "$file" >/dev/null 2>&1 || true
  ;;
esac

case "$file" in
*.ts | *.tsx | *.mts | *.cts | *.js | *.jsx | *.mjs | *.cjs)
  # ESLint runs from the nearest folder with its own flat config (each app has one).
  dir=$(dirname "$file")
  while [[ "$dir" == "$root"* && ! -f "$dir/eslint.config.mjs" ]]; do dir=$(dirname "$dir"); done
  [[ -f "$dir/eslint.config.mjs" ]] && (cd "$dir" && timeout 30 pnpm exec eslint --fix --no-warn-ignored "$file" >/dev/null 2>&1)
  ;;
esac
exit 0
