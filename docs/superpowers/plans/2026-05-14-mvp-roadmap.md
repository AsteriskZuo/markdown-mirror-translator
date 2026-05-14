# MVP Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Markdown Mirror Translator MVP in three reviewable phases that each produce working, testable VS Code extension behavior.

**Architecture:** Phase 1 establishes the VS Code command, configuration, Markdown document validation, read-only virtual document, split-editor shell, session replacement behavior, and save command entry point. Phase 2 adds the local Markdown translation pipeline with parser, block model, renderer, translation session, mock translator, throttled virtual document refresh, and unit tests. Phase 3 replaces the mock loop with the production provider, scheduler, cache, failure handling, save-to-disk behavior, overwrite confirmation, integration tests, and edge-case corrections.

**Tech Stack:** VS Code Extension API, TypeScript strict mode, Node16 module resolution, Mocha tests through `@vscode/test-cli`, ESLint, `TextDocumentContentProvider`, VS Code settings contributions.

---

## Source Material

- Product design: `docs/basic-design.zh-CN.md`
- Current extension entry point: `src/extension.ts`
- Current test entry point: `src/test/extension.test.ts`
- Current manifest and scripts: `package.json`
- Existing validation commands: `npm run check-types`, `npm run lint`, `npm run compile`, `npm test`

## Constraints

- Do not edit `docs/basic-design.zh-CN.md` while executing this roadmap; it may contain user work.
- Keep each phase independently reviewable and do not mix phase 2 or phase 3 implementation into phase 1.
- Use existing TypeScript, ESLint, VS Code extension, and test tooling before adding dependencies.
- Do not add AI translation, webviews, Markdown preview rendering, scroll sync, selection translation, batch translation, glossary support, provider switching UI, or automatic source document watching in the MVP.
- Preserve manual refresh semantics: repeated translate command replaces the current translation session for the source document.

## Non-Goals

- This roadmap does not contain every line of implementation for phases 2 and 3.
- This roadmap does not change extension behavior by itself.
- This roadmap does not decide future paid provider configuration or AI translation scope.

## Affected Files And Modules

### Phase 1: VS Code Shell

- Modify: `package.json`
  - Replace helloWorld contribution with translate and save commands.
  - Add settings contributions for source language, target language, bilingual output, and update mode.
  - Add editor title menu entries scoped to Markdown documents and translated virtual documents.
- Modify: `src/extension.ts`
  - Register commands and the translated virtual document provider.
  - Keep activation small by delegating command bodies.
- Create: `src/config.ts`
  - Read and normalize settings from `markdownMirrorTranslator`.
- Create: `src/document/translatedDocumentProvider.ts`
  - Own the `TextDocumentContentProvider`, virtual URI creation, read-only content lookup, and refresh event.
- Create: `src/translationSession.ts`
  - Store per-source-file shell session data and current rendered content.
- Create: `src/commands/translateCurrentFile.ts`
  - Validate the active editor, read Markdown content, replace the session, open the translated virtual document in the side column, and show success or validation messages.
- Create: `src/commands/saveTranslatedFile.ts`
  - Register the save entry point and show a clear message that real file saving is delivered in phase 3.
- Modify: `src/test/extension.test.ts`
  - Replace sample tests with extension shell tests.
- Create as needed: focused unit tests under `src/test/`.

### Phase 2: Local Translation Pipeline

- Create: `src/markdown/parser.ts`
  - Convert Markdown text into stable block records.
- Create: `src/markdown/renderer.ts`
  - Render block records into translated-only or bilingual Markdown.
- Create: `src/translation/types.ts`
  - Define provider input, result, and interface types.
- Create: `src/translation/providers/mockTranslator.ts`
  - Provide deterministic local translations for tests and development.
- Create or extend: `src/translationSession.ts`
  - Track block state, rendered content, and session replacement.
- Create or extend: `src/commands/translateCurrentFile.ts`
  - Use parser, mock translator, renderer, and throttled provider refresh.
- Add tests under `src/test/markdown/`, `src/test/translation/`, and command-level tests as needed.

### Phase 3: Production Translation Loop

- Create: `src/translation/providers/googleFreeTranslator.ts`
  - Adapt the non-official Google Translate endpoint behind the provider interface.
- Create: `src/translation/scheduler.ts`
  - Apply concurrency limits, max-text splitting, cache lookup, and failure isolation.
- Create: `src/cache/translationCache.ts`
  - Store block translations using provider, language, parser version, and block hash keys.
- Extend: `src/commands/saveTranslatedFile.ts`
  - Save rendered Markdown to the source directory with target-language file naming and overwrite confirmation.
- Extend tests for provider response parsing, scheduler behavior, cache behavior, save behavior, and integration workflows.

## Verification Strategy

- Every phase ends with:
  - `npm run check-types`
  - `npm run lint`
  - `npm run compile`
- Command and VS Code integration changes also run:
  - `npm test`
- Documentation-only changes are verified with:
  - Review against `docs/basic-design.zh-CN.md`
  - Placeholder scan for planning red flags
  - Type and naming consistency review across all planned files

## Open Questions

- Should phase 1 keep the helloWorld command available for compatibility during early development, or remove it immediately when the real commands are contributed?
- Should the translated virtual document URI encode the full source URI with percent-encoding, or use a shorter stable key backed by an in-memory source URI map?
- Should phase 1 tests invoke VS Code commands directly, or keep most command behavior in exported helper functions to make tests faster and more isolated?
- Should the save command in phase 1 show an information message only, or also reveal the currently associated source file path to confirm the session binding?

## Tasks

### Task 1: Approve Phase Boundaries

**Files:**
- Review: `docs/basic-design.zh-CN.md`
- Review: `docs/superpowers/plans/2026-05-14-vscode-shell-plan.md`

- [ ] **Step 1: Confirm phase 1 scope**

Review that phase 1 includes command registration, settings reads, Markdown validation, right-side read-only virtual document, split-editor opening, source-content initial display, virtual document reuse, and save command entry behavior.

Expected: no parser, renderer, real translator, cache, scheduler, or file-writing work is included in phase 1.

- [ ] **Step 2: Confirm phase 2 scope**

Review that phase 2 includes Markdown parser, block model, renderer, translation session, mock translator, translated-only and bilingual output, throttled right-side refresh, and unit tests.

Expected: no network provider, persistent cache, or final save-to-disk workflow is included in phase 2.

- [ ] **Step 3: Confirm phase 3 scope**

Review that phase 3 includes `google-free` provider, scheduler, concurrency limit, long-text splitting, cache, failure handling, save-to-disk behavior, overwrite confirmation, integration tests, and edge-case corrections.

Expected: phase 3 completes the MVP success criteria from `docs/basic-design.zh-CN.md`.

### Task 2: Execute Phase 1 Detailed Plan

**Files:**
- Execute: `docs/superpowers/plans/2026-05-14-vscode-shell-plan.md`

- [ ] **Step 1: Use the required execution workflow**

Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` before touching implementation files.

Expected: task execution follows the checkbox order in the phase 1 plan.

- [ ] **Step 2: Keep commits phase-scoped**

Commit only phase 1 implementation and test changes.

Expected commit message:

```bash
git commit -m "feat: add vscode translation shell"
```

### Task 3: Write Phase 2 Detailed Plan After Phase 1 Review

**Files:**
- Create: `docs/superpowers/plans/YYYY-MM-DD-local-translation-pipeline-plan.md`
- Review: `docs/basic-design.zh-CN.md`
- Review: phase 1 implementation files

- [ ] **Step 1: Re-read design and phase 1 implementation**

Run:

```bash
sed -n '1,520p' docs/basic-design.zh-CN.md
rg --files src | sort
```

Expected: the phase 2 plan uses the actual phase 1 module boundaries and does not invent parallel command or session APIs.

- [ ] **Step 2: Create the phase 2 plan**

Write a plan that starts with the required Superpower plan header and includes parser, renderer, translation session, mock translator, throttled refresh, and unit tests as bite-sized checkbox tasks.

Expected: each code step includes exact TypeScript snippets or exact replacement content.

- [ ] **Step 3: Verify the phase 2 plan**

Run:

```bash
rg -n 'T[B]D|T[O]DO|implement [l]ater|fill in [d]etails|add [a]ppropriate|handle [e]dge cases|Write tests for the [a]bove|Similar to [T]ask' docs/superpowers/plans/YYYY-MM-DD-local-translation-pipeline-plan.md
```

Expected: no matches.

### Task 4: Write Phase 3 Detailed Plan After Phase 2 Review

**Files:**
- Create: `docs/superpowers/plans/YYYY-MM-DD-production-translation-loop-plan.md`
- Review: `docs/basic-design.zh-CN.md`
- Review: phase 1 and phase 2 implementation files

- [ ] **Step 1: Re-read design and phase 2 implementation**

Run:

```bash
sed -n '1,520p' docs/basic-design.zh-CN.md
rg --files src | sort
```

Expected: the phase 3 plan builds on the actual parser, renderer, session, and mock-provider contracts.

- [ ] **Step 2: Create the phase 3 plan**

Write a plan that starts with the required Superpower plan header and includes provider, scheduler, cache, failure handling, save-to-disk behavior, overwrite confirmation, integration tests, and edge-case corrections as bite-sized checkbox tasks.

Expected: each code step includes exact TypeScript snippets or exact replacement content.

- [ ] **Step 3: Verify the phase 3 plan**

Run:

```bash
rg -n 'T[B]D|T[O]DO|implement [l]ater|fill in [d]etails|add [a]ppropriate|handle [e]dge cases|Write tests for the [a]bove|Similar to [T]ask' docs/superpowers/plans/YYYY-MM-DD-production-translation-loop-plan.md
```

Expected: no matches.

## Self-Review Checklist

- [ ] **Requirement coverage:** Map all MVP requirements from `docs/basic-design.zh-CN.md` to phase 1, phase 2, or phase 3 above.
- [ ] **Placeholder scan:** Run the red-flag search commands shown in the task sections for every detailed plan document.
- [ ] **Type and naming consistency:** Confirm command IDs, setting keys, provider IDs, and module names match across `package.json`, `src/extension.ts`, command modules, session modules, provider modules, and tests.
