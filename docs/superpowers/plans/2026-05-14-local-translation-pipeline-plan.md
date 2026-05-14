# Local Translation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build phase 2 local translation behavior so the right-side virtual Markdown document renders deterministic translated-only or bilingual Markdown from parsed Markdown blocks.

**Architecture:** Add a dependency-free Markdown block parser, a small block model, a renderer, and a deterministic mock translator, then wire them into the existing translate command and translation session. The pipeline stays local and synchronous except for the translator interface, and the virtual document provider receives throttled refreshes while the session content is updated.

**Tech Stack:** TypeScript strict mode, VS Code Extension API, Mocha through `@vscode/test-cli`, Node built-ins only, existing ESLint and esbuild setup.

---

## Goal

Phase 2 turns the phase 1 shell into a local translation pipeline:

- Parse Markdown source into stable block records.
- Preserve non-translatable Markdown structures.
- Translate translatable block text through a deterministic mock translator.
- Render pure translated Markdown when `bilingual` is false.
- Render adjacent source and translated blocks when `bilingual` is true.
- Store parsed blocks, translated blocks, rendered content, and render mode in the translation session.
- Refresh the right-side virtual document through a small throttle so repeated updates do not fire provider change events on every content mutation.
- Cover parser, renderer, session, mock translator, command pipeline, and extension behavior with focused tests.

## Architecture

The phase 2 pipeline is deliberately local:

1. `src/markdown/parser.ts` converts source Markdown into `MarkdownBlock[]`.
2. `src/translation/providers/mockTranslator.ts` translates only blocks whose `translatable` flag is true.
3. `src/markdown/renderer.ts` renders translated-only or bilingual Markdown from source and translated block pairs.
4. `src/translationSession.ts` stores the block-level state and rendered content.
5. `src/commands/translateCurrentFile.ts` orchestrates parser, mock translator, renderer, session replacement, throttled provider refresh, and right-side document opening.

The parser is block-oriented rather than a complete Markdown AST. It preserves fenced code, frontmatter, HTML blocks, and blank lines as protected blocks, and treats headings, paragraphs, list items, block quotes, table rows, and plain text blocks as translatable text blocks. Inline protection is handled with placeholder tokens inside translatable blocks so inline code, URLs, link destinations, image destinations, and inline HTML survive mock translation unchanged.

## Tech Stack

- Existing TypeScript strict settings from `tsconfig.json`.
- Existing VS Code extension modules:
  - `src/commands/translateCurrentFile.ts`
  - `src/document/translatedDocumentProvider.ts`
  - `src/translationSession.ts`
  - `src/config.ts`
- New local modules:
  - `src/markdown/block.ts`
  - `src/markdown/parser.ts`
  - `src/markdown/renderer.ts`
  - `src/translation/types.ts`
  - `src/translation/providers/mockTranslator.ts`
  - `src/refresh/throttledRefresh.ts`
- Tests remain under `src/test/` so `npm run compile-tests` and `npm test` pick them up without test runner changes.

## Affected Files And Modules

- Create: `src/markdown/block.ts`
  - Defines `MarkdownBlock`, `MarkdownBlockKind`, `ProtectedInlineToken`, and translated block types.
- Create: `src/markdown/parser.ts`
  - Parses source Markdown into block records and protects inline spans.
- Create: `src/markdown/renderer.ts`
  - Renders translated-only and bilingual Markdown from source/translation pairs.
- Create: `src/translation/types.ts`
  - Defines local translator request, response, and interface contracts.
- Create: `src/translation/providers/mockTranslator.ts`
  - Implements deterministic local mock translation for tests and development.
- Create: `src/refresh/throttledRefresh.ts`
  - Provides a small throttler for coalesced virtual document refreshes.
- Modify: `src/translationSession.ts`
  - Adds source blocks, translated blocks, render mode, and `replaceRenderedContent()`.
- Modify: `src/document/translatedDocumentProvider.ts`
  - Adds `refreshSession()` so command code can explicitly fire throttled change events.
- Modify: `src/commands/translateCurrentFile.ts`
  - Replaces phase 1 source echo with parse, mock translate, render, session update, and throttled refresh.
- Modify: `src/test/extension.test.ts`
  - Updates shell integration expectations from source echo to mock-translated output.
- Create: `src/test/markdown/parser.test.ts`
  - Unit tests parser block model and protected inline behavior.
- Create: `src/test/markdown/renderer.test.ts`
  - Unit tests pure translated and bilingual rendering.
- Create: `src/test/translation/mockTranslator.test.ts`
  - Unit tests mock translator determinism and protected-block behavior.
- Create: `src/test/refresh/throttledRefresh.test.ts`
  - Unit tests refresh coalescing.

## Non-Goals

- No `google-free` provider.
- No scheduler concurrency controls.
- No long-text splitting.
- No cache.
- No failed-request retry policy.
- No save-to-disk implementation.
- No overwrite confirmation.
- No provider settings or provider UI.
- No webview, HTML preview, scroll sync, selection translation, batch translation, glossary, or automatic source watching.
- No changes to `docs/basic-design.zh-CN.md`.

## Constraints

- Keep changes small and reviewable.
- Do not add npm dependencies.
- Keep the parser deterministic and dependency-free.
- Preserve phase 1 command IDs, settings keys, translated document scheme, and right-side virtual document behavior.
- Treat `translationUpdateMode: "auto"` as manual behavior in this phase.
- `npm test` must be run with escalated permissions directly because `vscode-test` may need network access and VS Code/Electron runtime startup.
- Use the existing worktree branch `2026-05-14-local-translation-pipeline-plan`.

## Verification Method

Run narrow verification after each task:

```bash
npm run compile-tests
```

Expected: exits with code 0 after the implementation step for the task.

```bash
npm run check-types
```

Expected: exits with code 0 and no TypeScript errors.

```bash
npm run lint
```

Expected: exits with code 0 and no ESLint errors.

Run full verification at the end:

```bash
npm run compile
```

Expected: exits with code 0 and emits `dist/extension.js`.

```bash
npm test
```

Expected: run with escalated permissions; exits with code 0; parser, renderer, translator, refresh, and extension tests pass.

## Open Questions

- Should phase 2 parser treat a multi-line HTML block as protected only when a line starts with `<`, or should it keep consuming until a closing tag is seen? This plan chooses line-start HTML block protection to keep the parser small and deterministic.
- Should bilingual rendering separate source and translation with exactly one blank line or preserve the source block's original trailing blank lines? This plan chooses exactly one blank line between adjacent source and translation blocks for readable Markdown.
- Should mock translations include target language in the rendered text? This plan includes `[zh-CN]` or the configured target language in translated text so tests can prove config is used.

## Tasks

### Task 1: Add Markdown Block Model

**Files:**
- Create: `src/markdown/block.ts`
- Create: `src/test/markdown/parser.test.ts`

- [ ] **Step 1: Write failing block model parser test**

Create `src/test/markdown/parser.test.ts`:

```ts
import * as assert from 'assert';
import { parseMarkdownBlocks } from '../../markdown/parser';

suite('Markdown parser', () => {
	test('parses headings, paragraphs, blank lines, and fenced code blocks', () => {
		const blocks = parseMarkdownBlocks('# Hello\n\nThis is `code` and https://example.com.\n\n```ts\nconst value = 1;\n```\n');

		assert.deepStrictEqual(
			blocks.map((block) => ({
				kind: block.kind,
				source: block.source,
				text: block.text,
				translatable: block.translatable,
			})),
			[
				{ kind: 'heading', source: '# Hello\n', text: 'Hello', translatable: true },
				{ kind: 'blank', source: '\n', text: '', translatable: false },
				{
					kind: 'paragraph',
					source: 'This is `code` and https://example.com.\n',
					text: 'This is __MMT_INLINE_0__ and __MMT_INLINE_1__.',
					translatable: true,
				},
				{ kind: 'blank', source: '\n', text: '', translatable: false },
				{ kind: 'fencedCode', source: '```ts\nconst value = 1;\n```\n', text: '', translatable: false },
			],
		);
		assert.deepStrictEqual(blocks[2].protectedInlines, [
			{ token: '__MMT_INLINE_0__', value: '`code`' },
			{ token: '__MMT_INLINE_1__', value: 'https://example.com' },
		]);
	});
});
```

- [ ] **Step 2: Run test compile to verify parser module is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript output containing `Cannot find module '../../markdown/parser'`.

- [ ] **Step 3: Create block model types**

Create `src/markdown/block.ts`:

```ts
export type MarkdownBlockKind =
	| 'frontmatter'
	| 'blank'
	| 'heading'
	| 'paragraph'
	| 'listItem'
	| 'blockquote'
	| 'tableRow'
	| 'fencedCode'
	| 'html'
	| 'protected';

export type ProtectedInlineToken = {
	token: string;
	value: string;
};

export type MarkdownBlock = {
	id: string;
	kind: MarkdownBlockKind;
	source: string;
	text: string;
	translatable: boolean;
	protectedInlines: ProtectedInlineToken[];
};

export type TranslatedMarkdownBlock = MarkdownBlock & {
	translatedText: string;
};

export type RenderMode = 'translated' | 'bilingual';
```

- [ ] **Step 4: Create parser stub**

Create `src/markdown/parser.ts` with the smallest compiling export:

```ts
import type { MarkdownBlock } from './block';

export function parseMarkdownBlocks(_source: string): MarkdownBlock[] {
	return [];
}
```

- [ ] **Step 5: Run parser test to verify it fails behaviorally**

Run:

```bash
npm test -- --grep "Markdown parser"
```

Expected: FAIL because `blocks.map(...)` is `[]` instead of the expected block records.

### Task 2: Implement Markdown Parser

**Files:**
- Modify: `src/markdown/parser.ts`
- Modify: `src/test/markdown/parser.test.ts`

- [ ] **Step 1: Replace parser with block parsing implementation**

Replace `src/markdown/parser.ts` with:

```ts
import type { MarkdownBlock, MarkdownBlockKind, ProtectedInlineToken } from './block';

const inlinePatterns = [
	/`[^`\n]+`/g,
	/<[A-Za-z][^>\n]*>/g,
];

const markdownDestinationPattern = /(!?\[[^\]]*])\(([^)\s]+)(\s+"[^"]*")?\)/g;
const urlPattern = /https?:\/\/[^\s)]+/g;

function createBlock(
	index: number,
	kind: MarkdownBlockKind,
	source: string,
	text: string,
	translatable: boolean,
	protectedInlines: ProtectedInlineToken[] = [],
): MarkdownBlock {
	return {
		id: `block-${index}`,
		kind,
		source,
		text,
		translatable,
		protectedInlines,
	};
}

function protectInlineText(text: string): { text: string; protectedInlines: ProtectedInlineToken[] } {
	const protectedInlines: ProtectedInlineToken[] = [];
	let protectedText = text.replace(
		markdownDestinationPattern,
		(_value: string, label: string, destination: string, title: string | undefined) => {
			const token = `__MMT_INLINE_${protectedInlines.length}__`;
			protectedInlines.push({ token, value: destination });
			return `${label}(${token}${title ?? ''})`;
		},
	);

	protectedText = protectedText.replace(urlPattern, (value: string) => {
		const trailingPunctuation = value.match(/[.,;:!?]+$/)?.[0] ?? '';
		const url = trailingPunctuation ? value.slice(0, -trailingPunctuation.length) : value;
		const token = `__MMT_INLINE_${protectedInlines.length}__`;
		protectedInlines.push({ token, value: url });
		return `${token}${trailingPunctuation}`;
	});

	for (const pattern of inlinePatterns) {
		protectedText = protectedText.replace(pattern, (value: string) => {
			const token = `__MMT_INLINE_${protectedInlines.length}__`;
			protectedInlines.push({ token, value });
			return token;
		});
	}

	return { text: protectedText, protectedInlines };
}

function stripPrefix(line: string, kind: MarkdownBlockKind): string {
	const withoutNewline = line.replace(/\r?\n$/, '');

	if (kind === 'heading') {
		return withoutNewline.replace(/^#{1,6}\s*/, '');
	}

	if (kind === 'listItem') {
		return withoutNewline.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
	}

	if (kind === 'blockquote') {
		return withoutNewline.replace(/^>\s?/, '');
	}

	if (kind === 'tableRow') {
		return withoutNewline;
	}

	return withoutNewline;
}

function classifyLine(line: string): MarkdownBlockKind {
	if (/^\s*$/.test(line)) {
		return 'blank';
	}

	if (/^#{1,6}\s+/.test(line)) {
		return 'heading';
	}

	if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
		return 'listItem';
	}

	if (/^>\s?/.test(line)) {
		return 'blockquote';
	}

	if (/^\|.*\|\s*$/.test(line)) {
		return 'tableRow';
	}

	if (/^\s*<[A-Za-z][^>]*>\s*$/.test(line)) {
		return 'html';
	}

	return 'paragraph';
}

function isFrontmatterStart(lines: string[]): boolean {
	return lines.length > 0 && /^---\s*$/.test(lines[0]);
}

function consumeFrontmatter(lines: string[]): { source: string; nextIndex: number } | undefined {
	if (!isFrontmatterStart(lines)) {
		return undefined;
	}

	for (let index = 1; index < lines.length; index += 1) {
		if (/^---\s*$/.test(lines[index])) {
			return {
				source: lines.slice(0, index + 1).join(''),
				nextIndex: index + 1,
			};
		}
	}

	return undefined;
}

function consumeFencedCode(lines: string[], startIndex: number): { source: string; nextIndex: number } {
	const fence = lines[startIndex].match(/^(```|~~~)/)?.[1] ?? '```';

	for (let index = startIndex + 1; index < lines.length; index += 1) {
		if (lines[index].startsWith(fence)) {
			return {
				source: lines.slice(startIndex, index + 1).join(''),
				nextIndex: index + 1,
			};
		}
	}

	return {
		source: lines.slice(startIndex).join(''),
		nextIndex: lines.length,
	};
}

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
	const lines = source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
	const blocks: MarkdownBlock[] = [];
	let index = 0;

	const frontmatter = consumeFrontmatter(lines);
	if (frontmatter) {
		blocks.push(createBlock(blocks.length, 'frontmatter', frontmatter.source, '', false));
		index = frontmatter.nextIndex;
	}

	while (index < lines.length) {
		const line = lines[index];

		if (/^(```|~~~)/.test(line)) {
			const fencedCode = consumeFencedCode(lines, index);
			blocks.push(createBlock(blocks.length, 'fencedCode', fencedCode.source, '', false));
			index = fencedCode.nextIndex;
			continue;
		}

		const kind = classifyLine(line);

		if (kind === 'blank' || kind === 'html') {
			blocks.push(createBlock(blocks.length, kind, line, '', false));
			index += 1;
			continue;
		}

		const stripped = stripPrefix(line, kind);
		const protectedText = protectInlineText(stripped);
		blocks.push(createBlock(blocks.length, kind, line, protectedText.text, true, protectedText.protectedInlines));
		index += 1;
	}

	return blocks;
}
```

- [ ] **Step 2: Add parser coverage for frontmatter, lists, quotes, links, images, and HTML**

Append these tests inside `suite('Markdown parser', ...)` in `src/test/markdown/parser.test.ts`:

```ts
	test('protects frontmatter, html lines, links, and image URLs', () => {
		const blocks = parseMarkdownBlocks('---\ntitle: Hello\n---\n\n- Read [docs](https://example.com/docs)\n> See ![alt](image.png)\n<div>raw</div>\n');

		assert.strictEqual(blocks[0].kind, 'frontmatter');
		assert.strictEqual(blocks[0].translatable, false);
		assert.strictEqual(blocks[2].kind, 'listItem');
		assert.strictEqual(blocks[2].text, 'Read [docs](__MMT_INLINE_0__)');
		assert.deepStrictEqual(blocks[2].protectedInlines, [
			{ token: '__MMT_INLINE_0__', value: 'https://example.com/docs' },
		]);
		assert.strictEqual(blocks[3].kind, 'blockquote');
		assert.strictEqual(blocks[3].text, 'See ![alt](__MMT_INLINE_0__)');
		assert.deepStrictEqual(blocks[3].protectedInlines, [
			{ token: '__MMT_INLINE_0__', value: 'image.png' },
		]);
		assert.strictEqual(blocks[4].kind, 'html');
		assert.strictEqual(blocks[4].translatable, false);
	});

	test('marks table rows as translatable blocks', () => {
		const blocks = parseMarkdownBlocks('| Name | Description |\n| --- | --- |\n| API | Local pipeline |\n');

		assert.deepStrictEqual(
			blocks.map((block) => ({ kind: block.kind, text: block.text, translatable: block.translatable })),
			[
				{ kind: 'tableRow', text: '| Name | Description |', translatable: true },
				{ kind: 'tableRow', text: '| --- | --- |', translatable: true },
				{ kind: 'tableRow', text: '| API | Local pipeline |', translatable: true },
			],
		);
	});
```

- [ ] **Step 3: Run parser tests**

Run:

```bash
npm test -- --grep "Markdown parser"
```

Expected: PASS for all `Markdown parser` tests.

- [ ] **Step 4: Run type check and lint**

Run:

```bash
npm run check-types
npm run lint
```

Expected: both commands exit with code 0.

### Task 3: Add Renderer

**Files:**
- Create: `src/markdown/renderer.ts`
- Create: `src/test/markdown/renderer.test.ts`

- [ ] **Step 1: Write failing renderer tests**

Create `src/test/markdown/renderer.test.ts`:

```ts
import * as assert from 'assert';
import type { TranslatedMarkdownBlock } from '../../markdown/block';
import { renderMarkdown } from '../../markdown/renderer';

function block(input: Partial<TranslatedMarkdownBlock> & Pick<TranslatedMarkdownBlock, 'source' | 'translatedText'>): TranslatedMarkdownBlock {
	return {
		id: input.id ?? 'block-0',
		kind: input.kind ?? 'paragraph',
		source: input.source,
		text: input.text ?? input.source.trim(),
		translatable: input.translatable ?? true,
		protectedInlines: input.protectedInlines ?? [],
		translatedText: input.translatedText,
	};
}

suite('Markdown renderer', () => {
	test('renders translated-only Markdown with restored inline tokens', () => {
		const rendered = renderMarkdown(
			[
				block({
					kind: 'heading',
					source: '# Hello\n',
					text: 'Hello',
					translatedText: '[zh-CN] Hello',
				}),
				block({
					kind: 'blank',
					source: '\n',
					text: '',
					translatable: false,
					translatedText: '',
				}),
				block({
					source: 'Read `code`.\n',
					text: 'Read __MMT_INLINE_0__.',
					protectedInlines: [{ token: '__MMT_INLINE_0__', value: '`code`' }],
					translatedText: '[zh-CN] Read __MMT_INLINE_0__.',
				}),
			],
			'translated',
		);

		assert.strictEqual(rendered, '# [zh-CN] Hello\n\n[zh-CN] Read `code`.\n');
	});

	test('renders bilingual Markdown as source block followed by translated block', () => {
		const rendered = renderMarkdown(
			[
				block({
					kind: 'heading',
					source: '# Hello\n',
					text: 'Hello',
					translatedText: '[zh-CN] Hello',
				}),
				block({
					source: 'World\n',
					text: 'World',
					translatedText: '[zh-CN] World',
				}),
			],
			'bilingual',
		);

		assert.strictEqual(rendered, '# Hello\n\n# [zh-CN] Hello\n\nWorld\n\n[zh-CN] World\n');
	});
});
```

- [ ] **Step 2: Run test compile to verify renderer module is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript output containing `Cannot find module '../../markdown/renderer'`.

- [ ] **Step 3: Create renderer implementation**

Create `src/markdown/renderer.ts`:

```ts
import type { RenderMode, TranslatedMarkdownBlock } from './block';

function restoreInlineTokens(text: string, block: TranslatedMarkdownBlock): string {
	return block.protectedInlines.reduce(
		(current, protectedInline) => current.split(protectedInline.token).join(protectedInline.value),
		text,
	);
}

function ensureTrailingNewline(text: string): string {
	return text.endsWith('\n') ? text : `${text}\n`;
}

function renderTranslatedBlock(block: TranslatedMarkdownBlock): string {
	if (!block.translatable) {
		return block.source;
	}

	const translatedText = restoreInlineTokens(block.translatedText, block);

	if (block.kind === 'heading') {
		const prefix = block.source.match(/^(#{1,6}\s*)/)?.[1] ?? '';
		return ensureTrailingNewline(`${prefix}${translatedText}`);
	}

	if (block.kind === 'listItem') {
		const prefix = block.source.match(/^(\s*(?:[-*+]|\d+[.)])\s+)/)?.[1] ?? '';
		return ensureTrailingNewline(`${prefix}${translatedText}`);
	}

	if (block.kind === 'blockquote') {
		const prefix = block.source.match(/^(>\s?)/)?.[1] ?? '> ';
		return ensureTrailingNewline(`${prefix}${translatedText}`);
	}

	return ensureTrailingNewline(translatedText);
}

function joinBilingualPairs(pairs: string[]): string {
	return pairs.filter((pair) => pair.length > 0).join('\n');
}

export function renderMarkdown(blocks: TranslatedMarkdownBlock[], mode: RenderMode): string {
	if (mode === 'translated') {
		return blocks.map(renderTranslatedBlock).join('');
	}

	const pairs = blocks.map((block) => {
		if (!block.translatable) {
			if (block.kind === 'blank') {
				return '';
			}

			return block.source;
		}

		return `${ensureTrailingNewline(block.source).trimEnd()}\n\n${renderTranslatedBlock(block).trimEnd()}\n`;
	});

	return joinBilingualPairs(pairs);
}
```

- [ ] **Step 4: Run renderer tests**

Run:

```bash
npm test -- --grep "Markdown renderer"
```

Expected: PASS for all `Markdown renderer` tests.

- [ ] **Step 5: Run type check and lint**

Run:

```bash
npm run check-types
npm run lint
```

Expected: both commands exit with code 0.

### Task 4: Add Mock Translator

**Files:**
- Create: `src/translation/types.ts`
- Create: `src/translation/providers/mockTranslator.ts`
- Create: `src/test/translation/mockTranslator.test.ts`

- [ ] **Step 1: Write failing mock translator tests**

Create `src/test/translation/mockTranslator.test.ts`:

```ts
import * as assert from 'assert';
import type { MarkdownBlock } from '../../markdown/block';
import { MockTranslator } from '../../translation/providers/mockTranslator';

const translatableBlock: MarkdownBlock = {
	id: 'block-1',
	kind: 'paragraph',
	source: 'Hello __MMT_INLINE_0__\n',
	text: 'Hello __MMT_INLINE_0__',
	translatable: true,
	protectedInlines: [{ token: '__MMT_INLINE_0__', value: '`code`' }],
};

const protectedBlock: MarkdownBlock = {
	id: 'block-2',
	kind: 'fencedCode',
	source: '```ts\nconst value = 1;\n```\n',
	text: '',
	translatable: false,
	protectedInlines: [],
};

suite('Mock translator', () => {
	test('adds target language prefix to translatable blocks', async () => {
		const translator = new MockTranslator();
		const translated = await translator.translateBlocks({
			sourceLanguage: '',
			targetLanguage: 'zh-CN',
			blocks: [translatableBlock],
		});

		assert.strictEqual(translated[0].translatedText, '[zh-CN] Hello __MMT_INLINE_0__');
	});

	test('leaves protected blocks untranslated', async () => {
		const translator = new MockTranslator();
		const translated = await translator.translateBlocks({
			sourceLanguage: 'en',
			targetLanguage: 'ja',
			blocks: [protectedBlock],
		});

		assert.strictEqual(translated[0].translatedText, '');
		assert.strictEqual(translated[0].source, protectedBlock.source);
	});
});
```

- [ ] **Step 2: Run test compile to verify translator module is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript output containing `Cannot find module '../../translation/providers/mockTranslator'`.

- [ ] **Step 3: Create translator interface types**

Create `src/translation/types.ts`:

```ts
import type { MarkdownBlock, TranslatedMarkdownBlock } from '../markdown/block';

export type TranslateBlocksRequest = {
	sourceLanguage: string;
	targetLanguage: string;
	blocks: MarkdownBlock[];
};

export interface MarkdownTranslator {
	translateBlocks(request: TranslateBlocksRequest): Promise<TranslatedMarkdownBlock[]>;
}
```

- [ ] **Step 4: Create mock translator implementation**

Create `src/translation/providers/mockTranslator.ts`:

```ts
import type { TranslatedMarkdownBlock } from '../../markdown/block';
import type { MarkdownTranslator, TranslateBlocksRequest } from '../types';

export class MockTranslator implements MarkdownTranslator {
	async translateBlocks(request: TranslateBlocksRequest): Promise<TranslatedMarkdownBlock[]> {
		return request.blocks.map((block) => ({
			...block,
			translatedText: block.translatable ? `[${request.targetLanguage}] ${block.text}` : '',
		}));
	}
}
```

- [ ] **Step 5: Run mock translator tests**

Run:

```bash
npm test -- --grep "Mock translator"
```

Expected: PASS for all `Mock translator` tests.

- [ ] **Step 6: Run type check and lint**

Run:

```bash
npm run check-types
npm run lint
```

Expected: both commands exit with code 0.

### Task 5: Extend Translation Session

**Files:**
- Modify: `src/translationSession.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Replace session test expectations**

In `src/test/extension.test.ts`, replace the test named `createInitialSession stores source content as rendered content` with:

```ts
	test('createInitialSession stores block state and rendered content', () => {
		const sourceUri = vscode.Uri.file('/workspace/README.md');
		const translatedUri = vscode.Uri.from({
			scheme: 'markdown-mirror-translator',
			path: '/README.zh-CN.md',
		});
		const sourceBlocks = [
			{
				id: 'block-0',
				kind: 'heading' as const,
				source: '# Hello\n',
				text: 'Hello',
				translatable: true,
				protectedInlines: [],
			},
		];
		const translatedBlocks = [
			{
				...sourceBlocks[0],
				translatedText: '[zh-CN] Hello',
			},
		];

		const session = createInitialSession({
			sourceUri,
			translatedUri,
			sourceContent: '# Hello\n',
			sourceBlocks,
			translatedBlocks,
			renderedContent: '# [zh-CN] Hello\n',
			renderMode: 'translated',
			config: getConfig(),
		});

		assert.strictEqual(session.sourceUri.toString(), sourceUri.toString());
		assert.strictEqual(session.translatedUri.toString(), translatedUri.toString());
		assert.strictEqual(session.sourceContent, '# Hello\n');
		assert.deepStrictEqual(session.sourceBlocks, sourceBlocks);
		assert.deepStrictEqual(session.translatedBlocks, translatedBlocks);
		assert.strictEqual(session.renderedContent, '# [zh-CN] Hello\n');
		assert.strictEqual(session.renderMode, 'translated');
		assert.ok(session.updatedAt > 0);
	});
```

- [ ] **Step 2: Run compile-tests to verify session input shape fails**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript errors because `CreateInitialSessionInput` does not include `sourceBlocks`, `translatedBlocks`, `renderedContent`, or `renderMode`.

- [ ] **Step 3: Replace session module**

Replace `src/translationSession.ts` with:

```ts
import * as vscode from 'vscode';
import type { MarkdownMirrorTranslatorConfig } from './config';
import type { MarkdownBlock, RenderMode, TranslatedMarkdownBlock } from './markdown/block';

export type TranslationSession = {
	sourceUri: vscode.Uri;
	translatedUri: vscode.Uri;
	sourceContent: string;
	sourceBlocks: MarkdownBlock[];
	translatedBlocks: TranslatedMarkdownBlock[];
	renderedContent: string;
	renderMode: RenderMode;
	config: MarkdownMirrorTranslatorConfig;
	updatedAt: number;
};

export type CreateInitialSessionInput = {
	sourceUri: vscode.Uri;
	translatedUri: vscode.Uri;
	sourceContent: string;
	sourceBlocks?: MarkdownBlock[];
	translatedBlocks?: TranslatedMarkdownBlock[];
	renderedContent?: string;
	renderMode?: RenderMode;
	config: MarkdownMirrorTranslatorConfig;
};

export function createInitialSession(input: CreateInitialSessionInput): TranslationSession {
	return {
		sourceUri: input.sourceUri,
		translatedUri: input.translatedUri,
		sourceContent: input.sourceContent,
		sourceBlocks: input.sourceBlocks ?? [],
		translatedBlocks: input.translatedBlocks ?? [],
		renderedContent: input.renderedContent ?? input.sourceContent,
		renderMode: input.renderMode ?? (input.config.bilingual ? 'bilingual' : 'translated'),
		config: input.config,
		updatedAt: Date.now(),
	};
}

export function replaceRenderedContent(session: TranslationSession, renderedContent: string): TranslationSession {
	return {
		...session,
		renderedContent,
		updatedAt: Date.now(),
	};
}
```

- [ ] **Step 4: Update provider content test session creation**

In `src/test/extension.test.ts`, replace the session creation inside `TranslatedDocumentProvider returns session rendered content` with:

```ts
		const sourceBlocks = [
			{
				id: 'block-0',
				kind: 'heading' as const,
				source: '# Hello\n',
				text: 'Hello',
				translatable: true,
				protectedInlines: [],
			},
		];
		const session = createInitialSession({
			sourceUri,
			translatedUri,
			sourceContent: '# Hello\n',
			sourceBlocks,
			translatedBlocks: [{ ...sourceBlocks[0], translatedText: '[zh-CN] Hello' }],
			renderedContent: '# [zh-CN] Hello\n',
			renderMode: 'translated',
			config: getConfig(),
		});
```

Also replace the assertion in the same test with:

```ts
		assert.strictEqual(provider.provideTextDocumentContent(translatedUri), '# [zh-CN] Hello\n');
```

- [ ] **Step 5: Run focused session/provider tests**

Run:

```bash
npm test -- --grep "createInitialSession|TranslatedDocumentProvider returns"
```

Expected: PASS for both matching tests.

### Task 6: Add Explicit Provider Refresh And Throttler

**Files:**
- Modify: `src/document/translatedDocumentProvider.ts`
- Create: `src/refresh/throttledRefresh.ts`
- Create: `src/test/refresh/throttledRefresh.test.ts`

- [ ] **Step 1: Write failing throttled refresh test**

Create `src/test/refresh/throttledRefresh.test.ts`:

```ts
import * as assert from 'assert';
import { createThrottledRefresh } from '../../refresh/throttledRefresh';

suite('Throttled refresh', () => {
	test('coalesces repeated refresh requests', async () => {
		let calls = 0;
		const refresh = createThrottledRefresh(() => {
			calls += 1;
		}, 5);

		refresh.request();
		refresh.request();
		refresh.request();

		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.strictEqual(calls, 1);
	});

	test('flush runs a pending refresh immediately', () => {
		let calls = 0;
		const refresh = createThrottledRefresh(() => {
			calls += 1;
		}, 1000);

		refresh.request();
		refresh.flush();

		assert.strictEqual(calls, 1);
	});
});
```

- [ ] **Step 2: Run test compile to verify refresh module is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript output containing `Cannot find module '../../refresh/throttledRefresh'`.

- [ ] **Step 3: Create throttled refresh helper**

Create `src/refresh/throttledRefresh.ts`:

```ts
export type ThrottledRefresh = {
	request(): void;
	flush(): void;
	dispose(): void;
};

export function createThrottledRefresh(refresh: () => void, delayMs: number): ThrottledRefresh {
	let timer: NodeJS.Timeout | undefined;

	function run(): void {
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}

		refresh();
	}

	return {
		request(): void {
			if (timer) {
				return;
			}

			timer = setTimeout(run, delayMs);
		},
		flush(): void {
			if (!timer) {
				return;
			}

			run();
		},
		dispose(): void {
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
		},
	};
}
```

- [ ] **Step 4: Add explicit provider refresh method**

In `src/document/translatedDocumentProvider.ts`, add this method after `setSession(session: TranslationSession): void { ... }`:

```ts
	refreshSession(translatedUri: vscode.Uri): void {
		this.changeEmitter.fire(translatedUri);
	}
```

Then change `setSession()` to store the session without firing immediately:

```ts
	setSession(session: TranslationSession): void {
		const translatedKey = session.translatedUri.toString();
		this.sessionsByTranslatedUri.set(translatedKey, session);
	}
```

- [ ] **Step 5: Run throttled refresh tests**

Run:

```bash
npm test -- --grep "Throttled refresh"
```

Expected: PASS for all `Throttled refresh` tests.

- [ ] **Step 6: Run provider tests**

Run:

```bash
npm test -- --grep "TranslatedDocumentProvider"
```

Expected: PASS for provider tests because `provideTextDocumentContent()` still reads the stored session.

### Task 7: Wire Local Pipeline Into Translate Command

**Files:**
- Modify: `src/commands/translateCurrentFile.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Update extension integration test expected translated output**

In `src/test/extension.test.ts`, rename the integration test to:

```ts
	test('translate command opens a reused virtual Markdown document with mock translated content', async () => {
```

Within that test, replace both expected document text assertions:

```ts
		assert.strictEqual(firstTranslatedEditor.document.getText(), '# [zh-CN] Hello\n\n[zh-CN] World\n');
```

and:

```ts
		assert.strictEqual(secondTranslatedEditor.document.getText(), '# [zh-CN] Hello\n\n[zh-CN] World\n');
```

- [ ] **Step 2: Run extension test to verify phase 1 echo still fails**

Run:

```bash
npm test -- --grep "mock translated content"
```

Expected: FAIL because the current command still renders source Markdown content.

- [ ] **Step 3: Replace translate command orchestration**

Replace `src/commands/translateCurrentFile.ts` with:

```ts
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { TranslatedDocumentProvider } from '../document/translatedDocumentProvider';
import { parseMarkdownBlocks } from '../markdown/parser';
import { renderMarkdown } from '../markdown/renderer';
import { createThrottledRefresh } from '../refresh/throttledRefresh';
import { createInitialSession } from '../translationSession';
import { MockTranslator } from '../translation/providers/mockTranslator';

const translateCommandId = 'markdown-mirror-translator.translateCurrentFile';
const virtualDocumentRefreshDelayMs = 25;

function isMarkdownDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'markdown' || document.fileName.toLowerCase().endsWith('.md');
}

export async function translateCurrentFile(provider: TranslatedDocumentProvider): Promise<void> {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		vscode.window.showInformationMessage('Open a Markdown file before translating.');
		return;
	}

	const document = editor.document;

	if (!isMarkdownDocument(document)) {
		vscode.window.showInformationMessage('Markdown Mirror Translator only translates Markdown files.');
		return;
	}

	const sourceContent = document.getText();

	if (sourceContent.trim().length === 0) {
		vscode.window.showInformationMessage('The current Markdown file is empty.');
		return;
	}

	const config = getConfig();
	const renderMode = config.bilingual ? 'bilingual' : 'translated';
	const translatedUri = provider.getTranslatedUri(document.uri, config.targetLanguage, config.bilingual);
	const sourceBlocks = parseMarkdownBlocks(sourceContent);
	const translator = new MockTranslator();
	const translatedBlocks = await translator.translateBlocks({
		sourceLanguage: config.sourceLanguage,
		targetLanguage: config.targetLanguage,
		blocks: sourceBlocks,
	});
	const renderedContent = renderMarkdown(translatedBlocks, renderMode);
	const session = createInitialSession({
		sourceUri: document.uri,
		translatedUri,
		sourceContent,
		sourceBlocks,
		translatedBlocks,
		renderedContent,
		renderMode,
		config,
	});
	const refresh = createThrottledRefresh(() => provider.refreshSession(translatedUri), virtualDocumentRefreshDelayMs);

	provider.setSession(session);
	refresh.request();
	refresh.flush();
	refresh.dispose();

	const translatedDocument = await vscode.workspace.openTextDocument(translatedUri);
	await vscode.window.showTextDocument(translatedDocument, {
		viewColumn: vscode.ViewColumn.Beside,
		preview: false,
		preserveFocus: false,
	});

	vscode.window.showInformationMessage('Markdown translation view opened.');
}

export function registerTranslateCurrentFileCommand(
	context: vscode.ExtensionContext,
	provider: TranslatedDocumentProvider,
): void {
	const disposable = vscode.commands.registerCommand(translateCommandId, () => translateCurrentFile(provider));
	context.subscriptions.push(disposable);
}
```

- [ ] **Step 4: Run extension translation test**

Run:

```bash
npm test -- --grep "mock translated content"
```

Expected: PASS and the virtual document content is `# [zh-CN] Hello\n\n[zh-CN] World\n`.

- [ ] **Step 5: Run type check and lint**

Run:

```bash
npm run check-types
npm run lint
```

Expected: both commands exit with code 0.

### Task 8: Cover Bilingual Command Output

**Files:**
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Add integration test for bilingual mode**

Add this test inside `suite('Markdown Mirror Translator shell', ...)`:

```ts
	test('translate command renders bilingual Markdown when setting is enabled', async () => {
		const config = vscode.workspace.getConfiguration('markdownMirrorTranslator');
		await config.update('bilingual', true, vscode.ConfigurationTarget.Global);

		try {
			const sourceDocument = await vscode.workspace.openTextDocument({
				content: '# Hello\n\nWorld\n',
				language: 'markdown',
			});

			await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
			await vscode.commands.executeCommand('markdown-mirror-translator.translateCurrentFile');

			const translatedEditor = vscode.window.activeTextEditor;
			assert.ok(translatedEditor);
			assert.strictEqual(translatedEditor.document.uri.scheme, translatedDocumentScheme);
			assert.strictEqual(
				translatedEditor.document.getText(),
				'# Hello\n\n# [zh-CN] Hello\n\nWorld\n\n[zh-CN] World\n',
			);
		} finally {
			await config.update('bilingual', undefined, vscode.ConfigurationTarget.Global);
		}
	});
```

- [ ] **Step 2: Run bilingual integration test**

Run:

```bash
npm test -- --grep "bilingual Markdown"
```

Expected: PASS and rendered content interleaves source block and translated block.

- [ ] **Step 3: Run full extension tests**

Run:

```bash
npm test
```

Expected: run with escalated permissions; exits with code 0; all extension tests pass.

### Task 9: Final Verification And Review

**Files:**
- Review: all changed files under `src/`
- Review: `docs/superpowers/plans/2026-05-14-local-translation-pipeline-plan.md`
- Do not modify: `docs/basic-design.zh-CN.md`

- [ ] **Step 1: Confirm scope boundary**

Run:

```bash
rg -n "googleFree|google-free|scheduler|cache|retry|overwrite|showSaveDialog|writeFile|provider setting|provider UI" src docs/superpowers/plans/2026-05-14-local-translation-pipeline-plan.md
```

Expected: matches only appear in this plan's non-goals or phase-boundary sections, not in implementation files under `src/`.

- [ ] **Step 2: Confirm basic design doc was not edited**

Run:

```bash
git diff -- docs/basic-design.zh-CN.md
```

Expected: no output.

- [ ] **Step 3: Run type checks**

Run:

```bash
npm run check-types
```

Expected: exits with code 0.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: exits with code 0.

- [ ] **Step 5: Run compile**

Run:

```bash
npm run compile
```

Expected: exits with code 0 and emits `dist/extension.js`.

- [ ] **Step 6: Run full extension tests**

Run:

```bash
npm test
```

Expected: run with escalated permissions; exits with code 0; all tests pass, including parser, renderer, mock translator, throttled refresh, and extension integration tests.

- [ ] **Step 7: Inspect git status**

Run:

```bash
git status --short --branch
```

Expected: changed files are limited to phase 2 implementation and test files, plus previously approved `AGENTS.md` documentation if it has not already been committed.

## Self-Review Checklist

- [ ] **Requirement coverage:** Parser, block model, renderer, session extension, mock translator, translated-only output, bilingual output, throttled virtual document refresh, unit tests, and extension tests are each covered by a task.
- [ ] **Phase boundary:** No production provider, scheduler, long-text splitting, cache, retry policy, save-to-disk behavior, overwrite confirmation, provider setting, or provider UI appears in implementation steps.
- [ ] **Placeholder scan:** Run:

```bash
rg -n 'T[B]D|T[O]DO|implement [l]ater|fill in [d]etails|add [a]ppropriate|handle [e]dge cases|Write tests for the [a]bove|Similar to [T]ask' docs/superpowers/plans/2026-05-14-local-translation-pipeline-plan.md
```

Expected: no matches.

- [ ] **Type consistency:** `MarkdownBlock`, `TranslatedMarkdownBlock`, `RenderMode`, `MarkdownTranslator`, `MockTranslator`, `parseMarkdownBlocks()`, `renderMarkdown()`, `createThrottledRefresh()`, `createInitialSession()`, and `refreshSession()` are named consistently across tasks.
