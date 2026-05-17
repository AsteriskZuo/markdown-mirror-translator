import * as assert from 'assert';
import type { TranslatedMarkdownBlock } from '../../markdown/block';
import {
	createSourceLineMappings,
	getRenderedMarkdownLineCount,
	renderMarkdown,
	renderMarkdownWithLineMappings,
} from '../../markdown/renderer';

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

	test('renders bilingual Markdown without manually inserted blank lines', () => {
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

		assert.strictEqual(rendered, '# Hello\n# [zh-CN] Hello\nWorld\n[zh-CN] World\n');
	});

	test('preserves original blank blocks without adding extra blank lines', () => {
		const rendered = renderMarkdown(
			[
				block({
					kind: 'heading',
					source: '# Hello\n',
					text: 'Hello',
					translatedText: '[zh-CN] Hello',
				}),
				block({
					id: 'block-1',
					kind: 'blank',
					source: '\n',
					text: '',
					translatable: false,
					translatedText: '',
				}),
				block({
					id: 'block-2',
					source: 'World\n',
					text: 'World',
					translatedText: '[zh-CN] World',
				}),
			],
			'bilingual',
		);

		assert.strictEqual(rendered, '# Hello\n# [zh-CN] Hello\n\nWorld\n[zh-CN] World\n');
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

	test('renders task list checkboxes as list structure before translated text', () => {
		const rendered = renderMarkdown(
			[
				block({
					kind: 'listItem',
					source: '  * [x] hello\n',
					text: 'hello',
					translatedText: '你好',
				}),
				block({
					kind: 'listItem',
					source: '  2. [ ] world\n',
					text: 'world',
					translatedText: '世界',
				}),
			],
			'bilingual',
		);

		assert.strictEqual(rendered, '  * [x] hello\n  * [x] 你好\n  2. [ ] world\n  2. [ ] 世界\n');
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
			'| Name | Description |\n| --- | --- |\n| API | Local pipeline |\n| 名称 | 描述 |\n| --- | --- |\n| 接口 | 本地流水线 |\n',
		);
	});

	test('returns translated-only block line mappings from emitted text', () => {
		const result = renderMarkdownWithLineMappings(
			[
				block({
					id: 'block-0',
					kind: 'heading',
					source: '# Hello\n',
					text: 'Hello',
					translatedText: '你好',
				}),
				block({
					id: 'block-1',
					kind: 'blank',
					source: '\n',
					text: '',
					translatable: false,
					translatedText: '',
				}),
				block({
					id: 'block-2',
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
			'translated',
		);

		assert.strictEqual(result.markdown, '# 你好\n\n| 名称 | 描述 |\n| --- | --- |\n| 接口 | 本地流水线 |\n');
		assert.deepStrictEqual(result.lineMappings, [
			{
				blockId: 'block-0',
				sourceStartLine: 0,
				sourceEndLine: 0,
				translatedStartLine: 0,
				translatedEndLine: 0,
			},
			{
				blockId: 'block-1',
				sourceStartLine: 1,
				sourceEndLine: 1,
				translatedStartLine: 1,
				translatedEndLine: 1,
			},
			{
				blockId: 'block-2',
				sourceStartLine: 2,
				sourceEndLine: 4,
				translatedStartLine: 2,
				translatedEndLine: 4,
			},
		]);
	});

	test('returns bilingual block line mappings without separator blank lines', () => {
		const result = renderMarkdownWithLineMappings(
			[
				block({
					id: 'block-0',
					kind: 'heading',
					source: '# Hello\n',
					text: 'Hello',
					translatedText: '你好',
				}),
				block({
					id: 'block-1',
					source: 'World\n',
					text: 'World',
					translatedText: '世界',
				}),
			],
			'bilingual',
		);

		assert.strictEqual(result.markdown, '# Hello\n# 你好\nWorld\n世界\n');
		assert.deepStrictEqual(result.lineMappings, [
			{
				blockId: 'block-0',
				sourceStartLine: 0,
				sourceEndLine: 0,
				translatedStartLine: 0,
				translatedEndLine: 1,
			},
			{
				blockId: 'block-1',
				sourceStartLine: 1,
				sourceEndLine: 1,
				translatedStartLine: 2,
				translatedEndLine: 3,
			},
		]);
	});

	test('returns source line mappings for initial source-content placeholder', () => {
		const result = createSourceLineMappings([
			block({
				id: 'block-0',
				kind: 'heading',
				source: '# Hello\n',
				text: 'Hello',
				translatedText: '',
			}),
			block({
				id: 'block-1',
				kind: 'fencedCode',
				source: '```ts\nconst value = 1;\n```\n',
				text: '',
				translatable: false,
				translatedText: '',
			}),
		]);

		assert.deepStrictEqual(result, [
			{
				blockId: 'block-0',
				sourceStartLine: 0,
				sourceEndLine: 0,
				translatedStartLine: 0,
				translatedEndLine: 0,
			},
			{
				blockId: 'block-1',
				sourceStartLine: 1,
				sourceEndLine: 3,
				translatedStartLine: 1,
				translatedEndLine: 3,
			},
		]);
	});

	test('counts rendered markdown lines without treating trailing newline as an extra line', () => {
		assert.strictEqual(getRenderedMarkdownLineCount(''), 0);
		assert.strictEqual(getRenderedMarkdownLineCount('\n'), 1);
		assert.strictEqual(getRenderedMarkdownLineCount('one\n'), 1);
		assert.strictEqual(getRenderedMarkdownLineCount('one\ntwo\n'), 2);
		assert.strictEqual(getRenderedMarkdownLineCount('one\ntwo'), 2);
	});
});
