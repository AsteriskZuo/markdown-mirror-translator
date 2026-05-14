import * as vscode from 'vscode';
import type { MarkdownMirrorTranslatorConfig } from './config';

export type TranslationSession = {
	sourceUri: vscode.Uri;
	translatedUri: vscode.Uri;
	sourceContent: string;
	renderedContent: string;
	config: MarkdownMirrorTranslatorConfig;
	updatedAt: number;
};

export type CreateInitialSessionInput = {
	sourceUri: vscode.Uri;
	translatedUri: vscode.Uri;
	sourceContent: string;
	config: MarkdownMirrorTranslatorConfig;
};

export function createInitialSession(input: CreateInitialSessionInput): TranslationSession {
	return {
		sourceUri: input.sourceUri,
		translatedUri: input.translatedUri,
		sourceContent: input.sourceContent,
		renderedContent: input.sourceContent,
		config: input.config,
		updatedAt: Date.now(),
	};
}
