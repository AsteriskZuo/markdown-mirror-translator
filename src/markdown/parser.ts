import * as crypto from 'crypto';
import type { MarkdownBlock, MarkdownBlockKind, ProtectedInlineToken } from './block';

export const PARSER_VERSION = 'markdown-mirror-translator-parser-v1';

const inlinePatterns = [
	/`[^`\n]+`/g,
	/<[A-Za-z][^>\n]*>/g,
];

const markdownDestinationPattern = /(!?\[[^\]]*])\(([^)\s]+)(\s+"[^"]*")?\)/g;
const urlPattern = /https?:\/\/[^\s)]+/g;

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
	};
}

function protectInlineText(text: string): { text: string; protectedInlines: ProtectedInlineToken[] } {
	const protectedInlines: ProtectedInlineToken[] = [];
	let protectedText = text.replace(
		markdownDestinationPattern,
		(_value: string, label: string, destination: string, title: string | undefined) => {
			const token = `__MMT_INLINE_${protectedInlines.length}__`;
			protectedInlines.push({ token, value: destination });
			return `${label}(${token}${title ?? ''})`;
		},
	);

	for (const pattern of inlinePatterns) {
		protectedText = protectedText.replace(pattern, (value: string) => {
			const token = `__MMT_INLINE_${protectedInlines.length}__`;
			protectedInlines.push({ token, value });
			return token;
		});
	}

	protectedText = protectedText.replace(urlPattern, (value: string) => {
		const trailingPunctuation = value.match(/[.,;:!?]+$/)?.[0] ?? '';
		const url = trailingPunctuation ? value.slice(0, -trailingPunctuation.length) : value;
		const token = `__MMT_INLINE_${protectedInlines.length}__`;
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
		return withoutNewline.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
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

function consumeFencedCode(lines: string[], startIndex: number): { source: string; nextIndex: number } {
	const fence = lines[startIndex].match(/^(```|~~~)/)?.[1] ?? '```';

	for (let index = startIndex + 1; index < lines.length; index += 1) {
		if (lines[index].startsWith(fence)) {
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
		const line = lines[index];

		if (/^(```|~~~)/.test(line)) {
			const fencedCode = consumeFencedCode(lines, index);
			blocks.push(createBlock(blocks.length, 'fencedCode', fencedCode.source, '', false));
			index = fencedCode.nextIndex;
			continue;
		}

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
