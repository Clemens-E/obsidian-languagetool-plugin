import { MatchesEntity } from './LanguageToolTypings';
import { LanguageToolPluginSettings } from './SettingsTab';

export function hashString(value: string) {
	let hash = 0;
	if (value.length === 0) {
		return hash;
	}
	for (let i = 0; i < value.length; i++) {
		const char = value.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash &= hash; // Convert to 32bit integer
	}
	return hash;
}

const ignoreListRegEx = /frontmatter|code|math|templater|blockid/;

export function shouldCheckTextAtPos(instance: CodeMirror.Editor, pos: CodeMirror.Position) {
	// Empty line
	if (!instance.getLine(pos.line)) {
		return false;
	}

	const tokens = instance.getTokenTypeAt(pos);

	// Plain text line
	if (!tokens) {
		return true;
	}

	// Not codeblock or frontmatter
	if (!ignoreListRegEx.test(tokens)) {
		return true;
	}

	return false;
}

export function clearMarks(
	markerMap: Map<CodeMirror.TextMarker, MatchesEntity>,
	editor: CodeMirror.Editor,
	from?: CodeMirror.Position,
	to?: CodeMirror.Position,
) {
	const clearMark = (mark: CodeMirror.TextMarker<CodeMirror.MarkerRange>) => {
		if (mark.attributes?.isIgnored) return;
		markerMap.delete(mark);
		mark.clear();
	};

	if (from && to) {
		return editor.findMarks(from, to).forEach(clearMark);
	}

	editor.getAllMarks().forEach(clearMark);
}

// Assign a CSS class based on a rule's category ID
export function getIssueTypeClassName(categoryId: string) {
	switch (categoryId) {
		case 'COLLOQUIALISMS':
		case 'REDUNDANCY':
		case 'STYLE':
			return 'lt-style';
		case 'PUNCTUATION':
		case 'TYPOS':
			return 'lt-major';
	}

	return 'lt-minor';
}

// Construct a list of enabled / disabled rules
export function getRuleCategories(settings: LanguageToolPluginSettings) {
	const enabledCategories: string[] = settings.ruleOtherCategories ? settings.ruleOtherCategories.split(',') : [];
	const disabledCategories: string[] = settings.ruleOtherDisabledRules
		? settings.ruleOtherDisabledRules.split(',')
		: [];

	return {
		enabledCategories,
		disabledCategories,
	};
}
