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

	test('marks table rows as translatable blocks', () => {
		const blocks = parseMarkdownBlocks('| Name | Description |\n| --- | --- |\n| API | Local pipeline |\n');

		assert.deepStrictEqual(
			blocks.map((block) => ({ kind: block.kind, text: block.text, translatable: block.translatable })),
			[
				{ kind: 'tableRow', text: '| Name | Description |', translatable: true },
				{ kind: 'tableRow', text: '| --- | --- |', translatable: true },
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
