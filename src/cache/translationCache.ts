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
