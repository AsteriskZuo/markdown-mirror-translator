# Skip Non-Translatable Markdown Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correctly identify Markdown blocks that must never be translated, including fenced code blocks, indented code blocks, HTML blocks, and frontmatter, and preserve them verbatim in translated output.

**Architecture:** Extend the existing line scanner in `src/markdown/parser.ts` so it recognizes all non-translatable multi-line blocks at parse time and marks them `translatable: false` before they ever reach chunking or translation. Keep the current block/session/render pipeline intact: the scheduler already skips non-translatable blocks, and the renderer already emits their original source unchanged. The change stays narrow by adding only the missing block recognition rules and the tests that pin those rules down, including the broken case where an indented code fence appears after leading spaces inside otherwise valid Markdown.

**Tech Stack:** TypeScript, existing Markdown parser/renderer/scheduler modules, Mocha + Node `assert` tests.

---

## Constraints

- Preserve existing translation flow for translatable paragraphs, headings, lists, blockquotes, tables, and inline token protection.
- Do not expand into a full Markdown/CommonMark rewrite.
- Do not add dependencies.
- Do not change unrelated translation, caching, scroll sync, or save-file behavior.
- Do not attempt to optimize nested cases where a translatable block contains a more complex embedded Markdown structure unless the outer block is already being parsed as non-translatable.
- Preserve original source text, indentation, and fence placement for skipped blocks.

## Non-Goals

- Do not rework the renderer to reconstruct skipped blocks from parsed metadata.
- Do not introduce new user settings for skip behavior.
- Do not implement a generalized HTML parser beyond what is needed to detect Markdown HTML blocks as non-translatable.
- Do not change table translation logic.

## Affected Files

- `src/markdown/block.ts`: add or confirm the block kind(s) needed to represent indented code blocks without treating them as translatable text.
- `src/markdown/parser.ts`: detect fenced code blocks, indented code blocks, HTML blocks, and frontmatter as whole non-translatable blocks while preserving raw source.
- `src/test/markdown/parser.test.ts`: add coverage for indented code blocks with leading spaces, HTML blocks, and frontmatter in valid Markdown positions.
- `src/test/translation/scheduler.test.ts`: add a regression test showing skipped blocks never enter provider translation.
- `src/test/markdown/renderer.test.ts`: add a regression test proving skipped blocks render exactly as their original source.

## Task 1: Lock In Parser-Level Skip Detection

**Files:**
- Modify: `src/markdown/parser.ts`
- Modify: `src/markdown/block.ts`
- Test: `src/test/markdown/parser.test.ts`

- [ ] **Step 1: Add a failing parser regression test for the broken indented code case**

```ts
test('treats indented code blocks as non-translatable even when the fence line is indented', () => {
	const blocks = parseMarkdownBlocks(
		'Intro paragraph\n\n    ```ts\n    const value = 1;\n    ```\n\nOutro paragraph\n',
	);

	assert.deepStrictEqual(
		blocks.map((block) => ({ kind: block.kind, source: block.source, text: block.text, translatable: block.translatable })),
		[
			{ kind: 'paragraph', source: 'Intro paragraph\n', text: 'Intro paragraph', translatable: true },
			{ kind: 'blank', source: '\n', text: '', translatable: false },
			{ kind: 'indentedCode', source: '    ```ts\n    const value = 1;\n    ```\n', text: '', translatable: false },
			{ kind: 'blank', source: '\n', text: '', translatable: false },
			{ kind: 'paragraph', source: 'Outro paragraph\n', text: 'Outro paragraph', translatable: true },
		],
	);
});
```

- [ ] **Step 2: Add parser tests for the other non-translatable block forms**

```ts
test('treats frontmatter and HTML blocks as non-translatable whole blocks', () => {
	const blocks = parseMarkdownBlocks(
		'---\ntitle: Example\n---\n\n<div>\n  <p>raw html</p>\n</div>\n',
	);

	assert.deepStrictEqual(
		blocks.map((block) => ({ kind: block.kind, source: block.source, text: block.text, translatable: block.translatable })),
		[
			{ kind: 'frontmatter', source: '---\ntitle: Example\n---\n', text: '', translatable: false },
			{ kind: 'blank', source: '\n', text: '', translatable: false },
			{ kind: 'html', source: '<div>\n  <p>raw html</p>\n</div>\n', text: '', translatable: false },
		],
	);
});
```

- [ ] **Step 3: Update the parser scan rules to consume multi-line skipped blocks before chunking or text protection**

Implement the scan order in `parseMarkdownBlocks()` as:

1. `consumeFrontmatter(lines)` at document start, returning a `frontmatter` block with `translatable: false` and empty `text`.
2. `consumeFencedCode(lines, index)` for opening fences that are valid Markdown fences even when indented, returning a `fencedCode` block with raw `source`, empty `text`, and `translatable: false`.
3. `consumeIndentedCode(lines, index)` for a raw indented code block, returning an `indentedCode` block with raw `source`, empty `text`, and `translatable: false`.
4. `consumeHtmlBlock(lines, index)` for Markdown HTML blocks, returning an `html` block with raw `source`, empty `text`, and `translatable: false`.
5. Existing table detection and single-line classification only after those four consumers have declined the current line.

Keep the raw `source` exactly as read from the document for every skipped block. Do not strip indentation, normalize fences, or translate any content inside those blocks.

- [ ] **Step 4: Run the parser tests**

Run:
`node_modules/.bin/mocha --ui tdd out/test/markdown/parser.test.js`

Expected:
The new parser regression tests pass, and the existing parser table/list/inline tests still pass.

## Task 2: Prove Skipped Blocks Never Reach Translation or Rendering as Text

**Files:**
- Modify: `src/test/translation/scheduler.test.ts`
- Modify: `src/test/markdown/renderer.test.ts`

- [ ] **Step 1: Add a scheduler regression test that verifies skipped blocks do not call the provider**

```ts
test('does not send skipped markdown blocks to the translation provider', async () => {
	const provider = new RecordingProvider();
	const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
		parserVersion: 'parser-v1',
		concurrency: 1,
	});

	const result = await scheduler.translate({
		sourceLanguage: 'en',
		targetLanguage: 'zh-CN',
		blocks: [
			sourceBlock({ id: 'block-1', kind: 'frontmatter', translatable: false, text: '', hash: 'hash-frontmatter', source: '---\ntitle: Example\n---\n' }),
			sourceBlock({ id: 'block-2', kind: 'indentedCode', translatable: false, text: '', hash: 'hash-code', source: '    code line\n' }),
			sourceBlock({ id: 'block-3', text: 'Translate me', hash: 'hash-text' }),
		],
	});

	assert.strictEqual(provider.inputs.length, 1);
	assert.strictEqual(result.blocks[0].state, 'skipped');
	assert.strictEqual(result.blocks[1].state, 'skipped');
	assert.strictEqual(result.blocks[2].state, 'translated');
});
```

- [ ] **Step 2: Add a renderer regression test that verifies skipped blocks are emitted verbatim**

```ts
test('renders skipped non-translatable blocks exactly as source', () => {
	const rendered = renderMarkdown(
		[
			block({ kind: 'frontmatter', source: '---\ntitle: Example\n---\n', translatable: false, translatedText: '' }),
			block({ kind: 'indentedCode', source: '    code line\n    second line\n', translatable: false, translatedText: '' }),
		],
		'translated',
	);

	assert.strictEqual(rendered, '---\ntitle: Example\n---\n    code line\n    second line\n');
});
```

- [ ] **Step 3: Run the scheduler and renderer tests**

Run:
`node_modules/.bin/mocha --ui tdd out/test/translation/scheduler.test.js out/test/markdown/renderer.test.js`

Expected:
Skipped blocks stay out of provider input and render unchanged from `source`.

## Task 3: Full Verification

**Files:**
- No new code files; verify the edited parser and tests together.

- [ ] **Step 1: Run the targeted TypeScript build/test checks used by this repo**

Run:
`npm run compile-tests`

Expected:
Test output compiles successfully with the updated parser and test cases.

- [ ] **Step 2: Run type checking and linting**

Run:
`npm run check-types`
`npm run lint`

Expected:
No type errors and no lint errors introduced by the parser changes.

- [ ] **Step 3: Run the package test suite if the VS Code runtime is available**

Run:
`npm test`

Expected:
The extension test suite passes, or it fails only for an already-known VS Code runtime issue that is called out explicitly in the verification notes.

## Self-Review Checklist

- The plan covers all four required skip categories: fenced code, indented code, HTML block, and frontmatter.
- The plan preserves the existing parser/scheduler/renderer architecture instead of introducing a rewrite.
- The plan does not ask for nested Markdown optimization inside translatable content.
- The plan keeps scope away from tables, scroll sync, saving, and cache format changes.
- The plan uses exact file paths and concrete test cases rather than placeholders.
