import * as assert from 'assert';
import type { TranslatedMarkdownBlock } from '../../markdown/block';
import { renderMarkdown } from '../../markdown/renderer';

function block(input: Partial<TranslatedMarkdownBlock> & Pick<TranslatedMarkdownBlock, 'source' | 'translatedText'>): TranslatedMarkdownBlock {
	return {
		id: input.id ?? 'block-0',
		kind: input.kind ?? 'paragraph',
		source: input.source,
		text: input.text ?? input.source.trim(),
		translatable: input.translatable ?? true,
		protectedInlines: input.protectedInlines ?? [],
		translatedText: input.translatedText,
	};
}

suite('Markdown renderer', () => {
	test('renders translated-only Markdown with restored inline tokens', () => {
		const rendered = renderMarkdown(
			[
				block({
					kind: 'heading',
					source: '# Hello\n',
					text: 'Hello',
					translatedText: '[zh-CN] Hello',
				}),
				block({
					kind: 'blank',
					source: '\n',
					text: '',
					translatable: false,
					translatedText: '',
				}),
				block({
					source: 'Read `code`.\n',
					text: 'Read __MMT_INLINE_0__.',
					protectedInlines: [{ token: '__MMT_INLINE_0__', value: '`code`' }],
					translatedText: '[zh-CN] Read __MMT_INLINE_0__.',
				}),
			],
			'translated',
		);

		assert.strictEqual(rendered, '# [zh-CN] Hello\n\n[zh-CN] Read `code`.\n');
	});

	test('renders bilingual Markdown as source block followed by translated block', () => {
		const rendered = renderMarkdown(
			[
				block({
					kind: 'heading',
					source: '# Hello\n',
					text: 'Hello',
					translatedText: '[zh-CN] Hello',
				}),
				block({
					source: 'World\n',
					text: 'World',
					translatedText: '[zh-CN] World',
				}),
			],
			'bilingual',
		);

		assert.strictEqual(rendered, '# Hello\n\n# [zh-CN] Hello\n\nWorld\n\n[zh-CN] World\n');
	});
});
