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
