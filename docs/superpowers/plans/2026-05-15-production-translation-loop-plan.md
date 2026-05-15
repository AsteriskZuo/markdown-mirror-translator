# Production Translation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the MVP production loop by replacing the mock command path with the default `google-free` provider, scheduler, cache, failure isolation, and save-to-disk workflow.

**Architecture:** Keep the existing parser, renderer, virtual document provider, and command IDs. Add block metadata needed for cache keys, introduce a single-text provider contract, route translation through a scheduler that applies cache lookup, max-length splitting, concurrency control, and per-block failure state, then save rendered Markdown through the existing save command.

**Tech Stack:** TypeScript strict mode, VS Code Extension API, Node built-ins, built-in `fetch`, Mocha through `@vscode/test-cli`, existing ESLint and esbuild setup.

---

## Goal

Phase 3 turns the phase 2 local pipeline into the production MVP:

- Use `google-free` as the default internal translation provider.
- Preserve the existing right-side read-only virtual Markdown document.
- Open the right-side document immediately with source Markdown as the placeholder.
- Translate block-by-block through a scheduler with bounded concurrency.
- Split provider requests that exceed the provider maximum text length.
- Cache successful block translations by provider, languages, parser version, and block hash.
- Keep failed blocks as source Markdown in the rendered output.
- Show a final success or partial-failure message.
- Save the current translated result into the source file directory.
- Prompt before overwriting an existing translated file.

## Context

Phase 2 currently provides these modules:

- `src/markdown/parser.ts` parses Markdown into `MarkdownBlock[]`.
- `src/markdown/renderer.ts` renders translated-only or bilingual Markdown.
- `src/translation/providers/mockTranslator.ts` provides deterministic local translations.
- `src/translationSession.ts` stores source blocks, translated blocks, rendered content, render mode, and config.
- `src/commands/translateCurrentFile.ts` runs the phase 2 mock translator before opening the virtual document.
- `src/commands/saveTranslatedFile.ts` still displays a phase placeholder message.

## Non-Goals

- No provider setting or provider switching UI.
- No official Google Cloud Translation API.
- No API key or OAuth support.
- No AI translation.
- No webview or Markdown preview.
- No scroll sync, selection translation, batch translation, glossary, or automatic source watching.
- No changes to `docs/basic-design.zh-CN.md`.
- No npm dependencies.

## Constraints

- Preserve command IDs:
  - `markdown-mirror-translator.translateCurrentFile`
  - `markdown-mirror-translator.saveTranslatedFile`
- Preserve settings keys:
  - `markdownMirrorTranslator.sourceLanguage`
  - `markdownMirrorTranslator.targetLanguage`
  - `markdownMirrorTranslator.bilingual`
  - `markdownMirrorTranslator.translationUpdateMode`
- Treat `translationUpdateMode: "auto"` as manual.
- Keep the translated virtual document scheme as `markdown-mirror-translator`.
- Use the existing `TextDocumentContentProvider`.
- Use built-in `fetch`; do not add a Google translation npm package.
- `npm test` must be run with escalated permissions because `vscode-test` may need network access and VS Code/Electron startup.

## Affected Files And Modules

- Modify: `src/markdown/block.ts`
  - Add block state and hash fields required by scheduling and cache.
- Modify: `src/markdown/parser.ts`
  - Export `PARSER_VERSION` and compute deterministic block hashes.
- Modify: `src/markdown/renderer.ts`
  - Render failed translatable blocks as their original source block.
- Modify: `src/translation/types.ts`
  - Replace the phase 2 block translator contract with a provider contract and scheduler result types.
- Modify: `src/translation/providers/mockTranslator.ts`
  - Keep this file as a single-text `TranslatorProvider` for scheduler tests.
- Create: `src/translation/providers/googleFreeTranslator.ts`
  - Adapt `https://translate.googleapis.com/translate_a/single` behind the provider interface.
- Create: `src/cache/translationCache.ts`
  - Implement in-memory plus `globalState` backed translation cache with TTL and max-entry trimming.
- Create: `src/translation/scheduler.ts`
  - Translate blocks using cache, provider max text length, concurrency limit, and failure isolation.
- Modify: `src/translationSession.ts`
  - Add a helper for replacing translated blocks and rendered content together.
- Modify: `package.json`
  - Hide the translate editor-title action on translated virtual documents.
- Modify: `src/commands/translateCurrentFile.ts`
  - Correct translated-document retranslation behavior, then wire production provider, scheduler, cache, progressive refresh, document-size messages, and final status.
- Modify: `src/commands/saveTranslatedFile.ts`
  - Save rendered Markdown to the source directory with target-language naming and overwrite confirmation.
- Modify: `src/test/markdown/parser.test.ts`
  - Cover parser version, block hash, and initial state.
- Modify: `src/test/markdown/renderer.test.ts`
  - Cover failed block fallback rendering.
- Modify: `src/test/translation/mockTranslator.test.ts`
  - Update to the single-text provider contract.
- Create: `src/test/cache/translationCache.test.ts`
  - Cover cache keys, hits, expiry, and trimming.
- Create: `src/test/translation/googleFreeTranslator.test.ts`
  - Cover request construction, response parsing, and error parsing with injected fetch.
- Create: `src/test/translation/scheduler.test.ts`
  - Cover cache hits, split requests, concurrency, and block failures.
- Modify: `src/test/extension.test.ts`
  - Cover save behavior and keep command workflow checks compatible with production command wiring.

## Verification Method

Run after each task that changes TypeScript:

```bash
npm run compile-tests
```

Expected: exits with code 0.

```bash
npm run check-types
```

Expected: exits with code 0.

Run after lint-sensitive edits:

```bash
npm run lint
```

Expected: exits with code 0.

Run at the end:

```bash
npm run compile
```

Expected: exits with code 0 and emits `dist/extension.js`.

```bash
npm test
```

Expected: run with escalated permissions; exits with code 0.

## Open Questions

- The non-official Google endpoint can change without notice. This plan treats endpoint failures as per-block failures and keeps the source block visible.
- The production command will call the network by default. Tests must inject fake providers or fake fetch functions so the test suite remains deterministic.
- The parser currently marks table separator rows as translatable. This plan does not correct that in Phase 3 because it is outside the production loop, but failed or untranslated separator rows remain valid Markdown because renderer fallback preserves source.
- Phase 1/2 allow the translate command to run while the active editor is a translated virtual document. This plan corrects that edge case by excluding the virtual scheme from the translate menu and command validation.

## Tasks

### Task 1: Add Block Metadata For Production State

**Files:**
- Modify: `src/markdown/block.ts`
- Modify: `src/markdown/parser.ts`
- Modify: `src/test/markdown/parser.test.ts`
- Modify: `src/test/markdown/renderer.test.ts`
- Modify: `src/test/extension.test.ts`
- Modify: `src/test/translation/mockTranslator.test.ts`

- [ ] **Step 1: Write failing parser metadata test**

Add this test to `src/test/markdown/parser.test.ts`:

```ts
test('adds parser version, hash, and initial state metadata', () => {
	const blocks = parseMarkdownBlocks('# Hello\n\n```ts\nconst value = 1;\n```\n');

	assert.strictEqual(typeof blocks[0].hash, 'string');
	assert.strictEqual(blocks[0].hash.length, 64);
	assert.strictEqual(blocks[0].state, 'pending');
	assert.strictEqual(blocks[2].state, 'skipped');

	const repeated = parseMarkdownBlocks('# Hello\n\n```ts\nconst value = 1;\n```\n');
	assert.strictEqual(blocks[0].hash, repeated[0].hash);
	assert.strictEqual(blocks[2].hash, repeated[2].hash);
});
```

- [ ] **Step 2: Run test compile to verify metadata is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript output containing `Property 'hash' does not exist on type 'MarkdownBlock'`.

- [ ] **Step 3: Replace block model types**

Replace `src/markdown/block.ts` with:

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

export type MarkdownBlockState = 'pending' | 'translating' | 'translated' | 'failed' | 'skipped';

export type ProtectedInlineToken = {
	token: string;
	value: string;
};

export type MarkdownBlock = {
	id: string;
	kind: MarkdownBlockKind;
	source: string;
	text: string;
	hash: string;
	translatable: boolean;
	state: MarkdownBlockState;
	protectedInlines: ProtectedInlineToken[];
};

export type TranslatedMarkdownBlock = MarkdownBlock & {
	translatedText: string;
	errorMessage?: string;
};

export type RenderMode = 'translated' | 'bilingual';
```

- [ ] **Step 4: Update parser to compute metadata**

In `src/markdown/parser.ts`, add the crypto import and parser version:

```ts
import * as crypto from 'crypto';
import type { MarkdownBlock, MarkdownBlockKind, ProtectedInlineToken } from './block';

export const PARSER_VERSION = 'markdown-mirror-translator-parser-v1';
```

Replace `createBlock()` with:

```ts
function hashBlock(kind: MarkdownBlockKind, text: string, source: string, protectedInlines: ProtectedInlineToken[]): string {
	const canonical = JSON.stringify({
		parserVersion: PARSER_VERSION,
		kind,
		text,
		source,
		protectedInlines,
	});
	return crypto.createHash('sha256').update(canonical).digest('hex');
}

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
		hash: hashBlock(kind, text, source, protectedInlines),
		translatable,
		state: translatable ? 'pending' : 'skipped',
		protectedInlines,
	};
}
```

Keep the rest of the parser flow unchanged.

- [ ] **Step 5: Update test helpers that construct blocks manually**

In `src/test/markdown/renderer.test.ts`, update the `block()` helper return object:

```ts
return {
	id: input.id ?? 'block-0',
	kind: input.kind ?? 'paragraph',
	source: input.source,
	text: input.text ?? input.source.trim(),
	hash: input.hash ?? 'hash-0',
	translatable: input.translatable ?? true,
	state: input.state ?? 'translated',
	protectedInlines: input.protectedInlines ?? [],
	translatedText: input.translatedText,
	errorMessage: input.errorMessage,
};
```

In `src/test/extension.test.ts` and `src/test/translation/mockTranslator.test.ts`, add `hash` and `state` to manually created blocks:

```ts
hash: 'hash-0',
state: 'translated',
```

Use `state: 'skipped'` for protected blocks.

- [ ] **Step 6: Run metadata verification**

Run:

```bash
npm run compile-tests
npm test -- --grep "Markdown parser"
```

Expected: PASS.

### Task 2: Move Translation Types To Provider Contract

**Files:**
- Modify: `src/translation/types.ts`
- Modify: `src/translation/providers/mockTranslator.ts`
- Modify: `src/test/translation/mockTranslator.test.ts`

- [ ] **Step 1: Write failing mock provider contract test**

Replace `src/test/translation/mockTranslator.test.ts` with:

```ts
import * as assert from 'assert';
import { MockTranslator } from '../../translation/providers/mockTranslator';

suite('Mock translator provider', () => {
	test('translates a single text request with target language prefix', async () => {
		const translator = new MockTranslator();
		const result = await translator.translate({
			sourceLanguage: '',
			targetLanguage: 'zh-CN',
			text: 'Hello __MMT_INLINE_0__',
		});

		assert.strictEqual(translator.id, 'mock');
		assert.strictEqual(result.text, '[zh-CN] Hello __MMT_INLINE_0__');
	});
});
```

- [ ] **Step 2: Run test compile to verify old contract fails**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript output containing `Property 'translate' does not exist on type 'MockTranslator'`.

- [ ] **Step 3: Replace translation type contracts**

Replace `src/translation/types.ts` with:

```ts
import type { MarkdownBlock, TranslatedMarkdownBlock } from '../markdown/block';

export type TranslateInput = {
	text: string;
	sourceLanguage: string;
	targetLanguage: string;
};

export type TranslateResult = {
	text: string;
};

export interface TranslatorProvider {
	id: string;
	maxTextLength: number;
	translate(input: TranslateInput): Promise<TranslateResult>;
}

export type TranslationSchedulerInput = {
	sourceLanguage: string;
	targetLanguage: string;
	blocks: MarkdownBlock[];
};

export type TranslationSchedulerResult = {
	blocks: TranslatedMarkdownBlock[];
	failedBlockCount: number;
};

export type TranslationProgress = {
	blocks: TranslatedMarkdownBlock[];
	completedBlockCount: number;
	failedBlockCount: number;
};

export type TranslationProgressHandler = (progress: TranslationProgress) => void;
```

- [ ] **Step 4: Replace mock translator implementation**

Replace `src/translation/providers/mockTranslator.ts` with:

```ts
import type { TranslateInput, TranslateResult, TranslatorProvider } from '../types';

export class MockTranslator implements TranslatorProvider {
	readonly id = 'mock';
	readonly maxTextLength = 5_000;

	async translate(input: TranslateInput): Promise<TranslateResult> {
		return {
			text: `[${input.targetLanguage}] ${input.text}`,
		};
	}
}
```

- [ ] **Step 5: Run provider contract verification**

Run:

```bash
npm run compile-tests
npm test -- --grep "Mock translator provider"
```

Expected: PASS.

### Task 3: Add Translation Cache

**Files:**
- Create: `src/cache/translationCache.ts`
- Create: `src/test/cache/translationCache.test.ts`

- [ ] **Step 1: Write failing cache tests**

Create `src/test/cache/translationCache.test.ts`:

```ts
import * as assert from 'assert';
import { TranslationCache } from '../../cache/translationCache';

class MemoryMemento {
	private readonly values = new Map<string, unknown>();

	get<T>(key: string, defaultValue: T): T {
		return (this.values.get(key) as T | undefined) ?? defaultValue;
	}

	async update(key: string, value: unknown): Promise<void> {
		this.values.set(key, value);
	}
}

suite('Translation cache', () => {
	test('stores and reads entries by provider, languages, parser version, and block hash', async () => {
		const cache = new TranslationCache(new MemoryMemento(), {
			now: () => 1_000,
			ttlMs: 30 * 24 * 60 * 60 * 1000,
			maxEntries: 10,
		});

		await cache.set(
			{
				provider: 'google-free',
				sourceLanguage: '',
				targetLanguage: 'zh-CN',
				parserVersion: 'parser-v1',
				blockHash: 'hash-1',
			},
			'你好',
		);

		assert.strictEqual(
			cache.get({
				provider: 'google-free',
				sourceLanguage: '',
				targetLanguage: 'zh-CN',
				parserVersion: 'parser-v1',
				blockHash: 'hash-1',
			}),
			'你好',
		);
		assert.strictEqual(
			cache.get({
				provider: 'google-free',
				sourceLanguage: 'en',
				targetLanguage: 'zh-CN',
				parserVersion: 'parser-v1',
				blockHash: 'hash-1',
			}),
			undefined,
		);
	});

	test('expires old entries and trims oldest entries', async () => {
		let now = 1_000;
		const cache = new TranslationCache(new MemoryMemento(), {
			now: () => now,
			ttlMs: 100,
			maxEntries: 1,
		});

		await cache.set(
			{
				provider: 'google-free',
				sourceLanguage: '',
				targetLanguage: 'zh-CN',
				parserVersion: 'parser-v1',
				blockHash: 'hash-1',
			},
			'one',
		);

		now = 1_050;
		await cache.set(
			{
				provider: 'google-free',
				sourceLanguage: '',
				targetLanguage: 'zh-CN',
				parserVersion: 'parser-v1',
				blockHash: 'hash-2',
			},
			'two',
		);

		assert.strictEqual(
			cache.get({
				provider: 'google-free',
				sourceLanguage: '',
				targetLanguage: 'zh-CN',
				parserVersion: 'parser-v1',
				blockHash: 'hash-1',
			}),
			undefined,
		);

		now = 1_200;
		assert.strictEqual(
			cache.get({
				provider: 'google-free',
				sourceLanguage: '',
				targetLanguage: 'zh-CN',
				parserVersion: 'parser-v1',
				blockHash: 'hash-2',
			}),
			undefined,
		);
	});
});
```

- [ ] **Step 2: Run test compile to verify cache module is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript output containing `Cannot find module '../../cache/translationCache'`.

- [ ] **Step 3: Create cache implementation**

Create `src/cache/translationCache.ts`:

```ts
const storageKey = 'markdownMirrorTranslator.translationCache.v1';
const defaultTtlMs = 30 * 24 * 60 * 60 * 1000;
const defaultMaxEntries = 5_000;

export type TranslationCacheKeyInput = {
	provider: string;
	sourceLanguage: string;
	targetLanguage: string;
	parserVersion: string;
	blockHash: string;
};

export type TranslationCacheOptions = {
	now?: () => number;
	ttlMs?: number;
	maxEntries?: number;
};

type TranslationCacheEntry = {
	key: string;
	text: string;
	createdAt: number;
	accessedAt: number;
};

type TranslationCacheStorage = {
	get<T>(key: string, defaultValue: T): T;
	update(key: string, value: unknown): PromiseLike<void>;
};

export class TranslationCache {
	private readonly entries = new Map<string, TranslationCacheEntry>();
	private readonly now: () => number;
	private readonly ttlMs: number;
	private readonly maxEntries: number;

	constructor(
		private readonly storage: TranslationCacheStorage,
		options: TranslationCacheOptions = {},
	) {
		this.now = options.now ?? Date.now;
		this.ttlMs = options.ttlMs ?? defaultTtlMs;
		this.maxEntries = options.maxEntries ?? defaultMaxEntries;

		for (const entry of this.storage.get<TranslationCacheEntry[]>(storageKey, [])) {
			this.entries.set(entry.key, entry);
		}
		this.removeExpired();
	}

	get(input: TranslationCacheKeyInput): string | undefined {
		this.removeExpired();
		const key = createTranslationCacheKey(input);
		const entry = this.entries.get(key);

		if (!entry) {
			return undefined;
		}

		entry.accessedAt = this.now();
		return entry.text;
	}

	async set(input: TranslationCacheKeyInput, text: string): Promise<void> {
		this.removeExpired();
		const key = createTranslationCacheKey(input);
		const timestamp = this.now();
		this.entries.set(key, {
			key,
			text,
			createdAt: timestamp,
			accessedAt: timestamp,
		});
		this.trimToLimit();
		await this.persist();
	}

	private removeExpired(): void {
		const cutoff = this.now() - this.ttlMs;
		for (const [key, entry] of this.entries) {
			if (entry.createdAt < cutoff) {
				this.entries.delete(key);
			}
		}
	}

	private trimToLimit(): void {
		if (this.entries.size <= this.maxEntries) {
			return;
		}

		const oldestFirst = [...this.entries.values()].sort((left, right) => left.accessedAt - right.accessedAt);
		for (const entry of oldestFirst.slice(0, this.entries.size - this.maxEntries)) {
			this.entries.delete(entry.key);
		}
	}

	private async persist(): Promise<void> {
		await this.storage.update(storageKey, [...this.entries.values()]);
	}
}

export function createTranslationCacheKey(input: TranslationCacheKeyInput): string {
	return [
		input.provider,
		input.sourceLanguage,
		input.targetLanguage,
		input.parserVersion,
		input.blockHash,
	].join('\u001f');
}
```

- [ ] **Step 4: Run cache verification**

Run:

```bash
npm run compile-tests
npm test -- --grep "Translation cache"
```

Expected: PASS.

### Task 4: Add Google Free Translator Provider

**Files:**
- Create: `src/translation/providers/googleFreeTranslator.ts`
- Create: `src/test/translation/googleFreeTranslator.test.ts`

- [ ] **Step 1: Write failing provider tests**

Create `src/test/translation/googleFreeTranslator.test.ts`:

```ts
import * as assert from 'assert';
import { GoogleFreeTranslator } from '../../translation/providers/googleFreeTranslator';

suite('Google free translator provider', () => {
	test('builds request and parses translated text response', async () => {
		let requestedUrl = '';
		const translator = new GoogleFreeTranslator(async (url) => {
			requestedUrl = url.toString();
			return {
				ok: true,
				status: 200,
				text: async () => '[[["你好","Hello",null,null,1]],null,"en"]',
			};
		});

		const result = await translator.translate({
			sourceLanguage: '',
			targetLanguage: 'zh-CN',
			text: 'Hello',
		});

		assert.strictEqual(translator.id, 'google-free');
		assert.strictEqual(result.text, '你好');
		assert.ok(requestedUrl.startsWith('https://translate.googleapis.com/translate_a/single?'));
		assert.ok(requestedUrl.includes('client=gtx'));
		assert.ok(requestedUrl.includes('sl=auto'));
		assert.ok(requestedUrl.includes('tl=zh-CN'));
		assert.ok(requestedUrl.includes('dt=t'));
		assert.ok(requestedUrl.includes('q=Hello'));
	});

	test('throws clear error for non-ok responses and malformed bodies', async () => {
		const failedTranslator = new GoogleFreeTranslator(async () => ({
			ok: false,
			status: 429,
			text: async () => 'rate limited',
		}));

		await assert.rejects(
			() =>
				failedTranslator.translate({
					sourceLanguage: 'en',
					targetLanguage: 'zh-CN',
					text: 'Hello',
				}),
			/Google free translator request failed with status 429/,
		);

		const malformedTranslator = new GoogleFreeTranslator(async () => ({
			ok: true,
			status: 200,
			text: async () => '{"unexpected":true}',
		}));

		await assert.rejects(
			() =>
				malformedTranslator.translate({
					sourceLanguage: 'en',
					targetLanguage: 'zh-CN',
					text: 'Hello',
				}),
			/Google free translator returned an unsupported response shape/,
		);
	});
});
```

- [ ] **Step 2: Run test compile to verify provider module is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript output containing `Cannot find module '../../translation/providers/googleFreeTranslator'`.

- [ ] **Step 3: Create provider implementation**

Create `src/translation/providers/googleFreeTranslator.ts`:

```ts
import type { TranslateInput, TranslateResult, TranslatorProvider } from '../types';

type MinimalFetchResponse = {
	ok: boolean;
	status: number;
	text(): Promise<string>;
};

type FetchLike = (url: URL) => Promise<MinimalFetchResponse>;

export class GoogleFreeTranslator implements TranslatorProvider {
	readonly id = 'google-free';
	readonly maxTextLength = 4_500;

	constructor(private readonly fetcher: FetchLike = defaultFetch) {}

	async translate(input: TranslateInput): Promise<TranslateResult> {
		const url = new URL('https://translate.googleapis.com/translate_a/single');
		url.searchParams.set('client', 'gtx');
		url.searchParams.set('sl', input.sourceLanguage.trim() || 'auto');
		url.searchParams.set('tl', input.targetLanguage);
		url.searchParams.set('dt', 't');
		url.searchParams.set('q', input.text);

		const response = await this.fetcher(url);
		const body = await response.text();

		if (!response.ok) {
			throw new Error(`Google free translator request failed with status ${response.status}`);
		}

		return {
			text: parseGoogleFreeResponse(body),
		};
	}
}

async function defaultFetch(url: URL): Promise<MinimalFetchResponse> {
	return fetch(url);
}

export function parseGoogleFreeResponse(body: string): string {
	const parsed = JSON.parse(body) as unknown;

	if (!Array.isArray(parsed) || !Array.isArray(parsed[0])) {
		throw new Error('Google free translator returned an unsupported response shape');
	}

	const translatedParts: string[] = [];
	for (const segment of parsed[0]) {
		if (!Array.isArray(segment) || typeof segment[0] !== 'string') {
			throw new Error('Google free translator returned an unsupported response shape');
		}

		translatedParts.push(segment[0]);
	}

	return translatedParts.join('');
}
```

- [ ] **Step 4: Run provider verification**

Run:

```bash
npm run compile-tests
npm test -- --grep "Google free translator provider"
```

Expected: PASS.

### Task 5: Add Scheduler With Cache, Splitting, Concurrency, And Failure Isolation

**Files:**
- Create: `src/translation/scheduler.ts`
- Create: `src/test/translation/scheduler.test.ts`

- [ ] **Step 1: Write failing scheduler tests**

Create `src/test/translation/scheduler.test.ts`:

```ts
import * as assert from 'assert';
import type { MarkdownBlock } from '../../markdown/block';
import { TranslationCache } from '../../cache/translationCache';
import { TranslationScheduler } from '../../translation/scheduler';
import type { TranslateInput, TranslateResult, TranslatorProvider } from '../../translation/types';

class MemoryMemento {
	private readonly values = new Map<string, unknown>();

	get<T>(key: string, defaultValue: T): T {
		return (this.values.get(key) as T | undefined) ?? defaultValue;
	}

	async update(key: string, value: unknown): Promise<void> {
		this.values.set(key, value);
	}
}

class RecordingProvider implements TranslatorProvider {
	readonly id = 'recording';
	readonly maxTextLength = 5;
	readonly inputs: TranslateInput[] = [];
	active = 0;
	maxActive = 0;

	constructor(private readonly failText?: string) {}

	async translate(input: TranslateInput): Promise<TranslateResult> {
		this.inputs.push(input);
		this.active += 1;
		this.maxActive = Math.max(this.maxActive, this.active);
		await new Promise((resolve) => setTimeout(resolve, 5));
		this.active -= 1;

		if (input.text === this.failText) {
			throw new Error('provider failed');
		}

		return { text: `[${input.targetLanguage}] ${input.text}` };
	}
}

function sourceBlock(input: Partial<MarkdownBlock> & Pick<MarkdownBlock, 'id' | 'text' | 'hash'>): MarkdownBlock {
	return {
		id: input.id,
		kind: input.kind ?? 'paragraph',
		source: input.source ?? `${input.text}\n`,
		text: input.text,
		hash: input.hash,
		translatable: input.translatable ?? true,
		state: input.state ?? 'pending',
		protectedInlines: input.protectedInlines ?? [],
	};
}

suite('Translation scheduler', () => {
	test('uses cache hits and translates cache misses', async () => {
		const provider = new RecordingProvider();
		const cache = new TranslationCache(new MemoryMemento(), { now: () => 1_000, maxEntries: 10 });
		await cache.set(
			{
				provider: 'recording',
				sourceLanguage: '',
				targetLanguage: 'zh-CN',
				parserVersion: 'parser-v1',
				blockHash: 'hash-hit',
			},
			'cached text',
		);
		const scheduler = new TranslationScheduler(provider, cache, {
			parserVersion: 'parser-v1',
			concurrency: 2,
		});

		const result = await scheduler.translate({
			sourceLanguage: '',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({ id: 'block-1', text: 'Hello', hash: 'hash-hit' }),
				sourceBlock({ id: 'block-2', text: 'World', hash: 'hash-miss' }),
			],
		});

		assert.strictEqual(provider.inputs.length, 1);
		assert.strictEqual(result.failedBlockCount, 0);
		assert.strictEqual(result.blocks[0].translatedText, 'cached text');
		assert.strictEqual(result.blocks[0].state, 'translated');
		assert.strictEqual(result.blocks[1].translatedText, '[zh-CN] World');
		assert.strictEqual(result.blocks[1].state, 'translated');
	});

	test('splits long text and limits concurrency', async () => {
		const provider = new RecordingProvider();
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 2,
		});

		const result = await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({ id: 'block-1', text: 'abcdefghij', hash: 'hash-1' }),
				sourceBlock({ id: 'block-2', text: 'klmno', hash: 'hash-2' }),
				sourceBlock({ id: 'block-3', text: 'pqrst', hash: 'hash-3' }),
			],
		});

		assert.deepStrictEqual(
			provider.inputs.map((input) => input.text).sort(),
			['abcde', 'fghij', 'klmno', 'pqrst'].sort(),
		);
		assert.ok(provider.maxActive <= 2);
		assert.strictEqual(result.blocks[0].translatedText, '[zh-CN] abcde[zh-CN] fghij');
	});

	test('keeps failed blocks as source through failed state', async () => {
		const provider = new RecordingProvider('World');
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		const result = await scheduler.translate({
			sourceLanguage: '',
			targetLanguage: 'zh-CN',
			blocks: [sourceBlock({ id: 'block-1', text: 'World', hash: 'hash-fail' })],
		});

		assert.strictEqual(result.failedBlockCount, 1);
		assert.strictEqual(result.blocks[0].state, 'failed');
		assert.strictEqual(result.blocks[0].translatedText, '');
		assert.match(result.blocks[0].errorMessage ?? '', /provider failed/);
	});
});
```

- [ ] **Step 2: Run test compile to verify scheduler module is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript output containing `Cannot find module '../../translation/scheduler'`.

- [ ] **Step 3: Create scheduler implementation**

Create `src/translation/scheduler.ts`:

```ts
import { PARSER_VERSION } from '../markdown/parser';
import type { MarkdownBlock, TranslatedMarkdownBlock } from '../markdown/block';
import type { TranslationCache } from '../cache/translationCache';
import type {
	TranslationProgressHandler,
	TranslationSchedulerInput,
	TranslationSchedulerResult,
	TranslatorProvider,
} from './types';

const defaultConcurrency = 3;

export type TranslationSchedulerOptions = {
	parserVersion?: string;
	concurrency?: number;
	onProgress?: TranslationProgressHandler;
};

export class TranslationScheduler {
	private readonly parserVersion: string;
	private readonly concurrency: number;
	private readonly onProgress?: TranslationProgressHandler;

	constructor(
		private readonly provider: TranslatorProvider,
		private readonly cache: TranslationCache,
		options: TranslationSchedulerOptions = {},
	) {
		this.parserVersion = options.parserVersion ?? PARSER_VERSION;
		this.concurrency = Math.max(1, options.concurrency ?? defaultConcurrency);
		this.onProgress = options.onProgress;
	}

	async translate(input: TranslationSchedulerInput): Promise<TranslationSchedulerResult> {
		const output = input.blocks.map(createInitialTranslatedBlock);
		const translatableIndexes = output
			.map((block, index) => ({ block, index }))
			.filter(({ block }) => block.translatable);
		let cursor = 0;
		let completedBlockCount = 0;
		let failedBlockCount = 0;

		const worker = async (): Promise<void> => {
			while (cursor < translatableIndexes.length) {
				const item = translatableIndexes[cursor];
				cursor += 1;
				const { index, block } = item;
				output[index] = { ...block, state: 'translating' };
				this.emitProgress(output, completedBlockCount, failedBlockCount);

				const cacheKey = {
					provider: this.provider.id,
					sourceLanguage: input.sourceLanguage,
					targetLanguage: input.targetLanguage,
					parserVersion: this.parserVersion,
					blockHash: block.hash,
				};
				const cached = this.cache.get(cacheKey);

				if (cached !== undefined) {
					output[index] = { ...block, translatedText: cached, state: 'translated' };
					completedBlockCount += 1;
					this.emitProgress(output, completedBlockCount, failedBlockCount);
					continue;
				}

				try {
					const translatedText = await this.translateTextInChunks(block.text, input.sourceLanguage, input.targetLanguage);
					await this.cache.set(cacheKey, translatedText);
					output[index] = { ...block, translatedText, state: 'translated' };
				} catch (error) {
					failedBlockCount += 1;
					output[index] = {
						...block,
						translatedText: '',
						state: 'failed',
						errorMessage: error instanceof Error ? error.message : String(error),
					};
				}

				completedBlockCount += 1;
				this.emitProgress(output, completedBlockCount, failedBlockCount);
			}
		};

		await Promise.all(Array.from({ length: Math.min(this.concurrency, translatableIndexes.length) }, () => worker()));
		return { blocks: output, failedBlockCount };
	}

	private async translateTextInChunks(text: string, sourceLanguage: string, targetLanguage: string): Promise<string> {
		const chunks = splitText(text, this.provider.maxTextLength);
		const translatedChunks: string[] = [];

		for (const chunk of chunks) {
			const result = await this.provider.translate({
				text: chunk,
				sourceLanguage,
				targetLanguage,
			});
			translatedChunks.push(result.text);
		}

		return translatedChunks.join('');
	}

	private emitProgress(blocks: TranslatedMarkdownBlock[], completedBlockCount: number, failedBlockCount: number): void {
		this.onProgress?.({
			blocks: [...blocks],
			completedBlockCount,
			failedBlockCount,
		});
	}
}

function createInitialTranslatedBlock(block: MarkdownBlock): TranslatedMarkdownBlock {
	if (!block.translatable) {
		return {
			...block,
			state: 'skipped',
			translatedText: '',
		};
	}

	return {
		...block,
		state: block.state,
		translatedText: '',
	};
}

function splitText(text: string, maxTextLength: number): string[] {
	if (text.length <= maxTextLength) {
		return [text];
	}

	const chunks: string[] = [];
	for (let start = 0; start < text.length; start += maxTextLength) {
		chunks.push(text.slice(start, start + maxTextLength));
	}
	return chunks;
}
```

- [ ] **Step 4: Run scheduler verification**

Run:

```bash
npm run compile-tests
npm test -- --grep "Translation scheduler"
```

Expected: PASS.

### Task 6: Render Failed Blocks As Source And Add Session Replacement Helper

**Files:**
- Modify: `src/markdown/renderer.ts`
- Modify: `src/test/markdown/renderer.test.ts`
- Modify: `src/translationSession.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Write failing renderer fallback test**

Add this test to `src/test/markdown/renderer.test.ts`:

```ts
test('renders failed translatable blocks as their original source', () => {
	const rendered = renderMarkdown(
		[
			block({
				source: 'World\n',
				text: 'World',
				state: 'failed',
				translatedText: '',
				errorMessage: 'provider failed',
			}),
		],
		'translated',
	);

	assert.strictEqual(rendered, 'World\n');
});
```

- [ ] **Step 2: Run renderer test to verify fallback behavior is missing**

Run:

```bash
npm test -- --grep "failed translatable"
```

Expected: FAIL because the renderer emits an empty translated block.

- [ ] **Step 3: Update renderer fallback**

In `src/markdown/renderer.ts`, add this guard at the top of `renderTranslatedBlock()` after the non-translatable guard:

```ts
if (block.state === 'failed') {
	return block.source;
}
```

- [ ] **Step 4: Add session helper**

In `src/translationSession.ts`, add this export after `replaceRenderedContent()`:

```ts
export function replaceTranslatedBlocks(
	session: TranslationSession,
	translatedBlocks: TranslatedMarkdownBlock[],
	renderedContent: string,
): TranslationSession {
	return {
		...session,
		translatedBlocks,
		renderedContent,
		updatedAt: Date.now(),
	};
}
```

- [ ] **Step 5: Add session helper test**

In `src/test/extension.test.ts`, update the import:

```ts
import { createInitialSession, replaceTranslatedBlocks } from '../translationSession';
```

Add this test:

```ts
test('replaceTranslatedBlocks updates translated blocks and rendered content', () => {
	const sourceUri = vscode.Uri.file('/workspace/README.md');
	const translatedUri = vscode.Uri.from({
		scheme: 'markdown-mirror-translator',
		path: '/README.zh-CN.md',
	});
	const sourceBlocks = [
		{
			id: 'block-0',
			kind: 'paragraph' as const,
			source: 'Hello\n',
			text: 'Hello',
			hash: 'hash-0',
			translatable: true,
			state: 'pending' as const,
			protectedInlines: [],
		},
	];
	const initial = createInitialSession({
		sourceUri,
		translatedUri,
		sourceContent: 'Hello\n',
		sourceBlocks,
		renderedContent: 'Hello\n',
		renderMode: 'translated',
		config: getConfig(),
	});
	const translated = [{ ...sourceBlocks[0], translatedText: '你好', state: 'translated' as const }];

	const updated = replaceTranslatedBlocks(initial, translated, '你好\n');

	assert.deepStrictEqual(updated.translatedBlocks, translated);
	assert.strictEqual(updated.renderedContent, '你好\n');
	assert.ok(updated.updatedAt >= initial.updatedAt);
});
```

- [ ] **Step 6: Run renderer and session verification**

Run:

```bash
npm run compile-tests
npm test -- --grep "Markdown renderer|replaceTranslatedBlocks"
```

Expected: PASS.

### Task 7: Correct Phase 1/2 Retranslation Edge Case And Wire Production Translation Command

**Files:**
- Modify: `package.json`
- Modify: `src/commands/translateCurrentFile.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Write failing virtual-document retranslation guard test**

In `src/test/extension.test.ts`, update the command import:

```ts
import { isTranslatableMarkdownDocument } from '../commands/translateCurrentFile';
```

Add this test:

```ts

test('translate command rejects translated virtual documents as sources', () => {
	assert.strictEqual(
		isTranslatableMarkdownDocument({
			uri: vscode.Uri.from({
				scheme: translatedDocumentScheme,
				path: '/README.zh-CN.md',
			}),
			languageId: 'markdown',
			fileName: 'README.zh-CN.md',
		}),
		false,
	);
});
```

- [ ] **Step 2: Run test to verify the edge case fails**

Run:

```bash
npm test -- --grep "translated virtual document"
```

Expected: FAIL with TypeScript output containing `Module '"../commands/translateCurrentFile"' has no exported member 'isTranslatableMarkdownDocument'`.

- [ ] **Step 3: Hide translate action on translated virtual documents**

In `package.json`, replace the translate editor-title menu item:

```json
{
  "command": "markdown-mirror-translator.translateCurrentFile",
  "when": "resourceLangId == markdown",
  "group": "navigation"
}
```

with:

```json
{
  "command": "markdown-mirror-translator.translateCurrentFile",
  "when": "resourceLangId == markdown && resourceScheme != 'markdown-mirror-translator'",
  "group": "navigation"
}
```

- [ ] **Step 4: Reject translated virtual documents in command validation**

In `src/commands/translateCurrentFile.ts`, import the virtual document scheme:

```ts
import { translatedDocumentScheme, TranslatedDocumentProvider } from '../document/translatedDocumentProvider';
```

Replace `isMarkdownDocument()` with:

```ts
type MarkdownDocumentIdentity = Pick<vscode.TextDocument, 'uri' | 'languageId' | 'fileName'>;

export function isTranslatableMarkdownDocument(document: MarkdownDocumentIdentity): boolean {
	if (document.uri.scheme === translatedDocumentScheme) {
		return false;
	}

	return document.languageId === 'markdown' || document.fileName.toLowerCase().endsWith('.md');
}
```

Then replace the command validation call from:

```ts
if (!isMarkdownDocument(document)) {
```

to:

```ts
if (!isTranslatableMarkdownDocument(document)) {
```

Keep the existing non-Markdown information message. It is acceptable for translated virtual documents to receive `Markdown Mirror Translator only translates Markdown files.` because the actionable behavior is that the command does not create a nested translation session.

- [ ] **Step 5: Extract production command dependencies**

In `src/commands/translateCurrentFile.ts`, add imports:

```ts
import type * as vscodeTypes from 'vscode';
import { TranslationCache } from '../cache/translationCache';
import { GoogleFreeTranslator } from '../translation/providers/googleFreeTranslator';
import { TranslationScheduler } from '../translation/scheduler';
import type { TranslatorProvider } from '../translation/types';
import { replaceTranslatedBlocks } from '../translationSession';
```

Replace the mock translator import:

```ts
import { MockTranslator } from '../translation/providers/mockTranslator';
```

with no import.

Add these types and constants near the existing command constants:

```ts
const virtualDocumentRefreshDelayMs = 400;
const smallDocumentMaxCharacters = 20_000;
const largeDocumentMaxCharacters = 200_000;
const translationConcurrency = 3;

export type TranslateCurrentFileDependencies = {
	createProvider?: () => TranslatorProvider;
	createCache?: () => TranslationCache;
	openTranslatedDocument?: (uri: vscode.Uri) => Promise<void>;
};
```

Keep `translateCommandId` unchanged.

- [ ] **Step 6: Replace command body with immediate-open production loop**

Replace the body of `translateCurrentFile()` with:

```ts
export async function translateCurrentFile(
	provider: TranslatedDocumentProvider,
	globalState: vscodeTypes.Memento,
	dependencies: TranslateCurrentFileDependencies = {},
): Promise<void> {
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
	let session = createInitialSession({
		sourceUri: document.uri,
		translatedUri,
		sourceContent,
		sourceBlocks,
		translatedBlocks: sourceBlocks.map((block) => ({
			...block,
			translatedText: '',
		})),
		renderedContent: sourceContent,
		renderMode,
		config,
	});
	const refresh = createThrottledRefresh(() => provider.refreshSession(translatedUri), virtualDocumentRefreshDelayMs);

	provider.setSession(session);
	refresh.request();

	await (dependencies.openTranslatedDocument ?? openTranslatedDocument)(translatedUri);

	showDocumentSizeMessage(sourceContent.length);

	const translator = dependencies.createProvider?.() ?? new GoogleFreeTranslator();
	const cache = dependencies.createCache?.() ?? new TranslationCache(globalState);
	const scheduler = new TranslationScheduler(translator, cache, {
		concurrency: translationConcurrency,
		onProgress: (progress) => {
			const renderedContent = renderMarkdown(progress.blocks, renderMode);
			session = replaceTranslatedBlocks(session, progress.blocks, renderedContent);
			provider.setSession(session);
			refresh.request();
		},
	});

	try {
		const result = await scheduler.translate({
			sourceLanguage: config.sourceLanguage,
			targetLanguage: config.targetLanguage,
			blocks: sourceBlocks,
		});
		const renderedContent = renderMarkdown(result.blocks, renderMode);
		session = replaceTranslatedBlocks(session, result.blocks, renderedContent);
		provider.setSession(session);
		refresh.request();
		refresh.flush();

		if (result.failedBlockCount > 0) {
			vscode.window.showWarningMessage(`Markdown translation completed with ${result.failedBlockCount} failed block(s).`);
		} else {
			vscode.window.showInformationMessage('Markdown translation completed.');
		}
	} catch (error) {
		refresh.flush();
		vscode.window.showErrorMessage(
			`Markdown translation failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	} finally {
		refresh.dispose();
	}
}
```

- [ ] **Step 7: Add default virtual document opener and test memento helper**

In `src/commands/translateCurrentFile.ts`, add:

```ts
async function openTranslatedDocument(uri: vscode.Uri): Promise<void> {
	const translatedDocument = await vscode.workspace.openTextDocument(uri);
	await vscode.window.showTextDocument(translatedDocument, {
		viewColumn: vscode.ViewColumn.Beside,
		preview: false,
		preserveFocus: false,
	});
}
```

In `src/test/extension.test.ts`, add this helper:

```ts
function createTestMemento(): vscode.Memento {
	return {
		get: <T>(_key: string, defaultValue: T) => defaultValue,
		update: async () => undefined,
	} as vscode.Memento;
}
```

- [ ] **Step 8: Add document size message helper**

In `src/commands/translateCurrentFile.ts`, add:

```ts
function showDocumentSizeMessage(characterCount: number): void {
	if (characterCount > largeDocumentMaxCharacters) {
		vscode.window.showWarningMessage('This Markdown file is large, so translation may take a while.');
		return;
	}

	if (characterCount > smallDocumentMaxCharacters) {
		vscode.window.showInformationMessage('Translating Markdown blocks in batches.');
	}
}
```

- [ ] **Step 9: Update command registration for dependency defaulting**

Keep `registerTranslateCurrentFileCommand()` API unchanged for extension activation:

```ts
export function registerTranslateCurrentFileCommand(
	context: vscode.ExtensionContext,
	provider: TranslatedDocumentProvider,
): void {
	const disposable = vscode.commands.registerCommand(translateCommandId, () => translateCurrentFile(provider, context.globalState));
	context.subscriptions.push(disposable);
}
```

- [ ] **Step 10: Add command unit test with fake provider**

In `src/test/extension.test.ts`, import the command and provider contract:

```ts
import { translateCurrentFile } from '../commands/translateCurrentFile';
import type { TranslateInput, TranslateResult, TranslatorProvider } from '../translation/types';
```

Add this fake provider:

```ts
class TestProvider implements TranslatorProvider {
	readonly id = 'test';
	readonly maxTextLength = 10_000;

	async translate(input: TranslateInput): Promise<TranslateResult> {
		return { text: `[${input.targetLanguage}] ${input.text}` };
	}
}
```

Replace the body of the existing command workflow test with direct invocation:

```ts
const provider = new TranslatedDocumentProvider();
const sourceDocument = await vscode.workspace.openTextDocument({
	content: '# Hello\n\nWorld\n',
	language: 'markdown',
});

await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
await translateCurrentFile(provider, createTestMemento(), {
	createProvider: () => new TestProvider(),
	openTranslatedDocument: async () => undefined,
});

const firstTranslatedUri = provider.getTranslatedUri(sourceDocument.uri, 'zh-CN', false);
assert.strictEqual(firstTranslatedUri.scheme, translatedDocumentScheme);
assert.strictEqual(provider.provideTextDocumentContent(firstTranslatedUri), '# [zh-CN] Hello\n\n[zh-CN] World\n');

await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
await translateCurrentFile(provider, createTestMemento(), {
	createProvider: () => new TestProvider(),
	openTranslatedDocument: async () => undefined,
});

const secondTranslatedUri = provider.getTranslatedUri(sourceDocument.uri, 'zh-CN', false);
assert.strictEqual(secondTranslatedUri.toString(), firstTranslatedUri.toString());
assert.strictEqual(provider.provideTextDocumentContent(secondTranslatedUri), '# [zh-CN] Hello\n\n[zh-CN] World\n');
```

Update the bilingual command test the same way: call `translateCurrentFile(provider, createTestMemento(), { createProvider: () => new TestProvider(), openTranslatedDocument: async () => undefined })` and assert `provider.provideTextDocumentContent(translatedUri)`.

- [ ] **Step 11: Run command verification**

Run:

```bash
npm run compile-tests
npm test -- --grep "translate command|bilingual|translated virtual document"
```

Expected: PASS.

### Task 8: Implement Save-To-Disk Workflow

**Files:**
- Modify: `src/commands/saveTranslatedFile.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Write failing save target tests**

Add exports to test pure naming logic before touching VS Code file writes. In `src/test/extension.test.ts`, import:

```ts
import { getTranslatedFileUri, saveTranslatedFileForUri } from '../commands/saveTranslatedFile';
```

Add this test:

```ts
test('getTranslatedFileUri creates target-language filenames next to source file', () => {
	const sourceUri = vscode.Uri.file('/workspace/README.md');

	assert.strictEqual(
		getTranslatedFileUri(sourceUri, 'zh-CN', false).fsPath,
		vscode.Uri.file('/workspace/README.zh-CN.md').fsPath,
	);
	assert.strictEqual(
		getTranslatedFileUri(sourceUri, 'zh-CN', true).fsPath,
		vscode.Uri.file('/workspace/README.bilingual.zh-CN.md').fsPath,
	);
});
```

- [ ] **Step 2: Run test compile to verify save helper is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with TypeScript output containing `Module '"../commands/saveTranslatedFile"' has no exported member`.

- [ ] **Step 3: Replace save command implementation**

Replace `src/commands/saveTranslatedFile.ts` with:

```ts
import * as path from 'path';
import * as vscode from 'vscode';
import { translatedDocumentScheme, TranslatedDocumentProvider } from '../document/translatedDocumentProvider';

const saveCommandId = 'markdown-mirror-translator.saveTranslatedFile';

export type SaveTranslatedFileDependencies = {
	confirmOverwrite?: (targetUri: vscode.Uri) => Promise<boolean>;
};

export async function saveTranslatedFile(provider: TranslatedDocumentProvider): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	const activeUri = editor?.document.uri;

	await saveTranslatedFileForUri(provider, activeUri, {});
}

export async function saveTranslatedFileForUri(
	provider: TranslatedDocumentProvider,
	activeUri: vscode.Uri | undefined,
	dependencies: SaveTranslatedFileDependencies = {},
): Promise<void> {
	if (!activeUri || activeUri.scheme !== translatedDocumentScheme) {
		vscode.window.showInformationMessage('Open a Markdown Mirror Translator result before saving.');
		return;
	}

	const session = provider.getSessionByTranslatedUri(activeUri);

	if (!session) {
		vscode.window.showInformationMessage('No translated Markdown content is available for this editor.');
		return;
	}

	const targetUri = getTranslatedFileUri(session.sourceUri, session.config.targetLanguage, session.config.bilingual);
	const canWrite = dependencies.confirmOverwrite
		? await dependencies.confirmOverwrite(targetUri)
		: await confirmOverwriteIfNeeded(targetUri);

	if (!canWrite) {
		return;
	}

	await vscode.workspace.fs.writeFile(targetUri, Buffer.from(session.renderedContent, 'utf8'));
	vscode.window.showInformationMessage(`Saved translated Markdown to ${path.basename(targetUri.fsPath)}.`);
}

export function getTranslatedFileUri(sourceUri: vscode.Uri, targetLanguage: string, bilingual: boolean): vscode.Uri {
	const parsed = path.parse(sourceUri.fsPath);
	const suffix = bilingual ? `.bilingual.${targetLanguage}.md` : `.${targetLanguage}.md`;
	return vscode.Uri.file(path.join(parsed.dir, `${parsed.name}${suffix}`));
}

async function confirmOverwriteIfNeeded(targetUri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(targetUri);
	} catch {
		return true;
	}

	const choice = await vscode.window.showWarningMessage(
		`Overwrite existing file ${path.basename(targetUri.fsPath)}?`,
		{ modal: true },
		'Overwrite',
	);

	return choice === 'Overwrite';
}

export function registerSaveTranslatedFileCommand(
	context: vscode.ExtensionContext,
	provider: TranslatedDocumentProvider,
): void {
	const disposable = vscode.commands.registerCommand(saveCommandId, () => saveTranslatedFile(provider));
	context.subscriptions.push(disposable);
}
```

- [ ] **Step 4: Add save workflow integration test**

In `src/test/extension.test.ts`, add:

```ts
test('save command writes translated Markdown beside the source file', async () => {
	const provider = new TranslatedDocumentProvider();
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	assert.ok(workspaceFolder);
	const sourceUri = vscode.Uri.joinPath(workspaceFolder.uri, `mmt-${Date.now()}.md`);
	const targetUri = getTranslatedFileUri(sourceUri, 'zh-CN', false);

	await vscode.workspace.fs.writeFile(sourceUri, Buffer.from('# Hello\n', 'utf8'));
	const sourceDocument = await vscode.workspace.openTextDocument(sourceUri);
	await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
	await translateCurrentFile(provider, createTestMemento(), {
		createProvider: () => new TestProvider(),
		openTranslatedDocument: async () => undefined,
	});
	const translatedUri = provider.getTranslatedUri(sourceUri, 'zh-CN', false);

	await saveTranslatedFileForUri(provider, translatedUri, {
		confirmOverwrite: async () => true,
	});

	const saved = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8');
	assert.strictEqual(saved, '# [zh-CN] Hello\n');
});
```

Also add this overwrite cancellation test:

```ts
test('save command does not overwrite when confirmation is declined', async () => {
	const provider = new TranslatedDocumentProvider();
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	assert.ok(workspaceFolder);
	const sourceUri = vscode.Uri.joinPath(workspaceFolder.uri, `mmt-overwrite-${Date.now()}.md`);
	const targetUri = getTranslatedFileUri(sourceUri, 'zh-CN', false);

	await vscode.workspace.fs.writeFile(sourceUri, Buffer.from('# Hello\n', 'utf8'));
	await vscode.workspace.fs.writeFile(targetUri, Buffer.from('existing\n', 'utf8'));
	const sourceDocument = await vscode.workspace.openTextDocument(sourceUri);
	await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
	await translateCurrentFile(provider, createTestMemento(), {
		createProvider: () => new TestProvider(),
		openTranslatedDocument: async () => undefined,
	});
	const translatedUri = provider.getTranslatedUri(sourceUri, 'zh-CN', false);

	await saveTranslatedFileForUri(provider, translatedUri, {
		confirmOverwrite: async () => false,
	});

	const saved = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8');
	assert.strictEqual(saved, 'existing\n');
});
```

If the test workspace has no folder, use `vscode.workspace.openTextDocument({ content, language: 'markdown' })` for command tests and leave these file-write tests as helper-level tests only. The final manual verification still covers save-to-disk.

- [ ] **Step 5: Run save verification**

Run:

```bash
npm run compile-tests
npm test -- --grep "getTranslatedFileUri|save command writes|does not overwrite"
```

Expected: PASS when the VS Code test workspace has a writable folder. If no writable folder exists, keep the helper tests and document that the command write path was manually verified.

### Task 9: Final Integration Corrections And Full Verification

**Files:**
- Review: `src/commands/translateCurrentFile.ts`
- Review: `src/commands/saveTranslatedFile.ts`
- Review: `src/translation/scheduler.ts`
- Review: `src/cache/translationCache.ts`
- Review: `src/translation/providers/googleFreeTranslator.ts`
- Review: `src/test/`

- [ ] **Step 1: Run full TypeScript test compile**

Run:

```bash
npm run compile-tests
```

Expected: exits with code 0.

- [ ] **Step 2: Run type check**

Run:

```bash
npm run check-types
```

Expected: exits with code 0.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: exits with code 0.

- [ ] **Step 4: Run extension bundle compile**

Run:

```bash
npm run compile
```

Expected: exits with code 0.

- [ ] **Step 5: Run VS Code test suite**

Run with escalated permissions:

```bash
npm test
```

Expected: exits with code 0. The suite passes parser, renderer, cache, provider, scheduler, command, and save tests.

- [ ] **Step 6: Manual smoke test production behavior**

In the Extension Development Host:

1. Open a real `.md` file containing a heading, paragraph, inline code, link, and fenced code block.
2. Run `Markdown Mirror Translator: Translate Current File`.
3. Confirm the right editor opens immediately with Markdown source placeholder content.
4. Confirm translated content progressively replaces translatable blocks.
5. Confirm inline code, URLs, link destinations, frontmatter, HTML lines, and fenced code remain structurally intact.
6. Run `Markdown Mirror Translator: Save Translated File`.
7. Confirm `README.zh-CN.md` or `README.bilingual.zh-CN.md` is created beside the source file.
8. Run save again and confirm the overwrite prompt appears before replacing the existing file.

Expected: the MVP success criteria from `docs/basic-design.zh-CN.md` section 15 are satisfied.

## Self-Review Checklist

- [ ] **Requirement coverage:** Phase 3 tasks cover `google-free`, provider isolation, scheduler, concurrency, max-text splitting, cache, failure isolation, save-to-disk, translated file naming, overwrite confirmation, provider response parsing, scheduler tests, cache tests, save behavior tests, extension/integration tests, and Phase 1/2 edge-case corrections.
- [ ] **Scope check:** The plan does not add provider settings, AI translation, preview rendering, scroll sync, selection translation, batch translation, glossary, or automatic source watching.
- [ ] **Type consistency:** `TranslatorProvider`, `TranslateInput`, `TranslateResult`, `TranslationScheduler`, `TranslationCache`, and `TranslatedMarkdownBlock.state` names match across tasks.
- [ ] **Verification coverage:** The plan includes narrow test commands after each task and full verification at the end.
