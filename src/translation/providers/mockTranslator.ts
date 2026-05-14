import type { TranslatedMarkdownBlock } from '../../markdown/block';
import type { MarkdownTranslator, TranslateBlocksRequest } from '../types';

export class MockTranslator implements MarkdownTranslator {
	async translateBlocks(request: TranslateBlocksRequest): Promise<TranslatedMarkdownBlock[]> {
		return request.blocks.map((block) => ({
			...block,
			translatedText: block.translatable ? `[${request.targetLanguage}] ${block.text}` : '',
		}));
	}
}
