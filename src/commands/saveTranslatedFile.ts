import * as path from 'path';
import * as vscode from 'vscode';
import { translatedDocumentScheme, TranslatedDocumentProvider } from '../document/translatedDocumentProvider';

const saveCommandId = 'markdown-mirror-translator.saveTranslatedFile';

export type SaveTranslatedFileDependencies = {
	confirmOverwrite?: (targetUri: vscode.Uri) => Promise<boolean>;
};

export async function saveTranslatedFile(provider: TranslatedDocumentProvider): Promise<void> {
	const editor = vscode.window.activeTextEditor;
	const activeUri = editor?.document.uri;

	await saveTranslatedFileForUri(provider, activeUri, {});
}

export async function saveTranslatedFileForUri(
	provider: TranslatedDocumentProvider,
	activeUri: vscode.Uri | undefined,
	dependencies: SaveTranslatedFileDependencies = {},
): Promise<void> {
	if (!activeUri || activeUri.scheme !== translatedDocumentScheme) {
		vscode.window.showInformationMessage('Open a Markdown Mirror Translator result before saving.');
		return;
	}

	const session = provider.getSessionByTranslatedUri(activeUri);

	if (!session) {
		vscode.window.showInformationMessage('No translated Markdown content is available for this editor.');
		return;
	}

	const targetUri = getTranslatedFileUri(session.sourceUri, session.config.targetLanguage, session.config.bilingual);
	const canWrite = dependencies.confirmOverwrite
		? await dependencies.confirmOverwrite(targetUri)
		: await confirmOverwriteIfNeeded(targetUri);

	if (!canWrite) {
		return;
	}

	await vscode.workspace.fs.writeFile(targetUri, Buffer.from(session.renderedContent, 'utf8'));
	vscode.window.showInformationMessage(`Saved translated Markdown to ${path.basename(targetUri.fsPath)}.`);
}

export function getTranslatedFileUri(sourceUri: vscode.Uri, targetLanguage: string, bilingual: boolean): vscode.Uri {
	const parsed = path.parse(sourceUri.fsPath);
	const suffix = bilingual ? `.bilingual.${targetLanguage}.md` : `.${targetLanguage}.md`;
	return vscode.Uri.file(path.join(parsed.dir, `${parsed.name}${suffix}`));
}

async function confirmOverwriteIfNeeded(targetUri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(targetUri);
	} catch {
		return true;
	}

	const choice = await vscode.window.showWarningMessage(
		`Overwrite existing file ${path.basename(targetUri.fsPath)}?`,
		{ modal: true },
		'Overwrite',
	);

	return choice === 'Overwrite';
}

export function registerSaveTranslatedFileCommand(
	context: vscode.ExtensionContext,
	provider: TranslatedDocumentProvider,
): void {
	const disposable = vscode.commands.registerCommand(saveCommandId, () => saveTranslatedFile(provider));
	context.subscriptions.push(disposable);
}
