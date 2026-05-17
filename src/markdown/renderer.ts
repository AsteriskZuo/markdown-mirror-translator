import type { MarkdownTableAlignment, RenderMode, TranslatedMarkdownBlock, TranslationLineMapping } from './block';

const listItemPrefixPattern = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/;

function restoreInlineTokens(text: string, block: TranslatedMarkdownBlock): string {
	return block.protectedInlines.reduce(
		(current, protectedInline) => current.split(protectedInline.token).join(protectedInline.value),
		text,
	);
}

function ensureTrailingNewline(text: string): string {
	return text.endsWith('\n') ? text : `${text}\n`;
}

function renderTableSeparator(alignments: MarkdownTableAlignment[]): string {
	return alignments.map((alignment) => {
		if (alignment === 'left') {
			return ':---';
		}

		if (alignment === 'right') {
			return '---:';
		}

		if (alignment === 'center') {
			return ':---:';
		}

		return '---';
	}).join(' | ');
}

function renderTableRow(cells: string[], block: TranslatedMarkdownBlock): string {
	return `| ${cells.map((cell) => restoreInlineTokens(cell, block)).join(' | ')} |`;
}

export type RenderedMarkdownWithLineMappings = {
	markdown: string;
	lineMappings: TranslationLineMapping[];
};

export function getRenderedMarkdownLineCount(text: string): number {
	if (text.length === 0) {
		return 0;
	}

	const withoutTrailingNewline = text.endsWith('\n') ? text.slice(0, -1) : text;
	if (withoutTrailingNewline.length === 0) {
		return 1;
	}

	return withoutTrailingNewline.split('\n').length;
}

function getBlockSourceLineCount(block: TranslatedMarkdownBlock): number {
	return Math.max(1, getRenderedMarkdownLineCount(block.source));
}

function createLineMapping(
	block: TranslatedMarkdownBlock,
	sourceStartLine: number,
	translatedStartLine: number,
	renderedBlock: string,
): TranslationLineMapping {
	const sourceLineCount = getBlockSourceLineCount(block);
	const translatedLineCount = Math.max(1, getRenderedMarkdownLineCount(renderedBlock));

	return {
		blockId: block.id,
		sourceStartLine,
		sourceEndLine: sourceStartLine + sourceLineCount - 1,
		translatedStartLine,
		translatedEndLine: translatedStartLine + translatedLineCount - 1,
	};
}

export function createSourceLineMappings(blocks: TranslatedMarkdownBlock[]): TranslationLineMapping[] {
	const lineMappings: TranslationLineMapping[] = [];
	let sourceLine = 0;

	for (const block of blocks) {
		const lineCount = getBlockSourceLineCount(block);
		lineMappings.push({
			blockId: block.id,
			sourceStartLine: sourceLine,
			sourceEndLine: sourceLine + lineCount - 1,
			translatedStartLine: sourceLine,
			translatedEndLine: sourceLine + lineCount - 1,
		});
		sourceLine += lineCount;
	}

	return lineMappings;
}

function renderTranslatedTable(block: TranslatedMarkdownBlock): string {
	if (!block.table || !block.translatedTable) {
		return block.source;
	}

	return ensureTrailingNewline([
		renderTableRow(block.translatedTable.header, block),
		`| ${renderTableSeparator(block.table.alignments)} |`,
		...block.translatedTable.rows.map((row) => renderTableRow(row, block)),
	].join('\n'));
}

function renderTranslatedBlock(block: TranslatedMarkdownBlock): string {
	if (!block.translatable) {
		return block.source;
	}

	if (block.state === 'failed') {
		return block.source;
	}

	if (block.kind === 'table') {
		return renderTranslatedTable(block);
	}

	const translatedText = restoreInlineTokens(block.translatedText, block);

	if (block.kind === 'heading') {
		const prefix = block.source.match(/^(#{1,6}\s*)/)?.[1] ?? '';
		return ensureTrailingNewline(`${prefix}${translatedText}`);
	}

	if (block.kind === 'listItem') {
		const prefix = block.source.match(listItemPrefixPattern)?.[1] ?? '';
		return ensureTrailingNewline(`${prefix}${translatedText}`);
	}

	if (block.kind === 'blockquote') {
		const prefix = block.source.match(/^(>\s?)/)?.[1] ?? '> ';
		return ensureTrailingNewline(`${prefix}${translatedText}`);
	}

	return ensureTrailingNewline(translatedText);
}

function renderBilingualBlock(block: TranslatedMarkdownBlock): string {
	if (!block.translatable) {
		return block.source;
	}

	return `${ensureTrailingNewline(block.source)}${renderTranslatedBlock(block)}`;
}

export function renderMarkdownWithLineMappings(
	blocks: TranslatedMarkdownBlock[],
	mode: RenderMode,
): RenderedMarkdownWithLineMappings {
	let markdown = '';
	const lineMappings: TranslationLineMapping[] = [];
	let sourceLine = 0;
	let translatedLine = 0;

	for (const block of blocks) {
		const renderedBlock = mode === 'translated' ? renderTranslatedBlock(block) : renderBilingualBlock(block);
		lineMappings.push(createLineMapping(block, sourceLine, translatedLine, renderedBlock));
		markdown += renderedBlock;
		sourceLine += getBlockSourceLineCount(block);
		translatedLine += Math.max(1, getRenderedMarkdownLineCount(renderedBlock));
	}

	return { markdown, lineMappings };
}

export function renderMarkdown(blocks: TranslatedMarkdownBlock[], mode: RenderMode): string {
	return renderMarkdownWithLineMappings(blocks, mode).markdown;
}
