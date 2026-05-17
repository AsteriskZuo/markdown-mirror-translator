import * as vscode from 'vscode';

export type TranslationUpdateMode = 'manual' | 'auto';

export type MarkdownMirrorTranslatorConfig = {
	sourceLanguage: string;
	targetLanguage: string;
	bilingual: boolean;
	translationUpdateMode: TranslationUpdateMode;
	syncScroll: boolean;
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
		syncScroll: config.get<boolean>('syncScroll', true),
	};
}
