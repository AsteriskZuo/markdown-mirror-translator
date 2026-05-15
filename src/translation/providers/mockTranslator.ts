import type { TranslateInput, TranslateResult, TranslatorProvider } from '../types';

export class MockTranslator implements TranslatorProvider {
	readonly id = 'mock';
	readonly maxTextLength = 5_000;

	async translate(input: TranslateInput): Promise<TranslateResult> {
		return {
			text: `[${input.targetLanguage}] ${input.text}`,
		};
	}
}
