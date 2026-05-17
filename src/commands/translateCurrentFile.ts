import * as vscode from 'vscode';
import type * as vscodeTypes from 'vscode';
import { TranslationCache } from '../cache/translationCache';
import { getConfig } from '../config';
import { translatedDocumentScheme, TranslatedDocumentProvider } from '../document/translatedDocumentProvider';
import { parseMarkdownBlocks } from '../markdown/parser';
import { createSourceLineMappings, renderMarkdownWithLineMappings } from '../markdown/renderer';
import { createThrottledRefresh } from '../refresh/throttledRefresh';
import { GoogleFreeTranslator } from '../translation/providers/googleFreeTranslator';
import { TranslationScheduler } from '../translation/scheduler';
import type { TranslatorProvider } from '../translation/types';
import { createInitialSession, replaceTranslatedBlocks } from '../translationSession';

const translateCommandId = 'markdown-mirror-translator.translateCurrentFile';
const virtualDocumentRefreshDelayMs = 400;
const smallDocumentMaxCharacters = 20_000;
const largeDocumentMaxCharacters = 200_000;
const translationConcurrency = 3;

type MarkdownDocumentIdentity = Pick<vscode.TextDocument, 'uri' | 'languageId' | 'fileName'>;

export type TranslateCurrentFileDependencies = {
	createProvider?: () => TranslatorProvider;
	createCache?: () => TranslationCache;
	openTranslatedDocument?: (uri: vscode.Uri) => Promise<void>;
};

export function isTranslatableMarkdownDocument(document: MarkdownDocumentIdentity): boolean {
	if (document.uri.scheme === translatedDocumentScheme) {
		return false;
	}

	return document.languageId === 'markdown' || document.fileName.toLowerCase().endsWith('.md');
}

export async function translateCurrentFile(
	provider: TranslatedDocumentProvider,
	globalState: vscodeTypes.Memento,
	dependencies: TranslateCurrentFileDependencies = {},
): Promise<void> {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		vscode.window.showInformationMessage('Open a Markdown file before translating.');
		return;
	}

	const document = editor.document;

	if (!isTranslatableMarkdownDocument(document)) {
		vscode.window.showInformationMessage('Markdown Mirror Translator only translates Markdown files.');
		return;
	}

	const sourceContent = document.getText();

	if (sourceContent.trim().length === 0) {
		vscode.window.showInformationMessage('The current Markdown file is empty.');
		return;
	}

	const config = getConfig();
	const renderMode = config.bilingual ? 'bilingual' : 'translated';
	const translatedUri = provider.getTranslatedUri(document.uri, config.targetLanguage, config.bilingual);
	const sourceBlocks = parseMarkdownBlocks(sourceContent);
	const initialTranslatedBlocks = sourceBlocks.map((block) => ({
		...block,
		translatedText: '',
	}));
	let session = createInitialSession({
		sourceUri: document.uri,
		translatedUri,
		sourceContent,
		sourceBlocks,
		translatedBlocks: initialTranslatedBlocks,
		renderedContent: sourceContent,
		lineMappings: createSourceLineMappings(initialTranslatedBlocks),
		renderMode,
		config,
	});
	const refresh = createThrottledRefresh(() => provider.refreshSession(translatedUri), virtualDocumentRefreshDelayMs);

	provider.setSession(session);
	refresh.request();

	await (dependencies.openTranslatedDocument ?? openTranslatedDocument)(translatedUri);

	showDocumentSizeMessage(sourceContent.length);

	const translator = dependencies.createProvider?.() ?? new GoogleFreeTranslator();
	const cache = dependencies.createCache?.() ?? new TranslationCache(globalState);
	const scheduler = new TranslationScheduler(translator, cache, {
		concurrency: translationConcurrency,
		onProgress: (progress) => {
			const rendered = renderMarkdownWithLineMappings(progress.blocks, renderMode);
			session = replaceTranslatedBlocks(session, progress.blocks, rendered.markdown, rendered.lineMappings);
			provider.setSession(session);
			refresh.request();
		},
	});

	try {
		const result = await scheduler.translate({
			sourceLanguage: config.sourceLanguage,
			targetLanguage: config.targetLanguage,
			blocks: sourceBlocks,
		});
		const rendered = renderMarkdownWithLineMappings(result.blocks, renderMode);
		session = replaceTranslatedBlocks(session, result.blocks, rendered.markdown, rendered.lineMappings);
		provider.setSession(session);
		refresh.request();
		refresh.flush();

		if (result.failedBlockCount > 0) {
			vscode.window.showWarningMessage(`Markdown translation completed with ${result.failedBlockCount} failed block(s).`);
		} else {
			vscode.window.showInformationMessage('Markdown translation completed.');
		}
	} catch (error) {
		refresh.flush();
		vscode.window.showErrorMessage(
			`Markdown translation failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	} finally {
		refresh.dispose();
	}
}

async function openTranslatedDocument(uri: vscode.Uri): Promise<void> {
	const translatedDocument = await vscode.workspace.openTextDocument(uri);
	await vscode.window.showTextDocument(translatedDocument, {
		viewColumn: vscode.ViewColumn.Beside,
		preview: false,
		preserveFocus: false,
	});
}

function showDocumentSizeMessage(characterCount: number): void {
	if (characterCount > largeDocumentMaxCharacters) {
		vscode.window.showWarningMessage('This Markdown file is large, so translation may take a while.');
		return;
	}

	if (characterCount > smallDocumentMaxCharacters) {
		vscode.window.showInformationMessage('Translating Markdown blocks in batches.');
	}
}

export function registerTranslateCurrentFileCommand(
	context: vscode.ExtensionContext,
	provider: TranslatedDocumentProvider,
): void {
	const disposable = vscode.commands.registerCommand(translateCommandId, () => translateCurrentFile(provider, context.globalState));
	context.subscriptions.push(disposable);
}
