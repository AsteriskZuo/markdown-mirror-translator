export type MarkdownBlockKind =
	| 'frontmatter'
	| 'blank'
	| 'heading'
	| 'paragraph'
	| 'listItem'
	| 'blockquote'
	| 'tableRow'
	| 'fencedCode'
	| 'html'
	| 'protected';

export type MarkdownBlockState = 'pending' | 'translating' | 'translated' | 'failed' | 'skipped';

export type ProtectedInlineToken = {
	token: string;
	value: string;
};

export type MarkdownBlock = {
	id: string;
	kind: MarkdownBlockKind;
	source: string;
	text: string;
	hash: string;
	translatable: boolean;
	state: MarkdownBlockState;
	protectedInlines: ProtectedInlineToken[];
};

export type TranslatedMarkdownBlock = MarkdownBlock & {
	translatedText: string;
	errorMessage?: string;
};

export type RenderMode = 'translated' | 'bilingual';
