#!/usr/bin/env bash
# Pipes sample PreToolUse JSON into the hooks and checks the exit code (2 = blocked, 0 = allowed).
# The sampled commands are never executed, so no env file is touched. Run: pnpm test:hooks
set -uo pipefail

HOOKS=$(cd "$(dirname "$0")" && pwd)
SETTINGS="$HOOKS/../settings.json"
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
count=0
failures=0

bash_input() {
  jq -n --arg command "$1" --arg cwd "${2:-/repo}" \
    '{tool_name: "Bash", cwd: $cwd, tool_input: {command: $command}}'
}
file_input() {
  jq -n --arg tool "$1" --arg path "$2" '{tool_name: $tool, cwd: "/repo", tool_input: {file_path: $path}}'
}

record() { # record <want> <got> <label>
  count=$((count + 1))
  if [[ "$2" != "$1" ]]; then
    failures=$((failures + 1))
    echo "FAIL $3: exit $2, want $1"
  fi
}

# expect <0|2> <hook script> <label> <json> [VAR=value ...]
expect() {
  local want=$1 hook=$2 label=$3 json=$4
  shift 4
  printf '%s' "$json" | env "$@" "$BASH" "$HOOKS/$hook" >/dev/null 2>&1
  record "$want" $? "$hook: $label"
}

# expect_configured <0|2> <matcher> <label> <json> <project dir>: runs every hook command
# from settings.json for that matcher, the way Claude Code does, and keeps the highest exit code.
expect_configured() {
  local want=$1 matcher=$2 label=$3 json=$4 project=$5 got=0 status command
  while IFS= read -r command; do
    printf '%s' "$json" | CLAUDE_PROJECT_DIR="$project" sh -c "$command" >/dev/null 2>&1
    status=$?
    ((status > got)) && got=$status
  done < <(jq -r --arg m "$matcher" '.hooks.PreToolUse[] | select(.matcher == $m) | .hooks[].command' "$SETTINGS")
  record "$want" "$got" "settings [$matcher]: $label"
}

# --- protect-env: Edit / Write ---
expect 2 protect-env.sh "Edit .env" "$(file_input Edit /repo/.env)"
expect 2 protect-env.sh "Write apps/web/.env.local" "$(file_input Write /repo/apps/web/.env.local)"
expect 0 protect-env.sh "Edit .env.example" "$(file_input Edit /repo/.env.example)"
expect 0 protect-env.sh "Write config.env and .envrc" "$(file_input Write /repo/config.env)"
expect 0 protect-env.sh "Write .envrc" "$(file_input Write /repo/.envrc)"
expect 2 protect-env.sh "MultiEdit .env" "$(file_input MultiEdit /repo/.env)"
expect 2 protect-env.sh "NotebookEdit notebook_path .env" \
  "$(jq -n '{tool_name: "NotebookEdit", cwd: "/repo", tool_input: {notebook_path: "/repo/.env"}}')"

# --- protect-env: Bash writes that used to get through (OTA-76) ---
blocked_commands=(
  'echo "API_BASE_URL=http://127.0.0.1:3001" >> .env'
  "printf 'A=1\n' > ./.env"
  $'cat >> /Users/someone/project/.env <<EOF\nA=1\nEOF'
  'echo A=1 | tee -a .env'
  "sed -i '' 's/a/b/' .env"
  "perl -pi -e 's/a/b/' .env"
  'cp .env.example .env'
  'mv /tmp/new-env .env'
  'rm .env'
  'ln -sf /tmp/x .env'
  "python3 -c \"open('.env', 'a').write('A=1')\""
  "node -e \"require('fs').appendFileSync('.env', 'A=1')\""
  'cd apps/api && echo A=1 >> ../../.env'
  'F=.env; echo A=1 >> $F'
  "bash -c 'echo A=1 >> .env'"
  'echo A=1 >| .env.local'
  'echo A=1 > "apps/web/.env.production"'
  'truncate -s 0 .env'
  # Security review of OTA-81: quoted directory prefix, space in the path, heredoc into an interpreter.
  'echo A=1 >> "$ROOT"/.env'
  'cat > "$CLAUDE_PROJECT_DIR"/.env'
  'cat > "$(git rev-parse --show-toplevel)/.env"'
  'echo A=1 >> "/Users/me/my proj/.env"'
  $'python3 - <<EOF\nopen(".env", "a").write("A=1")\nEOF'
  $'node <<\'EOF\'\nrequire("fs").appendFileSync(".env", "A=1")\nEOF'
  "tsx -e \"require('fs').writeFileSync('.env', '')\""
  'echo A=1 | sponge .env'
  'patch .env < fix.diff'
)
for command in "${blocked_commands[@]}"; do
  expect 2 protect-env.sh "$command" "$(bash_input "$command")"
done

allowed_commands=(
  'cat .env.example'
  'echo A=1 >> .env.example'
  "sed -i '' 's/a/b/' .env.example"
  'cp .env.example /tmp/scratch-copy'
  'cat .env'
  'grep API_BASE_URL .env'
  'pnpm db:up'
  'git commit -m "docs: mention .env in CLAUDE.md"'
  'ls -a'
  'echo done > out.txt'
)
for command in "${allowed_commands[@]}"; do
  expect 0 protect-env.sh "$command" "$(bash_input "$command")"
done

# Long text naming .env on every line must stay fast (bash 3.2 took 8 s for 200 lines before tr).
long_text=$(for _ in $(seq 1 2000); do echo 'see the .env file | x'; done)
started=$SECONDS
expect 0 protect-env.sh "2000 lines naming .env, no write" "$(bash_input "$long_text")"
record 0 $((SECONDS - started > 3)) "protect-env.sh: 2000 lines checked in 3 s or less"

# --- block-ai-attribution ---
cat >"$SCRATCH/attributed.md" <<'EOF'
Summary.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
printf 'Summary.\n\nCloses OTA-81\n' >"$SCRATCH/clean.md"

expect 2 block-ai-attribution.sh "Co-Authored-By in -m" \
  "$(bash_input 'git commit -m "feat: x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"')"
expect 2 block-ai-attribution.sh "Co-Authored-By in a heredoc" \
  "$(bash_input $'git commit -F - <<\'EOF\'\nfeat: x\n\nCo-Authored-By: Someone <a@b.c>\nEOF')"
expect 2 block-ai-attribution.sh "git -C <dir> commit" \
  "$(bash_input 'git -C /repo commit -m "x" -m "co-authored-by: someone"')"
expect 2 block-ai-attribution.sh "Generated with Claude Code in --body" \
  "$(bash_input 'gh pr create --title x --body "Done. Generated with [Claude Code](https://claude.com/claude-code)"')"
expect 2 block-ai-attribution.sh "attribution in a relative --body-file" \
  "$(bash_input 'gh pr create --title x --body-file attributed.md' "$SCRATCH")"
expect 2 block-ai-attribution.sh "attribution in an absolute -F file" \
  "$(bash_input "git commit -F $SCRATCH/attributed.md")"
expect 2 block-ai-attribution.sh "gh pr edit --body" \
  "$(bash_input 'gh pr edit 12 --body "Co-Authored-By: x"')"
expect 2 block-ai-attribution.sh "gh pr merge --body" \
  "$(bash_input 'gh pr merge 12 --squash --body "Co-Authored-By: x"')"
expect 2 block-ai-attribution.sh "message file the hook cannot read (\$TMPDIR)" \
  "$(bash_input 'git commit -F "$TMPDIR/msg.txt"')"
expect 2 block-ai-attribution.sh "message file in a directory the command cd's into" \
  "$(bash_input 'cd /elsewhere && git commit -F msg.txt' "$SCRATCH")"

# The git commit-msg hook catches what the Claude hook cannot see ($(cat file), an editor, --amend).
"$BASH" "$HOOKS/../../.githooks/commit-msg" "$SCRATCH/attributed.md" 2>/dev/null
record 1 $? "commit-msg: attribution in the final message"
"$BASH" "$HOOKS/../../.githooks/commit-msg" "$SCRATCH/clean.md" 2>/dev/null
record 0 $? "commit-msg: clean message"

# The OTA-82 false positive: reading history with the trigger words in a grep pattern.
expect 0 block-ai-attribution.sh "gh pr view | grep" \
  "$(bash_input "gh pr view 11 --json body -q .body | grep -ciE 'co-authored|generated with'")"
expect 0 block-ai-attribution.sh "git log | grep" \
  "$(bash_input 'git log -1 --format=%B | grep -ci co-authored-by')"
expect 0 block-ai-attribution.sh "commit that names CLAUDE.md" \
  "$(bash_input 'git commit -m "docs: update CLAUDE.md commands"')"
expect 0 block-ai-attribution.sh "files generated with prisma" \
  "$(bash_input 'git commit -m "chore: client generated with prisma generate"')"
expect 0 block-ai-attribution.sh "clean --body-file" \
  "$(bash_input 'gh pr create --title x --body-file clean.md' "$SCRATCH")"
expect 0 block-ai-attribution.sh "git push" "$(bash_input 'git push -u origin my-branch')"

# --- Fail closed ---
# jq missing: a PATH with only the tools the scripts need besides jq.
mkdir "$SCRATCH/bin"
for tool in cat grep sed basename; do ln -s "$(command -v "$tool")" "$SCRATCH/bin/$tool"; done
expect 2 protect-env.sh "jq missing" "$(file_input Edit /repo/.env.example)" PATH="$SCRATCH/bin"
expect 2 block-ai-attribution.sh "jq missing" "$(bash_input 'git commit -m "x"')" PATH="$SCRATCH/bin"
expect 2 protect-env.sh "input that is not JSON" "not json"

# Run from another working directory: the hooks only use absolute paths and the JSON cwd.
pushd / >/dev/null || exit 1
expect 2 protect-env.sh "from / : write .env" "$(bash_input 'echo A=1 >> .env')"
expect 0 block-ai-attribution.sh "from / : relative clean --body-file" \
  "$(bash_input 'gh pr create --title x --body-file clean.md' "$SCRATCH")"
popd >/dev/null || exit 1

# Commands as configured in settings.json, with the real scripts.
project=$(cd "$HOOKS/../.." && pwd)
expect_configured 2 Bash "write .env" "$(bash_input 'echo A=1 >> .env')" "$project"
expect_configured 2 Bash "attribution" "$(bash_input 'git commit -m "x" -m "Co-Authored-By: x"')" "$project"
expect_configured 0 Bash "plain command" "$(bash_input 'pnpm test')" "$project"
expect_configured 2 "Edit|Write|MultiEdit|NotebookEdit" "Edit .env" "$(file_input Edit /repo/.env)" "$project"
expect_configured 0 "Edit|Write|MultiEdit|NotebookEdit" "Edit .env.example" "$(file_input Edit /repo/.env.example)" "$project"

# Scripts that lost their executable bit still run (bash <script>), so they still block.
mkdir -p "$SCRATCH/noexec/.claude/hooks"
cp "$HOOKS/protect-env.sh" "$HOOKS/block-ai-attribution.sh" "$SCRATCH/noexec/.claude/hooks/"
chmod -x "$SCRATCH/noexec/.claude/hooks/"*.sh
expect_configured 2 Bash "not executable: write .env" "$(bash_input 'echo A=1 >> .env')" "$SCRATCH/noexec"
expect_configured 0 Bash "not executable: plain command" "$(bash_input 'pnpm test')" "$SCRATCH/noexec"

# A missing script blocks everything instead of allowing it.
mkdir -p "$SCRATCH/missing/.claude/hooks"
expect_configured 2 Bash "scripts missing" "$(bash_input 'pnpm test')" "$SCRATCH/missing"
expect_configured 2 "Edit|Write|MultiEdit|NotebookEdit" "script missing" "$(file_input Edit /repo/.env.example)" "$SCRATCH/missing"

# --- permissions.deny: git clean -x / -X and git stash -a would remove the gitignored .env without naming it ---
# Bash glob approximates Claude Code's documented rule matching (* matches any text, spaces included).
# Wrappers, env prefixes and && chains are handled by Claude Code itself, not checked here.
expect_denied() { # expect_denied <0|1> <command>: 1 = some deny rule matches
  local want=$1 command=$2 got=0 pattern
  while IFS= read -r pattern; do
    # shellcheck disable=SC2053 # $pattern is a glob on purpose
    [[ $command == $pattern ]] && got=1
  done < <(jq -r '.permissions.deny[] | select(startswith("Bash(")) | .[5:-1]' "$SETTINGS")
  record "$want" "$got" "settings deny: $command"
}
for command in 'git clean -fdx' 'git clean -xdf' 'git clean -fX' 'git clean -x -f' \
  'git clean -f -d -x' 'git clean --force -x' 'git clean -ffdx' 'git clean -nX'; do
  expect_denied 1 "$command"
done
for command in 'git clean -fd' 'git clean -n' 'git clean -fd src/' 'git status'; do
  expect_denied 0 "$command"
done
# git stash -a / --all moves ignored files (.env) out of the tree; -u / --include-untracked moves
# untracked ones (OTA-89). Substring rules: --all contains -a, --include-untracked contains -u.
for command in 'git stash -a' 'git stash --all' 'git stash push -a' 'git stash push --all -m wip' \
  'git stash -u' 'git stash --include-untracked' 'git stash push -u -- src' 'git stash save -u wip' \
  'git stash -au' 'git stash -ua'; do
  expect_denied 1 "$command"
done
for command in 'git stash' 'git stash push -m wip' 'git stash list' 'git stash pop' \
  'git stash show -p stash@{0}' 'git stash apply'; do
  expect_denied 0 "$command"
done

echo "hooks: $((count - failures))/$count passed"
((failures == 0))
