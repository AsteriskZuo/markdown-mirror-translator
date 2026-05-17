import * as assert from 'assert';
import * as vscode from 'vscode';
import type { TranslationLineMapping } from '../../markdown/block';
import {
	createScrollSyncState,
	findMappingForLine,
	getMappedLine,
	getRevealLineForTargetTopLine,
	isProgrammaticScrollEvent,
	markProgrammaticScroll,
} from '../../scroll/editorScrollSync';

const mappings: TranslationLineMapping[] = [
	{
		blockId: 'block-0',
		sourceStartLine: 0,
		sourceEndLine: 0,
		translatedStartLine: 0,
		translatedEndLine: 1,
	},
	{
		blockId: 'block-1',
		sourceStartLine: 2,
		sourceEndLine: 4,
		translatedStartLine: 4,
		translatedEndLine: 9,
	},
];

suite('Editor scroll sync', () => {
	test('finds containing mapping and nearest following gap mapping', () => {
		assert.strictEqual(findMappingForLine(mappings, 'source', 0)?.blockId, 'block-0');
		assert.strictEqual(findMappingForLine(mappings, 'source', 1)?.blockId, 'block-1');
		assert.strictEqual(findMappingForLine(mappings, 'translated', 3)?.blockId, 'block-1');
		assert.strictEqual(findMappingForLine(mappings, 'translated', 99)?.blockId, 'block-1');
	});

	test('maps lines by proportional block-relative offset', () => {
		assert.strictEqual(getMappedLine(mappings, 'source', 2), 4);
		assert.strictEqual(getMappedLine(mappings, 'source', 3), 7);
		assert.strictEqual(getMappedLine(mappings, 'source', 4), 9);
		assert.strictEqual(getMappedLine(mappings, 'translated', 8), 4);
		assert.strictEqual(getMappedLine([], 'source', 0), undefined);
	});

	test('compensates reveal line because VS Code keeps a top margin for AtTop reveals', () => {
		assert.strictEqual(getRevealLineForTargetTopLine(0, 100), 5);
		assert.strictEqual(getRevealLineForTargetTopLine(7, 100), 12);
		assert.strictEqual(getRevealLineForTargetTopLine(98, 100), 99);
		assert.strictEqual(getRevealLineForTargetTopLine(-2, 100), 3);
	});

	test('suppresses programmatic scroll events for the target URI within a short window', () => {
		const state = createScrollSyncState();
		const sourceUri = vscode.Uri.file('/workspace/source.md');
		const translatedUri = vscode.Uri.parse('markdown-mirror-translator:/source/translated.md');

		markProgrammaticScroll(state, translatedUri, 1_000, 150);

		assert.strictEqual(isProgrammaticScrollEvent(state, sourceUri, 1_000), false);
		assert.strictEqual(isProgrammaticScrollEvent(state, translatedUri, 1_000), true);
		assert.strictEqual(isProgrammaticScrollEvent(state, translatedUri, 1_100), true);
		assert.strictEqual(isProgrammaticScrollEvent(state, translatedUri, 1_200), false);
	});
});
