import type { RenderMode, TranslatedMarkdownBlock } from './block';

function restoreInlineTokens(text: string, block: TranslatedMarkdownBlock): string {
	return block.protectedInlines.reduce(
		(current, protectedInline) => current.split(protectedInline.token).join(protectedInline.value),
		text,
	);
}

function ensureTrailingNewline(text: string): string {
	return text.endsWith('\n') ? text : `${text}\n`;
}

function renderTranslatedBlock(block: TranslatedMarkdownBlock): string {
	if (!block.translatable) {
		return block.source;
	}

	if (block.state === 'failed') {
		return block.source;
	}

	const translatedText = restoreInlineTokens(block.translatedText, block);

	if (block.kind === 'heading') {
		const prefix = block.source.match(/^(#{1,6}\s*)/)?.[1] ?? '';
		return ensureTrailingNewline(`${prefix}${translatedText}`);
	}

	if (block.kind === 'listItem') {
		const prefix = block.source.match(/^(\s*(?:[-*+]|\d+[.)])\s+)/)?.[1] ?? '';
		return ensureTrailingNewline(`${prefix}${translatedText}`);
	}

	if (block.kind === 'blockquote') {
		const prefix = block.source.match(/^(>\s?)/)?.[1] ?? '> ';
		return ensureTrailingNewline(`${prefix}${translatedText}`);
	}

	return ensureTrailingNewline(translatedText);
}

function joinBilingualPairs(pairs: string[]): string {
	return pairs.filter((pair) => pair.length > 0).join('\n');
}

export function renderMarkdown(blocks: TranslatedMarkdownBlock[], mode: RenderMode): string {
	if (mode === 'translated') {
		return blocks.map(renderTranslatedBlock).join('');
	}

	const pairs = blocks.map((block) => {
		if (!block.translatable) {
			if (block.kind === 'blank') {
				return '';
			}

			return block.source;
		}

		return `${ensureTrailingNewline(block.source).trimEnd()}\n\n${renderTranslatedBlock(block).trimEnd()}\n`;
	});

	return joinBilingualPairs(pairs);
}
