# Markdown Mirror Translator

Markdown Mirror Translator is a VS Code extension for translating Markdown source files into editable Markdown files while keeping the original document open beside a read-only translated result.

It is not a Markdown preview renderer. It does not replace VS Code's built-in Markdown Preview or dedicated preview extensions. Its job is to translate Markdown source text, preserve common Markdown structures, show the translated Markdown in a side editor, and save the result as a separate `.md` file.

[中文说明](./README.zh-CN.md)

## Features

- Translate the current Markdown file from the command palette or editor title button.
- Keep the original Markdown file on the left and open a read-only translated Markdown document on the right.
- Show either translated-only Markdown or adjacent bilingual Markdown.
- Preserve common Markdown structures such as fenced code blocks, inline code, URLs, frontmatter, and HTML blocks.
- Translate headings, paragraphs, list items, block quotes, table rows, link labels, and image alt text where possible.
- Use the default `google-free` translation provider without requiring an API key.
- Cache translated blocks to reduce repeated translation requests.
- Save the translated result as a real Markdown file beside the source file.
- Ask before overwriting an existing translated file.

## What This Extension Does Not Do

- It does not render Markdown preview HTML.
- It does not provide a webview preview.
- It does not provide AI translation.
- It does not synchronize scrolling between source and translated editors.
- It does not translate selections only.
- It does not translate folders or projects in batch.
- It does not provide a glossary.
- It does not expose provider switching UI.
- It does not automatically watch source document changes and retranslate.
- It does not allow direct editing of the read-only translated virtual document.

## Commands

### `Markdown Mirror Translator: Translate Current File`

Translates the currently active Markdown document.

The translated document opens beside the source document as a read-only virtual Markdown document. Running the command again on the source document refreshes the existing translation view instead of opening duplicate translated editors.

### `Markdown Mirror Translator: Save Translated File`

Saves the current translated result to the source file directory.

This command is available from the command palette and from the title area of the translated virtual document.

## Settings

This extension contributes the following settings:

| Setting | Default | Description |
| --- | --- | --- |
| `markdownMirrorTranslator.sourceLanguage` | `""` | Source language code. Leave empty to let the provider accept any source language. |
| `markdownMirrorTranslator.targetLanguage` | `"zh-CN"` | Target language code for translated Markdown. |
| `markdownMirrorTranslator.bilingual` | `false` | When `false`, show translated-only Markdown. When `true`, show source and translated blocks together. |
| `markdownMirrorTranslator.translationUpdateMode` | `"manual"` | Translation update mode. `manual` is implemented. `auto` is reserved and currently behaves as manual. |

Example:

```json
{
  "markdownMirrorTranslator.sourceLanguage": "",
  "markdownMirrorTranslator.targetLanguage": "zh-CN",
  "markdownMirrorTranslator.bilingual": false,
  "markdownMirrorTranslator.translationUpdateMode": "manual"
}
```

## Usage

1. Open a `.md` file in VS Code.
2. Run `Markdown Mirror Translator: Translate Current File`.
3. The original Markdown file remains open, and a read-only translated Markdown document opens beside it.
4. Review the translated Markdown source.
5. Run `Markdown Mirror Translator: Save Translated File` from the translated document when you want a real editable file.

If you edit the source Markdown after translating, run `Translate Current File` again manually. The extension intentionally does not retranslate automatically while you type.

## Output Modes

### Translated-only Markdown

Source:

```markdown
# Hello

This is a document.
```

Translated result:

```markdown
# 你好

这是一个文档。
```

### Bilingual Markdown

Source:

```markdown
# Hello

This is a document.
```

Bilingual result:

```markdown
# Hello

# 你好

This is a document.

这是一个文档。
```

Bilingual output is block-adjacent by design. It does not attempt complex layout or rendered preview formatting.

## Saving Translated Files

Translated results are initially stored in a read-only virtual document managed by the extension. To edit or preview the result with another Markdown tool, save it as a real file first.

Default naming:

| Source file | Mode | Saved file |
| --- | --- | --- |
| `README.md` | Translated-only | `README.zh-CN.md` |
| `README.md` | Bilingual | `README.bilingual.zh-CN.md` |

If the target file already exists, the extension asks for confirmation before overwriting it.

## Markdown Structure Protection

The extension tries to avoid damaging Markdown syntax during translation.

Protected by default:

- Fenced code blocks
- Inline code
- URLs
- Markdown link URLs
- Image URLs
- Frontmatter blocks
- HTML blocks and inline HTML

Translatable where possible:

- Heading text
- Paragraph text
- List item text
- Block quote text
- Table row text
- Markdown link labels
- Image alt text

## Translation Provider

The MVP uses the internal `google-free` provider by default. It calls the non-official Google Translate endpoint and does not require an API key.

The provider is intentionally isolated behind an internal provider interface. Future providers can be added without changing the Markdown parser, renderer, cache, or scheduler.

## Error Handling

- If a single block fails to translate, the translated document keeps the original source block for that section.
- If some blocks fail, the extension shows a partial-failure message after translation completes.
- You can run `Translate Current File` again to retry.
- Cached successful blocks can be reused on later runs.

## Related Tools

The following links are provided as related tools in the Markdown translation and preview ecosystem:

- [Bilingual Markdown Preview](https://marketplace.visualstudio.com/items?itemName=harryplusplus.bilingual-markdown-preview)
- [Markdown Preview Enhanced](https://marketplace.visualstudio.com/items?itemName=shd101wyy.markdown-preview-enhanced)
- [Immersive Translate](https://immersivetranslate.com/en/)

## Development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run check-types
npm run lint
npm run compile
```

Run the VS Code extension test suite:

```bash
npm test
```

## License

No license has been declared yet.
