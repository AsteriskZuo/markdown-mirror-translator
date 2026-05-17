# Change Log

All notable changes to the "markdown-mirror-translator" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.2] - 2026-05-17

- Fix bilingual Markdown rendering so consecutive list items do not gain paragraph-sized blank lines between source and translated list rows.
- Fix pipe table parsing for escaped `\|` inside table cells so those rows stay in the structured table translation path.

## [1.0.1] - 2026-05-17

- Preserve Markdown pipe table structure during translation.
- Translate table rows without sending separator rows to the translation provider.
- Use adaptive table translation that tries row context first and falls back to cell translation when row output cannot be mapped back to the original columns.

## [1.0.0] - 2026-05-15

- Initial release
