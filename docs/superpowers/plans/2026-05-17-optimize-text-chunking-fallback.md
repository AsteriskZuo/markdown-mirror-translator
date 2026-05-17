# Optimize Text Chunking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hard-length text slicing with language-neutral semantic chunking for normal text translation.

**Architecture:** Keep translation scheduling behavior unchanged except for the text splitter used by `translateTextInChunks()`. The new splitter chooses the best safe boundary within `provider.maxTextLength`, preserves protected inline placeholder tokens, and falls back to hard slicing only when no semantic or whitespace boundary is available.

**Tech Stack:** TypeScript, existing `TranslationScheduler`, existing `TranslatorProvider` interface, Mocha TDD tests under `src/test/translation/scheduler.test.ts`.

---

## Constraints

- Implement only the ordinary text chunking strategy.
- Do not implement chunk-level retry, partial block failure, `partial` states, `failedChunkCount`, or any other failure degradation behavior in this task.
- Preserve current failure behavior: if any chunk translation throws, the owning block remains `failed` and `failedBlockCount` increments.
- Do not add dependencies.
- Do not change provider APIs, cache keys, parser output, renderer behavior, or table translation strategy.
- Keep `translateTextInChunks()` joining translated chunks with `''`, matching the current behavior.
- Use language-neutral boundaries only; do not detect source language before chunking.
- Do not create task-level commits during execution; commit all plan, test, and implementation changes together after final verification.

## Non-Goals

- No chunk-level failure fallback.
- No recursive retry with smaller chunks.
- No UI state changes for partial translation.
- No statistics changes for partial failures.
- No full Markdown AST parsing.

## Affected Files

- Modify: `src/translation/scheduler.ts`
  - Replace `splitText()` hard slicing with semantic chunking.
  - Add focused helper functions inside this file unless extraction becomes clearly useful during implementation.
- Modify: `src/test/translation/scheduler.test.ts`
  - Add focused scheduler tests that observe provider input chunks.
- Documentation: this plan only. No user-facing docs update is required because the change is internal translation quality behavior.

## Chunking Rules

The splitter must use this priority order when selecting the best split point at or before `maxTextLength`:

1. Strong boundary: blank line, newline, Chinese/Japanese sentence punctuation `。！？`, English `!` and `?`, and conservative English `.`.
2. Medium boundary: `；`, `;`, `：`, `:`.
3. Weak boundary: `，`, `,`, `、`.
4. Whitespace boundary: Unicode whitespace.
5. Fallback: hard split at `maxTextLength`.

English `.` is a sentence boundary only when the dot is followed by Unicode whitespace or the end of the text. This avoids treating common decimals, versions, and domains as sentence boundaries.

Protected inline tokens matching `__MMT_INLINE_<digits>__` must not be split. If `maxTextLength` lands inside a token, choose an earlier boundary before the token when possible. If no earlier boundary exists, keep the whole token in the current chunk even if that chunk exceeds `maxTextLength`; this is preferable to corrupting placeholder restoration.

## Verification

- Run `npm run compile-tests`.
- Run focused scheduler tests:

```bash
node_modules/.bin/mocha --ui tdd out/test/translation/scheduler.test.js
```

- Run `npm run check-types`.
- Run `npm run lint`.
- Run `npm test` with escalated permissions for final verification, as required by `AGENTS.md`.

---

### Task 1: Add Semantic Chunking Tests

**Files:**
- Modify: `src/test/translation/scheduler.test.ts`

- [ ] **Step 1: Add a test for sentence and punctuation boundaries**

Add this test inside `suite('Translation scheduler', () => { ... })`, near the existing `splits long text and limits concurrency` test:

```ts
	test('splits long text on semantic boundaries before hard limits', async () => {
		const provider = new RecordingProvider(undefined, 18);
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		const result = await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({
					id: 'block-1',
					text: 'First sentence. Second clause; third part, final',
					hash: 'hash-semantic-chunks',
				}),
			],
		});

		assert.deepStrictEqual(provider.inputs.map((input) => input.text), [
			'First sentence. ',
			'Second clause; ',
			'third part, final',
		]);
		assert.strictEqual(
			result.blocks[0].translatedText,
			'[zh-CN] First sentence. [zh-CN] Second clause; [zh-CN] third part, final',
		);
		assert.strictEqual(result.blocks[0].state, 'translated');
		assert.strictEqual(result.failedBlockCount, 0);
	});
```

- [ ] **Step 2: Add a test for conservative English dot handling**

Add this test after the semantic boundary test:

```ts
	test('does not treat dots inside versions domains or decimals as sentence boundaries', async () => {
		const provider = new RecordingProvider(undefined, 16);
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({
					id: 'block-1',
					text: 'Use v1.2.3, api.example.com, and 3.14. Done.',
					hash: 'hash-dot-chunks',
				}),
			],
		});

		assert.deepStrictEqual(provider.inputs.map((input) => input.text), [
			'Use v1.2.3, ',
			'api.example.com, ',
			'and 3.14. Done.',
		]);
	});
```

- [ ] **Step 3: Add a test for protected inline tokens**

Add this test after the conservative dot test:

```ts
	test('does not split protected inline tokens', async () => {
		const provider = new RecordingProvider(undefined, 20);
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({
					id: 'block-1',
					text: 'Read __MMT_INLINE_0__ before continuing with the paragraph.',
					hash: 'hash-inline-token-chunks',
					protectedInlines: [{ token: '__MMT_INLINE_0__', value: '`code`' }],
				}),
			],
		});

		assert.deepStrictEqual(provider.inputs.map((input) => input.text), [
			'Read ',
			'__MMT_INLINE_0__ ',
			'before continuing ',
			'with the paragraph.',
		]);
	});
```

- [ ] **Step 4: Verify the new tests fail for the expected reason**

Run:

```bash
npm run compile-tests
node_modules/.bin/mocha --ui tdd out/test/translation/scheduler.test.js
```

Expected: the new tests fail because provider inputs still show hard slices such as `First sentence. Se`, or because protected inline tokens are split.

- [ ] **Step 5: Keep the failing tests uncommitted**

Do not commit after this task. Keep the test changes in the working tree so all tasks can be committed together after final verification.

---

### Task 2: Implement Semantic Split Selection

**Files:**
- Modify: `src/translation/scheduler.ts`

- [ ] **Step 1: Replace the existing `splitText()` implementation**

Replace the current `splitText()` function at the bottom of `src/translation/scheduler.ts` with this implementation:

```ts
type SplitBoundary = {
	index: number;
	priority: number;
};

const protectedInlineTokenPattern = /__MMT_INLINE_\d+__/g;

function splitText(text: string, maxTextLength: number): string[] {
	if (text.length <= maxTextLength) {
		return [text];
	}

	const chunks: string[] = [];
	let start = 0;

	while (start < text.length) {
		if (text.length - start <= maxTextLength) {
			chunks.push(text.slice(start));
			break;
		}

		const preferredEnd = findPreferredChunkEnd(text, start, maxTextLength);
		chunks.push(text.slice(start, preferredEnd));
		start = preferredEnd;
	}

	return chunks;
}

function findPreferredChunkEnd(text: string, start: number, maxTextLength: number): number {
	const hardEnd = Math.min(text.length, start + maxTextLength);
	const protectedSafeEnd = moveEndBeforeProtectedToken(text, start, hardEnd);
	const searchEnd = protectedSafeEnd > start ? protectedSafeEnd : hardEnd;
	const boundary = findBestBoundary(text, start, searchEnd);

	if (boundary !== undefined) {
		return boundary.index;
	}

	if (protectedSafeEnd > start) {
		return protectedSafeEnd;
	}

	const tokenEnd = findProtectedTokenEndCovering(text, hardEnd);
	if (tokenEnd !== undefined) {
		return tokenEnd;
	}

	return hardEnd;
}

function findBestBoundary(text: string, start: number, end: number): SplitBoundary | undefined {
	let best: SplitBoundary | undefined;

	for (let index = start; index < end; index += 1) {
		const nextIndex = index + 1;
		const char = text[index];
		const nextChar = text[nextIndex];
		const priority = getBoundaryPriority(text, index, nextChar);

		if (priority === 0 || nextIndex <= start) {
			continue;
		}

		if (best === undefined || priority > best.priority || (priority === best.priority && nextIndex > best.index)) {
			best = { index: nextIndex, priority };
		}
	}

	return best;
}

function getBoundaryPriority(text: string, index: number, nextChar: string | undefined): number {
	const char = text[index];

	if (char === '\n') {
		return 5;
	}

	if (char === '。' || char === '！' || char === '？' || char === '!' || char === '?') {
		return 5;
	}

	if (char === '.' && (nextChar === undefined || index + 1 === text.length || /\s/u.test(nextChar))) {
		return 5;
	}

	if (char === '；' || char === ';' || char === '：' || char === ':') {
		return 4;
	}

	if (char === '，' || char === ',' || char === '、') {
		return 3;
	}

	if (/\s/u.test(char)) {
		return 1;
	}

	return 0;
}

function moveEndBeforeProtectedToken(text: string, start: number, end: number): number {
	for (const match of text.matchAll(protectedInlineTokenPattern)) {
		const tokenStart = match.index;
		if (tokenStart === undefined) {
			continue;
		}

		const tokenEnd = tokenStart + match[0].length;
		if (tokenStart < end && tokenEnd > end) {
			return tokenStart > start ? tokenStart : start;
		}
	}

	return end;
}

function findProtectedTokenEndCovering(text: string, index: number): number | undefined {
	for (const match of text.matchAll(protectedInlineTokenPattern)) {
		const tokenStart = match.index;
		if (tokenStart === undefined) {
			continue;
		}

		const tokenEnd = tokenStart + match[0].length;
		if (tokenStart < index && tokenEnd > index) {
			return tokenEnd;
		}
	}

	return undefined;
}
```

- [ ] **Step 2: Run the focused scheduler tests**

Run:

```bash
npm run compile-tests
node_modules/.bin/mocha --ui tdd out/test/translation/scheduler.test.js
```

Expected: all scheduler tests pass.

- [ ] **Step 3: Keep the implementation uncommitted**

Do not commit after this task. Keep the implementation changes in the working tree so all tasks can be committed together after final verification.

---

### Task 3: Preserve Existing Failure Behavior

**Files:**
- Modify: `src/test/translation/scheduler.test.ts`

- [ ] **Step 1: Add a regression test proving chunk failure still fails the whole block**

Add this test near the existing `keeps failed blocks as source through failed state` test:

```ts
	test('keeps block-level failure behavior when a semantic chunk fails', async () => {
		const provider = new RecordingProvider('Second sentence.', 18);
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		const result = await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({
					id: 'block-1',
					text: 'First sentence. Second sentence.',
					hash: 'hash-semantic-chunk-failure',
				}),
			],
		});

		assert.deepStrictEqual(provider.inputs.map((input) => input.text), [
			'First sentence. ',
			'Second sentence.',
		]);
		assert.strictEqual(result.failedBlockCount, 1);
		assert.strictEqual(result.blocks[0].state, 'failed');
		assert.strictEqual(result.blocks[0].translatedText, '');
		assert.match(result.blocks[0].errorMessage ?? '', /provider failed/);
	});
```

- [ ] **Step 2: Run the regression test**

Run:

```bash
npm run compile-tests
node_modules/.bin/mocha --ui tdd out/test/translation/scheduler.test.js --grep "semantic chunk fails"
```

Expected: the test passes without adding chunk-level fallback logic.

- [ ] **Step 3: Keep the regression coverage uncommitted**

Do not commit after this task. Keep the regression test changes in the working tree so all tasks can be committed together after final verification.

---

### Task 4: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run compile-tests**

```bash
npm run compile-tests
```

Expected: TypeScript test compilation succeeds.

- [ ] **Step 2: Run focused scheduler tests**

```bash
node_modules/.bin/mocha --ui tdd out/test/translation/scheduler.test.js
```

Expected: all scheduler tests pass.

- [ ] **Step 3: Run type checks**

```bash
npm run check-types
```

Expected: no TypeScript errors.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: no ESLint errors.

- [ ] **Step 5: Run the full VS Code extension test suite**

Run with escalated permissions as required by `AGENTS.md`:

```bash
npm test
```

Expected: full test suite passes. If VS Code/Electron startup fails before tests execute, record the exact startup failure and keep the focused TypeScript/Mocha verification results in the handoff.

- [ ] **Step 6: Confirm no failure fallback was added**

Review:

```bash
git diff main...HEAD -- src/translation/scheduler.ts src/test/translation/scheduler.test.ts
```

Expected:
- `splitText()` and helper tests changed.
- `translateTextInChunks()` still throws if any provider chunk throws.
- `TranslationSchedulerResult` still has only `blocks` and `failedBlockCount`.
- No `partial` state, `failedChunkCount`, recursive retry, or chunk-level source-text splice fallback exists.

- [ ] **Step 7: Create one combined commit**

Run this once after all tests and diff checks pass:

```bash
git add docs/superpowers/plans/2026-05-17-optimize-text-chunking-fallback.md src/translation/scheduler.ts src/test/translation/scheduler.test.ts
git commit -m "feat: optimize text chunking"
```
