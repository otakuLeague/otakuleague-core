#!/usr/bin/env bash
# Shared helpers for the launchd digests. Sourced, not run.
set -uo pipefail
REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
DIGEST_DIR="${OTAKU_DIGEST_DIR:-$HOME/OtakuLeague/digests}"
STATE_DIR="$HOME/.otakuleague"
GH_REPO="otakuLeague/otakuleague-core"
mkdir -p "$DIGEST_DIR" "$STATE_DIR"
[[ -f "$STATE_DIR/paused" ]] && { echo "paused ($STATE_DIR/paused exists)"; exit 0; }

notify() { command -v osascript >/dev/null && osascript -e "display notification \"$1\" with title \"OtakuLeague\"" >/dev/null 2>&1 || true; }

open_prs() {
  gh api "repos/$GH_REPO/pulls?state=open&per_page=20" \
    --jq '.[] | "#\(.number) \(.title) [\(.head.ref)] sha=\(.head.sha)"' 2>/dev/null || echo "(gh unavailable)"
}

ci_status() { # ci_status <sha>
  gh api "repos/$GH_REPO/commits/$1/check-runs" \
    --jq '[.check_runs[] | .conclusion // .status] | if length == 0 then "no checks" elif all(. == "success" or . == "skipped") then "green" elif any(. == "failure" or . == "cancelled" or . == "timed_out") then "RED" else "running" end' 2>/dev/null || echo "unknown"
}

pr_ci_lines() {
  while IFS= read -r line; do
    sha=${line##*sha=}
    echo "${line% sha=*} CI=$(ci_status "$sha")"
  done < <(open_prs | grep 'sha=' || true)
}

# Runs the checks on a clean worktree of origin/main so your working branch is never touched.
check_main() {
  local wt="$STATE_DIR/main-worktree" log="$STATE_DIR/last-check.log"
  git -C "$REPO" fetch --quiet origin main || { echo "fetch failed"; return; }
  if [[ -d "$wt" ]]; then git -C "$wt" checkout --quiet --detach origin/main; else git -C "$REPO" worktree add --quiet --detach "$wt" origin/main; fi
  : >"$log"
  local step result=""
  for step in "install --frozen-lockfile" lint typecheck test; do
    if (cd "$wt" && pnpm $step >>"$log" 2>&1); then result+="$step ok; "; else result+="$step FAILED; "; [[ $step == install* ]] && break; fi
  done
  echo "main@$(git -C "$wt" rev-parse --short HEAD): $result(log: $log)"
}

ask_claude() { # ask_claude <model> <max_turns> <budget_usd> <prompt>
  claude -p "$4" --model "$1" --max-turns "$2" --max-budget-usd "$3" \
    --allowedTools "Read" --permission-mode dontAsk --output-format text 2>>"$STATE_DIR/claude.err"
}
