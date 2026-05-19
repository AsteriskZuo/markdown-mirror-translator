import * as crypto from 'crypto';
import type { MarkdownBlock, MarkdownBlockKind, MarkdownTable, MarkdownTableAlignment, ProtectedInlineToken } from './block';

export const PARSER_VERSION = 'markdown-mirror-translator-parser-v3';

const inlinePatterns = [
	/`[^`\n]+`/g,
	/<[A-Za-z][^>\n]*>/g,
];

const markdownDestinationPattern = /(!?\[[^\]]*])\(([^)\s]+)(\s+"[^"]*")?\)/g;
const urlPattern = /https?:\/\/[^\s)]+/g;
const listItemPrefixPattern = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/;
const fencedCodePattern = /^([ \t]{0,3})(`{3,}|~{3,})(.*)$/;
const indentedCodePattern = /^(?: {4,}|\t)/;
const htmlBlockPattern = /^([ \t]{0,3})<([A-Za-z][\w:-]*)(?:\s[^>]*)?>\s*$/;

function hashBlock(kind: MarkdownBlockKind, text: string, source: string, protectedInlines: ProtectedInlineToken[]): string {
	const canonical = JSON.stringify({
		parserVersion: PARSER_VERSION,
		kind,
		text,
		source,
		protectedInlines,
	});
	return crypto.createHash('sha256').update(canonical).digest('hex');
}

function createBlock(
	index: number,
	kind: MarkdownBlockKind,
	source: string,
	text: string,
	translatable: boolean,
	protectedInlines: ProtectedInlineToken[] = [],
	table?: MarkdownTable,
): MarkdownBlock {
	return {
		id: `block-${index}`,
		kind,
		source,
		text,
		hash: hashBlock(kind, text, source, protectedInlines),
		translatable,
		state: translatable ? 'pending' : 'skipped',
		protectedInlines,
		table,
	};
}

function protectInlineText(text: string, tokenOffset = 0): { text: string; protectedInlines: ProtectedInlineToken[] } {
	const protectedInlines: ProtectedInlineToken[] = [];
	let protectedText = text.replace(
		markdownDestinationPattern,
		(_value: string, label: string, destination: string, title: string | undefined) => {
			const token = `__MMT_INLINE_${protectedInlines.length + tokenOffset}__`;
			protectedInlines.push({ token, value: destination });
			return `${label}(${token}${title ?? ''})`;
		},
	);

	for (const pattern of inlinePatterns) {
		protectedText = protectedText.replace(pattern, (value: string) => {
			const token = `__MMT_INLINE_${protectedInlines.length + tokenOffset}__`;
			protectedInlines.push({ token, value });
			return token;
		});
	}

	protectedText = protectedText.replace(urlPattern, (value: string) => {
		const trailingPunctuation = value.match(/[.,;:!?]+$/)?.[0] ?? '';
		const url = trailingPunctuation ? value.slice(0, -trailingPunctuation.length) : value;
		const token = `__MMT_INLINE_${protectedInlines.length + tokenOffset}__`;
		protectedInlines.push({ token, value: url });
		return `${token}${trailingPunctuation}`;
	});

	return { text: protectedText, protectedInlines };
}

function stripPrefix(line: string, kind: MarkdownBlockKind): string {
	const withoutNewline = line.replace(/\r?\n$/, '');

	if (kind === 'heading') {
		return withoutNewline.replace(/^#{1,6}\s*/, '');
	}

	if (kind === 'listItem') {
		return withoutNewline.replace(listItemPrefixPattern, '');
	}

	if (kind === 'blockquote') {
		return withoutNewline.replace(/^>\s?/, '');
	}

	if (kind === 'tableRow') {
		return withoutNewline;
	}

	return withoutNewline;
}

function classifyLine(line: string): MarkdownBlockKind {
	const withoutNewline = line.replace(/\r?\n$/, '');

	if (/^\s*$/.test(withoutNewline)) {
		return 'blank';
	}

	if (/^#{1,6}\s+/.test(withoutNewline)) {
		return 'heading';
	}

	if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(withoutNewline)) {
		return 'listItem';
	}

	if (/^>\s?/.test(withoutNewline)) {
		return 'blockquote';
	}

	if (/^\|.*\|\s*$/.test(withoutNewline)) {
		return 'tableRow';
	}

	if (/^\s*<[A-Za-z][^>]*>.*$/.test(withoutNewline)) {
		return 'html';
	}

	return 'paragraph';
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFrontmatterStart(lines: string[]): boolean {
	return lines.length > 0 && /^---\s*$/.test(lines[0]);
}

function consumeFrontmatter(lines: string[]): { source: string; nextIndex: number } | undefined {
	if (!isFrontmatterStart(lines)) {
		return undefined;
	}

	for (let index = 1; index < lines.length; index += 1) {
		if (/^---\s*$/.test(lines[index])) {
			return {
				source: lines.slice(0, index + 1).join(''),
				nextIndex: index + 1,
			};
		}
	}

	return undefined;
}

function consumeFencedCode(lines: string[], startIndex: number): { source: string; nextIndex: number } | undefined {
	const openingLine = lines[startIndex].replace(/\r?\n$/, '');
	const match = openingLine.match(fencedCodePattern);

	if (!match) {
		return undefined;
	}

	const fence = match[2];
	const closingPattern = new RegExp(`^[ \\t]{0,3}${escapeRegExp(fence)}[ \\t]*$`);

	for (let index = startIndex + 1; index < lines.length; index += 1) {
		if (closingPattern.test(lines[index].replace(/\r?\n$/, ''))) {
			return {
				source: lines.slice(startIndex, index + 1).join(''),
				nextIndex: index + 1,
			};
		}
	}

	return {
		source: lines.slice(startIndex).join(''),
		nextIndex: lines.length,
	};
}

function consumeIndentedCode(lines: string[], startIndex: number): { source: string; nextIndex: number } | undefined {
	if (!indentedCodePattern.test(lines[startIndex].replace(/\r?\n$/, ''))) {
		return undefined;
	}

	let nextIndex = startIndex + 1;
	while (nextIndex < lines.length) {
		const line = lines[nextIndex].replace(/\r?\n$/, '');
		if (line.length === 0) {
			let lookahead = nextIndex + 1;
			while (lookahead < lines.length && lines[lookahead].replace(/\r?\n$/, '').length === 0) {
				lookahead += 1;
			}

			if (lookahead >= lines.length || !indentedCodePattern.test(lines[lookahead].replace(/\r?\n$/, ''))) {
				break;
			}

			nextIndex = lookahead;
			continue;
		}

		if (!indentedCodePattern.test(line)) {
			break;
		}
		nextIndex += 1;
	}

	return {
		source: lines.slice(startIndex, nextIndex).join(''),
		nextIndex,
	};
}

function consumeHtmlBlock(lines: string[], startIndex: number): { source: string; nextIndex: number } | undefined {
	const openingLine = lines[startIndex].replace(/\r?\n$/, '');
	const match = openingLine.match(htmlBlockPattern);

	if (!match || /\/>\s*$/.test(openingLine)) {
		return undefined;
	}

	const tagName = match[2];
	const closingPattern = new RegExp(`^[ \\t]{0,3}</${escapeRegExp(tagName)}\\s*>\\s*$`, 'i');

	for (let index = startIndex + 1; index < lines.length; index += 1) {
		if (closingPattern.test(lines[index].replace(/\r?\n$/, ''))) {
			return {
				source: lines.slice(startIndex, index + 1).join(''),
				nextIndex: index + 1,
			};
		}
	}

	return {
		source: lines.slice(startIndex).join(''),
		nextIndex: lines.length,
	};
}

function isPipeTableRow(line: string): boolean {
	return /^\|.*\|\s*$/.test(line.replace(/\r?\n$/, ''));
}

function parsePipeCells(line: string): string[] {
	const withoutNewline = line.replace(/\r?\n$/, '').trim();
	const cells: string[] = [];
	let currentCell = '';
	let isEscaped = false;

	for (const character of withoutNewline.slice(1, -1)) {
		if (character === '|' && !isEscaped) {
			cells.push(currentCell.trim());
			currentCell = '';
			continue;
		}

		currentCell += character;
		isEscaped = character === '\\' && !isEscaped;
		if (character !== '\\') {
			isEscaped = false;
		}
	}

	cells.push(currentCell.trim());
	return cells;
}

function isSeparatorCell(cell: string): boolean {
	return /^:?-{3,}:?$/.test(cell.replace(/\s+/g, ''));
}

function parseAlignment(separatorCell: string): MarkdownTableAlignment {
	const normalized = separatorCell.replace(/\s+/g, '');
	const startsWithColon = normalized.startsWith(':');
	const endsWithColon = normalized.endsWith(':');

	if (startsWithColon && endsWithColon) {
		return 'center';
	}

	if (startsWithColon) {
		return 'left';
	}

	if (endsWithColon) {
		return 'right';
	}

	return 'default';
}

function consumeTable(lines: string[], startIndex: number): { source: string; text: string; table: MarkdownTable; protectedInlines: ProtectedInlineToken[]; nextIndex: number } | undefined {
	const headerLine = lines[startIndex];
	const separatorLine = lines[startIndex + 1];

	if (!headerLine || !separatorLine || !isPipeTableRow(headerLine) || !isPipeTableRow(separatorLine)) {
		return undefined;
	}

	const headerCells = parsePipeCells(headerLine);
	const separatorCells = parsePipeCells(separatorLine);

	if (
		headerCells.length === 0 ||
		headerCells.length !== separatorCells.length ||
		!separatorCells.every(isSeparatorCell)
	) {
		return undefined;
	}

	let nextIndex = startIndex + 2;
	const bodyRows: string[][] = [];

	while (nextIndex < lines.length && isPipeTableRow(lines[nextIndex])) {
		const rowCells = parsePipeCells(lines[nextIndex]);
		if (rowCells.length !== headerCells.length) {
			break;
		}
		bodyRows.push(rowCells);
		nextIndex += 1;
	}

	const protectedInlines: ProtectedInlineToken[] = [];
	const protectCell = (cell: string): string => {
		const protectedCell = protectInlineText(cell, protectedInlines.length);
		protectedInlines.push(...protectedCell.protectedInlines);
		return protectedCell.text;
	};
	const protectedHeader = headerCells.map(protectCell);
	const protectedRows = bodyRows.map((row) => row.map(protectCell));
	const text = [protectedHeader, ...protectedRows].map((row) => row.join(' | ')).join('\n');

	return {
		source: lines.slice(startIndex, nextIndex).join(''),
		text,
		table: {
			header: protectedHeader,
			alignments: separatorCells.map(parseAlignment),
			rows: protectedRows,
		},
		protectedInlines,
		nextIndex,
	};
}

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
	const lines = source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
	const blocks: MarkdownBlock[] = [];
	let index = 0;

	const frontmatter = consumeFrontmatter(lines);
	if (frontmatter) {
		blocks.push(createBlock(blocks.length, 'frontmatter', frontmatter.source, '', false));
		index = frontmatter.nextIndex;
	}

	while (index < lines.length) {
		const fencedCode = consumeFencedCode(lines, index);
		if (fencedCode) {
			blocks.push(createBlock(blocks.length, 'fencedCode', fencedCode.source, '', false));
			index = fencedCode.nextIndex;
			continue;
		}

		const indentedCode = consumeIndentedCode(lines, index);
		if (indentedCode) {
			blocks.push(createBlock(blocks.length, 'indentedCode', indentedCode.source, '', false));
			index = indentedCode.nextIndex;
			continue;
		}

		const htmlBlock = consumeHtmlBlock(lines, index);
		if (htmlBlock) {
			blocks.push(createBlock(blocks.length, 'html', htmlBlock.source, '', false));
			index = htmlBlock.nextIndex;
			continue;
		}

		const table = consumeTable(lines, index);
		if (table) {
			blocks.push(createBlock(blocks.length, 'table', table.source, table.text, true, table.protectedInlines, table.table));
			index = table.nextIndex;
			continue;
		}

		const line = lines[index];
		const kind = classifyLine(line);

		if (kind === 'blank' || kind === 'html') {
			blocks.push(createBlock(blocks.length, kind, line, '', false));
			index += 1;
			continue;
		}

		const stripped = stripPrefix(line, kind);
		const protectedText = protectInlineText(stripped);
		blocks.push(createBlock(blocks.length, kind, line, protectedText.text, true, protectedText.protectedInlines));
		index += 1;
	}

	return blocks;
}
