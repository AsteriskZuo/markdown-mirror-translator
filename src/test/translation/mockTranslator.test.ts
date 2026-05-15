import * as assert from 'assert';
import { MockTranslator } from '../../translation/providers/mockTranslator';

suite('Mock translator provider', () => {
	test('translates a single text request with target language prefix', async () => {
		const translator = new MockTranslator();
		const result = await translator.translate({
			sourceLanguage: '',
			targetLanguage: 'zh-CN',
			text: 'Hello __MMT_INLINE_0__',
		});

		assert.strictEqual(translator.id, 'mock');
		assert.strictEqual(result.text, '[zh-CN] Hello __MMT_INLINE_0__');
	});
});
