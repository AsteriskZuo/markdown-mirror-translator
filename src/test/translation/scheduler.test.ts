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
	readonly inputs: TranslateInput[] = [];
	active = 0;
	maxActive = 0;

	constructor(
		private readonly failText?: string,
		readonly maxTextLength = 5,
	) {}

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

class MappingProvider implements TranslatorProvider {
	readonly id = 'mapping';
	readonly inputs: TranslateInput[] = [];

	constructor(
		private readonly translations: Record<string, string>,
		readonly maxTextLength = 500,
	) {}

	async translate(input: TranslateInput): Promise<TranslateResult> {
		this.inputs.push(input);
		return { text: this.translations[input.text] ?? `[${input.targetLanguage}] ${input.text}` };
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
		table: input.table,
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

	test('skips translation when source and target languages match', async () => {
		const provider = new RecordingProvider();
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		const result = await scheduler.translate({
			sourceLanguage: 'zh-CN',
			targetLanguage: 'zh-cn',
			blocks: [sourceBlock({ id: 'block-1', text: '你好', hash: 'hash-same-language' })],
		});

		assert.strictEqual(provider.inputs.length, 0);
		assert.strictEqual(result.failedBlockCount, 0);
		assert.strictEqual(result.blocks[0].translatedText, '你好');
		assert.strictEqual(result.blocks[0].state, 'translated');
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

	test('translates structured tables by adaptive row path by default', async () => {
		const provider = new RecordingProvider(undefined, 500);
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		const result = await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({
					id: 'block-table',
					kind: 'table',
					source: '| Name | Description |\n| --- | --- |\n| API | Local pipeline |\n',
					text: 'Name | Description\nAPI | Local pipeline',
					hash: 'hash-table',
					table: {
						header: ['Name', 'Description'],
						alignments: ['default', 'default'],
						rows: [['API', 'Local pipeline']],
					},
				}),
			],
		});

		assert.deepStrictEqual(provider.inputs.map((input) => input.text), ['Name | Description', 'API | Local pipeline']);
		assert.deepStrictEqual(result.blocks[0].translatedTable, {
			header: ['[zh-CN] Name', 'Description'],
			rows: [['[zh-CN] API', 'Local pipeline']],
		});
		assert.strictEqual(result.blocks[0].state, 'translated');
		assert.strictEqual(result.failedBlockCount, 0);
	});

	test('falls back to cell translation when adaptive row output cannot map to source columns', async () => {
		const provider = new MappingProvider({
			'Name | Description': '名称 描述',
			'API | Local pipeline': '接口 本地流水线',
			Name: '名称',
			Description: '描述',
			API: '接口',
			'Local pipeline': '本地流水线',
		});
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		const result = await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({
					id: 'block-table',
					kind: 'table',
					source: '| Name | Description |\n| --- | --- |\n| API | Local pipeline |\n',
					text: 'Name | Description\nAPI | Local pipeline',
					hash: 'hash-table-adaptive-mismatch',
					table: {
						header: ['Name', 'Description'],
						alignments: ['default', 'default'],
						rows: [['API', 'Local pipeline']],
					},
				}),
			],
		});

		assert.deepStrictEqual(provider.inputs.map((input) => input.text), [
			'Name | Description',
			'Name',
			'Description',
			'API | Local pipeline',
			'API',
			'Local pipeline',
		]);
		assert.deepStrictEqual(result.blocks[0].translatedTable, {
			header: ['名称', '描述'],
			rows: [['接口', '本地流水线']],
		});
		assert.strictEqual(result.blocks[0].state, 'translated');
		assert.strictEqual(result.failedBlockCount, 0);
	});

	test('falls back to cell translation when adaptive row input exceeds provider length', async () => {
		const provider = new MappingProvider({
			Short: '短',
			'Long cell': '长单元格',
		}, 10);
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		const result = await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({
					id: 'block-table',
					kind: 'table',
					source: '| Short | Long cell |\n| --- | --- |\n',
					text: 'Short | Long cell',
					hash: 'hash-table-adaptive-long-row',
					table: {
						header: ['Short', 'Long cell'],
						alignments: ['default', 'default'],
						rows: [],
					},
				}),
			],
		});

		assert.deepStrictEqual(provider.inputs.map((input) => input.text), ['Short', 'Long cell']);
		assert.deepStrictEqual(result.blocks[0].translatedTable, {
			header: ['短', '长单元格'],
			rows: [],
		});
		assert.strictEqual(result.blocks[0].state, 'translated');
		assert.strictEqual(result.failedBlockCount, 0);
	});

	test('falls back to cell translation when adaptive row translation fails', async () => {
		const provider = new RecordingProvider('Name | Description', 500);
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		const result = await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({
					id: 'block-table',
					kind: 'table',
					source: '| Name | Description |\n| --- | --- |\n',
					text: 'Name | Description',
					hash: 'hash-table-adaptive-row-fails',
					table: {
						header: ['Name', 'Description'],
						alignments: ['default', 'default'],
						rows: [],
					},
				}),
			],
		});

		assert.deepStrictEqual(provider.inputs.map((input) => input.text), [
			'Name | Description',
			'Name',
			'Description',
		]);
		assert.deepStrictEqual(result.blocks[0].translatedTable, {
			header: ['[zh-CN] Name', '[zh-CN] Description'],
			rows: [],
		});
		assert.strictEqual(result.blocks[0].state, 'translated');
		assert.strictEqual(result.failedBlockCount, 0);
	});

	test('falls back to cell translation when adaptive row output is empty', async () => {
		const provider = new MappingProvider({
			'Name | Description': '',
			Name: '名称',
			Description: '描述',
		});
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		const result = await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			blocks: [
				sourceBlock({
					id: 'block-table',
					kind: 'table',
					source: '| Name | Description |\n| --- | --- |\n',
					text: 'Name | Description',
					hash: 'hash-table-adaptive-row-empty',
					table: {
						header: ['Name', 'Description'],
						alignments: ['default', 'default'],
						rows: [],
					},
				}),
			],
		});

		assert.deepStrictEqual(provider.inputs.map((input) => input.text), [
			'Name | Description',
			'Name',
			'Description',
		]);
		assert.deepStrictEqual(result.blocks[0].translatedTable, {
			header: ['名称', '描述'],
			rows: [],
		});
		assert.strictEqual(result.blocks[0].state, 'translated');
		assert.strictEqual(result.failedBlockCount, 0);
	});

	test('translates structured tables by cell when requested', async () => {
		const provider = new RecordingProvider(undefined, 500);
		const scheduler = new TranslationScheduler(provider, new TranslationCache(new MemoryMemento()), {
			parserVersion: 'parser-v1',
			concurrency: 1,
		});

		const result = await scheduler.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			tableTranslationStrategy: 'cell',
			blocks: [
				sourceBlock({
					id: 'block-table',
					kind: 'table',
					source: '| Name | Description |\n| --- | --- |\n| API | Local pipeline |\n',
					text: 'Name | Description\nAPI | Local pipeline',
					hash: 'hash-table-cell',
					table: {
						header: ['Name', 'Description'],
						alignments: ['default', 'default'],
						rows: [['API', 'Local pipeline']],
					},
				}),
			],
		});

		assert.deepStrictEqual(provider.inputs.map((input) => input.text), ['Name', 'Description', 'API', 'Local pipeline']);
		assert.deepStrictEqual(result.blocks[0].translatedTable, {
			header: ['[zh-CN] Name', '[zh-CN] Description'],
			rows: [['[zh-CN] API', '[zh-CN] Local pipeline']],
		});
		assert.strictEqual(result.blocks[0].state, 'translated');
		assert.strictEqual(result.failedBlockCount, 0);
	});
});
