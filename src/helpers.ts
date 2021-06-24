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

const ignoreListRegEx = /frontmatter|code|math/;

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
	const disabledCategories: string[] = [];

	if (settings.ruleCasing) {
		enabledCategories.push('CASING');
	} else {
		disabledCategories.push('CASING');
	}
	if (settings.ruleColloquialisms) {
		enabledCategories.push('COLLOCATIONS');
	} else {
		disabledCategories.push('COLLOCATIONS');
	}
	if (settings.ruleCompounding) {
		enabledCategories.push('COMPOUNDING');
	} else {
		disabledCategories.push('COMPOUNDING');
	}
	if (settings.ruleConfusedWords) {
		enabledCategories.push('CONFUSED_WORDS');
	} else {
		disabledCategories.push('CONFUSED_WORDS');
	}
	if (settings.ruleFalseFriends) {
		enabledCategories.push('FALSE_FRIENDS');
	} else {
		disabledCategories.push('FALSE_FRIENDS');
	}
	if (settings.ruleGenderNeutrality) {
		enabledCategories.push('GENDER_NEUTRALITY');
	} else {
		disabledCategories.push('GENDER_NEUTRALITY');
	}
	if (settings.ruleGrammar) {
		enabledCategories.push('GRAMMAR');
	} else {
		disabledCategories.push('GRAMMAR');
	}
	if (settings.ruleMisc) {
		enabledCategories.push('MISC');
	} else {
		disabledCategories.push('MISC');
	}
	if (settings.rulePlainEnglish) {
		enabledCategories.push('PLAIN_ENGLISH');
	} else {
		disabledCategories.push('PLAIN_ENGLISH');
	}
	if (settings.rulePunctuation) {
		enabledCategories.push('PUNCTUATION');
	} else {
		disabledCategories.push('PUNCTUATION');
	}
	if (settings.ruleRedundancy) {
		enabledCategories.push('REDUNDANCY');
	} else {
		disabledCategories.push('REDUNDANCY');
	}
	if (settings.ruleRegionalisms) {
		enabledCategories.push('REGIONALISMS');
	} else {
		disabledCategories.push('REGIONALISMS');
	}
	if (settings.ruleRepetitions) {
		enabledCategories.push('REPETITIONS');
	} else {
		disabledCategories.push('REPETITIONS');
	}
	if (settings.ruleSemantics) {
		enabledCategories.push('SEMANTICS');
	} else {
		disabledCategories.push('SEMANTICS');
	}
	if (settings.ruleStyle) {
		enabledCategories.push('STYLE');
	} else {
		disabledCategories.push('STYLE');
	}
	if (settings.ruleTypography) {
		enabledCategories.push('TYPOGRAPHY');
	} else {
		disabledCategories.push('TYPOGRAPHY');
	}
	if (settings.ruleTypos) {
		enabledCategories.push('TYPOS');
	} else {
		disabledCategories.push('TYPOS');
	}

	return {
		enabledCategories,
		disabledCategories,
	};
}
