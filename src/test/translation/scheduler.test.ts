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
