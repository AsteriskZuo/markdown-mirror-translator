# VS Code Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the helloWorld scaffold with a working VS Code extension shell that opens a reused read-only Markdown virtual document beside the source file and registers translate/save entry points.

**Architecture:** The extension entry point only wires services and commands. Settings are read through `src/config.ts`, translated virtual document state is owned by `src/document/translatedDocumentProvider.ts`, per-source rendered content is tracked in `src/translationSession.ts`, and command modules own user-facing workflows.

**Tech Stack:** VS Code Extension API, TypeScript strict mode, Node16 module resolution, Mocha, `TextDocumentContentProvider`, VS Code settings and menu contributions.

---

## Goal

Build phase 1 of Markdown Mirror Translator:

- Register `Markdown Mirror Translator: Translate Current File`.
- Register `Markdown Mirror Translator: Save Translated File`.
- Read configured source language, target language, bilingual flag, and update mode.
- Validate that the active editor is a Markdown document.
- Reject empty Markdown files with a VS Code information message.
- Open a right-side read-only Markdown virtual document immediately after translate command execution.
- Show the source Markdown content in the translated virtual document until phase 2 provides rendered translations.
- Reuse the same translated virtual document URI when translating the same source file repeatedly.
- Register save command behavior that reports file saving is delivered by the production save loop in phase 3.

## Architecture

- `src/extension.ts` creates a single `TranslatedDocumentProvider`, registers it under the `markdown-mirror-translator` scheme, and delegates commands to focused modules.
- `src/config.ts` centralizes settings reads and normalizes `translationUpdateMode` so unsupported values behave as `manual` in phase 1.
- `src/translationSession.ts` stores source URI, translated URI, source content, rendered content, config snapshot, and update timestamp.
- `src/document/translatedDocumentProvider.ts` maps source document URI strings to translated virtual document URIs and session content.
- `src/commands/translateCurrentFile.ts` performs active editor validation, session replacement, virtual document refresh, side-column opening, and success/error messages.
- `src/commands/saveTranslatedFile.ts` registers the phase 1 save entry behavior without writing files.

## Tech Stack

- VS Code API:
  - `vscode.commands.registerCommand`
  - `vscode.workspace.registerTextDocumentContentProvider`
  - `vscode.TextDocumentContentProvider`
  - `vscode.window.showTextDocument`
  - `vscode.workspace.getConfiguration`
- TypeScript:
  - strict mode from `tsconfig.json`
  - `Node16` module resolution
- Tests and verification:
  - Mocha via `@vscode/test-cli`
  - `npm run check-types`
  - `npm run lint`
  - `npm run compile`
  - `npm test`

## Constraints

- Do not modify `docs/basic-design.zh-CN.md`.
- Do not implement Markdown parsing, translation providers, scheduling, caching, throttled block refresh, real file saving, or overwrite confirmation in this phase.
- Do not add npm dependencies.
- Do not introduce webviews or rendered Markdown preview.
- Keep virtual document content read-only by using `TextDocumentContentProvider`; do not create a real file for the right-side document.
- Keep `translationUpdateMode: "auto"` accepted in settings but treated as manual behavior in phase 1.

## Non-Goals

- Translating text.
- Rendering bilingual output from block pairs.
- Persisting translated Markdown to disk.
- Watching source document changes.
- Retaining old sessions after a repeated manual translate command for the same source file.

## Affected Files And Modules

- Modify: `package.json`
  - Remove the helloWorld command contribution.
  - Add translate and save command contributions.
  - Add configuration contributions under `markdownMirrorTranslator`.
  - Add editor title menu entries for Markdown source documents and translated virtual documents.
- Modify: `src/extension.ts`
  - Replace helloWorld command registration with provider and command module registration.
- Create: `src/config.ts`
  - Export `TranslationUpdateMode`, `MarkdownMirrorTranslatorConfig`, and `getConfig()`.
- Create: `src/translationSession.ts`
  - Export `TranslationSession` and `createInitialSession()`.
- Create: `src/document/translatedDocumentProvider.ts`
  - Export `translatedDocumentScheme` and `TranslatedDocumentProvider`.
- Create: `src/commands/translateCurrentFile.ts`
  - Export `registerTranslateCurrentFileCommand()` and `translateCurrentFile()`.
- Create: `src/commands/saveTranslatedFile.ts`
  - Export `registerSaveTranslatedFileCommand()` and `saveTranslatedFile()`.
- Modify: `src/test/extension.test.ts`
  - Replace sample assertions with focused tests for config defaults, session creation, provider reuse, and command registration.

## Verification Method

- Run type checks after each TypeScript task:

```bash
npm run check-types
```

Expected: exits with code 0 after the implementation step for that task.

- Run lint after edited TypeScript compiles:

```bash
npm run lint
```

Expected: exits with code 0 and no ESLint warnings promoted to failures.

- Run bundle compile before command tests:

```bash
npm run compile
```

Expected: exits with code 0 and emits `dist/extension.js`.

- Run extension tests at the end:

```bash
npm test
```

Expected: exits with code 0; the new shell tests pass.

## Open Questions

- Should the phase 1 save command message include the source file path when the active editor is a translated virtual document?
- Should repeated translation of the same dirty untitled Markdown document be supported in phase 1, or should the command require a file-backed Markdown document?
- Should the translated virtual document title include the target language, for example `README.zh-CN.md`, even though phase 1 still displays source content?

## Tasks

### Task 1: Add Configuration Reader

**Files:**
- Create: `src/config.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Write failing config tests**

Replace `src/test/extension.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run test compile to verify the config module is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with a TypeScript error containing `Cannot find module '../config'`.

- [ ] **Step 3: Create the config module**

Create `src/config.ts`:

```ts
import * as vscode from 'vscode';

export type TranslationUpdateMode = 'manual' | 'auto';

export type MarkdownMirrorTranslatorConfig = {
	sourceLanguage: string;
	targetLanguage: string;
	bilingual: boolean;
	translationUpdateMode: TranslationUpdateMode;
};

const configurationSection = 'markdownMirrorTranslator';

function normalizeUpdateMode(value: string): TranslationUpdateMode {
	if (value === 'auto') {
		return 'auto';
	}

	return 'manual';
}

export function getConfig(): MarkdownMirrorTranslatorConfig {
	const config = vscode.workspace.getConfiguration(configurationSection);

	return {
		sourceLanguage: config.get<string>('sourceLanguage', ''),
		targetLanguage: config.get<string>('targetLanguage', 'zh-CN'),
		bilingual: config.get<boolean>('bilingual', false),
		translationUpdateMode: normalizeUpdateMode(config.get<string>('translationUpdateMode', 'manual')),
	};
}
```

- [ ] **Step 4: Run type checks**

Run:

```bash
npm run check-types
```

Expected: PASS for `src/config.ts`; command-registration test can still fail at runtime until later tasks register commands.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/test/extension.test.ts
git commit -m "test: add shell config expectations"
```

### Task 2: Add Translation Session Model

**Files:**
- Create: `src/translationSession.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Add failing session test**

Add this import to `src/test/extension.test.ts`:

```ts
import { createInitialSession } from '../translationSession';
```

Add this test inside the existing suite:

```ts
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
```

- [ ] **Step 2: Run test compile to verify the session module is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with a TypeScript error containing `Cannot find module '../translationSession'`.

- [ ] **Step 3: Create the session module**

Create `src/translationSession.ts`:

```ts
import * as vscode from 'vscode';
import type { MarkdownMirrorTranslatorConfig } from './config';

export type TranslationSession = {
	sourceUri: vscode.Uri;
	translatedUri: vscode.Uri;
	sourceContent: string;
	renderedContent: string;
	config: MarkdownMirrorTranslatorConfig;
	updatedAt: number;
};

export type CreateInitialSessionInput = {
	sourceUri: vscode.Uri;
	translatedUri: vscode.Uri;
	sourceContent: string;
	config: MarkdownMirrorTranslatorConfig;
};

export function createInitialSession(input: CreateInitialSessionInput): TranslationSession {
	return {
		sourceUri: input.sourceUri,
		translatedUri: input.translatedUri,
		sourceContent: input.sourceContent,
		renderedContent: input.sourceContent,
		config: input.config,
		updatedAt: Date.now(),
	};
}
```

- [ ] **Step 4: Run type checks**

Run:

```bash
npm run check-types
```

Expected: PASS for `src/translationSession.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/translationSession.ts src/test/extension.test.ts
git commit -m "feat: add translation session shell model"
```

### Task 3: Add Translated Virtual Document Provider

**Files:**
- Create: `src/document/translatedDocumentProvider.ts`
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Add failing provider tests**

Add these imports to `src/test/extension.test.ts`:

```ts
import { translatedDocumentScheme, TranslatedDocumentProvider } from '../document/translatedDocumentProvider';
```

Add these tests inside the existing suite:

```ts
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
```

- [ ] **Step 2: Run test compile to verify the provider module is missing**

Run:

```bash
npm run compile-tests
```

Expected: FAIL with a TypeScript error containing `Cannot find module '../document/translatedDocumentProvider'`.

- [ ] **Step 3: Create provider directory and module**

Create `src/document/translatedDocumentProvider.ts`:

```ts
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
```

- [ ] **Step 4: Run type checks**

Run:

```bash
npm run check-types
```

Expected: PASS for `src/document/translatedDocumentProvider.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/document/translatedDocumentProvider.ts src/test/extension.test.ts
git commit -m "feat: add translated virtual document provider"
```

### Task 4: Update Extension Manifest Contributions

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Replace command and contribution sections**

In `package.json`, replace the current `"activationEvents": []`, `"main"`, and `"contributes"` block with:

```json
  "activationEvents": [
    "onCommand:markdown-mirror-translator.translateCurrentFile",
    "onCommand:markdown-mirror-translator.saveTranslatedFile"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "markdown-mirror-translator.translateCurrentFile",
        "title": "Markdown Mirror Translator: Translate Current File",
        "category": "Markdown Mirror Translator"
      },
      {
        "command": "markdown-mirror-translator.saveTranslatedFile",
        "title": "Markdown Mirror Translator: Save Translated File",
        "category": "Markdown Mirror Translator"
      }
    ],
    "configuration": {
      "title": "Markdown Mirror Translator",
      "properties": {
        "markdownMirrorTranslator.sourceLanguage": {
          "type": "string",
          "default": "",
          "description": "Source language code. Leave empty to let the translator accept any source language."
        },
        "markdownMirrorTranslator.targetLanguage": {
          "type": "string",
          "default": "zh-CN",
          "description": "Target language code for translated Markdown."
        },
        "markdownMirrorTranslator.bilingual": {
          "type": "boolean",
          "default": false,
          "description": "Show source and translated Markdown together in the translated document."
        },
        "markdownMirrorTranslator.translationUpdateMode": {
          "type": "string",
          "enum": [
            "manual",
            "auto"
          ],
          "default": "manual",
          "description": "Translation update mode. Phase 1 treats auto as manual."
        }
      }
    },
    "menus": {
      "editor/title": [
        {
          "command": "markdown-mirror-translator.translateCurrentFile",
          "when": "resourceLangId == markdown",
          "group": "navigation"
        },
        {
          "command": "markdown-mirror-translator.saveTranslatedFile",
          "when": "resourceScheme == 'markdown-mirror-translator'",
          "group": "navigation"
        }
      ]
    }
  },
```

- [ ] **Step 2: Validate JSON**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('package.json ok')"
```

Expected:

```text
package.json ok
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: contribute translator commands and settings"
```

### Task 5: Add Translate Current File Command

**Files:**
- Create: `src/commands/translateCurrentFile.ts`

- [ ] **Step 1: Create command directory and module**

Create `src/commands/translateCurrentFile.ts`:

```ts
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { TranslatedDocumentProvider } from '../document/translatedDocumentProvider';
import { createInitialSession } from '../translationSession';

const translateCommandId = 'markdown-mirror-translator.translateCurrentFile';

function isMarkdownDocument(document: vscode.TextDocument): boolean {
	return document.languageId === 'markdown' || document.fileName.toLowerCase().endsWith('.md');
}

export async function translateCurrentFile(provider: TranslatedDocumentProvider): Promise<void> {
	const editor = vscode.window.activeTextEditor;

	if (!editor) {
		vscode.window.showInformationMessage('Open a Markdown file before translating.');
		return;
	}

	const document = editor.document;

	if (!isMarkdownDocument(document)) {
		vscode.window.showInformationMessage('Markdown Mirror Translator only translates Markdown files.');
		return;
	}

	const sourceContent = document.getText();

	if (sourceContent.trim().length === 0) {
		vscode.window.showInformationMessage('The current Markdown file is empty.');
		return;
	}

	const config = getConfig();
	const translatedUri = provider.getTranslatedUri(document.uri, config.targetLanguage, config.bilingual);
	const session = createInitialSession({
		sourceUri: document.uri,
		translatedUri,
		sourceContent,
		config,
	});

	provider.setSession(session);

	const translatedDocument = await vscode.workspace.openTextDocument(translatedUri);
	await vscode.window.showTextDocument(translatedDocument, {
		viewColumn: vscode.ViewColumn.Beside,
		preview: false,
		preserveFocus: false,
	});

	vscode.window.showInformationMessage('Markdown translation view opened.');
}

export function registerTranslateCurrentFileCommand(
	context: vscode.ExtensionContext,
	provider: TranslatedDocumentProvider,
): void {
	const disposable = vscode.commands.registerCommand(translateCommandId, () => translateCurrentFile(provider));
	context.subscriptions.push(disposable);
}
```

- [ ] **Step 2: Run type checks**

Run:

```bash
npm run check-types
```

Expected: PASS for `src/commands/translateCurrentFile.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/commands/translateCurrentFile.ts
git commit -m "feat: add translate current file shell command"
```

### Task 6: Add Save Translated File Command Entry

**Files:**
- Create: `src/commands/saveTranslatedFile.ts`

- [ ] **Step 1: Create save command module**

Create `src/commands/saveTranslatedFile.ts`:

```ts
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
```

- [ ] **Step 2: Run type checks**

Run:

```bash
npm run check-types
```

Expected: PASS for `src/commands/saveTranslatedFile.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/commands/saveTranslatedFile.ts
git commit -m "feat: add save translated file command entry"
```

### Task 7: Wire Extension Activation

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Replace scaffold activation code**

Replace `src/extension.ts` with:

```ts
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
```

- [ ] **Step 2: Run type checks**

Run:

```bash
npm run check-types
```

Expected: PASS for extension activation wiring.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with no lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire translator shell activation"
```

### Task 8: Verify Command Registration Tests

**Files:**
- Modify: `src/test/extension.test.ts`

- [ ] **Step 1: Confirm extension id in tests**

If command registration test cannot activate the extension because `vscode.extensions.getExtension('undefined_publisher.markdown-mirror-translator')` is undefined, replace that test with command discovery after executing a manifest command:

```ts
	test('translate and save commands are discoverable', async () => {
		const commands = await vscode.commands.getCommands(true);

		assert.ok(commands.includes('markdown-mirror-translator.translateCurrentFile'));
		assert.ok(commands.includes('markdown-mirror-translator.saveTranslatedFile'));
	});
```

- [ ] **Step 2: Run extension tests**

Run:

```bash
npm test
```

Expected: PASS with tests covering config defaults, session creation, provider URI reuse, provider content lookup, and command registration.

- [ ] **Step 3: Commit**

```bash
git add src/test/extension.test.ts
git commit -m "test: verify translator shell registration"
```

### Task 9: Final Phase 1 Verification

**Files:**
- Review: `package.json`
- Review: `src/extension.ts`
- Review: `src/config.ts`
- Review: `src/translationSession.ts`
- Review: `src/document/translatedDocumentProvider.ts`
- Review: `src/commands/translateCurrentFile.ts`
- Review: `src/commands/saveTranslatedFile.ts`
- Review: `src/test/extension.test.ts`

- [ ] **Step 1: Run type checks**

Run:

```bash
npm run check-types
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run compile**

Run:

```bash
npm run compile
```

Expected: PASS and `dist/extension.js` is produced.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Manual VS Code shell check**

In the Extension Development Host:

1. Open a non-empty `.md` file.
2. Run `Markdown Mirror Translator: Translate Current File`.
3. Confirm a right-side editor opens with Markdown source content.
4. Run the translate command again for the same source editor.
5. Confirm the existing translated virtual document is reused rather than opening another translated editor for the same source URI.
6. Focus the translated virtual document.
7. Run `Markdown Mirror Translator: Save Translated File`.
8. Confirm VS Code shows the phase 1 save message and no file is written.

Expected: all eight manual checks match the listed behavior.

- [ ] **Step 6: Commit final adjustments**

```bash
git add package.json src/extension.ts src/config.ts src/translationSession.ts src/document/translatedDocumentProvider.ts src/commands/translateCurrentFile.ts src/commands/saveTranslatedFile.ts src/test/extension.test.ts
git commit -m "feat: complete vscode translation shell"
```

## Self-Review Checklist

- [ ] **Requirement coverage:** Phase 1 covers command registration, settings reads, Markdown validation, read-only virtual document, split-editor opening, source-content initial display, virtual document reuse, and save command entry behavior.
- [ ] **Phase boundary check:** No parser, renderer, translator provider, scheduler, cache, throttled block refresh, save-to-disk behavior, or overwrite confirmation is included.
- [ ] **Placeholder scan:** Run:

```bash
rg -n 'T[B]D|T[O]DO|implement [l]ater|fill in [d]etails|add [a]ppropriate|handle [e]dge cases|Write tests for the [a]bove|Similar to [T]ask' docs/superpowers/plans/2026-05-14-vscode-shell-plan.md
```

Expected: no matches.

- [ ] **Type consistency:** Confirm these names match everywhere:
  - Command ID: `markdown-mirror-translator.translateCurrentFile`
  - Command ID: `markdown-mirror-translator.saveTranslatedFile`
  - Setting key: `markdownMirrorTranslator.sourceLanguage`
  - Setting key: `markdownMirrorTranslator.targetLanguage`
  - Setting key: `markdownMirrorTranslator.bilingual`
  - Setting key: `markdownMirrorTranslator.translationUpdateMode`
  - Virtual document scheme: `markdown-mirror-translator`
  - Class name: `TranslatedDocumentProvider`
  - Function name: `createInitialSession`
