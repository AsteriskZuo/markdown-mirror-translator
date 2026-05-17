import * as assert from 'assert';
import type { TranslatedMarkdownBlock } from '../../markdown/block';
import { renderMarkdown } from '../../markdown/renderer';

function block(input: Partial<TranslatedMarkdownBlock> & Pick<TranslatedMarkdownBlock, 'source' | 'translatedText'>): TranslatedMarkdownBlock {
	return {
		id: input.id ?? 'block-0',
		kind: input.kind ?? 'paragraph',
		source: input.source,
		text: input.text ?? input.source.trim(),
		hash: input.hash ?? 'hash-0',
		translatable: input.translatable ?? true,
		state: input.state ?? 'translated',
		protectedInlines: input.protectedInlines ?? [],
		table: input.table,
		translatedText: input.translatedText,
		errorMessage: input.errorMessage,
		translatedTable: input.translatedTable,
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

	test('renders consecutive bilingual list items without paragraph gaps', () => {
		const rendered = renderMarkdown(
			[
				block({
					kind: 'listItem',
					source: '- Alpha\n',
					text: 'Alpha',
					translatedText: '阿尔法',
				}),
				block({
					kind: 'listItem',
					source: '- Beta\n',
					text: 'Beta',
					translatedText: '贝塔',
				}),
			],
			'bilingual',
		);

		assert.strictEqual(rendered, '- Alpha\n- 阿尔法\n- Beta\n- 贝塔\n');
	});

	test('renders failed translatable blocks as their original source', () => {
		const rendered = renderMarkdown(
			[
				block({
					source: 'World\n',
					text: 'World',
					state: 'failed',
					translatedText: '',
					errorMessage: 'provider failed',
				}),
			],
			'translated',
		);

		assert.strictEqual(rendered, 'World\n');
	});

	test('renders translated tables from translated table cells', () => {
		const rendered = renderMarkdown(
			[
				block({
					kind: 'table',
					source: '| Name | Description |\n| --- | :---: |\n| API | Local pipeline |\n',
					text: 'Name | Description\nAPI | Local pipeline',
					table: {
						header: ['Name', 'Description'],
						alignments: ['default', 'center'],
						rows: [['API', 'Local pipeline']],
					},
					translatedTable: {
						header: ['名称', '描述'],
						rows: [['接口', '本地流水线']],
					},
					translatedText: '',
				}),
			],
			'translated',
		);

		assert.strictEqual(rendered, '| 名称 | 描述 |\n| --- | :---: |\n| 接口 | 本地流水线 |\n');
	});

	test('renders bilingual tables as source table followed by translated table', () => {
		const rendered = renderMarkdown(
			[
				block({
					kind: 'table',
					source: '| Name | Description |\n| --- | --- |\n| API | Local pipeline |\n',
					text: 'Name | Description\nAPI | Local pipeline',
					table: {
						header: ['Name', 'Description'],
						alignments: ['default', 'default'],
						rows: [['API', 'Local pipeline']],
					},
					translatedTable: {
						header: ['名称', '描述'],
						rows: [['接口', '本地流水线']],
					},
					translatedText: '',
				}),
			],
			'bilingual',
		);

		assert.strictEqual(
			rendered,
			'| Name | Description |\n| --- | --- |\n| API | Local pipeline |\n\n| 名称 | 描述 |\n| --- | --- |\n| 接口 | 本地流水线 |\n',
		);
	});
});
