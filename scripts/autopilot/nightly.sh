#!/usr/bin/env bash
# Morning digest (launchd, daily). Deterministic checks first, then one capped Haiku call to summarise.
source "$(dirname "$0")/common.sh"
today=$(date +%F)
out="$DIGEST_DIR/$today.md"

checks=$(check_main)
prs=$(pr_ci_lines)
commits=$(git -C "$REPO" log origin/main --since="36 hours ago" --oneline 2>/dev/null | head -15)
progress=$(cat "$REPO/docs/PROGRESS.md" 2>/dev/null)
roadmap=$(sed -n '1,30p' "$REPO/docs/ROADMAP.md" 2>/dev/null)

prompt="You write a morning digest for Farouk, solo developer of OtakuLeague. Today is $today.
Write AT MOST 10 lines of Markdown, no preamble:
1. '## $today' heading.
2. What broke (failed checks on main, red PR CI) or 'Nothing broke'.
3. What landed since yesterday (from commits), one line.
4. PRs waiting on Farouk.
5. Today's suggested task (from PROGRESS next tasks), one line.
6. Roadmap: on track / at risk, with the reason in a few words (compare today with the milestone dates).
Use only the facts below. Do not use tools.

CHECKS ON MAIN: $checks
OPEN PRS: ${prs:-none}
COMMITS (36h): ${commits:-none}
PROGRESS.md:
$progress
ROADMAP (top):
$roadmap"

digest=$(ask_claude haiku 2 0.30 "$prompt")
if [[ -z "$digest" ]]; then
  digest="## $today (fallback, Claude unavailable)
- Checks: $checks
- PRs: ${prs:-none}"
fi
printf '%s\n' "$digest" >"$out"
first=$(grep -m1 -vE '^#|^$' "$out" | cut -c1-120)
notify "Digest ready: ${first:-see $out}"
echo "wrote $out"
