import type { TranslateInput, TranslateResult, TranslatorProvider } from '../types';

type MinimalFetchResponse = {
	ok: boolean;
	status: number;
	text(): Promise<string>;
};

type FetchLike = (url: URL) => Promise<MinimalFetchResponse>;

export class GoogleFreeTranslator implements TranslatorProvider {
	readonly id = 'google-free';
	readonly maxTextLength = 4_500;

	constructor(private readonly fetcher: FetchLike = defaultFetch) {}

	async translate(input: TranslateInput): Promise<TranslateResult> {
		const url = new URL('https://translate.googleapis.com/translate_a/single');
		url.searchParams.set('client', 'gtx');
		url.searchParams.set('sl', input.sourceLanguage.trim() || 'auto');
		url.searchParams.set('tl', input.targetLanguage);
		url.searchParams.set('dt', 't');
		url.searchParams.set('q', input.text);

		const response = await this.fetcher(url);
		const body = await response.text();

		if (!response.ok) {
			throw new Error(`Google free translator request failed with status ${response.status}`);
		}

		return {
			text: parseGoogleFreeResponse(body),
		};
	}
}

async function defaultFetch(url: URL): Promise<MinimalFetchResponse> {
	return fetch(url);
}

export function parseGoogleFreeResponse(body: string): string {
	const parsed = JSON.parse(body) as unknown;

	if (!Array.isArray(parsed) || !Array.isArray(parsed[0])) {
		throw new Error('Google free translator returned an unsupported response shape');
	}

	const translatedParts: string[] = [];
	for (const segment of parsed[0]) {
		if (!Array.isArray(segment) || typeof segment[0] !== 'string') {
			throw new Error('Google free translator returned an unsupported response shape');
		}

		translatedParts.push(segment[0]);
	}

	return translatedParts.join('');
}
