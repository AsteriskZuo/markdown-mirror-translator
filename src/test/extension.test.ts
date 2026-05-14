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

		await extension?.activate();

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('markdown-mirror-translator.translateCurrentFile'));
		assert.ok(commands.includes('markdown-mirror-translator.saveTranslatedFile'));
	});

	test('createInitialSession stores source content as rendered content', () => {
		const sourceUri = vscode.Uri.file('/workspace/README.md');
		const translatedUri = vscode.Uri.from({
			scheme: 'markdown-mirror-translator',
			path: '/README.zh-CN.md',
		});

		const session = createInitialSession({
			sourceUri,
			translatedUri,
			sourceContent: '# Hello\n\nWorld\n',
			config: getConfig(),
		});

		assert.strictEqual(session.sourceUri.toString(), sourceUri.toString());
		assert.strictEqual(session.translatedUri.toString(), translatedUri.toString());
		assert.strictEqual(session.sourceContent, '# Hello\n\nWorld\n');
		assert.strictEqual(session.renderedContent, '# Hello\n\nWorld\n');
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
		const session = createInitialSession({
			sourceUri,
			translatedUri,
			sourceContent: '# Hello\n',
			config: getConfig(),
		});

		provider.setSession(session);

		assert.strictEqual(provider.provideTextDocumentContent(translatedUri), '# Hello\n');
	});
});
