import * as assert from 'assert';
import { parseMarkdownBlocks } from '../../markdown/parser';

suite('Markdown parser', () => {
	test('parses headings, paragraphs, blank lines, and fenced code blocks', () => {
		const blocks = parseMarkdownBlocks('# Hello\n\nThis is `code` and https://example.com.\n\n```ts\nconst value = 1;\n```\n');

		assert.deepStrictEqual(
			blocks.map((block) => ({
				kind: block.kind,
				source: block.source,
				text: block.text,
				translatable: block.translatable,
			})),
			[
				{ kind: 'heading', source: '# Hello\n', text: 'Hello', translatable: true },
				{ kind: 'blank', source: '\n', text: '', translatable: false },
				{
					kind: 'paragraph',
					source: 'This is `code` and https://example.com.\n',
					text: 'This is __MMT_INLINE_0__ and __MMT_INLINE_1__.',
					translatable: true,
				},
				{ kind: 'blank', source: '\n', text: '', translatable: false },
				{ kind: 'fencedCode', source: '```ts\nconst value = 1;\n```\n', text: '', translatable: false },
			],
		);
		assert.deepStrictEqual(blocks[2].protectedInlines, [
			{ token: '__MMT_INLINE_0__', value: '`code`' },
			{ token: '__MMT_INLINE_1__', value: 'https://example.com' },
		]);
	});

	test('protects frontmatter, html lines, links, and image URLs', () => {
		const blocks = parseMarkdownBlocks('---\ntitle: Hello\n---\n\n- Read [docs](https://example.com/docs)\n> See ![alt](image.png)\n<div>raw</div>\n');

		assert.strictEqual(blocks[0].kind, 'frontmatter');
		assert.strictEqual(blocks[0].translatable, false);
		assert.strictEqual(blocks[2].kind, 'listItem');
		assert.strictEqual(blocks[2].text, 'Read [docs](__MMT_INLINE_0__)');
		assert.deepStrictEqual(blocks[2].protectedInlines, [
			{ token: '__MMT_INLINE_0__', value: 'https://example.com/docs' },
		]);
		assert.strictEqual(blocks[3].kind, 'blockquote');
		assert.strictEqual(blocks[3].text, 'See ![alt](__MMT_INLINE_0__)');
		assert.deepStrictEqual(blocks[3].protectedInlines, [
			{ token: '__MMT_INLINE_0__', value: 'image.png' },
		]);
		assert.strictEqual(blocks[4].kind, 'html');
		assert.strictEqual(blocks[4].translatable, false);
	});

	test('treats task list checkboxes as list item structure', () => {
		const blocks = parseMarkdownBlocks('  * [x] hello\n  2. [ ] world\n');

		assert.deepStrictEqual(
			blocks.map((block) => ({ kind: block.kind, source: block.source, text: block.text })),
			[
				{ kind: 'listItem', source: '  * [x] hello\n', text: 'hello' },
				{ kind: 'listItem', source: '  2. [ ] world\n', text: 'world' },
			],
		);
	});

	test('parses pipe tables as structured table blocks', () => {
		const blocks = parseMarkdownBlocks('| Name | Description |\n| --- | --- |\n| API | Local pipeline |\n');

		assert.strictEqual(blocks.length, 1);
		assert.strictEqual(blocks[0].kind, 'table');
		assert.strictEqual(blocks[0].translatable, true);
		assert.strictEqual(blocks[0].text, 'Name | Description\nAPI | Local pipeline');
		assert.deepStrictEqual(blocks[0].table, {
			header: ['Name', 'Description'],
			alignments: ['default', 'default'],
			rows: [['API', 'Local pipeline']],
		});
	});

	test('parses escaped pipes inside table cells without splitting the table', () => {
		const blocks = parseMarkdownBlocks("| Name | Type | Required |\n| --- | --- | --- |\n| `type` | `'easemob' \\| 'agora'` | No |\n| `logHandler` | `Function` | No |\n");

		assert.strictEqual(blocks.length, 1);
		assert.strictEqual(blocks[0].kind, 'table');
		assert.strictEqual(blocks[0].text, "Name | Type | Required\n__MMT_INLINE_0__ | __MMT_INLINE_1__ | No\n__MMT_INLINE_2__ | __MMT_INLINE_3__ | No");
		assert.deepStrictEqual(blocks[0].table, {
			header: ['Name', 'Type', 'Required'],
			alignments: ['default', 'default', 'default'],
			rows: [
				['__MMT_INLINE_0__', '__MMT_INLINE_1__', 'No'],
				['__MMT_INLINE_2__', '__MMT_INLINE_3__', 'No'],
			],
		});
		assert.deepStrictEqual(blocks[0].protectedInlines, [
			{ token: '__MMT_INLINE_0__', value: '`type`' },
			{ token: '__MMT_INLINE_1__', value: "`'easemob' \\| 'agora'`" },
			{ token: '__MMT_INLINE_2__', value: '`logHandler`' },
			{ token: '__MMT_INLINE_3__', value: '`Function`' },
		]);
	});

	test('keeps non-table pipe rows as table row blocks', () => {
		const blocks = parseMarkdownBlocks('| Name | Description |\n| API | Local pipeline |\n');

		assert.deepStrictEqual(
			blocks.map((block) => ({ kind: block.kind, text: block.text, translatable: block.translatable })),
			[
				{ kind: 'tableRow', text: '| Name | Description |', translatable: true },
				{ kind: 'tableRow', text: '| API | Local pipeline |', translatable: true },
			],
		);
	});

	test('adds parser version, hash, and initial state metadata', () => {
		const blocks = parseMarkdownBlocks('# Hello\n\n```ts\nconst value = 1;\n```\n');

		assert.strictEqual(typeof blocks[0].hash, 'string');
		assert.strictEqual(blocks[0].hash.length, 64);
		assert.strictEqual(blocks[0].state, 'pending');
		assert.strictEqual(blocks[2].state, 'skipped');

		const repeated = parseMarkdownBlocks('# Hello\n\n```ts\nconst value = 1;\n```\n');
		assert.strictEqual(blocks[0].hash, repeated[0].hash);
		assert.strictEqual(blocks[2].hash, repeated[2].hash);
	});
});
