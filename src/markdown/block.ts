export type MarkdownBlockKind =
	| 'frontmatter'
	| 'blank'
	| 'heading'
	| 'paragraph'
	| 'listItem'
	| 'blockquote'
	| 'table'
	| 'tableRow'
	| 'fencedCode'
	| 'html'
	| 'protected';

export type MarkdownBlockState = 'pending' | 'translating' | 'translated' | 'failed' | 'skipped';

export type ProtectedInlineToken = {
	token: string;
	value: string;
};

export type MarkdownTableAlignment = 'default' | 'left' | 'right' | 'center';

export type MarkdownTable = {
	header: string[];
	alignments: MarkdownTableAlignment[];
	rows: string[][];
};

export type TranslatedMarkdownTable = {
	header: string[];
	rows: string[][];
};

export type TableTranslationStrategy = 'adaptive' | 'row' | 'cell';

export type MarkdownBlock = {
	id: string;
	kind: MarkdownBlockKind;
	source: string;
	text: string;
	hash: string;
	translatable: boolean;
	state: MarkdownBlockState;
	protectedInlines: ProtectedInlineToken[];
	table?: MarkdownTable;
};

export type TranslatedMarkdownBlock = MarkdownBlock & {
	translatedText: string;
	errorMessage?: string;
	translatedTable?: TranslatedMarkdownTable;
};

export type RenderMode = 'translated' | 'bilingual';
