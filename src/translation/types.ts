import type { MarkdownBlock, TranslatedMarkdownBlock } from '../markdown/block';

export type TranslateBlocksRequest = {
	sourceLanguage: string;
	targetLanguage: string;
	blocks: MarkdownBlock[];
};

export interface MarkdownTranslator {
	translateBlocks(request: TranslateBlocksRequest): Promise<TranslatedMarkdownBlock[]>;
}
