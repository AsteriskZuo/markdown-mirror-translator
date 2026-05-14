import * as assert from 'assert';
import * as vscode from 'vscode';
import { getConfig } from '../config';

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
});
