import * as vscode from 'vscode';
import type { MarkdownMirrorTranslatorConfig } from './config';
import type { MarkdownBlock, RenderMode, TranslatedMarkdownBlock } from './markdown/block';

export type TranslationSession = {
	sourceUri: vscode.Uri;
	translatedUri: vscode.Uri;
	sourceContent: string;
	sourceBlocks: MarkdownBlock[];
	translatedBlocks: TranslatedMarkdownBlock[];
	renderedContent: string;
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
): TranslationSession {
	return {
		...session,
		translatedBlocks,
		renderedContent,
		updatedAt: Date.now(),
	};
}
