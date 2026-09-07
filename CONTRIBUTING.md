# Contributing to Markdown Mirror Translator

This document is for contributors. User-facing installation, usage, commands, and settings are documented in [README.md](./README.md) and [README.zh-CN.md](./README.zh-CN.md).

## Project Scope

Markdown Mirror Translator is a VS Code extension that translates Markdown source files into Markdown source text. The extension opens the source file and a read-only translated virtual document side by side, then lets the user save the translated result as a real `.md` file.

Keep implementation aligned with this scope:

- Translate the current Markdown file.
- Preserve common Markdown syntax structures.
- Render translated-only or bilingual Markdown source text.
- Save translated Markdown beside the source file.
- Use internal provider, scheduler, cache, parser, renderer, and session boundaries.

Do not add these features without an approved design:

- Markdown preview rendering
- Webviews
- AI translation
- Scroll synchronization
- Selection translation
- Folder or project batch translation
- Glossary support
- Provider switching UI
- Automatic source document watching

## Repository Rules

Read [AGENTS.md](./AGENTS.md) before making changes. It contains repository-level workflow rules for agents and contributors working with agents.

Long-term product and architecture design belongs in `docs/`. Task-specific plans belong in `docs/superpowers/plans/`. Do not use `AGENTS.md` for temporary plans, debug logs, or task history.

## Development Environment

Requirements:

- VS Code `^1.118.0`
- Node.js compatible with the repository lockfile and `@types/node` `22.x`
- npm

Install dependencies:

```bash
npm install
```

## Local Debugging In VS Code

Use VS Code's Extension Development Host to debug the extension locally. This is the main way to test commands and breakpoints while developing the extension.

1. Open the repository in VS Code.
2. Install dependencies with `npm install`.
3. Install the recommended [esbuild Problem Matchers](https://marketplace.visualstudio.com/items?itemName=connor4312.esbuild-problem-matchers) extension. Without it, launching fails with `Invalid problemMatcher reference: $esbuild-watch`, because the `watch:esbuild` task in `.vscode/tasks.json` relies on the problem matcher that extension provides.
4. Open the Run and Debug view:
   - macOS: `Cmd+Shift+D`
   - Windows/Linux: `Ctrl+Shift+D`
5. Select `Run Extension` from the debug configuration dropdown.
6. Press `F5` or click the green Run button.
7. VS Code opens a second window named Extension Development Host.
8. In the Extension Development Host window, open a `.md` file.
9. Run `Markdown Mirror Translator: Translate Current File` from the command palette.

Use the original VS Code window for source code and breakpoints. Use the Extension Development Host window as the test instance where you operate the extension like a user.

The launch configuration is defined in `.vscode/launch.json`. The current `Run Extension` configuration launches VS Code with:

```json
"--extensionDevelopmentPath=${workspaceFolder}"
```

This points the Extension Development Host at the current repository checkout.

When actively editing code, keep the default build/watch task running so TypeScript and esbuild output stay current. Build and watch tasks are defined in `.vscode/tasks.json`.

## Running Tests In VS Code

Command-line tests are the primary verification path for this repository, but VS Code's Testing view can also be used for local test iteration.

To use the Testing view:

1. Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner) extension.
2. Run the `tasks: watch-tests` task from **Tasks: Run Task**.
3. Open the Testing view from the activity bar.
4. Run tests from the Testing view or use the VS Code test shortcuts.

The Extension Test Runner helps VS Code discover and run extension tests in the Testing UI. It is not required for launching the Extension Development Host and debugging extension commands with `Run Extension`.

Tests live under `src/test/`. Add new tests as `*.test.ts` files.

## Useful Commands

Compile tests:

```bash
npm run compile-tests
```

Type-check source:

```bash
npm run check-types
```

Run ESLint:

```bash
npm run lint
```

Build the extension bundle:

```bash
npm run compile
```

Run the full VS Code extension test suite:

```bash
npm test
```

`npm test` uses `vscode-test` and may need VS Code/Electron startup and network access. In agent sessions, run it with the narrow tool-level escalation prefix `["npm", "test"]` as described in [AGENTS.md](./AGENTS.md).

Troubleshooting:

- If `npm test` fails with `spawn .../Contents/MacOS/Electron ENOENT` on macOS, the downloaded VS Code is 1.110 or newer, where the main executable was renamed from `Electron` to `Code` and the compatibility symlink was removed. This repository pins `@vscode/test-cli` `^0.0.15` and `@vscode/test-electron` `^3.1.0`, which resolve the executable from `Info.plist`; run `npm install` to pick them up. Do not hand-add an `Electron` symlink inside the downloaded `.app` bundle — it breaks the code signature and VS Code then dies with `SIGKILL`.
- Deleting `.vscode-test/` and rerunning `npm test` is safe; the test runner downloads a fresh VS Code copy.

## Architecture Overview

Core modules:

- `src/extension.ts` registers the virtual document provider and commands.
- `src/config.ts` reads `markdownMirrorTranslator.*` settings.
- `src/commands/translateCurrentFile.ts` validates the active Markdown document and orchestrates parsing, scheduling, rendering, session updates, and virtual document refresh.
- `src/commands/saveTranslatedFile.ts` saves the current translated session to disk with target-language naming and overwrite confirmation.
- `src/document/translatedDocumentProvider.ts` owns read-only translated virtual documents.
- `src/translationSession.ts` stores source URI, translated URI, source content, block state, rendered content, render mode, and config.
- `src/markdown/parser.ts` splits Markdown source into block records and protects inline structures.
- `src/markdown/renderer.ts` renders translated-only or bilingual Markdown from translated blocks.
- `src/translation/scheduler.ts` applies cache lookup, concurrency control, long-text splitting, progress updates, and failure isolation.
- `src/cache/translationCache.ts` stores provider/language/parser/block-hash based translation results.
- `src/translation/providers/googleFreeTranslator.ts` adapts the default `google-free` provider.
- `src/translation/types.ts` defines provider and scheduler contracts.

Tests live under `src/test/` and mirror these module boundaries.

## Adding Features

Use a design-first workflow for behavior changes:

1. Read `docs/basic-design.zh-CN.md` and the current implementation.
2. Write or update a task plan under `docs/superpowers/plans/` when the change affects behavior, multiple modules, public contracts, settings, file formats, or compatibility.
3. Keep changes small and reviewable.
4. Prefer existing module boundaries over new abstractions.
5. Add tests before implementation for new behavior.
6. Run the narrow useful verification during development.
7. Run full verification before completion.

When adding a translation provider:

- Implement `TranslatorProvider` from `src/translation/types.ts`.
- Keep provider code responsible only for request construction and response parsing.
- Do not put Markdown parsing, cache lookup, concurrency, or chunk splitting in the provider.
- Add provider tests with injected network functions. Do not make tests depend on live external services.

When changing Markdown parsing:

- Update `PARSER_VERSION` if cache compatibility changes.
- Add parser tests under `src/test/markdown/`.
- Preserve protected structures unless the design explicitly changes them.

When changing save behavior:

- Keep virtual translated documents read-only.
- Save only through `Markdown Mirror Translator: Save Translated File`.
- Preserve target-language naming and overwrite confirmation unless an approved design changes them.

## Fixing Bugs

Use a test-first bugfix flow:

1. Reproduce the bug.
2. Identify the root cause.
3. Add the smallest failing test that demonstrates the bug.
4. Implement the smallest fix.
5. Verify the new test and the relevant existing tests.
6. Run full verification before finishing.

Avoid broad refactors while fixing a bug unless the root cause requires a focused structural change.

## Testing Guidance

Prefer focused tests during development:

```bash
npm test -- --grep "Translation scheduler"
npm test -- --grep "Markdown parser"
npm test -- --grep "save command"
```

Always run full verification before completing meaningful work:

```bash
npm run compile-tests
npm run check-types
npm run lint
npm run compile
npm test
```

For documentation-only changes, use the narrowest useful verification:

```bash
git diff --check
```

Then review links, headings, and language consistency manually.

## Documentation Guidelines

Use the document type that matches the audience:

- `README.md`: user-facing English documentation and Marketplace default display.
- `README.zh-CN.md`: user-facing Chinese documentation.
- `CONTRIBUTING.md`: contributor setup, debugging, tests, architecture, and workflow.
- `docs/basic-design.zh-CN.md`: product and architecture design.
- `docs/superpowers/plans/`: task-specific implementation plans.
- `AGENTS.md`: repository-level agent rules only.

Keep user documentation focused on what the extension does, how to use it, commands, settings, output files, limitations, and related links. Keep contributor documentation focused on how to build, test, debug, extend, and safely change the project.

## Branch And Worktree Workflow

Use isolated worktrees for feature work when possible:

```bash
git worktree add .worktrees/<branch-name> -b <branch-name>
```

The project-local `.worktrees/` directory is ignored by git. Keep each branch focused on one task. Do not mix unrelated documentation, feature, and bugfix changes.

Before merging:

1. Commit all intended changes on the feature branch.
2. Run the appropriate verification.
3. Merge back to `main` only after verification passes.
4. Keep or remove the worktree according to the task owner’s preference.

## Pull Request Checklist

Before opening or merging a pull request:

- The change matches the approved scope.
- User-facing behavior changes are documented in `README.md` and `README.zh-CN.md` when relevant.
- Contributor workflow changes are documented in `CONTRIBUTING.md` when relevant.
- Product or architecture decisions are documented under `docs/` when they affect future development.
- Tests cover new behavior or bug fixes.
- `npm run check-types`, `npm run lint`, `npm run compile`, and `npm test` pass unless the PR explicitly documents why a narrower verification is sufficient.

## Releasing

Publishing to the VS Code Marketplace is done by the publisher owner. The scripts are already wired in `package.json`.

One-time setup:

1. Create an Azure DevOps account and a Personal Access Token with organization **All accessible organizations** and scope **Marketplace → Manage**.
2. Create the publisher at <https://marketplace.visualstudio.com/manage> and keep it identical to the `publisher` field in `package.json`.
3. Log in once on the release machine: `npx vsce login <publisher>`.

Release steps:

1. Update `CHANGELOG.md`, and update `README.md` / `README.zh-CN.md` when user-facing behavior changed.
2. Bump the version. The Marketplace rejects re-publishing an existing version:
   ```bash
   npm version patch   # or minor / major
   ```
3. Run full verification: `npm run compile-tests`, `npm run check-types`, `npm run lint`, `npm run compile`, `npm test`.
4. Publish from the CLI:
   ```bash
   npm run vscode:publish
   ```
   Or build a `.vsix` with `npm run vscode:vsix` and upload it manually from the publisher management page, which is useful for a first release or when the CLI token has problems.

A new release usually appears on the Marketplace within minutes, after an automated security scan. To distribute a build without publishing, hand out the `.vsix` and install it with `Extensions: Install from VSIX...`.
