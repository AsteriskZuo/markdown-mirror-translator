# Change Log

All notable changes to the "markdown-mirror-translator" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.3] - 2026-05-17

- Split long ordinary text on language-neutral semantic boundaries instead of only hard length slices.
- Avoid splitting protected inline placeholder tokens during text chunking.
- Keep block-level failure behavior unchanged when a chunk translation fails.

## [1.0.2] - 2026-05-17

- Fix bilingual Markdown rendering so consecutive list items do not gain paragraph-sized blank lines between source and translated list rows.
- Fix pipe table parsing for escaped `\|` inside table cells so those rows stay in the structured table translation path.
- Preserve task list checkbox markers while translating list item text.
- Make table row translation fall back to cell translation when row output cannot be mapped back to the source columns.

## [1.0.1] - 2026-05-17

- Preserve Markdown pipe table structure during translation.
- Translate table rows without sending separator rows to the translation provider.
- Use adaptive table translation that tries row context first and falls back to cell translation when row output cannot be mapped back to the original columns.

## [1.0.0] - 2026-05-15

- Initial release
