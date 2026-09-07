import * as assert from 'assert';
import { GoogleFreeTranslator } from '../../translation/providers/googleFreeTranslator';

suite('Google free translator provider', () => {
	test('builds request and parses translated text response', async () => {
		let requestedUrl = '';
		const translator = new GoogleFreeTranslator(async (url: URL) => {
			requestedUrl = url.toString();
			return {
				ok: true,
				status: 200,
				text: async () => '[[["你好","Hello",null,null,1]],null,"en"]',
			};
		});

		const result = await translator.translate({
			sourceLanguage: '',
			targetLanguage: 'zh-CN',
			text: 'Hello',
		});

		assert.strictEqual(translator.id, 'google-free');
		assert.strictEqual(result.text, '你好');
		assert.ok(requestedUrl.startsWith('https://translate.googleapis.com/translate_a/single?'));
		assert.ok(requestedUrl.includes('client=gtx'));
		assert.ok(requestedUrl.includes('sl=auto'));
		assert.ok(requestedUrl.includes('tl=zh-CN'));
		assert.ok(requestedUrl.includes('dt=t'));
		assert.ok(requestedUrl.includes('q=Hello'));
	});

	test('throws clear error for non-ok responses and malformed bodies', async () => {
		const failedTranslator = new GoogleFreeTranslator(async () => ({
			ok: false,
			status: 429,
			text: async () => 'rate limited',
		}));

		await assert.rejects(
			() =>
				failedTranslator.translate({
					sourceLanguage: 'en',
					targetLanguage: 'zh-CN',
					text: 'Hello',
				}),
			/Google free translator request failed with status 429/,
		);

		const malformedTranslator = new GoogleFreeTranslator(async () => ({
			ok: true,
			status: 200,
			text: async () => '{"unexpected":true}',
		}));

		await assert.rejects(
			() =>
				malformedTranslator.translate({
					sourceLanguage: 'en',
					targetLanguage: 'zh-CN',
					text: 'Hello',
				}),
			/Google free translator returned an unsupported response shape/,
		);
	});

	test('retries once after a timeout and succeeds', async () => {
		let requestCount = 0;
		const translator = new GoogleFreeTranslator(async () => {
			requestCount += 1;
			if (requestCount === 1) {
				throw createTimeoutError();
			}

			return {
				ok: true,
				status: 200,
				text: async () => '[[["你好","Hello",null,null,1]],null,"en"]',
			};
		}, 0);

		const result = await translator.translate({
			sourceLanguage: 'en',
			targetLanguage: 'zh-CN',
			text: 'Hello',
		});

		assert.strictEqual(result.text, '你好');
		assert.strictEqual(requestCount, 2);
	});

	test('reports timeout after retrying once', async () => {
		let requestCount = 0;
		const translator = new GoogleFreeTranslator(async () => {
			requestCount += 1;
			throw createTimeoutError();
		}, 0);

		await assert.rejects(
			() =>
				translator.translate({
					sourceLanguage: 'en',
					targetLanguage: 'zh-CN',
					text: 'Hello',
				}),
			/Google free translator request timed out after 30 seconds/,
		);
		assert.strictEqual(requestCount, 2);
	});

	test('does not retry non-timeout errors', async () => {
		let requestCount = 0;
		const translator = new GoogleFreeTranslator(async () => {
			requestCount += 1;
			throw new Error('connection refused');
		}, 0);

		await assert.rejects(
			() =>
				translator.translate({
					sourceLanguage: 'en',
					targetLanguage: 'zh-CN',
					text: 'Hello',
				}),
			/connection refused/,
		);
		assert.strictEqual(requestCount, 1);
	});
});

function createTimeoutError(): Error {
	const error = new Error('The operation timed out.');
	error.name = 'TimeoutError';
	return error;
}
