import * as vscode from 'vscode';
import { registerSaveTranslatedFileCommand } from './commands/saveTranslatedFile';
import { registerTranslateCurrentFileCommand } from './commands/translateCurrentFile';
import { translatedDocumentScheme, TranslatedDocumentProvider } from './document/translatedDocumentProvider';

export function activate(context: vscode.ExtensionContext): void {
	const translatedDocumentProvider = new TranslatedDocumentProvider();

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(translatedDocumentScheme, translatedDocumentProvider),
		translatedDocumentProvider,
	);

	registerTranslateCurrentFileCommand(context, translatedDocumentProvider);
	registerSaveTranslatedFileCommand(context, translatedDocumentProvider);
}

export function deactivate(): void {}
