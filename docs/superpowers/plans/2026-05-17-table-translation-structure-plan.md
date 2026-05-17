# Table Translation Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Markdown table structure during translation by parsing tables as structured blocks and using adaptive table translation that prefers row context, falls back to cell translation when row output is unsafe, and chunks oversized cells only when needed.

**Architecture:** The Markdown parser will group valid pipe-table lines into one `table` block. The block stores structured rows and translation units so the scheduler can translate table content without sending the separator row to the provider. The scheduler uses `adaptive` as the default strategy: try row translation first, reject row output when it is too large, fails, or cannot be mapped back to the original columns, then fall back to cell translation; oversized cells use the existing chunking path. The renderer rebuilds the Markdown table from translated units while preserving separator alignment.

**Tech Stack:** TypeScript, current Markdown parser/renderer modules, existing translation scheduler and Mocha tests.

---

## Constraints

- Preserve existing paragraph, heading, list, blockquote, code fence, HTML, and frontmatter behavior.
- Do not translate table separator rows such as `| --- | --- |`.
- Default table translation strategy is `adaptive`.
- Keep `row` and `cell` strategies available as internal options, not user-facing settings in this change.
- Treat table row translation as successful only when the translated row can be mapped back to the original column count without structural repair.
- Fall back from row to cell when a row exceeds provider length limits, row translation fails, row output is empty, or row output cannot be split back into the original columns.
- Use chunking only inside cell translation when a single cell exceeds provider length limits.
- Do not add dependencies.
- Keep the change narrow to parser, block types, renderer, scheduler, and focused tests.

## Non-Goals

- Do not implement a full CommonMark table parser.
- Do not support tables without a valid separator row as structured tables.
- Do not expose a new VS Code configuration setting.
- Do not rewrite cache storage.

## Affected Files

- `src/markdown/block.ts`: add table metadata types and table strategy type.
- `src/markdown/parser.ts`: group valid pipe tables into table blocks.
- `src/markdown/renderer.ts`: rebuild translated table blocks.
- `src/translation/scheduler.ts`: translate table units with adaptive row-to-cell fallback while preserving existing block translation behavior.
- `src/translation/types.ts`: allow the scheduler input to select table strategy.
- `src/test/markdown/parser.test.ts`: parser coverage for structured tables.
- `src/test/markdown/renderer.test.ts`: renderer coverage for translated tables and bilingual output.
- `src/test/translation/scheduler.test.ts`: scheduler coverage for adaptive, row, and cell strategies.

## Table Translation Strategy

`adaptive` is the real default strategy.

For each table row:

1. If the row text length is within `provider.maxTextLength`, translate the whole row first.
2. Accept row translation only when the translated output splits into exactly the same number of cells as the source row.
3. If row translation is skipped, fails, returns empty output, or has a mismatched cell count, translate each cell separately.
4. If an individual cell exceeds `provider.maxTextLength`, use the existing chunking behavior for that cell.

The `row` strategy remains useful for explicit internal testing of row-only behavior. The `cell` strategy remains useful for explicit internal testing of structure-first behavior. Neither strategy is exposed as a user setting in this change.

## Verification

- Run `npm run compile-tests`.
- Run focused Mocha tests for Markdown and scheduler output:
  - `node_modules/.bin/mocha --ui tdd out/test/markdown/parser.test.js out/test/markdown/renderer.test.js out/test/translation/scheduler.test.js`
- Run `npm run check-types`.
- Run `npm run lint`.
- Run `npm test` if the VS Code test runtime can start in the current worktree. If it fails before tests execute because of the known VS Code IPC runtime issue, report that separately.
