import * as path from 'path';
import * as vscode from 'vscode';
import type { TranslationSession } from '../translationSession';

export const translatedDocumentScheme = 'markdown-mirror-translator';

export class TranslatedDocumentProvider implements vscode.TextDocumentContentProvider {
	private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	private readonly sourceToTranslatedUri = new Map<string, vscode.Uri>();
	private readonly sessionsByTranslatedUri = new Map<string, TranslationSession>();

	readonly onDidChange = this.changeEmitter.event;

	getTranslatedUri(sourceUri: vscode.Uri, targetLanguage: string, bilingual: boolean): vscode.Uri {
		const sourceKey = sourceUri.toString();
		const existingUri = this.sourceToTranslatedUri.get(sourceKey);

		if (existingUri) {
			return existingUri;
		}

		const parsedPath = path.posix.parse(sourceUri.path);
		const suffix = bilingual ? `.bilingual.${targetLanguage}.md` : `.${targetLanguage}.md`;
		const fileName = `${parsedPath.name}${suffix}`;
		const translatedUri = vscode.Uri.from({
			scheme: translatedDocumentScheme,
			path: `/${encodeURIComponent(sourceKey)}/${fileName}`,
		});

		this.sourceToTranslatedUri.set(sourceKey, translatedUri);
		return translatedUri;
	}

	setSession(session: TranslationSession): void {
		const translatedKey = session.translatedUri.toString();
		this.sessionsByTranslatedUri.set(translatedKey, session);
		this.changeEmitter.fire(session.translatedUri);
	}

	getSessionByTranslatedUri(translatedUri: vscode.Uri): TranslationSession | undefined {
		return this.sessionsByTranslatedUri.get(translatedUri.toString());
	}

	provideTextDocumentContent(uri: vscode.Uri): string {
		const session = this.sessionsByTranslatedUri.get(uri.toString());
		return session?.renderedContent ?? '';
	}

	dispose(): void {
		this.changeEmitter.dispose();
	}
}
