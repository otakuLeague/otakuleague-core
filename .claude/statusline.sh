#!/usr/bin/env bash
# Status line: model · context used · 5h plan usage · git branch. Hints /compact or /clear when context fills up.
input=$(cat)
model=$(jq -r '.model.display_name // "?"' <<<"$input")
ctx=$(jq -r '.context_window.used_percentage // 0 | floor' <<<"$input")
five=$(jq -r '.rate_limits.five_hour.used_percentage // empty | floor' <<<"$input" 2>/dev/null)
dir=$(jq -r '.workspace.current_dir // .cwd // "."' <<<"$input")
branch=$(git -C "$dir" branch --show-current 2>/dev/null)

hint=""
if ((ctx >= 70)); then hint=" → /clear or /compact"; elif ((ctx >= 50)); then hint=" (consider /compact)"; fi
line="[$model] ctx ${ctx}%${hint}"
[[ -n "$five" ]] && line+=" · 5h ${five}%"
[[ -n "$branch" ]] && line+=" · ⎇ $branch"
printf '%s' "$line"
