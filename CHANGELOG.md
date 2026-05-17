# Change Log

All notable changes to the "markdown-mirror-translator" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.1] - 2026-05-17

- Preserve Markdown pipe table structure during translation.
- Translate table rows without sending separator rows to the translation provider.
- Use adaptive table translation that tries row context first and falls back to cell translation when row output cannot be mapped back to the original columns.

## [1.0.0] - 2026-05-15

- Initial release
