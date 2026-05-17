import * as vscode from 'vscode';
import { getConfig } from '../config';
import type { TranslatedDocumentProvider } from '../document/translatedDocumentProvider';
import type { TranslationLineMapping } from '../markdown/block';
import type { TranslationSession } from '../translationSession';

export type ScrollSyncSide = 'source' | 'translated';

export type ScrollSyncState = {
	programmaticScrollUntilByUri: Map<string, number>;
};

const defaultProgrammaticScrollSuppressionMs = 150;

// IMPORTANT: This is an observed VS Code editor behavior workaround, not part of
// the Markdown line-mapping model. In VS Code 1.120 on macOS, revealRange(..., AtTop)
// kept the requested line about five rows below the viewport top. Re-test this
// value when upgrading VS Code because the offset may change, become zero, or even
// require a negative compensation.
const atTopRevealCompensationLines = 5;

export function createScrollSyncState(): ScrollSyncState {
	return {
		programmaticScrollUntilByUri: new Map<string, number>(),
	};
}

function sameUri(left: vscode.Uri, right: vscode.Uri): boolean {
	return left.toString() === right.toString();
}

function getRangeStart(mapping: TranslationLineMapping, side: ScrollSyncSide): number {
	return side === 'source' ? mapping.sourceStartLine : mapping.translatedStartLine;
}

function getRangeEnd(mapping: TranslationLineMapping, side: ScrollSyncSide): number {
	return side === 'source' ? mapping.sourceEndLine : mapping.translatedEndLine;
}

function getRangeLength(mapping: TranslationLineMapping, side: ScrollSyncSide): number {
	return getRangeEnd(mapping, side) - getRangeStart(mapping, side) + 1;
}

export function findMappingForLine(
	mappings: TranslationLineMapping[],
	side: ScrollSyncSide,
	line: number,
): TranslationLineMapping | undefined {
	if (mappings.length === 0) {
		return undefined;
	}

	const containing = mappings.find((mapping) => line >= getRangeStart(mapping, side) && line <= getRangeEnd(mapping, side));
	if (containing) {
		return containing;
	}

	const following = mappings.find((mapping) => getRangeStart(mapping, side) > line);
	return following ?? mappings[mappings.length - 1];
}

export function getMappedLine(
	mappings: TranslationLineMapping[],
	fromSide: ScrollSyncSide,
	line: number,
): number | undefined {
	const mapping = findMappingForLine(mappings, fromSide, line);
	if (!mapping) {
		return undefined;
	}

	const toSide: ScrollSyncSide = fromSide === 'source' ? 'translated' : 'source';
	const fromStart = getRangeStart(mapping, fromSide);
	const fromLength = getRangeLength(mapping, fromSide);
	const toStart = getRangeStart(mapping, toSide);
	const toLength = getRangeLength(mapping, toSide);
	const fromOffset = Math.min(Math.max(0, line - fromStart), fromLength - 1);

	if (fromLength <= 1 || toLength <= 1) {
		return toStart;
	}

	const ratio = fromOffset / (fromLength - 1);
	return toStart + Math.round(ratio * (toLength - 1));
}

export function markProgrammaticScroll(
	state: ScrollSyncState,
	uri: vscode.Uri,
	now = Date.now(),
	durationMs = defaultProgrammaticScrollSuppressionMs,
): void {
	const key = uri.toString();
	const suppressUntil = now + durationMs;
	const currentSuppressUntil = state.programmaticScrollUntilByUri.get(key) ?? 0;
	state.programmaticScrollUntilByUri.set(key, Math.max(currentSuppressUntil, suppressUntil));

	setTimeout(() => {
		if ((state.programmaticScrollUntilByUri.get(key) ?? 0) <= Date.now()) {
			state.programmaticScrollUntilByUri.delete(key);
		}
	}, durationMs);
}

export function isProgrammaticScrollEvent(state: ScrollSyncState, uri: vscode.Uri, now = Date.now()): boolean {
	const key = uri.toString();
	const suppressUntil = state.programmaticScrollUntilByUri.get(key);

	if (suppressUntil === undefined) {
		return false;
	}

	if (now <= suppressUntil) {
		return true;
	}

	state.programmaticScrollUntilByUri.delete(key);
	return false;
}

function getEditorSide(editor: vscode.TextEditor, session: TranslationSession): ScrollSyncSide | undefined {
	if (sameUri(editor.document.uri, session.sourceUri)) {
		return 'source';
	}

	if (sameUri(editor.document.uri, session.translatedUri)) {
		return 'translated';
	}

	return undefined;
}

function findPairedEditor(session: TranslationSession, fromSide: ScrollSyncSide): vscode.TextEditor | undefined {
	const targetUri = fromSide === 'source' ? session.translatedUri : session.sourceUri;
	return vscode.window.visibleTextEditors.find((editor) => sameUri(editor.document.uri, targetUri));
}

function clampLine(editor: vscode.TextEditor, line: number): number {
	const maxLine = Math.max(0, editor.document.lineCount - 1);
	return Math.min(Math.max(0, line), maxLine);
}

export function getRevealLineForTargetTopLine(targetTopLine: number, documentLineCount: number): number {
	const maxLine = Math.max(0, documentLineCount - 1);
	return Math.min(Math.max(0, targetTopLine + atTopRevealCompensationLines), maxLine);
}

function revealEditorLine(editor: vscode.TextEditor, line: number): void {
	const clampedLine = clampLine(editor, getRevealLineForTargetTopLine(line, editor.document.lineCount));
	const position = new vscode.Position(clampedLine, 0);
	editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.AtTop);
}

export function registerEditorScrollSync(provider: TranslatedDocumentProvider): vscode.Disposable {
	const state = createScrollSyncState();

	return vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
		const eventUri = event.textEditor.document.uri;

		if (!getConfig().syncScroll) {
			return;
		}

		const session = provider.getSessionForUri(eventUri);
		if (!session || session.lineMappings.length === 0 || event.visibleRanges.length === 0) {
			return;
		}

		if (isProgrammaticScrollEvent(state, eventUri)) {
			return;
		}

		const fromSide = getEditorSide(event.textEditor, session);
		if (!fromSide) {
			return;
		}

		const pairedEditor = findPairedEditor(session, fromSide);
		if (!pairedEditor) {
			return;
		}

		const targetLine = getMappedLine(session.lineMappings, fromSide, event.visibleRanges[0].start.line);
		if (targetLine === undefined) {
			return;
		}

		markProgrammaticScroll(state, pairedEditor.document.uri);
		revealEditorLine(pairedEditor, targetLine);
	});
}
