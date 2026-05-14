import * as vscode from 'vscode';
import { getConfig } from '../config';
import { TranslatedDocumentProvider } from '../document/translatedDocumentProvider';
import { parseMarkdownBlocks } from '../markdown/parser';
import { renderMarkdown } from '../markdown/renderer';
import { createThrottledRefresh } from '../refresh/throttledRefresh';
import { createInitialSession } from '../translationSession';
import { MockTranslator } from '../translation/providers/mockTranslator';

const translateCommandId = 'markdown-mirror-translator.translateCurrentFile';
const virtualDocumentRefreshDelayMs = 25;

function isMarkdownDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'markdown' || document.fileName.toLowerCase().endsWith('.md');
}

export async function translateCurrentFile(provider: TranslatedDocumentProvider): Promise<void> {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		vscode.window.showInformationMessage('Open a Markdown file before translating.');
		return;
	}

	const document = editor.document;

	if (!isMarkdownDocument(document)) {
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
	const translator = new MockTranslator();
	const translatedBlocks = await translator.translateBlocks({
		sourceLanguage: config.sourceLanguage,
		targetLanguage: config.targetLanguage,
		blocks: sourceBlocks,
	});
	const renderedContent = renderMarkdown(translatedBlocks, renderMode);
	const session = createInitialSession({
		sourceUri: document.uri,
		translatedUri,
		sourceContent,
		sourceBlocks,
		translatedBlocks,
		renderedContent,
		renderMode,
		config,
	});
	const refresh = createThrottledRefresh(() => provider.refreshSession(translatedUri), virtualDocumentRefreshDelayMs);

	provider.setSession(session);
	refresh.request();
	refresh.flush();
	refresh.dispose();

	const translatedDocument = await vscode.workspace.openTextDocument(translatedUri);
	await vscode.window.showTextDocument(translatedDocument, {
		viewColumn: vscode.ViewColumn.Beside,
		preview: false,
		preserveFocus: false,
	});

	vscode.window.showInformationMessage('Markdown translation view opened.');
}

export function registerTranslateCurrentFileCommand(
	context: vscode.ExtensionContext,
	provider: TranslatedDocumentProvider,
): void {
	const disposable = vscode.commands.registerCommand(translateCommandId, () => translateCurrentFile(provider));
	context.subscriptions.push(disposable);
}
