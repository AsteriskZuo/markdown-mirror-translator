import * as vscode from 'vscode';
import { registerSaveTranslatedFileCommand } from './commands/saveTranslatedFile';
import { registerTranslateCurrentFileCommand } from './commands/translateCurrentFile';
import { translatedDocumentScheme, TranslatedDocumentProvider } from './document/translatedDocumentProvider';
import { registerEditorScrollSync } from './scroll/editorScrollSync';

export function activate(context: vscode.ExtensionContext): void {
	const translatedDocumentProvider = new TranslatedDocumentProvider();

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(translatedDocumentScheme, translatedDocumentProvider),
		translatedDocumentProvider,
		registerEditorScrollSync(translatedDocumentProvider),
	);

	registerTranslateCurrentFileCommand(context, translatedDocumentProvider);
	registerSaveTranslatedFileCommand(context, translatedDocumentProvider);
}

export function deactivate(): void {}
