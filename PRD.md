# Product Requirements Document (PRD): Mimir

| Field | Value |
|---|---|
| Product Name | Mimir |
| Repository | `mimir-extension` |
| Product Type | Browser Extension (Chromium & Firefox) |
| Audience | Cybersecurity Professionals — Red Team & Blue Team |
| Distribution | Open-source; primarily build-and-install-it-yourself |
| License | MIT |
| Document Version | 4.1 |
| Status | Approved scope for MVP |
| Companion Doc | `TECHNICAL_DESIGN.md` |

### Changelog
- **4.1** — Payload Library gains three categories — LFI, SSRF, and command injection (v1.1 expansion). PRD F-PAY. Document Version → 4.1.
- **4.0** — JWT gains signature verification (HS/RS/PS/ES/EdDSA), temporal-claim status, and an edit/re-encode/HMAC-re-sign workbench (alg:none + RS→HS attack support). PRD F-TRANSFORM. Document Version → 4.0.
- **3.9** — Log Analysis: when a background-mode (right-click) analysis completes and no Mimir surface is open, the popup auto-opens and routes directly to the completed analysis. Best-effort — `action.openPopup()` may be refused by the browser, in which case the badge and history continue to surface the result and the next manual popup open routes to the analysis. F-LOG-7.
- **3.8** — Adds AI You as a fifth AI provider for internal-team use. User-supplied endpoint URL (no shipped default), dual auth modes (X-API-KEY or Bearer JWT), three hardcoded models. SSE streaming required by the API but buffered internally — the AiClient interface stays non-streaming for callers, so PRD §6 non-goal 8 is unchanged.
- **3.7** — CTI history collapsed to one entry per indicator, with each provider's result nested in a `providers` map. Clicking a history row no longer triggers a refetch — it renders stored data only; staleness is informational. Re-typing the indicator is the only path to fresh data.
- **3.6** — Defang module switches to a two-pane bidirectional UI (Fanged ↔ Defanged); the operation dropdown is removed for Defang only. Other Transform operations remain dropdown-driven.
- **3.5** — Redaction Stage 3 drops the explicit "Apply" step; the output panel now re-derives live from the current accept/reject set and any manual additions. Copy is via the in-corner copy icon.
- **3.4** — CTI cache and history merged into a single store (TTL marks entries stale rather than deleting; LRU at 100 is the only eviction). Log Analysis module gains a local history of the last 10 analyses with a clear action.
- **3.3** — CTI cache and history confirmed as separate stores with combined "Clear CTI data" action; Defang module covers URLs, IPs, and domains; sidebar ordering rule (category then label); MIT license declared in metadata; right-click invocation always opens the popup.
- **3.2** — Closed remaining open questions: payload library v1 set is XSS + SQLi only; risks R1/R2 acknowledged as accepted.
- **3.1** — Right-click integration is per-module opt-in (not universal) and individually toggleable in settings; AI provider default resolved (empty field, placeholder text only); detector-toggle behaviour clarified.
- **3.0** — Repositioned as a tool-not-a-guardian: redaction is user-opt-in, AI provider is fully user-configurable (local or remote), no telemetry/metrics tracking, no enforcement of safety controls. Added Defang URLs module, abuse.ch API mode, OpenAI-compatible support, user-built custom modules. Removed: paternalistic safeguards, store-compliance constraints, metrics, dogfood QA, signing infra.
- **2.0** — Blue-team-primary framing, three-stage gated redaction, success metrics, risks.
- **1.2** — Initial scope.

---

## 1. Context & Problem Statement

Cybersecurity professionals — both red team and blue team — live in their browsers and constantly switch between a half-dozen ad-hoc tools: a base64 decoder, a JWT parser, VirusTotal, AbuseIPDB, a defang utility, a scratchpad, and increasingly an AI for log triage or payload generation. Each context switch costs time and adds the risk of pasting the wrong thing into the wrong tab.

Mimir collapses this surface area into a single browser extension. It is a **tool**, not a platform: it does what the user asks, where the user asks it, with whichever AI provider the user has configured. It does not enforce policy, does not phone home, does not gate workflows behind safety prompts the user did not ask for. The user is a professional and is treated as one.

## 2. Audience

Mimir serves both **red team** and **blue team** practitioners. The toolset is deliberately mixed — encoding/decoding, CTI lookups, payload library, defang utilities, log analysis — because the same person often does both kinds of work in the same week, and even when they don't, the underlying primitives overlap.

There is no primary persona ranking. Modules are surfaced equally; users enable or disable what they need.

## 3. Design Principles

1. **The user is responsible.** Mimir provides capability; the user provides judgment. If a user pastes customer data into a remote AI provider, that is the user's call and their responsibility — Mimir does not block, warn, or override.
2. **Local-first by default, remote by choice.** Storage is local. AI defaults to local endpoints. But if the user wants OpenAI, Anthropic, or any OpenAI-compatible endpoint, they configure it and Mimir uses it.
3. **Simple beats clever.** No signing, no sandboxing, no permission registry, no enforced workflows. Custom modules are added to the source and the user rebuilds.
4. **No telemetry, ever.** Zero phone-home. Not even anonymous counters.
5. **Right-click access where it makes sense.** Modules can optionally expose a context-menu action for selected text. It is not universal — each module decides whether it offers one. Users can enable or disable each context-menu entry in settings to keep their right-click menu uncluttered.

## 4. Top User Journeys

**J1 — Indicator enrichment.** User opens the popup, pastes an IP/domain/hash, sees VirusTotal + AbuseIPDB + abuse.ch results side-by-side, copies a summary into a ticket or note.

**J2 — Log analysis from selection.** User selects a log excerpt on a webpage (SIEM UI, GitHub issue, pastebin, anything), right-clicks, chooses "Analyse log with Mimir." The selection is sent to the user's configured AI provider — local or remote, their choice — and Mimir renders the response as Markdown plus an optional Mermaid diagram. The log is sent **as-is**; if the user wants redaction, they trigger it explicitly first. The analysis is added to a local history pane (last 10 kept) so the user can scroll back to a previous run without re-analyzing.

**J3 — Fast decode/defang.** User highlights a base64 blob or a URL, right-clicks → "Decode" or "Defang URL." Result appears in the popup.

**J4 — CTI history pivot.** User opens the CTI history pane, filters by verdict or source, exports as CSV.

**J5 — Payload lookup.** Red-teamer browses the offline payload library, copies an XSS or SQLi string to clipboard.

**J6 — Custom module.** A user clones the repo, adds a folder under `src/modules/`, implements the `MimirModule` interface, runs `pnpm build`, and loads the unpacked extension. No signing, no review, no marketplace.

## 5. Goals

1. **Cover the core daily-use toolkit** for red and blue practitioners in one extension: encoding, defang, CTI, payloads, log analysis.
2. **Stay out of the user's way.** No enforced flows, no mandatory safety steps, no required choices the user didn't ask to make.
3. **Support the user's choice of AI** — local (Ollama, LocalAI) or remote (OpenAI, Anthropic, any OpenAI-compatible endpoint).
4. **Make custom modules trivial to add** by anyone willing to clone and build.

## 6. Non-Goals

1. **No mobile browser support.** Laptop/desktop browsers only.
2. **No telemetry, analytics, or phone-home.** Zero.
3. **No enforced redaction.** Redaction is a feature the user *can* invoke; it is never automatic before sending data to AI.
4. **No SIEM/SOAR replacement.** Mimir is a productivity tool adjacent to those systems, not a substitute.
5. **No success-metric tracking.** This is an open-source project; counting users is not a goal.
6. **No store-compliance shaping of the product.** Manual install is the primary distribution path. If the extension also lands in the Chrome Web Store, that's a bonus, not a constraint on what gets built.
7. **No module signing, sandboxing, or marketplace.** Custom modules live in the user's own fork.
8. **No streaming LLM responses in MVP.** Standard async only. (AI You's API requires `stream: true`, but its adapter buffers SSE chunks internally and exposes a non-streaming interface like every other adapter.)

## 7. Functional Requirements

### 7.1 Modules

| ID | Module | Notes |
|---|---|---|
| F-TRANSFORM | Transform | Single module covering all text-in / text-out conversions. Operations: Base64 (encode/decode), Hex (encode/decode), URL (encode/decode), HTML entities (encode/decode), JWT (decode; signature verification for HS/RS/PS/ES/EdDSA via secret/PEM/JWK/JWKS; editable header/payload/signature with live re-encode and HMAC re-sign — supports alg:none and RS→HS confusion testing), Defang/Refang for URLs, IPs, and domains. Encoding operations: user picks from a dropdown. Defang: two synchronized panes (Fanged ↔ Defanged) — typing in either pane updates the other live, no operation selector. Bulk input supported throughout. |
| F-CTI | CTI Lookups | VirusTotal, AbuseIPDB, hunting.abuse.ch (web-request **and** API modes) |
| F-PAY | Payload Library | Offline. Ships with curated default sets: **XSS, SQLi, LFI, SSRF, and command injection**. Further categories added in later versions. |
| F-LOG | Log Analysis | Sends user-selected log content to the configured AI; renders Markdown + Mermaid response |
| F-RED | Redaction | User-invoked only; three-stage pipeline (deterministic → optional AI → user review). Never automatic. |

### 7.2 Right-Click Integration

A module can optionally declare a context-menu action for selected page text. Not every module does — it's a per-module choice that lives in the module's definition. Modules that ship with one in v1 include Decode, Defang URL, Analyse log, and Lookup IOC.

Each context-menu action is **individually toggleable** by the user in settings (enabled by default). This keeps the right-click menu from getting cluttered for users who only want a few actions surfaced there. Disabling a context-menu entry does not disable the module itself — only its right-click shortcut.

### 7.3 CTI Module

| ID | Requirement |
|---|---|
| F-CTI-1 | VirusTotal lookup by IP, domain, URL, file hash |
| F-CTI-2 | AbuseIPDB lookup by IP |
| F-CTI-3 | hunting.abuse.ch lookup, supporting both web-request mode and API-key mode (user choice) |
| F-CTI-4 | **Unified CTI history** — every indicator is stored locally with results from every provider that ran (per-provider verdict and full response, plus first/last-lookup timestamps). Acts as both audit log and response cache in one store. |
| F-CTI-5 | Configurable **TTL (72h default)** marks a provider's stored result as **stale** — display-only, informational. Clicking a row never triggers a refetch; the user re-types the indicator to refresh. |
| F-CTI-6 | **Max 100 indicators**, LRU eviction by `lastLookupAt` when the cap is hit. |
| F-CTI-7 | History export as CSV |
| F-CTI-8 | "Clear CTI history" action wipes the entire store in one operation |

### 7.4 Log Analysis Module

| ID | Requirement |
|---|---|
| F-LOG-1 | Accepts arbitrary log content — no size cap, no chunking |
| F-LOG-2 | Sends content **as-is** to the configured AI provider (no automatic redaction) |
| F-LOG-3 | Renders response as Markdown with optional Mermaid diagram |
| F-LOG-4 | Available via popup paste **and** via right-click on selected page text |
| F-LOG-5 | **Local history of the last 10 analyses**, each storing the input, the AI response, timestamp, and provider used. Oldest is evicted when a new analysis would exceed the cap. |
| F-LOG-6 | "Clear log analysis history" action wipes the store in one operation |
| F-LOG-7 | When a background-mode (right-click) analysis completes and no Mimir surface (popup or standalone window) is currently open, the popup auto-opens and routes directly to the completed analysis. Best-effort: browsers may refuse `action.openPopup()` (e.g. expired user gesture); on refusal the badge and history are still updated, and the next manual popup open routes to the analysis. A 2-minute marker TTL prevents stale routing on later popup opens. |
| F-LOG-8 | Output language selectable between English (default) and French via a popup dropdown. The AI writes the report directly in the chosen language; technical and ambiguous IT/security terms (log field names, commands, protocols, HTTP methods, status codes, tool/product names, file paths, usernames, hostnames, IoCs, established jargon) are left in their original English form. The choice persists (write-through) and is the language used by the right-click background path. Changing it does not re-run or alter an existing result. |

### 7.5 Redaction Module (Opt-In)

Redaction is its own module the user invokes deliberately — it is not gated into the Log Analysis flow. The pipeline is:

1. **Stage 1 — Deterministic detectors.** Regex/pattern matchers for IPs, emails, FQDNs, AWS/GitHub tokens, JWTs, private keys, MAC addresses, user paths, etc.
2. **Stage 2 — Optional AI enrichment.** Off by default. If the user enables it, the configured AI is asked to flag additional candidates Stage 1 missed. Cannot unflag Stage 1 hits.
3. **Stage 3 — User review.** Diff view of original vs. redacted; per-detection accept/reject; manual additions allowed. The redacted output updates live as the user toggles detections or adds manual entries — no explicit "Apply" step.

Output goes to the clipboard or to whichever module the user pastes it into. **The redaction module never automatically forwards text to another module.**

### 7.6 AI Configuration

| ID | Requirement |
|---|---|
| F-AI-1 | User configures one or more AI providers in settings |
| F-AI-2 | Supported provider types: **Ollama / LocalAI (local)**, **OpenAI**, **Anthropic**, **OpenAI-compatible (any URL)**, **AI You** (internal-team gateway, user-supplied URL) |
| F-AI-3 | User picks active provider per AI-using module (or one global default) |
| F-AI-4 | Per-feature system prompts, user-editable in settings |
| F-AI-5 | If the configured provider is unreachable, the AI-using module shows a clear error and other modules continue working |

### 7.7 Module Registry

| ID | Requirement |
|---|---|
| F-MOD-1 | Built-in modules registered via the `MimirModule` interface; nothing hard-coded into routing |
| F-MOD-2 | A user can add a folder under `src/modules/`, implement the interface, rebuild, and the module appears |
| F-MOD-3 | Contributor doc walks through adding a module |

## 8. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NF-PERF | Popup should feel snappy. Sub-200ms cold open is a target, not a gate. |
| NF-BROWSER-1 | Chromium-based browsers (Chrome, Edge, Brave, Arc) on MV3 |
| NF-BROWSER-2 | Firefox on MV3 |
| NF-FORM | Laptop/desktop browsers only |
| NF-PRIVACY | Zero telemetry, zero phone-home |

## 9. User Interface

**Two surfaces, full feature parity:**
1. **Popup** — default, opened from the toolbar icon.
2. **Standalone window** — opened from the popup; same UI, more screen space.

Every feature works identically in both. There is no third "tab" surface in v1.

**Sidebar-left navigation** switches between modules within either surface. Modules are ordered by **category, then alphabetical by label** within each category.

**Output rendering:** Markdown (via `react-markdown`) and Mermaid diagrams.

**Settings:** AI providers, API keys, per-feature system prompts, CTI cache TTL, redaction detector toggles, right-click action toggles.

## 10. Risks & Open Questions

Most things prior versions of this doc treated as risks are explicitly the user's responsibility under §3 and §6. The two that remain are acknowledged and accepted:

**R1 — Firefox MV3 API divergence.** Some Chromium APIs differ. *Resolution:* a thin compat shim handles the divergences (see Technical Design §3). Acceptable engineering cost.

**R2 — Local AI output quality varies by model.** A small model gives bad summaries. *Resolution:* user's choice, user's call. Noted in the README; no in-product handling.

**Open questions:** None.

**Resolved decisions:**
- **AI provider default on first run:** field is empty, with `http://localhost:11434` shown as placeholder text. The user must explicitly pick a provider before any AI-using module works. No silent default.
- **Payload library default set for v1:** simple curated **XSS and SQLi** sets only. **v1.1 adds LFI, SSRF, and command injection;** further categories (SSTI, XXE, NoSQLi, etc.) remain deferred.

## 11. Dependencies

**APIs:** VirusTotal v3, AbuseIPDB v2, hunting.abuse.ch (web + API).

**AI providers supported out of the box:** Ollama, LocalAI, OpenAI, Anthropic, any OpenAI-compatible endpoint, AI You.

**Browsers:** Chrome ≥ 120, Edge ≥ 120, Firefox ≥ 128.

**Libraries:** TypeScript, React, Webpack, `react-markdown`, `mermaid.js`. The browser's built-in Web Crypto API replaces `crypto-js` from earlier drafts (smaller bundle, no separate dependency).

## 12. Milestones

**v1.0 (MVP).** All modules in §7.1, right-click integration, CTI cache with 72h/100-entry defaults, AI provider configuration covering local + OpenAI + Anthropic + OpenAI-compatible, opt-in redaction module with all three stages, popup + standalone window surfaces, Chromium build. Firefox build follows shortly.

**v1.1+.** Streaming AI responses, further payload categories (LFI, SSRF, and command injection shipped), additional defangers/encoders as users request them.

## Appendix — Glossary

**CTI** — Cyber Threat Intelligence. **Defang** — render a malicious URL/IP non-clickable (e.g., `hxxp://1[.]2[.]3[.]4`). **IOC** — Indicator of Compromise. **MV3** — Manifest V3, current Chrome extension platform. **JWT** — JSON Web Token.