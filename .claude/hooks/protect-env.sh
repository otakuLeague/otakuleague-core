#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|MultiEdit|NotebookEdit|Bash): never write a real env file
# (.env, .env.local, ...). .env.example stays editable. Exit 2 blocks the call.
# In Bash, a line that names a real env file is blocked if it redirects into it, uses a
# command that can write files (sed, awk, cp, node, ...), or assigns a variable, so some
# reads (sed -n, awk) are blocked too; cat and grep are allowed.
# Fails closed: if this script cannot check the call, it blocks. Tests: hooks.test.sh.
set -uo pipefail

block() {
  echo "Blocked: $1 Never write real env files: edit .env.example and ask the human to update .env." >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || block "jq is not installed, so protect-env cannot check this call."
input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input") || block "unreadable hook input."

is_real_env() {
  [[ "$1" == ".env" || ("$1" == .env.* && "$1" != ".env.example") ]]
}

# True if the text names a real env file, e.g. `.env` in `>> ../../.env` (not `config.env`, not `.envrc`).
# Bash regexes only, no grep/sed per line: a long heredoc must not take seconds.
ENV_NAME='(^|[^A-Za-z0-9_.-])(\.env(\.[A-Za-z0-9_-]+)*)'
names_real_env() {
  local text=$1
  while [[ "$text" =~ $ENV_NAME ]]; do
    is_real_env "${BASH_REMATCH[2]}" && return 0
    text=${text#*"${BASH_REMATCH[0]}"}
  done
  return 1
}

# A word that can write or delete a file it is given, as a whole word.
WRITERS='(^|[^A-Za-z0-9_-])(tee|sponge|sed|perl|ruby|python[0-9.]*|node|tsx|ts-node|bun|deno|awk|gawk|cp|mv|ln|install|rsync|dd|truncate|rm|touch|chmod|chown|patch|ed|ex|vi|vim|nano|xargs|find|bash|sh|zsh|eval)([^A-Za-z0-9_-]|$)'
# A redirection whose target ends in an env file name (quotes removed first, so "$ROOT"/.env and
# paths with spaces match). .env.example is removed before this check.
REDIRECT_TO_ENV='>>?([^<>]*[/[:space:]])?\.env(\.[A-Za-z0-9_-]+)*([[:space:])]|$)'

case "$tool" in
  Bash)
    command=$(jq -r '.tool_input.command // empty' <<<"$input") || block "unreadable hook input."
    names_real_env "$command" || exit 0
    # A heredoc body is input to the command on its first line (python3 - <<EOF), so judge it whole.
    if [[ "$command" == *"<<"* && "$command" =~ $WRITERS ]]; then
      block "this heredoc command can write to an env file."
    fi
    # One simple command per line. Quotes are not parsed: a quoted ; or | only splits more finely.
    # tr, not ${var//[;|&]/...}: bash 3.2 (macOS) takes seconds on that substitution for long text.
    segments=$(tr ';|&' '\n\n\n' <<<"${command//'>|'/'>'}")
    while IFS= read -r segment; do
      names_real_env "$segment" || continue
      unquoted=${segment//[\"\']/}
      unquoted=${unquoted//.env.example/}
      if [[ "$unquoted" =~ $REDIRECT_TO_ENV ]] ||
        [[ "$segment" =~ $WRITERS ]] ||
        [[ "$segment" =~ ^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*= ]]; then
        block "this command can write to an env file."
      fi
    done <<<"$segments"
    ;;
  *)
    path=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<<"$input") ||
      block "unreadable hook input."
    if is_real_env "$(basename -- "$path")"; then
      block "this is a real env file."
    fi
    ;;
esac
exit 0
