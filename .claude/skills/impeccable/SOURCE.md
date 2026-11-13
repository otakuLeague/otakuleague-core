# Vendored skill: impeccable

- Upstream repo: https://github.com/pbakaus/impeccable, commit b4bff1626c344067788c2679f048a20057c7cc5a
- Base: the official rendered Claude Code build, `.claude/skills/impeccable/` (SKILL.md v4.8.2, reference/). Not the `skill/SKILL.src.md` template.
- License: Apache-2.0. LICENSE and NOTICE.md copied verbatim from the repo root.
- Vendored date: 2026-11-13
- Vendored in OTA-188

## Left out

- `scripts/` (12 files): launcher and binary selection/download, live browser JS (4 files), screenshot library, font and command data, checksums. Reason: runs or fetches code; the setup, detector and live steps depend on it.
- `reference/hooks.md`, `doctor.md`, `live.md`, `live-setup.md`, `generate.md`: hook configuration, artifact repair, live browser mode. Reason: the design hook stays off (ADR 0011); the rest needs the engine.
- `reference/component-review.md`, `region-map.md`, `visualize.md`: comp and image-generation build pipeline. Reason: drives the CLI and image tools.
- `reference/degraded/` (4 files): fallback copies of the agent prompts. Reason: they exist only for the documenter, finish-reviewer, asset-producer and manual-edit agents, none of which is vendored.
- agents (documenter, finish-reviewer, manual-edit-applier, asset-producer): not vendored. Claude Code loads agents only from `.claude/agents/`, and these would be inert text here.
- `skill/hermes-plugin/` (another agent host's plugin); `skill/SKILL.src.md` (template, superseded by the rendered SKILL.md).

## Changes from upstream

- SKILL.md frontmatter: `argument-hint` set to `[command] [target]`; `disable-model-invocation: true` added. The short Claude Code description is upstream's.
- SKILL.md: "In this repo" block added before the first paragraph (use limits, precedence of CLAUDE.md, ADR 0011/0012, the design skill and `apps/web/app/styles/tokens.css`; no running, installing or fetching `impeccable`; no writes to `.impeccable/`; captures only via `node scripts/design/shots.mjs`; no overwrite of PRODUCT.md or DESIGN.md without asking).
- SKILL.md Setup step 1 (the launcher): replaced with "not available in this repo; use the Launcher unavailable fallback".
- SKILL.md Commands table: `live` and `generate` rows removed.
- SKILL.md: Pin/Unpin, Hooks, Doctor and "Never repair drift" paragraphs replaced by one note: not available, design hook stays off (ADR 0011).
- reference/*: every `.claude/skills/impeccable/scripts/impeccable <verb>` call, and every backticked engine verb (`detect`, `critique-storage`, `concept-seed`, `build-phase`, `comp-spec`, `surface-brief`, `serve-question`, `live-server`, `pin`, `embed-prompt`, `comp-diff` and similar), now ends "(not available in this repo; skip this step and say so)". Line-start commands are prefixed "Not available in this repo, skip:". `impeccable context` becomes "the context check (not available in this repo)". `npx impeccable` is rewritten the same way.
- reference/critique.md: "In this repo" header (design review only; a skipped engine step is the complete run; no DEGRADED banner; no retry). Hard-invariant bullets on sub-agents, the DEGRADED banner and the skipped detector reworded. "is mandatory" and "Run the bundled detector and browser visualization evidence" reworded to not available. Snapshot writes to `.impeccable/critique/` removed (the report stays in the chat); the read of `.impeccable/critique/ignore.md` marked not available.
- reference/audit.md: "In this repo" header; "Run the bundled detector and verify each finding in context" reworded to not available, verify by reading the code. Snapshot writes not made.
- reference/polish.md: "quality guidance supplied by impeccable context and hooks" now reads "supplied by the impeccable context check (not available in this repo; skip it and say so)". No hooks reference. critique-storage steps marked not available.
- reference/new-work.md: "In this repo" section added before section 1 (engine and comp pipeline, `.impeccable/` writes, and the documenter and reviewer agents are not available; new pages go through the `design` skill; no overwrite of DESIGN.md or PRODUCT.md without asking). Removed: the region-map sentence; the "Where the harness sandboxes its shell ... least-sandboxed command path" sentence; the "download them into the workspace" parenthetical; the whole "Comp-led" subsection (build-phase, comp-spec, plates, telemetry choice-ping paragraph); the "Act on the disposition word", "A rebuild and a fix round", "Then spawn the shipped finish reviewer" and "record the final review disposition" paragraphs. Reworded: "No substitute, no skip:" now says the unavailable step is said so, not substituted silently; the documenter spawn now reads "not available in this repo: follow document.md yourself, and only after the user's answer"; "[visualize.md]" links are plain text ("the comp round (not vendored)"); the finish reviewer audit clauses are marked not available. The comp-round trigger paragraph is marked not available.
- reference/init.md: the garbled image-generation sentence now says the API fallback is not available in this repo. The live-mode setup step and the "/impeccable live" hand-off line are removed. The buildPath paragraph is replaced: it now reports the answer in the reply instead of writing `.impeccable/config.json`.
- reference/typeset.md, layout.md, colorize.md: removed "Follow [`live.md`](live.md)'s parameter contract." (`live.md` is not vendored).
- reference/routing.md: live/generate menu line replaced with "not available in this repo; do not offer them". Impeccable.style link now plain text with "do not fetch; the vendored text is the spec".
- reference/document.md: the DESIGN.md spec URL (raw.githubusercontent.com) is plain text with "do not fetch; the vendored text is the spec".
- reference/mode-persuade.md: "visualize.md" reference is plain text ("the comp round (not vendored)"). mode-operate.md and mode-read.md unchanged apart from the CLI rewrite above; no links to removed files.
- AskUserQuestion sentence (kept, per coordinator): "Ask with the AskUserQuestion tool and wait for the answer before continuing." now ends "(in an unattended autopilot run, decide and record the decision instead)". Exception: gates that overwrite DESIGN.md or PRODUCT.md (document.md, new-work.md) and overdrive.md now end "(in an unattended autopilot run, stop and record the question instead of deciding)".

## Behaviour change for Farouk to approve

The unattended-run text makes autopilot runs decide and record the decision for ordinary questions. The overwrite gates stop instead. Confirm this is wanted before merge.

## Verification

- No `<codex`, `<claude>`, `<!-- rule:` markers and no `{{` placeholders in the folder.
- No Markdown link or "read X.md" pointer to a file outside the folder. No `scripts/`, `hooks`, `doctor`, `live`, `generate`, `visualize` or `degraded/` pointers remain except in "not available" text.

- Follow-up (OTA-188 final cleanup), reference/new-work.md: removed the `NEXT read` artifact sentence; the contract-violation clause after the colon cut; every `.impeccable/` path (decision folder, config) replaced by 'not available in this repo'; the screenshot round and the verification step name `node scripts/design/shots.mjs` as the only capture tool; the 'build-phase gate' phrase reworded.
- Follow-up, reference/critique.md: header option `Method: design review only (detector not available in this repo)` added, with the dual-agent, degraded and native options marked n/a; 'until both are complete' dropped; the Persist the Snapshot section replaced by one line (the report stays in chat, nothing is written); the Assessment B sub-agent gate noted as not applicable.
- Follow-up, fenced commands: the 'Not available in this repo, skip:' lines moved out of bash fences in critique.md, polish.md (2), layout.md and typeset.md; the command is kept in backticks in plain text.
