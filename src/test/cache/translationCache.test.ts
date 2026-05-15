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
