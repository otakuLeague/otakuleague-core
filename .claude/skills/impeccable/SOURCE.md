# Vendored skill: impeccable

- Upstream repo: https://github.com/pbakaus/impeccable, path skill/ (SKILL.src.md, reference/, agents/), commit b4bff1626c344067788c2679f048a20057c7cc5a
- License: Apache-2.0. LICENSE and NOTICE.md in this folder, copied verbatim from the repo root.
- Vendored date: 2026-11-13
- Vendored in OTA-188

## Changes from upstream

- SKILL.md: upstream has only the template `skill/SKILL.src.md` (no rendered SKILL.md), so it was copied as SKILL.md and rendered for Claude Code by hand: `{{model}}`, `{{config_file}}`, `{{command_prefix}}`, `{{ask_instruction}}`, `{{available_commands}}` and `{{reference_path}}` replaced; `claude-code-description`, `allowed-tools` (Bash patterns for the CLI) and the `argument-hint` placeholder removed or made generic in the frontmatter; Setup step 1 (the `impeccable context` launcher) replaced with a note that it is not available here, so the "Launcher unavailable" fallback applies; the `live` and `generate` rows removed from the Commands table; the Pin/Unpin, Hooks, Doctor and "Never repair drift" paragraphs replaced by one note that these are not available and the design hook stays off (ADR 0011).
- reference/*.md (all kept files): every `{{scripts_path}}/impeccable` call and every backticked `impeccable <engine verb>` call (detect, critique-storage, concept-seed, build-phase, comp-spec, surface-brief, serve-question, live-server, pin and similar) now ends with "(not available in this repo; skip this step and say so)". The same placeholder rendering as SKILL.md applies to every file.
- reference/typeset.md, layout.md, colorize.md: removed the sentence "Follow live.md's parameter contract." (live.md is not vendored).
- reference/init.md: removed the "configure live mode" step and the "/impeccable live when configured" hand-off line (live is not vendored).
- reference/routing.md: the `devServer.running` / live-and-generate menu line replaced by "Live mode and generate are not available in this repo; do not offer them."
- reference/critique.md and polish.md: the critique-storage and live-server steps are marked not available (see above); polish.md still says "supplied by impeccable context and hooks", which the agent must treat as unavailable.
- Left out, scripts/ and hermes-plugin/: `skill/scripts/` (the launcher, a binary download path, a live browser driver and its in-page JS, the screenshot library, font and command data). Reason: it runs or fetches code, and it is the engine that the setup, live and detect steps depend on. `skill/hermes-plugin/` (a plugin for another agent host).
- Left out, reference/: hooks.md (configures and runs the design hook, which stays off per ADR 0011), doctor.md (repairs project artifacts via the CLI), live.md and live-setup.md (live browser mode, which needs the in-page JS and a dev server), generate.md (live browser variants), component-review.md, region-map.md and visualize.md (comp and image-generation build pipeline that drives the CLI and image tools).
- Left out, agents/: impeccable-asset-producer.md (produces image plates through the CLI), impeccable-finish-reviewer.md and impeccable-manual-edit-applier.md (their work runs through the CLI and the live browser).
- Open decision (not patched): reference/new-work.md still describes the comp-led build pipeline (concept-seed, build-phase, comp-spec, image generation, the finish reviewer) and links to the removed region-map.md and visualize.md. Those steps are marked unavailable, but the file is otherwise unchanged. Farouk to decide whether to drop the comp pipeline or keep the file as guidance.

## Follow-up edits (coordinator decisions, OTA-188)

- reference/new-work.md: added an "In this repo" section at the top. The comp-led pipeline (concept-seed, build-phase, comp-spec, image generation and its API fallback, the finish reviewer agent) is not available; new pages and surfaces go through the project's `design` skill (.claude/skills/design/SKILL.md). The guidance in the file applies inside that workflow. Removed the links to region-map.md and visualize.md (now plain "not vendored, not available" text) and the link to the finish reviewer agent (now marked not available).
- reference/init.md: the image-generation API fallback is marked not available in this repo.
- reference/polish.md: "quality guidance supplied by impeccable context and hooks" now reads "supplied by the impeccable context check (not available in this repo; skip it and say so)". No hooks reference remains.
- reference/mode-persuade.md, mode-operate.md, mode-read.md: kept unpatched. Grep found no link to a removed file in them.
- Every reference that asks for a user decision (critique, quieter, bolder, distill, init, overdrive, new-work, extract, document): the AskUserQuestion wording is kept and now ends "(in an unattended autopilot run, decide and record the decision instead)".
- Dangling-link grep across .claude/skills/impeccable for every removed filename (hooks, doctor, live, live-setup, generate, component-review, region-map, visualize, the three removed agents, hermes, scripts/): no links left. Remaining mentions are plain text in "not available" notes.
- reference/new-work.md: the remaining links to visualize.md, region-map.md and component-review.md are now plain text ("the comp round (not vendored)" and similar). Zero Markdown links to removed files remain in the folder.
