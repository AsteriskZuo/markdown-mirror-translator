import * as assert from 'assert';
import * as vscode from 'vscode';
import { getConfig } from '../config';
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
});
