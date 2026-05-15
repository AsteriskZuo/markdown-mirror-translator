import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { isTranslatableMarkdownDocument, translateCurrentFile } from '../commands/translateCurrentFile';
import { getTranslatedFileUri, saveTranslatedFileForUri } from '../commands/saveTranslatedFile';
import { getConfig } from '../config';
import { translatedDocumentScheme, TranslatedDocumentProvider } from '../document/translatedDocumentProvider';
import type { TranslateInput, TranslateResult, TranslatorProvider } from '../translation/types';
import { createInitialSession, replaceTranslatedBlocks } from '../translationSession';

type ExtensionManifestCommand = {
	command: string;
	icon?: string;
	shortTitle?: string;
	title: string;
};

function createTestMemento(): vscode.Memento {
	return {
		get: <T>(_key: string, defaultValue?: T) => defaultValue,
		update: async () => undefined,
		keys: () => [],
	};
}

class TestProvider implements TranslatorProvider {
	readonly id = 'test';
	readonly maxTextLength = 10_000;

	async translate(input: TranslateInput): Promise<TranslateResult> {
		return { text: `[${input.targetLanguage}] ${input.text}` };
	}
}

async function createTempMarkdownUri(fileName: string): Promise<vscode.Uri> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mmt-test-'));
	return vscode.Uri.file(path.join(directory, fileName));
}

async function readManifestCommands(): Promise<ExtensionManifestCommand[]> {
	const manifestPath = path.resolve(__dirname, '../../package.json');
	const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
		contributes: { commands: ExtensionManifestCommand[] };
	};

	return manifest.contributes.commands;
}

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

	test('editor title commands use icons with tooltip titles', async () => {
		const commands = await readManifestCommands();
		const translateCommand = commands.find(
			(command) => command.command === 'markdown-mirror-translator.translateCurrentFile',
		);
		const saveCommand = commands.find((command) => command.command === 'markdown-mirror-translator.saveTranslatedFile');

		assert.ok(translateCommand);
		assert.strictEqual(translateCommand.icon, '$(globe)');
		assert.strictEqual(translateCommand.shortTitle, '');
		assert.strictEqual(translateCommand.title, 'Markdown Mirror Translator: Translate Current File');

		assert.ok(saveCommand);
		assert.strictEqual(saveCommand.icon, '$(save)');
		assert.strictEqual(saveCommand.shortTitle, '');
		assert.strictEqual(saveCommand.title, 'Markdown Mirror Translator: Save Translated File');
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
				hash: 'hash-0',
				translatable: true,
				state: 'translated' as const,
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

	test('replaceTranslatedBlocks updates translated blocks and rendered content', () => {
		const sourceUri = vscode.Uri.file('/workspace/README.md');
		const translatedUri = vscode.Uri.from({
			scheme: 'markdown-mirror-translator',
			path: '/README.zh-CN.md',
		});
		const sourceBlocks = [
			{
				id: 'block-0',
				kind: 'paragraph' as const,
				source: 'Hello\n',
				text: 'Hello',
				hash: 'hash-0',
				translatable: true,
				state: 'pending' as const,
				protectedInlines: [],
			},
		];
		const initial = createInitialSession({
			sourceUri,
			translatedUri,
			sourceContent: 'Hello\n',
			sourceBlocks,
			renderedContent: 'Hello\n',
			renderMode: 'translated',
			config: getConfig(),
		});
		const translated = [{ ...sourceBlocks[0], translatedText: '你好', state: 'translated' as const }];

		const updated = replaceTranslatedBlocks(initial, translated, '你好\n');

		assert.deepStrictEqual(updated.translatedBlocks, translated);
		assert.strictEqual(updated.renderedContent, '你好\n');
		assert.ok(updated.updatedAt >= initial.updatedAt);
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
				hash: 'hash-0',
				translatable: true,
				state: 'translated' as const,
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

	test('translate command rejects translated virtual documents as sources', () => {
		assert.strictEqual(
			isTranslatableMarkdownDocument({
				uri: vscode.Uri.from({
					scheme: translatedDocumentScheme,
					path: '/README.zh-CN.md',
				}),
				languageId: 'markdown',
				fileName: 'README.zh-CN.md',
			}),
			false,
		);
	});

	test('translate command opens a reused virtual Markdown document with mock translated content', async () => {
		const provider = new TranslatedDocumentProvider();
		const sourceDocument = await vscode.workspace.openTextDocument({
			content: '# Hello\n\nWorld\n',
			language: 'markdown',
		});

		await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
		await translateCurrentFile(provider, createTestMemento(), {
			createProvider: () => new TestProvider(),
			openTranslatedDocument: async () => undefined,
		});

		const firstTranslatedUri = provider.getTranslatedUri(sourceDocument.uri, 'zh-CN', false);
		assert.strictEqual(firstTranslatedUri.scheme, translatedDocumentScheme);
		assert.strictEqual(provider.provideTextDocumentContent(firstTranslatedUri), '# [zh-CN] Hello\n\n[zh-CN] World\n');

		await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
		await translateCurrentFile(provider, createTestMemento(), {
			createProvider: () => new TestProvider(),
			openTranslatedDocument: async () => undefined,
		});

		const secondTranslatedUri = provider.getTranslatedUri(sourceDocument.uri, 'zh-CN', false);
		assert.strictEqual(secondTranslatedUri.toString(), firstTranslatedUri.toString());
		assert.strictEqual(provider.provideTextDocumentContent(secondTranslatedUri), '# [zh-CN] Hello\n\n[zh-CN] World\n');

		await vscode.commands.executeCommand('markdown-mirror-translator.saveTranslatedFile');
	});

	test('translate command renders bilingual Markdown when setting is enabled', async () => {
		const provider = new TranslatedDocumentProvider();
		const config = vscode.workspace.getConfiguration('markdownMirrorTranslator');
		await config.update('bilingual', true, vscode.ConfigurationTarget.Global);

		try {
			const sourceDocument = await vscode.workspace.openTextDocument({
				content: '# Hello\n\nWorld\n',
				language: 'markdown',
			});

			await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
			await translateCurrentFile(provider, createTestMemento(), {
				createProvider: () => new TestProvider(),
				openTranslatedDocument: async () => undefined,
			});

			const translatedUri = provider.getTranslatedUri(sourceDocument.uri, 'zh-CN', true);
			assert.strictEqual(translatedUri.scheme, translatedDocumentScheme);
			assert.strictEqual(
				provider.provideTextDocumentContent(translatedUri),
				'# Hello\n\n# [zh-CN] Hello\n\nWorld\n\n[zh-CN] World\n',
			);
		} finally {
			await config.update('bilingual', undefined, vscode.ConfigurationTarget.Global);
		}
	});

	test('getTranslatedFileUri creates target-language filenames next to source file', () => {
		const sourceUri = vscode.Uri.file('/workspace/README.md');

		assert.strictEqual(
			getTranslatedFileUri(sourceUri, 'zh-CN', false).fsPath,
			vscode.Uri.file('/workspace/README.zh-CN.md').fsPath,
		);
		assert.strictEqual(
			getTranslatedFileUri(sourceUri, 'zh-CN', true).fsPath,
			vscode.Uri.file('/workspace/README.bilingual.zh-CN.md').fsPath,
		);
	});

	test('save command writes translated Markdown beside the source file', async () => {
		const provider = new TranslatedDocumentProvider();
		const sourceUri = await createTempMarkdownUri(`mmt-${Date.now()}.md`);
		const targetUri = getTranslatedFileUri(sourceUri, 'zh-CN', false);

		await vscode.workspace.fs.writeFile(sourceUri, Buffer.from('# Hello\n', 'utf8'));
		const sourceDocument = await vscode.workspace.openTextDocument(sourceUri);
		await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
		await translateCurrentFile(provider, createTestMemento(), {
			createProvider: () => new TestProvider(),
			openTranslatedDocument: async () => undefined,
		});
		const translatedUri = provider.getTranslatedUri(sourceUri, 'zh-CN', false);

		await saveTranslatedFileForUri(provider, translatedUri, {
			confirmOverwrite: async () => true,
		});

		const saved = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8');
		assert.strictEqual(saved, '# [zh-CN] Hello\n');
	});

	test('save command does not overwrite when confirmation is declined', async () => {
		const provider = new TranslatedDocumentProvider();
		const sourceUri = await createTempMarkdownUri(`mmt-overwrite-${Date.now()}.md`);
		const targetUri = getTranslatedFileUri(sourceUri, 'zh-CN', false);

		await vscode.workspace.fs.writeFile(sourceUri, Buffer.from('# Hello\n', 'utf8'));
		await vscode.workspace.fs.writeFile(targetUri, Buffer.from('existing\n', 'utf8'));
		const sourceDocument = await vscode.workspace.openTextDocument(sourceUri);
		await vscode.window.showTextDocument(sourceDocument, vscode.ViewColumn.One);
		await translateCurrentFile(provider, createTestMemento(), {
			createProvider: () => new TestProvider(),
			openTranslatedDocument: async () => undefined,
		});
		const translatedUri = provider.getTranslatedUri(sourceUri, 'zh-CN', false);

		await saveTranslatedFileForUri(provider, translatedUri, {
			confirmOverwrite: async () => false,
		});

		const saved = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8');
		assert.strictEqual(saved, 'existing\n');
	});
});
