import * as assert from 'assert';
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { translatedDocumentScheme, TranslatedDocumentProvider } from '../document/translatedDocumentProvider';
import { createInitialSession } from '../translationSession';

suite('Markdown Mirror Translator shell', () => {
	test('getConfig reads default extension settings', () => {
		const config = getConfig();

		assert.strictEqual(config.sourceLanguage, '');
		assert.strictEqual(config.targetLanguage, 'zh-CN');
		assert.strictEqual(config.bilingual, false);
		assert.strictEqual(config.translationUpdateMode, 'manual');
	});

	test('extension commands are registered after activation', async () => {
		const extension = vscode.extensions.getExtension('undefined_publisher.markdown-mirror-translator');

		assert.ok(extension);
		await extension.activate();
		assert.strictEqual(extension.isActive, true);

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('markdown-mirror-translator.translateCurrentFile'));
		assert.ok(commands.includes('markdown-mirror-translator.saveTranslatedFile'));
	});

	test('createInitialSession stores block state and rendered content', () => {
		const sourceUri = vscode.Uri.file('/workspace/README.md');
		const translatedUri = vscode.Uri.from({
			scheme: 'markdown-mirror-translator',
			path: '/README.zh-CN.md',
		});
		const sourceBlocks = [
			{
				id: 'block-0',
				kind: 'heading' as const,
				source: '# Hello\n',
				text: 'Hello',
				translatable: true,
				protectedInlines: [],
			},
		];
		const translatedBlocks = [
			{
				...sourceBlocks[0],
				translatedText: '[zh-CN] Hello',
			},
		];

		const session = createInitialSession({
			sourceUri,
			translatedUri,
			sourceContent: '# Hello\n',
			sourceBlocks,
			translatedBlocks,
			renderedContent: '# [zh-CN] Hello\n',
			renderMode: 'translated',
			config: getConfig(),
		});

		assert.strictEqual(session.sourceUri.toString(), sourceUri.toString());
		assert.strictEqual(session.translatedUri.toString(), translatedUri.toString());
		assert.strictEqual(session.sourceContent, '# Hello\n');
		assert.deepStrictEqual(session.sourceBlocks, sourceBlocks);
		assert.deepStrictEqual(session.translatedBlocks, translatedBlocks);
		assert.strictEqual(session.renderedContent, '# [zh-CN] Hello\n');
		assert.strictEqual(session.renderMode, 'translated');
		assert.ok(session.updatedAt > 0);
	});

	test('TranslatedDocumentProvider reuses one translated URI per source URI', () => {
		const provider = new TranslatedDocumentProvider();
		const sourceUri = vscode.Uri.file('/workspace/README.md');

		const firstUri = provider.getTranslatedUri(sourceUri, 'zh-CN', false);
		const secondUri = provider.getTranslatedUri(sourceUri, 'zh-CN', false);

		assert.strictEqual(firstUri.toString(), secondUri.toString());
		assert.strictEqual(firstUri.scheme, translatedDocumentScheme);
		assert.ok(firstUri.path.endsWith('.md'));
	});

	test('TranslatedDocumentProvider returns session rendered content', () => {
		const provider = new TranslatedDocumentProvider();
		const sourceUri = vscode.Uri.file('/workspace/README.md');
		const translatedUri = provider.getTranslatedUri(sourceUri, 'zh-CN', false);
		const sourceBlocks = [
			{
				id: 'block-0',
				kind: 'heading' as const,
				source: '# Hello\n',
				text: 'Hello',
				translatable: true,
				protectedInlines: [],
			},
		];
		const session = createInitialSession({
			sourceUri,
			translatedUri,
			sourceContent: '# Hello\n',
			sourceBlocks,
			translatedBlocks: [{ ...sourceBlocks[0], translatedText: '[zh-CN] Hello' }],
			renderedContent: '# [zh-CN] Hello\n',
			renderMode: 'translated',
			config: getConfig(),
		});

		provider.setSession(session);

		assert.strictEqual(provider.provideTextDocumentContent(translatedUri), '# [zh-CN] Hello\n');
	});

	test('translate command opens a reused virtual Markdown document with mock translated content', async () => {
		const sourceDocument = await vscode.workspace.openTextDocument({
			content: '# Hello\n\nWorld\n',
			language: 'markdown',
		});

		await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
		await vscode.commands.executeCommand('markdown-mirror-translator.translateCurrentFile');

		const firstTranslatedEditor = vscode.window.activeTextEditor;
		assert.ok(firstTranslatedEditor);
		assert.strictEqual(firstTranslatedEditor.document.uri.scheme, translatedDocumentScheme);
		assert.strictEqual(firstTranslatedEditor.document.languageId, 'markdown');
		assert.strictEqual(firstTranslatedEditor.document.getText(), '# [zh-CN] Hello\n\n[zh-CN] World\n');

		const firstTranslatedUri = firstTranslatedEditor.document.uri.toString();

		await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
		await vscode.commands.executeCommand('markdown-mirror-translator.translateCurrentFile');

		const secondTranslatedEditor = vscode.window.activeTextEditor;
		assert.ok(secondTranslatedEditor);
		assert.strictEqual(secondTranslatedEditor.document.uri.toString(), firstTranslatedUri);
		assert.strictEqual(secondTranslatedEditor.document.getText(), '# [zh-CN] Hello\n\n[zh-CN] World\n');

		await vscode.commands.executeCommand('markdown-mirror-translator.saveTranslatedFile');
	});

	test('translate command renders bilingual Markdown when setting is enabled', async () => {
		const config = vscode.workspace.getConfiguration('markdownMirrorTranslator');
		await config.update('bilingual', true, vscode.ConfigurationTarget.Global);

		try {
			const sourceDocument = await vscode.workspace.openTextDocument({
				content: '# Hello\n\nWorld\n',
				language: 'markdown',
			});

			await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
			await vscode.commands.executeCommand('markdown-mirror-translator.translateCurrentFile');

			const translatedEditor = vscode.window.activeTextEditor;
			assert.ok(translatedEditor);
			assert.strictEqual(translatedEditor.document.uri.scheme, translatedDocumentScheme);
			assert.strictEqual(
				translatedEditor.document.getText(),
				'# Hello\n\n# [zh-CN] Hello\n\nWorld\n\n[zh-CN] World\n',
			);
		} finally {
			await config.update('bilingual', undefined, vscode.ConfigurationTarget.Global);
		}
	});
});
