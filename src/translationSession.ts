import * as vscode from 'vscode';
import type { MarkdownMirrorTranslatorConfig } from './config';
import type { MarkdownBlock, RenderMode, TranslatedMarkdownBlock, TranslationLineMapping } from './markdown/block';

export type TranslationSession = {
	sourceUri: vscode.Uri;
	translatedUri: vscode.Uri;
	sourceContent: string;
	sourceBlocks: MarkdownBlock[];
	translatedBlocks: TranslatedMarkdownBlock[];
	renderedContent: string;
	lineMappings: TranslationLineMapping[];
	renderMode: RenderMode;
	config: MarkdownMirrorTranslatorConfig;
	updatedAt: number;
};

export type CreateInitialSessionInput = {
	sourceUri: vscode.Uri;
	translatedUri: vscode.Uri;
	sourceContent: string;
	sourceBlocks?: MarkdownBlock[];
	translatedBlocks?: TranslatedMarkdownBlock[];
	renderedContent?: string;
	lineMappings?: TranslationLineMapping[];
	renderMode?: RenderMode;
	config: MarkdownMirrorTranslatorConfig;
};

export function createInitialSession(input: CreateInitialSessionInput): TranslationSession {
	return {
		sourceUri: input.sourceUri,
		translatedUri: input.translatedUri,
		sourceContent: input.sourceContent,
		sourceBlocks: input.sourceBlocks ?? [],
		translatedBlocks: input.translatedBlocks ?? [],
		renderedContent: input.renderedContent ?? input.sourceContent,
		lineMappings: input.lineMappings ?? [],
		renderMode: input.renderMode ?? (input.config.bilingual ? 'bilingual' : 'translated'),
		config: input.config,
		updatedAt: Date.now(),
	};
}

export function replaceRenderedContent(session: TranslationSession, renderedContent: string): TranslationSession {
	return {
		...session,
		renderedContent,
		updatedAt: Date.now(),
	};
}

export function replaceTranslatedBlocks(
	session: TranslationSession,
	translatedBlocks: TranslatedMarkdownBlock[],
	renderedContent: string,
	lineMappings: TranslationLineMapping[] = session.lineMappings,
): TranslationSession {
	return {
		...session,
		translatedBlocks,
		renderedContent,
		lineMappings,
		updatedAt: Date.now(),
	};
}
