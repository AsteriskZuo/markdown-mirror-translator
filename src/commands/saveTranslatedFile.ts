import * as vscode from 'vscode';
import { translatedDocumentScheme, TranslatedDocumentProvider } from '../document/translatedDocumentProvider';

const saveCommandId = 'markdown-mirror-translator.saveTranslatedFile';

export async function saveTranslatedFile(provider: TranslatedDocumentProvider): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	const activeUri = editor?.document.uri;

	if (!activeUri || activeUri.scheme !== translatedDocumentScheme) {
		vscode.window.showInformationMessage('Open a Markdown Mirror Translator result before saving.');
		return;
	}

	const session = provider.getSessionByTranslatedUri(activeUri);

	if (!session) {
		vscode.window.showInformationMessage('No translated Markdown content is available for this editor.');
		return;
	}

	vscode.window.showInformationMessage('Saving translated Markdown files is available in the production translation phase.');
}

export function registerSaveTranslatedFileCommand(
	context: vscode.ExtensionContext,
	provider: TranslatedDocumentProvider,
): void {
	const disposable = vscode.commands.registerCommand(saveCommandId, () => saveTranslatedFile(provider));
	context.subscriptions.push(disposable);
}
