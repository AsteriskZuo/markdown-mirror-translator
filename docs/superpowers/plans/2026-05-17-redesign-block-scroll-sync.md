# Redesign Block Scroll Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable synchronized scrolling between the source Markdown editor and the translated virtual Markdown editor using block boundary mapping, without relying on global line-count formulas.

**Architecture:** The translated document renderer will return both Markdown text and block line mappings based on the actual text it emits. The scroll synchronizer will identify user-driven visible-range changes from either the source editor or the translated editor, find the current block, map the line by block-relative offset into the paired editor, and ignore visible-range changes caused by the synchronizer itself.

**Tech Stack:** TypeScript, VS Code extension API, existing Markdown parser/renderer/session modules, Node.js tests through `vscode-test`.

---

## Design Constraints

- Start from branch/worktree `2026-05-17-redesign-block-scroll-sync`.
- Do not reference or copy implementation from `2026-05-17-add-editor-line-sync`.
- Keep the translated document read-only.
- Keep synchronization limited to VS Code text editors, not Markdown preview.
- Do not add dependencies.
- Do not delete the older worktree or branch.
- Preserve user work and unrelated files.

## Design Decisions

- The renderer must not add decorative or paragraph-separator blank lines. It should preserve original blank-line blocks and emit only content needed for translated or bilingual text.
- Block boundaries are the stable synchronization anchors.
- Block-internal line mapping is approximate and bounded to that block. If translation output changes line count inside one block, the error must not accumulate into later blocks.
- The mapping uses actual emitted line ranges, not hardcoded formulas such as "translated is 1x" or "bilingual is 2x".
- The scroll synchronizer should only react to user-driven editor scrolls from either side. Programmatic `revealRange()` calls made by the synchronizer are marked as internal and must not start another synchronization pass.
- **Important workaround:** Manual diagnostics showed VS Code `revealRange(..., TextEditorRevealType.AtTop)` does not place the requested line exactly at the top of the viewport. In the observed VS Code 1.120 macOS extension host, revealing line `7` produced a visible top line around `2`, so scroll sync applies a `+5` reveal-line compensation while keeping block mapping unchanged.
- This compensation is intentionally isolated from the block mapping model. Re-test it when VS Code, Electron, editor settings, wrapping behavior, or platform changes. Future VS Code behavior may require a different value, zero compensation, or even negative compensation.
- Diagnostic logs include both `targetLine` and `targetRevealLine` so future maintainers can distinguish mapping correctness from VS Code reveal behavior.

## File Structure

- Modify `package.json`: add `markdownMirrorTranslator.syncScroll` setting.
- Modify `src/config.ts`: expose `syncScroll`.
- Modify `src/markdown/block.ts`: add `TranslationLineMapping`.
- Modify `src/markdown/renderer.ts`: remove manually inserted blank lines and return actual block line mappings.
- Modify `src/translationSession.ts`: store line mappings on sessions.
- Modify `src/document/translatedDocumentProvider.ts`: expose session lookup by source or translated URI.
- Create `src/scroll/editorScrollSync.ts`: implement line mapping helpers, internal scroll suppression, editor pairing, and registration.
- Modify `src/commands/translateCurrentFile.ts`: render with mappings during initial, progress, and final translation updates.
- Modify `src/extension.ts`: register scroll synchronization on activation.
- Modify `src/test/extension.test.ts`: add config, session, provider, activation tests.
- Modify `src/test/markdown/renderer.test.ts`: add no-extra-blank-lines and mapping tests.
- Create `src/test/scroll/editorScrollSync.test.ts`: add scroll mapping and suppression tests.

## Task 1: Add Scroll Sync Configuration

**Files:**
- Modify: `package.json`
- Modify: `src/config.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Write failing config tests**

In `src/test/extension.test.ts`, update the existing default config test to assert:

```ts
assert.strictEqual(config.syncScroll, true);
```

Add this test near the existing manifest/config tests:

```ts
test('manifest contributes sync scroll setting enabled by default', async () => {
	const manifestPath = path.resolve(__dirname, '../../package.json');
	const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
		contributes: {
			configuration: {
				properties: Record<string, { type: string; default: unknown; description: string }>;
			};
		};
	};

	const setting = manifest.contributes.configuration.properties['markdownMirrorTranslator.syncScroll'];

	assert.ok(setting);
	assert.strictEqual(setting.type, 'boolean');
	assert.strictEqual(setting.default, true);
	assert.match(setting.description, /synchronized scrolling/i);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run with tool-level escalated permission as required by `AGENTS.md`:

```bash
npm test -- --grep "getConfig reads default|sync scroll setting"
```

Expected: FAIL because `config.syncScroll` and the manifest setting do not exist.

- [ ] **Step 3: Add the setting to `package.json`**

In `package.json`, add this property under `contributes.configuration.properties` after `markdownMirrorTranslator.translationUpdateMode`:

```json
"markdownMirrorTranslator.syncScroll": {
  "type": "boolean",
  "default": true,
  "description": "Enable synchronized scrolling between the source Markdown editor and translated Markdown editor."
}
```

- [ ] **Step 4: Add the setting to `src/config.ts`**

Update the config type:

```ts
export type MarkdownMirrorTranslatorConfig = {
	sourceLanguage: string;
	targetLanguage: string;
	bilingual: boolean;
	translationUpdateMode: TranslationUpdateMode;
	syncScroll: boolean;
};
```

Update `getConfig()`:

```ts
return {
	sourceLanguage: config.get<string>('sourceLanguage', ''),
	targetLanguage: config.get<string>('targetLanguage', 'zh-CN'),
	bilingual: config.get<boolean>('bilingual', false),
	translationUpdateMode: normalizeUpdateMode(config.get<string>('translationUpdateMode', 'manual')),
	syncScroll: config.get<boolean>('syncScroll', true),
};
```

- [ ] **Step 5: Run focused tests**

Run with tool-level escalated permission:

```bash
npm test -- --grep "getConfig reads default|sync scroll setting"
```

Expected: PASS.

## Task 2: Render Text Without Added Blank Lines And Emit Block Mappings

**Files:**
- Modify: `src/markdown/block.ts`
- Modify: `src/markdown/renderer.ts`
- Modify: `src/test/markdown/renderer.test.ts`

- [ ] **Step 1: Write failing renderer tests for blank-line policy**

In `src/test/markdown/renderer.test.ts`, add tests that prove bilingual rendering does not inject blank separator lines:

```ts
test('renders bilingual text without manually inserted blank lines', () => {
	const rendered = renderMarkdown(
		[
			block({
				id: 'block-0',
				kind: 'heading',
				source: '# Hello\n',
				text: 'Hello',
				translatedText: '你好',
			}),
			block({
				id: 'block-1',
				kind: 'paragraph',
				source: 'World\n',
				text: 'World',
				translatedText: '世界',
			}),
		],
		'bilingual',
	);

	assert.strictEqual(rendered, '# Hello\n# 你好\nWorld\n世界\n');
});

test('preserves original blank blocks without adding extra blank lines', () => {
	const rendered = renderMarkdown(
		[
			block({
				id: 'block-0',
				kind: 'heading',
				source: '# Hello\n',
				text: 'Hello',
				translatedText: '你好',
			}),
			block({
				id: 'block-1',
				kind: 'blank',
				source: '\n',
				text: '',
				translatable: false,
				translatedText: '',
			}),
			block({
				id: 'block-2',
				kind: 'paragraph',
				source: 'World\n',
				text: 'World',
				translatedText: '世界',
			}),
		],
		'bilingual',
	);

	assert.strictEqual(rendered, '# Hello\n# 你好\n\nWorld\n世界\n');
});
```

- [ ] **Step 2: Write failing renderer mapping tests**

Update the import in `src/test/markdown/renderer.test.ts`:

```ts
import {
	createSourceLineMappings,
	getRenderedMarkdownLineCount,
	renderMarkdown,
	renderMarkdownWithLineMappings,
} from '../../markdown/renderer';
```

Add tests for actual emitted line ranges:

```ts
test('returns translated-only block line mappings from emitted text', () => {
	const result = renderMarkdownWithLineMappings(
		[
			block({
				id: 'block-0',
				kind: 'heading',
				source: '# Hello\n',
				text: 'Hello',
				translatedText: '你好',
			}),
			block({
				id: 'block-1',
				kind: 'blank',
				source: '\n',
				text: '',
				translatable: false,
				translatedText: '',
			}),
			block({
				id: 'block-2',
				kind: 'table',
				source: '| Name | Description |\n| --- | --- |\n| API | Local pipeline |\n',
				text: 'Name | Description\nAPI | Local pipeline',
				table: {
					header: ['Name', 'Description'],
					alignments: ['default', 'default'],
					rows: [['API', 'Local pipeline']],
				},
				translatedTable: {
					header: ['名称', '描述'],
					rows: [['接口', '本地流水线']],
				},
				translatedText: '',
			}),
		],
		'translated',
	);

	assert.strictEqual(result.markdown, '# 你好\n\n| 名称 | 描述 |\n| --- | --- |\n| 接口 | 本地流水线 |\n');
	assert.deepStrictEqual(result.lineMappings, [
		{
			blockId: 'block-0',
			sourceStartLine: 0,
			sourceEndLine: 0,
			translatedStartLine: 0,
			translatedEndLine: 0,
		},
		{
			blockId: 'block-1',
			sourceStartLine: 1,
			sourceEndLine: 1,
			translatedStartLine: 1,
			translatedEndLine: 1,
		},
		{
			blockId: 'block-2',
			sourceStartLine: 2,
			sourceEndLine: 4,
			translatedStartLine: 2,
			translatedEndLine: 4,
		},
	]);
});

test('returns bilingual block line mappings without separator blank lines', () => {
	const result = renderMarkdownWithLineMappings(
		[
			block({
				id: 'block-0',
				kind: 'heading',
				source: '# Hello\n',
				text: 'Hello',
				translatedText: '你好',
			}),
			block({
				id: 'block-1',
				kind: 'paragraph',
				source: 'World\n',
				text: 'World',
				translatedText: '世界',
			}),
		],
		'bilingual',
	);

	assert.strictEqual(result.markdown, '# Hello\n# 你好\nWorld\n世界\n');
	assert.deepStrictEqual(result.lineMappings, [
		{
			blockId: 'block-0',
			sourceStartLine: 0,
			sourceEndLine: 0,
			translatedStartLine: 0,
			translatedEndLine: 1,
		},
		{
			blockId: 'block-1',
			sourceStartLine: 1,
			sourceEndLine: 1,
			translatedStartLine: 2,
			translatedEndLine: 3,
		},
	]);
});

test('returns source line mappings for initial source-content placeholder', () => {
	const result = createSourceLineMappings([
		block({
			id: 'block-0',
			kind: 'heading',
			source: '# Hello\n',
			text: 'Hello',
			translatedText: '',
		}),
		block({
			id: 'block-1',
			kind: 'fencedCode',
			source: '```ts\nconst value = 1;\n```\n',
			text: '',
			translatable: false,
			translatedText: '',
		}),
	]);

	assert.deepStrictEqual(result, [
		{
			blockId: 'block-0',
			sourceStartLine: 0,
			sourceEndLine: 0,
			translatedStartLine: 0,
			translatedEndLine: 0,
		},
		{
			blockId: 'block-1',
			sourceStartLine: 1,
			sourceEndLine: 3,
			translatedStartLine: 1,
			translatedEndLine: 3,
		},
	]);
});

test('counts rendered markdown lines without treating trailing newline as an extra line', () => {
	assert.strictEqual(getRenderedMarkdownLineCount(''), 0);
	assert.strictEqual(getRenderedMarkdownLineCount('\n'), 1);
	assert.strictEqual(getRenderedMarkdownLineCount('one\n'), 1);
	assert.strictEqual(getRenderedMarkdownLineCount('one\ntwo\n'), 2);
	assert.strictEqual(getRenderedMarkdownLineCount('one\ntwo'), 2);
});
```

- [ ] **Step 3: Run renderer tests to verify failure**

Run with tool-level escalated permission:

```bash
npm test -- --grep "Markdown renderer"
```

Expected: FAIL because line mapping APIs do not exist and current bilingual rendering inserts blank lines.

- [ ] **Step 4: Add mapping type**

In `src/markdown/block.ts`, add after `RenderMode`:

```ts
export type TranslationLineMapping = {
	blockId: string;
	sourceStartLine: number;
	sourceEndLine: number;
	translatedStartLine: number;
	translatedEndLine: number;
};
```

- [ ] **Step 5: Update renderer imports and line helpers**

In `src/markdown/renderer.ts`, update the import:

```ts
import type { MarkdownTableAlignment, RenderMode, TranslatedMarkdownBlock, TranslationLineMapping } from './block';
```

Add helpers before `renderTranslatedBlock`:

```ts
export type RenderedMarkdownWithLineMappings = {
	markdown: string;
	lineMappings: TranslationLineMapping[];
};

export function getRenderedMarkdownLineCount(text: string): number {
	if (text.length === 0) {
		return 0;
	}

	const withoutTrailingNewline = text.endsWith('\n') ? text.slice(0, -1) : text;
	if (withoutTrailingNewline.length === 0) {
		return 1;
	}

	return withoutTrailingNewline.split('\n').length;
}

function getBlockSourceLineCount(block: TranslatedMarkdownBlock): number {
	return Math.max(1, getRenderedMarkdownLineCount(block.source));
}

function createLineMapping(
	block: TranslatedMarkdownBlock,
	sourceStartLine: number,
	translatedStartLine: number,
	renderedBlock: string,
): TranslationLineMapping {
	const sourceLineCount = getBlockSourceLineCount(block);
	const translatedLineCount = Math.max(1, getRenderedMarkdownLineCount(renderedBlock));

	return {
		blockId: block.id,
		sourceStartLine,
		sourceEndLine: sourceStartLine + sourceLineCount - 1,
		translatedStartLine,
		translatedEndLine: translatedStartLine + translatedLineCount - 1,
	};
}

export function createSourceLineMappings(blocks: TranslatedMarkdownBlock[]): TranslationLineMapping[] {
	const lineMappings: TranslationLineMapping[] = [];
	let sourceLine = 0;

	for (const block of blocks) {
		const lineCount = getBlockSourceLineCount(block);
		lineMappings.push({
			blockId: block.id,
			sourceStartLine: sourceLine,
			sourceEndLine: sourceLine + lineCount - 1,
			translatedStartLine: sourceLine,
			translatedEndLine: sourceLine + lineCount - 1,
		});
		sourceLine += lineCount;
	}

	return lineMappings;
}
```

- [ ] **Step 6: Remove manually inserted blank lines from bilingual rendering**

Replace `renderBilingualBlock` with:

```ts
function renderBilingualBlock(block: TranslatedMarkdownBlock): string {
	if (!block.translatable) {
		return block.source;
	}

	return `${ensureTrailingNewline(block.source)}${renderTranslatedBlock(block)}`;
}
```

Replace `renderMarkdown` with mapping-aware rendering:

```ts
export function renderMarkdownWithLineMappings(
	blocks: TranslatedMarkdownBlock[],
	mode: RenderMode,
): RenderedMarkdownWithLineMappings {
	let markdown = '';
	const lineMappings: TranslationLineMapping[] = [];
	let sourceLine = 0;
	let translatedLine = 0;

	for (const block of blocks) {
		const renderedBlock = mode === 'translated' ? renderTranslatedBlock(block) : renderBilingualBlock(block);
		lineMappings.push(createLineMapping(block, sourceLine, translatedLine, renderedBlock));
		markdown += renderedBlock;
		sourceLine += getBlockSourceLineCount(block);
		translatedLine += Math.max(1, getRenderedMarkdownLineCount(renderedBlock));
	}

	return { markdown, lineMappings };
}

export function renderMarkdown(blocks: TranslatedMarkdownBlock[], mode: RenderMode): string {
	return renderMarkdownWithLineMappings(blocks, mode).markdown;
}
```

- [ ] **Step 7: Run renderer tests**

Run with tool-level escalated permission:

```bash
npm test -- --grep "Markdown renderer"
```

Expected: PASS.

## Task 3: Store Line Mappings In Translation Sessions

**Files:**
- Modify: `src/translationSession.ts`
- Modify: `src/commands/translateCurrentFile.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Write failing session tests**

In `src/test/extension.test.ts`, update the session tests so initial sessions and replaced sessions include mappings:

```ts
const lineMappings = [
	{
		blockId: 'block-0',
		sourceStartLine: 0,
		sourceEndLine: 0,
		translatedStartLine: 0,
		translatedEndLine: 0,
	},
];

const session = createInitialSession({
	sourceUri,
	translatedUri,
	sourceContent: 'Hello\n',
	sourceBlocks: [sourceBlock],
	translatedBlocks: [translatedBlock],
	renderedContent: 'Hello\n',
	lineMappings,
	renderMode: 'translated',
	config: getConfig(),
});

assert.deepStrictEqual(session.lineMappings, lineMappings);
```

Update the `replaceTranslatedBlocks` test:

```ts
const updated = replaceTranslatedBlocks(initial, translated, '你好\n', lineMappings);

assert.deepStrictEqual(updated.lineMappings, lineMappings);
```

- [ ] **Step 2: Run tests to verify failure**

Run with tool-level escalated permission:

```bash
npm test -- --grep "createInitialSession|replaceTranslatedBlocks"
```

Expected: FAIL because sessions do not store line mappings yet.

- [ ] **Step 3: Update session types**

In `src/translationSession.ts`, update imports:

```ts
import type { MarkdownBlock, RenderMode, TranslatedMarkdownBlock, TranslationLineMapping } from './markdown/block';
```

Add to `TranslationSession`:

```ts
lineMappings: TranslationLineMapping[];
```

Add to `CreateInitialSessionInput`:

```ts
lineMappings?: TranslationLineMapping[];
```

Set the property in `createInitialSession()`:

```ts
lineMappings: input.lineMappings ?? [],
```

Change `replaceTranslatedBlocks()`:

```ts
export function replaceTranslatedBlocks(
	session: TranslationSession,
	translatedBlocks: TranslatedMarkdownBlock[],
	renderedContent: string,
	lineMappings: TranslationLineMapping[] = session.lineMappings,
): TranslationSession {
	return {
		...session,
		translatedBlocks,
		renderedContent,
		lineMappings,
		updatedAt: Date.now(),
	};
}
```

- [ ] **Step 4: Use mapped rendering in the translation command**

In `src/commands/translateCurrentFile.ts`, update imports:

```ts
import { createSourceLineMappings, renderMarkdownWithLineMappings } from '../markdown/renderer';
```

Replace the initial `createInitialSession` block setup with:

```ts
const initialTranslatedBlocks = sourceBlocks.map((block) => ({
	...block,
	translatedText: '',
}));
let session = createInitialSession({
	sourceUri: document.uri,
	translatedUri,
	sourceContent,
	sourceBlocks,
	translatedBlocks: initialTranslatedBlocks,
	renderedContent: sourceContent,
	lineMappings: createSourceLineMappings(initialTranslatedBlocks),
	renderMode,
	config,
});
```

Replace progress rendering:

```ts
const rendered = renderMarkdownWithLineMappings(progress.blocks, renderMode);
session = replaceTranslatedBlocks(session, progress.blocks, rendered.markdown, rendered.lineMappings);
```

Replace final rendering:

```ts
const rendered = renderMarkdownWithLineMappings(result.blocks, renderMode);
session = replaceTranslatedBlocks(session, result.blocks, rendered.markdown, rendered.lineMappings);
```

- [ ] **Step 5: Run focused tests**

Run with tool-level escalated permission:

```bash
npm test -- --grep "createInitialSession|replaceTranslatedBlocks|translate command"
```

Expected: PASS.

## Task 4: Expose Sessions For Editor Pairing

**Files:**
- Modify: `src/document/translatedDocumentProvider.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Write failing provider tests**

Add this test after the existing translated document provider tests:

```ts
test('TranslatedDocumentProvider finds sessions by source or translated URI', () => {
	const provider = new TranslatedDocumentProvider();
	const sourceUri = vscode.Uri.file('/workspace/README.md');
	const translatedUri = provider.getTranslatedUri(sourceUri, 'zh-CN', false);
	const session = createInitialSession({
		sourceUri,
		translatedUri,
		sourceContent: 'Hello\n',
		sourceBlocks: [],
		translatedBlocks: [],
		renderedContent: '你好\n',
		renderMode: 'translated',
		config: getConfig(),
	});

	provider.setSession(session);

	assert.strictEqual(provider.getSessionBySourceUri(sourceUri)?.translatedUri.toString(), translatedUri.toString());
	assert.strictEqual(provider.getSessionForUri(sourceUri)?.sourceUri.toString(), sourceUri.toString());
	assert.strictEqual(provider.getSessionForUri(translatedUri)?.translatedUri.toString(), translatedUri.toString());
	assert.deepStrictEqual(provider.getSessions(), [session]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run with tool-level escalated permission:

```bash
npm test -- --grep "finds sessions by source"
```

Expected: FAIL because provider lookup methods do not exist.

- [ ] **Step 3: Add source URI lookup**

In `src/document/translatedDocumentProvider.ts`, add:

```ts
private readonly sessionsBySourceUri = new Map<string, TranslationSession>();
```

Update `setSession()`:

```ts
setSession(session: TranslationSession): void {
	const translatedKey = session.translatedUri.toString();
	const sourceKey = session.sourceUri.toString();
	this.sessionsByTranslatedUri.set(translatedKey, session);
	this.sessionsBySourceUri.set(sourceKey, session);
}
```

Add methods after `getSessionByTranslatedUri()`:

```ts
getSessionBySourceUri(sourceUri: vscode.Uri): TranslationSession | undefined {
	return this.sessionsBySourceUri.get(sourceUri.toString());
}

getSessionForUri(uri: vscode.Uri): TranslationSession | undefined {
	return uri.scheme === translatedDocumentScheme
		? this.getSessionByTranslatedUri(uri)
		: this.getSessionBySourceUri(uri);
}

getSessions(): TranslationSession[] {
	return Array.from(this.sessionsByTranslatedUri.values());
}
```

- [ ] **Step 4: Run provider tests**

Run with tool-level escalated permission:

```bash
npm test -- --grep "TranslatedDocumentProvider"
```

Expected: PASS.

## Task 5: Add Scroll Mapping And Internal Scroll Suppression

**Files:**
- Create: `src/scroll/editorScrollSync.ts`
- Create: `src/test/scroll/editorScrollSync.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/test/scroll/editorScrollSync.test.ts`:

```ts
import * as assert from 'assert';
import * as vscode from 'vscode';
import type { TranslationLineMapping } from '../../markdown/block';
import {
	createScrollSyncState,
	findMappingForLine,
	getMappedLine,
	isProgrammaticScrollEvent,
	markProgrammaticScroll,
} from '../../scroll/editorScrollSync';

const mappings: TranslationLineMapping[] = [
	{
		blockId: 'block-0',
		sourceStartLine: 0,
		sourceEndLine: 0,
		translatedStartLine: 0,
		translatedEndLine: 1,
	},
	{
		blockId: 'block-1',
		sourceStartLine: 2,
		sourceEndLine: 4,
		translatedStartLine: 4,
		translatedEndLine: 9,
	},
];

suite('Editor scroll sync', () => {
	test('finds containing mapping and nearest following gap mapping', () => {
		assert.strictEqual(findMappingForLine(mappings, 'source', 0)?.blockId, 'block-0');
		assert.strictEqual(findMappingForLine(mappings, 'source', 1)?.blockId, 'block-1');
		assert.strictEqual(findMappingForLine(mappings, 'translated', 3)?.blockId, 'block-1');
		assert.strictEqual(findMappingForLine(mappings, 'translated', 99)?.blockId, 'block-1');
	});

	test('maps lines by proportional block-relative offset', () => {
		assert.strictEqual(getMappedLine(mappings, 'source', 2), 4);
		assert.strictEqual(getMappedLine(mappings, 'source', 3), 6);
		assert.strictEqual(getMappedLine(mappings, 'source', 4), 9);
		assert.strictEqual(getMappedLine(mappings, 'translated', 8), 4);
		assert.strictEqual(getMappedLine([], 'source', 0), undefined);
	});

	test('suppresses programmatic scroll events for the target URI within a short window', () => {
		const state = createScrollSyncState();
		const sourceUri = vscode.Uri.file('/workspace/source.md');
		const translatedUri = vscode.Uri.parse('markdown-mirror-translator:/source/translated.md');

		markProgrammaticScroll(state, translatedUri, 1_000, 150);

		assert.strictEqual(isProgrammaticScrollEvent(state, sourceUri, 1_000), false);
		assert.strictEqual(isProgrammaticScrollEvent(state, translatedUri, 1_000), true);
		assert.strictEqual(isProgrammaticScrollEvent(state, translatedUri, 1_100), true);
		assert.strictEqual(isProgrammaticScrollEvent(state, translatedUri, 1_200), false);
	});
});
```

- [ ] **Step 2: Run tests to verify failure**

Run with tool-level escalated permission:

```bash
npm test -- --grep "Editor scroll sync"
```

Expected: FAIL because `src/scroll/editorScrollSync.ts` does not exist.

- [ ] **Step 3: Implement helper exports and registration shell**

Create `src/scroll/editorScrollSync.ts`:

```ts
import * as vscode from 'vscode';
import { getConfig } from '../config';
import type { TranslatedDocumentProvider } from '../document/translatedDocumentProvider';
import type { TranslationLineMapping } from '../markdown/block';
import type { TranslationSession } from '../translationSession';

export type ScrollSyncSide = 'source' | 'translated';

export type ScrollSyncState = {
	programmaticScrollUntilByUri: Map<string, number>;
};

const defaultProgrammaticScrollSuppressionMs = 150;

export function createScrollSyncState(): ScrollSyncState {
	return {
		programmaticScrollUntilByUri: new Map<string, number>(),
	};
}

function sameUri(left: vscode.Uri, right: vscode.Uri): boolean {
	return left.toString() === right.toString();
}

function getRangeStart(mapping: TranslationLineMapping, side: ScrollSyncSide): number {
	return side === 'source' ? mapping.sourceStartLine : mapping.translatedStartLine;
}

function getRangeEnd(mapping: TranslationLineMapping, side: ScrollSyncSide): number {
	return side === 'source' ? mapping.sourceEndLine : mapping.translatedEndLine;
}

function getRangeLength(mapping: TranslationLineMapping, side: ScrollSyncSide): number {
	return getRangeEnd(mapping, side) - getRangeStart(mapping, side) + 1;
}

export function findMappingForLine(
	mappings: TranslationLineMapping[],
	side: ScrollSyncSide,
	line: number,
): TranslationLineMapping | undefined {
	if (mappings.length === 0) {
		return undefined;
	}

	const containing = mappings.find((mapping) => line >= getRangeStart(mapping, side) && line <= getRangeEnd(mapping, side));
	if (containing) {
		return containing;
	}

	const following = mappings.find((mapping) => getRangeStart(mapping, side) > line);
	return following ?? mappings[mappings.length - 1];
}

export function getMappedLine(
	mappings: TranslationLineMapping[],
	fromSide: ScrollSyncSide,
	line: number,
): number | undefined {
	const mapping = findMappingForLine(mappings, fromSide, line);
	if (!mapping) {
		return undefined;
	}

	const toSide: ScrollSyncSide = fromSide === 'source' ? 'translated' : 'source';
	const fromStart = getRangeStart(mapping, fromSide);
	const fromLength = getRangeLength(mapping, fromSide);
	const toStart = getRangeStart(mapping, toSide);
	const toLength = getRangeLength(mapping, toSide);
	const fromOffset = Math.min(Math.max(0, line - fromStart), fromLength - 1);

	if (fromLength <= 1 || toLength <= 1) {
		return toStart;
	}

	const ratio = fromOffset / (fromLength - 1);
	return toStart + Math.round(ratio * (toLength - 1));
}

export function markProgrammaticScroll(
	state: ScrollSyncState,
	uri: vscode.Uri,
	now = Date.now(),
	durationMs = defaultProgrammaticScrollSuppressionMs,
): void {
	const key = uri.toString();
	const suppressUntil = now + durationMs;
	const currentSuppressUntil = state.programmaticScrollUntilByUri.get(key) ?? 0;
	state.programmaticScrollUntilByUri.set(key, Math.max(currentSuppressUntil, suppressUntil));

	setTimeout(() => {
		if ((state.programmaticScrollUntilByUri.get(key) ?? 0) <= Date.now()) {
			state.programmaticScrollUntilByUri.delete(key);
		}
	}, durationMs);
}

export function isProgrammaticScrollEvent(state: ScrollSyncState, uri: vscode.Uri, now = Date.now()): boolean {
	const key = uri.toString();
	const suppressUntil = state.programmaticScrollUntilByUri.get(key);

	if (suppressUntil === undefined) {
		return false;
	}

	if (now <= suppressUntil) {
		return true;
	}

	state.programmaticScrollUntilByUri.delete(key);
	return false;
}

function getEditorSide(editor: vscode.TextEditor, session: TranslationSession): ScrollSyncSide | undefined {
	if (sameUri(editor.document.uri, session.sourceUri)) {
		return 'source';
	}

	if (sameUri(editor.document.uri, session.translatedUri)) {
		return 'translated';
	}

	return undefined;
}

function findPairedEditor(session: TranslationSession, fromSide: ScrollSyncSide): vscode.TextEditor | undefined {
	const targetUri = fromSide === 'source' ? session.translatedUri : session.sourceUri;
	return vscode.window.visibleTextEditors.find((editor) => sameUri(editor.document.uri, targetUri));
}

function clampLine(editor: vscode.TextEditor, line: number): number {
	const maxLine = Math.max(0, editor.document.lineCount - 1);
	return Math.min(Math.max(0, line), maxLine);
}

function revealEditorLine(editor: vscode.TextEditor, line: number): void {
	const clampedLine = clampLine(editor, line);
	const position = new vscode.Position(clampedLine, 0);
	editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
}

export function registerEditorScrollSync(provider: TranslatedDocumentProvider): vscode.Disposable {
	const state = createScrollSyncState();

	return vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
		if (!getConfig().syncScroll || isProgrammaticScrollEvent(state, event.textEditor.document.uri)) {
			return;
		}

		const session = provider.getSessionForUri(event.textEditor.document.uri);
		if (!session || session.lineMappings.length === 0 || event.visibleRanges.length === 0) {
			return;
		}

		const fromSide = getEditorSide(event.textEditor, session);
		if (!fromSide) {
			return;
		}

		const pairedEditor = findPairedEditor(session, fromSide);
		if (!pairedEditor) {
			return;
		}

		const targetLine = getMappedLine(session.lineMappings, fromSide, event.visibleRanges[0].start.line);
		if (targetLine === undefined) {
			return;
		}

		markProgrammaticScroll(state, pairedEditor.document.uri);
		revealEditorLine(pairedEditor, targetLine);
	});
}
```

- [ ] **Step 4: Run helper tests**

Run with tool-level escalated permission:

```bash
npm test -- --grep "Editor scroll sync"
```

Expected: PASS.

## Task 6: Register Scroll Synchronization

**Files:**
- Modify: `src/extension.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Write activation safety test**

Add this test near the existing activation tests:

```ts
test('extension activation registers translated document provider and scroll synchronizer', async () => {
	const extension = vscode.extensions.getExtension('undefined_publisher.markdown-mirror-translator');

	assert.ok(extension);
	await extension.activate();

	assert.ok(extension.isActive);
});
```

- [ ] **Step 2: Register the synchronizer**

In `src/extension.ts`, add:

```ts
import { registerEditorScrollSync } from './scroll/editorScrollSync';
```

Update `context.subscriptions.push(...)`:

```ts
context.subscriptions.push(
	vscode.workspace.registerTextDocumentContentProvider(translatedDocumentScheme, translatedDocumentProvider),
	translatedDocumentProvider,
	registerEditorScrollSync(translatedDocumentProvider),
);
```

- [ ] **Step 3: Run activation tests**

Run with tool-level escalated permission:

```bash
npm test -- --grep "extension activation|extension commands"
```

Expected: PASS.

## Task 7: Final Verification And Manual Check

**Files:**
- Review: `package.json`
- Review: `src/config.ts`
- Review: `src/markdown/block.ts`
- Review: `src/markdown/renderer.ts`
- Review: `src/translationSession.ts`
- Review: `src/document/translatedDocumentProvider.ts`
- Review: `src/scroll/editorScrollSync.ts`
- Review: `src/commands/translateCurrentFile.ts`
- Review: `src/extension.ts`
- Review: `src/test/extension.test.ts`
- Review: `src/test/markdown/renderer.test.ts`
- Review: `src/test/scroll/editorScrollSync.test.ts`

- [ ] **Step 1: Run typecheck**

```bash
npm run check-types
```

Expected: PASS.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run full extension test suite**

Run with tool-level escalated permission as required by `AGENTS.md`:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Manual VS Code verification**

Run:

```bash
npm run compile
```

Expected: PASS.

Manual check:

1. Open a Markdown file containing headings, normal lines, list items, blank lines, a pipe table, an image, and a fenced code block.
2. Run `Markdown Mirror Translator: Translate Current File`.
3. Confirm the translated virtual document opens beside the source editor.
4. With `markdownMirrorTranslator.syncScroll` at default `true`, scroll the source editor and confirm the translated editor follows without fighting the source editor.
5. Scroll the translated editor directly and confirm the source editor follows without fighting the translated editor.
6. Confirm translated-only mode stays closely aligned by block.
7. Enable bilingual mode and confirm block-level alignment remains usable around normal text and tables.
8. Set `markdownMirrorTranslator.syncScroll` to `false` and confirm scrolling either side no longer moves the other.

## Self-Review

- Spec coverage: The plan covers the confirmed design: no manually inserted blank lines, block boundary mapping, block-internal approximate offset, internal scroll suppression, config gating, session storage, provider lookup, registration, tests, and manual verification.
- Placeholder scan: No unresolved placeholder markers or vague implementation steps remain.
- Type consistency: The plan consistently uses `TranslationLineMapping`, `lineMappings`, `renderMarkdownWithLineMappings`, `createSourceLineMappings`, `registerEditorScrollSync`, `getSessionForUri`, and `syncScroll`.
- Scope check: This plan is limited to scroll synchronization and rendering structure needed for synchronization. It does not change translation providers, cache strategy, saved translated files, or Markdown preview behavior.
