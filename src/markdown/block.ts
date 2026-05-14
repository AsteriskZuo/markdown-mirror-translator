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

export type ProtectedInlineToken = {
	token: string;
	value: string;
};

export type MarkdownBlock = {
	id: string;
	kind: MarkdownBlockKind;
	source: string;
	text: string;
	translatable: boolean;
	protectedInlines: ProtectedInlineToken[];
};

export type TranslatedMarkdownBlock = MarkdownBlock & {
	translatedText: string;
};

export type RenderMode = 'translated' | 'bilingual';
