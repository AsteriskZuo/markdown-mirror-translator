import * as assert from 'assert';
import type { MarkdownBlock } from '../../markdown/block';
import { MockTranslator } from '../../translation/providers/mockTranslator';

const translatableBlock: MarkdownBlock = {
	id: 'block-1',
	kind: 'paragraph',
	source: 'Hello __MMT_INLINE_0__\n',
	text: 'Hello __MMT_INLINE_0__',
	translatable: true,
	protectedInlines: [{ token: '__MMT_INLINE_0__', value: '`code`' }],
};

const protectedBlock: MarkdownBlock = {
	id: 'block-2',
	kind: 'fencedCode',
	source: '```ts\nconst value = 1;\n```\n',
	text: '',
	translatable: false,
	protectedInlines: [],
};

suite('Mock translator', () => {
	test('adds target language prefix to translatable blocks', async () => {
		const translator = new MockTranslator();
		const translated = await translator.translateBlocks({
			sourceLanguage: '',
			targetLanguage: 'zh-CN',
			blocks: [translatableBlock],
		});

		assert.strictEqual(translated[0].translatedText, '[zh-CN] Hello __MMT_INLINE_0__');
	});

	test('leaves protected blocks untranslated', async () => {
		const translator = new MockTranslator();
		const translated = await translator.translateBlocks({
			sourceLanguage: 'en',
			targetLanguage: 'ja',
			blocks: [protectedBlock],
		});

		assert.strictEqual(translated[0].translatedText, '');
		assert.strictEqual(translated[0].source, protectedBlock.source);
	});
});
