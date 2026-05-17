import type { MarkdownTableAlignment, RenderMode, TranslatedMarkdownBlock } from './block';

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
		if (block.kind === 'blank') {
			return '';
		}

		return block.source;
	}

	if (block.kind === 'listItem') {
		return `${ensureTrailingNewline(block.source).trimEnd()}\n${renderTranslatedBlock(block).trimEnd()}\n`;
	}

	return `${ensureTrailingNewline(block.source).trimEnd()}\n\n${renderTranslatedBlock(block).trimEnd()}\n`;
}

export function renderMarkdown(blocks: TranslatedMarkdownBlock[], mode: RenderMode): string {
	if (mode === 'translated') {
		return blocks.map(renderTranslatedBlock).join('');
	}

	let rendered = '';
	let previousRenderedKind: TranslatedMarkdownBlock['kind'] | undefined;
	let pendingBlankSeparator = false;

	for (const block of blocks) {
		const renderedBlock = renderBilingualBlock(block);

		if (renderedBlock.length === 0) {
			if (block.kind === 'blank' && rendered.length > 0) {
				pendingBlankSeparator = true;
			}
			continue;
		}

		const joinsConsecutiveListItems = previousRenderedKind === 'listItem' && block.kind === 'listItem';
		if (rendered.length > 0 && (pendingBlankSeparator || !joinsConsecutiveListItems)) {
			rendered += '\n';
		}

		rendered += renderedBlock;
		previousRenderedKind = block.kind;
		pendingBlankSeparator = false;
	}

	return rendered;
}
