# AGENTS.md — Instructions for AI Coding Assistants

This file is the canonical guide for any AI coding assistant (Claude, Cursor, Copilot, Codex, etc.) working on the Mimir codebase. Read it before making changes. Re-read it when starting a new session.

**This file is dev-time only.** It is not loaded by the extension at runtime. It does not appear in any production bundle.

---

## 0. Source of Truth

Three documents define what Mimir is and how it's built:

| Document | Purpose | When to consult |
|---|---|---|
| `PRD.md` | Product scope, requirements, user-facing decisions | Before adding/removing features or behaviors users notice |
| `TECHNICAL_DESIGN.md` | Architecture, interfaces, file layout, persistence | Before adding files, dependencies, or subsystems |
| `AGENTS.md` (this file) | How agents should write code in this repo | Every session |

**If the PRD or technical design contradicts this file, they win.** If you find a contradiction, surface it — do not silently follow one and ignore the other.

**Never invent architecture.** If a question isn't answered by these three docs, ask the human before guessing. Examples of questions worth asking: "should this go in a new module or extend an existing one?", "should this state be in Zustand or React Query?", "is this dependency acceptable to add?".

---

## 1. Non-Negotiable Constraints

These are hard rules. Violating them breaks the product.

### 1.1 Manifest V3

- **No remote code loading.** No `eval`, no `Function()`, no `<script src="https://...">`, no dynamic `import()` of remote URLs. MV3 CSP forbids it and so do we.
- **No persistent background pages.** Background logic lives in the MV3 service worker (`src/background/`). Service workers terminate after ~30s idle — assume yours will.
- **Long-running outbound calls must use the keepalive pattern** described in `TECHNICAL_DESIGN.md` §3. Do not invent alternative patterns.
- **No `<all_urls>` host permissions.** Use `activeTab` plus runtime `permissions.request()` for user-configured AI/CTI hosts.
- **No browser storage APIs other than `chrome.storage.local`.** No `localStorage`, no `sessionStorage`, no IndexedDB, no `chrome.storage.sync`.

### 1.2 Privacy & User Trust

- **Zero telemetry.** No analytics SDKs, no error reporters that phone home, no anonymous counters, no "just an install ping." Not now, not ever.
- **No automatic redaction.** Redaction is its own opt-in module. Other modules — especially Log Analysis — send user input as-is. Do not add "helpful" pre-filtering to AI calls.
- **No safety prompts the user did not ask for.** No "are you sure you want to send this to OpenAI?" dialogs. The user is a professional. The PRD design principle is "the user is responsible" — code accordingly.
- **API keys are stored in plaintext** in `chrome.storage.local`. This is a documented decision (PRD §6, Technical Design §9). Do not propose encryption layers without explicit go-ahead.

### 1.3 Browser Targets

- **Chromium and Firefox**, both on MV3. Both are first-class.
- **Laptop/desktop only.** No mobile considerations.
- API differences between Chromium and Firefox go through `src/browser-compat/`. Modules and shared code do not call `chrome.*` directly when a compat shim exists.

---

## 2. Architectural Conventions

### 2.1 Module System

Every user-visible tool is a `MimirModule` (interface in `src/registry/types.ts`, full definition in `TECHNICAL_DESIGN.md` §4.1).

- **Adding a tool means adding a module folder under `src/modules/`** with a default export matching `MimirModule`. The webpack-time loader (`src/registry/loader.ts`) discovers it. **Never hardcode a module into routing or sidebar logic.**
- **Module categories are a closed set:** `encoding | utilities | cti | analysis | payloads`. Do not invent new categories without updating the technical design.
- **Sidebar order is computed from category + label.** No `order` field. Do not add one.
- **Right-click integration is opt-in.** A module that wants a context-menu entry declares `contextMenu` in its export. Modules that don't need one omit the field.

### 2.2 Where Code Lives

| Concern | Location |
|---|---|
| MV3 service worker (background) | `src/background/` |
| Module UIs and module-specific logic | `src/modules/<id>/` |
| Shared React components | `src/components/` |
| Redaction detectors and pipeline | `src/redaction/` |
| Module registry and types | `src/registry/` |
| Storage facade | `src/storage/` |
| Browser compat shim | `src/browser-compat/` |
| Popup, standalone window entry points | `src/surfaces/` |

If a piece of code doesn't have an obvious home in this layout, **stop and ask** before creating a new top-level directory.

### 2.3 Outbound Network Calls

- **All outbound HTTP goes through the service worker.** UI code does not call `fetch` against external hosts. This is a hard rule — it keeps rate-limiting, error handling, and keepalive in one place.
- UI ↔ service worker uses `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`, wrapped via React Query in the UI.

### 2.4 State Management

- **Zustand** for cross-module state (active module, settings, current redaction session).
- **React Query** for service-worker-mediated async (CTI lookups, AI calls).
- **Local component state** (`useState`/`useReducer`) for everything that doesn't need to be shared.
- **Do not introduce Redux, MobX, Recoil, Jotai, or another global store.** If you think you need one, you don't.

### 2.5 Persistence

`StorageManager` in `src/storage/` is the only thing that touches `chrome.storage.local` directly. Modules use the namespaced helpers it exposes. Storage namespaces are listed in `TECHNICAL_DESIGN.md` §9 — adding a new top-level namespace means updating that document.

---

## 3. TypeScript & React Conventions

### 3.1 TypeScript

- **`strict: true`** in `tsconfig.json`. No exceptions.
- **No `any`.** If you genuinely need an escape hatch, use `unknown` and narrow. `any` is a code smell and a review-blocker.
- **Prefer `interface` over `type`** for object shapes; use `type` for unions, intersections, and aliases.
- **Avoid `enum`.** Use union string literal types or `as const` objects instead. Enums in TS have well-known footguns and worse tree-shaking.
- **No non-null assertions (`!`)** unless there's a comment explaining why the value cannot be null in that branch. If you need them often, your types are wrong.

### 3.2 React

- **Functional components only.** No class components.
- **Hooks follow the standard rules** — top-level only, no conditional calls, dependency arrays correct.
- **Co-locate small subcomponents** with their parent until they're reused. Premature extraction to `src/components/` is worse than duplication.
- **`TextTransformPanel` is the shared shell** for input-transform-output modules (Encoding, Defang, etc.). See `TECHNICAL_DESIGN.md` §10.1. Use it for new modules of that shape; don't reinvent.
- **No CSS-in-JS libraries** (Emotion, styled-components). Plain CSS modules or Tailwind only — match what's already in the repo.
- **No portals, no `dangerouslySetInnerHTML`** outside of `MarkdownView` and `MermaidView`, which are already audited for it.

### 3.3 Markdown & Mermaid Rendering

- Markdown goes through `<MarkdownView>` in `src/components/`. It's configured with `rehype-sanitize`. **Do not bypass it** to render LLM-returned content.
- Mermaid goes through `<MermaidView>` with the documented try/catch around the renderer. Mermaid syntax errors must surface inline, not crash the tree.

---

## 4. Dependencies

### 4.1 Standing Allowlist

These are already in the project and may be used freely:

- `react`, `react-dom`, `typescript`, `webpack` (toolchain)
- `react-markdown`, `rehype-sanitize` (markdown rendering)
- `mermaid` (diagrams)
- `zustand` (state), `@tanstack/react-query` (async)
- `fast-check` (property-based testing — tests only)
- Browser-built-in: **Web Crypto API** for hashing/encoding utilities

### 4.2 Adding a Dependency

Before adding **any** new dependency, ask the human. When proposing one, include:

- Bundle-size impact (gzipped, after tree-shaking).
- License (MIT/Apache-2.0/BSD = fine; GPL/AGPL = blocking).
- Last release date and maintenance signals (open issues, recent commits).
- Whether the functionality could reasonably be implemented in <100 lines of in-repo code instead.

**Do not add `crypto-js`.** It was in v1.2 of the PRD and is explicitly replaced by Web Crypto. **Do not add `lodash`, `moment`, `axios`** — modern JS/TS makes them unnecessary, and bundle size matters here.

---

## 5. Workflow Expectations

### 5.1 Before Starting Work

1. **Read or re-read this file.**
2. **Skim `PRD.md` and `TECHNICAL_DESIGN.md`** for anything related to the task.
3. If the task touches a subsystem (CTI, AI, redaction, modules), read that section in the tech design in full.
4. State your understanding back to the human in 2-4 sentences before writing code on non-trivial tasks. Better to confirm direction than rebuild.

### 5.2 While Working

- **Make the smallest change that solves the problem.** Drive-by refactors during a feature change make review hard and history harder.
- **One concern per commit/PR.** A "fix bug + reformat 14 files + add new module" change will be sent back.
- **Update tests in the same change.** Detector regex changes update the redaction corpus. New modules add at least one unit test.
- **Update the docs in the same change.** If you change the `MimirModule` interface, the technical design changes. If you change a user-visible behavior, the PRD changes. Doc drift is a bug.

### 5.3 What to Run Before Declaring Done

```
pnpm typecheck
pnpm test
pnpm lint
pnpm build:chromium
pnpm build:firefox
```

All five must pass. If you don't have an environment to run them in, say so explicitly — don't claim success.

### 5.4 What Not to Do Without Asking

- Add a top-level dependency.
- Create a new top-level directory under `src/`.
- Introduce a new state-management library.
- Add a `chrome.*` permission to the manifest.
- Add a new outbound host that isn't user-configured.
- Add an "ignore-this-rule" comment to `eslintrc` or `tsconfig`.
- Touch `manifest.chromium.json` or `manifest.firefox.json`.
- Modify the `MimirModule` interface.
- Change persisted storage shapes (this is a migration concern even when "just renaming a key").

---

## 6. Anti-Patterns Specific to This Project

These come up often enough to call out:

- **"Helpful" auto-redaction in Log Analysis.** No. The user invokes redaction explicitly or sends raw. See PRD §3 and §7.4.
- **Adding a "developer mode" that bypasses MV3 constraints.** No. There is one runtime; it's MV3.
- **Wrapping `chrome.storage.local` differently in each module.** No. Use `StorageManager`.
- **Adding a custom prompt format like `<INSTRUCTION>...</INSTRUCTION>`.** No. Plain text prompts in `prompts.*`, two-layer resolution (user override → built-in default). See `TECHNICAL_DESIGN.md` §7.
- **Pulling `AGENTS.md` content into the runtime bundle.** No. This file is dev-time only.
- **Inventing a `permissions` field on `MimirModule`.** No. There is no module permissions system. The user is the trust boundary; if they install a hostile module in their fork, that's on them.
- **Adding rate-limiting to outbound CTI calls.** No. The user sees the provider's 429 and deals with it. See `TECHNICAL_DESIGN.md` §6.
- **Encrypting stored API keys.** No. Documented decision.
- **Creating a third UI surface (popup, window, **new tab**).** No. Two surfaces, full parity. See PRD §9.
- **Adding a new AI provider by editing `ai-client.ts` directly.** No. New providers go in `src/background/ai-adapters/<provider>.ts`, implement `AiAdapter` from `types.ts`, and register in `index.ts`. `ai-client.ts` is a dispatcher; it stays free of provider-specific logic.

---

## 7. Communication Style with the Human

- **State assumptions explicitly.** "I'm assuming X — confirm before I continue" is better than building on a wrong premise.
- **Surface tradeoffs, don't hide them.** If the cleanest fix requires changing `TECHNICAL_DESIGN.md`, say so up front.
- **Don't pad responses with unrequested suggestions.** A short list of genuinely useful follow-ups is welcome; a wall of "and you could also..." is noise.
- **Push back when you should.** If a request contradicts the PRD or this file, say so. Don't quietly comply with a request to "just add a quick analytics ping" or "encrypt the keys real fast."

---

## 8. When This File Is Wrong

This file will go stale. When you find a rule that contradicts current code, a missing convention that's clearly established in the codebase, or guidance that no longer matches reality:

1. Mention it in the same change where you noticed it.
2. Propose an edit to this file.
3. Don't silently work around the stale rule.
