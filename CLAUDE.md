# CLAUDE.md — Claude-specific notes for working on Mimir

**Read `AGENTS.md` first.** It contains the canonical rules for any AI coding assistant working on this repo. This file adds only Claude-specific guidance — it does not duplicate or override what's in `AGENTS.md`.

If `AGENTS.md` and this file ever conflict, `AGENTS.md` wins.

---

## 1. Reading Order at Session Start

1. `AGENTS.md` — full read.
2. `PRD.md` and `TECHNICAL_DESIGN.md` — skim, then deep-read the sections relevant to the task.
3. This file (`CLAUDE.md`).
4. Any task-specific files the user mentions.

If you're resuming a long session and have already read `AGENTS.md` once, re-skim it — context windows shift and you may have lost it.

---

## 2. Tool Usage in Claude Code

When working on this repo via Claude Code (terminal, VS Code, JetBrains):

- **Use `view` before `str_replace`.** Always view the file (or the relevant range) immediately before editing. Stale views cause stale edits.
- **Prefer `str_replace` over rewriting whole files.** Smaller diffs are easier for the human to review.
- **Use `bash_tool` for `pnpm` commands**, never paste their output into chat as if you ran them. If you can't run them, say so.
- **Don't `cat` binaries.** Manifest files and JSON configs are fine; bundled output is not.
- **Don't grep generated `dist/` directories.** Search source under `src/` and `tests/`.

---

## 3. Asking vs. Acting

Claude defaults to acting; on this repo, default to asking when:

- The task touches `manifest.chromium.json` or `manifest.firefox.json`.
- The task adds or removes a dependency.
- The task changes the `MimirModule` interface.
- The task changes a persisted storage shape (anything under `cti.*`, `analysis.*`, `prompts.*`, `settings.*`, `apikeys.*`).
- The task could plausibly be solved by either editing an existing module or creating a new one — pick is the human's call.
- The task implies a new outbound network host.

For everything else — bug fixes, internal refactors within a module, test additions, doc updates — proceed and report back.

---

## 4. Response Style for This Repo

- **Be terse in code review and code generation.** No "Great question!" preambles. The human is a security professional doing focused work.
- **Show diffs, not whole files**, when explaining changes — unless the file is being created.
- **Flag risk explicitly.** If a change has subtle implications (storage migration, MV3 lifecycle, cross-browser behavior), call them out at the top of the response, not buried at the end.
- **Don't pad with suggestions.** One or two genuinely useful follow-ups is welcome at the end of a response. A bulleted "you could also consider..." list is noise.
- **No emojis in code, comments, commit messages, or PR descriptions.** In chat, only if the human uses them first.

---

## 5. Things Claude Specifically Tends to Get Wrong Here

Pattern-matching from general training, Claude has reflexes that don't fit this project. Watch for:

- **Adding telemetry "just for debugging."** No. Zero telemetry, including dev-mode counters.
- **Suggesting `localStorage` or `sessionStorage`.** They're not allowed in MV3 extension contexts the way they are in regular pages, and we use `chrome.storage.local` exclusively. See `AGENTS.md` §1.1.
- **Auto-redacting before AI calls "for safety."** No. Redaction is opt-in and lives in its own module. Log Analysis sends raw input.
- **Suggesting Redux when state gets complex.** Use Zustand. We made the call deliberately.
- **Adding `lodash`/`axios`/`moment`.** Not needed; not allowed without explicit go-ahead.
- **Wrapping `chrome.*` calls "for testability" inside random files.** That's what `src/storage/` and `src/browser-compat/` are for.
- **Creating a "utils" or "helpers" folder.** If a function is shared, it lives next to the abstraction it belongs to. Generic dumping grounds rot.
- **Pre-emptively adding error boundaries everywhere.** Add them where they're justified (Mermaid renderer, AI response display) — not as a default sprinkle.
- **Generating "comprehensive" JSDoc for every function.** Comment the why, not the what. TypeScript types already document the what.

---

## 6. When Generating PRs

If asked to draft a PR description:

- **Title:** imperative mood, ≤72 chars (`Add Defang module`, not `Added defang module support to the extension`).
- **Body sections:** *What*, *Why*, *How verified*. Skip empty ones.
- **Link the relevant doc section** when the change is doc-driven (`Implements PRD §7.3 F-CTI-7`).
- **Note breaking changes prominently** — especially storage shape changes.
- **Don't include AI co-author/generated-by attribution lines.** The human will add what they want.

---

## 7. When You're Uncertain

The right move is almost always to ask. Specifically:

- "Should this be a new module or extension of an existing one?" — Ask.
- "Should this storage key live under `settings` or its own namespace?" — Ask.
- "Should this be configurable in settings or hardcoded?" — Ask.
- "Should this run on every CTI lookup or be opt-in?" — Ask.

Asking costs one round-trip. Guessing wrong costs a rewrite.
