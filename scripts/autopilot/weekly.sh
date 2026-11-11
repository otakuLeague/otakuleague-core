#!/usr/bin/env bash
# Sunday review (launchd, weekly): progress vs roadmap, next week's plan, proposed cuts.
source "$(dirname "$0")/common.sh"
today=$(date +%F)
out="$DIGEST_DIR/weekly-$today.md"
git -C "$REPO" fetch --quiet origin main || true

merged=$(gh api "repos/$GH_REPO/pulls?state=closed&per_page=30" \
  --jq "[.[] | select(.merged_at != null and .merged_at >= \"$(date -v-7d +%F 2>/dev/null || date -d '7 days ago' +%F)\")] | .[] | \"#\(.number) \(.title)\"" 2>/dev/null)
prs=$(pr_ci_lines)
commits=$(git -C "$REPO" log origin/main --since="7 days ago" --oneline | head -40)
roadmap=$(cat "$REPO/docs/ROADMAP.md")
progress=$(cat "$REPO/docs/PROGRESS.md")

prompt="Weekly review for OtakuLeague. Today is $today (Sunday). Launch 2026-12-28, freeze 2026-12-15, ~10 h/week.
Write at most 25 lines of Markdown, no preamble, sections: '## Week ending $today', 'Done this week', 'Plan vs actual' (which milestone should be done by now, verdict on track / at risk / behind with numbers), 'Next week' (4-5 sessions, ticket keys, in order), 'Proposed cuts' (only if at risk, from the roadmap's cut list; never propose moving the date unless cuts can't close the gap).
Use only the facts below. Do not use tools.

MERGED PRS (7d): ${merged:-none}
OPEN PRS: ${prs:-none}
COMMITS (7d): ${commits:-none}
ROADMAP.md:
$roadmap
PROGRESS.md:
$progress"

review=$(ask_claude sonnet 2 1.00 "$prompt")
[[ -n "$review" ]] || review="## Week ending $today (fallback, Claude unavailable)
Merged: ${merged:-none}"
printf '%s\n' "$review" >"$out"
notify "Weekly review ready"
echo "wrote $out"
