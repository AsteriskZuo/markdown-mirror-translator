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
		const shouldSkipProvider = isSameLanguage(input.sourceLanguage, input.targetLanguage);
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

				if (shouldSkipProvider) {
					output[index] = { ...block, translatedText: block.text, state: 'translated' };
					completedBlockCount += 1;
					this.emitProgress(output, completedBlockCount, failedBlockCount);
					continue;
				}

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

function isSameLanguage(sourceLanguage: string, targetLanguage: string): boolean {
	const normalizedSourceLanguage = normalizeLanguageCode(sourceLanguage);
	const normalizedTargetLanguage = normalizeLanguageCode(targetLanguage);

	return normalizedSourceLanguage.length > 0 && normalizedSourceLanguage === normalizedTargetLanguage;
}

function normalizeLanguageCode(language: string): string {
	return language.trim().toLowerCase();
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
