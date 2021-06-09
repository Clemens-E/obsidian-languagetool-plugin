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

export function isPositionWithinRange(pos: CodeMirror.Position, start: CodeMirror.Position, end: CodeMirror.Position) {
	if (pos.line > start.line || (pos.line === start.line && pos.ch >= start.ch)) {
		if (pos.line < end.line || (pos.line === end.line && pos.ch <= end.ch)) {
			return true;
		}
	}
	return false;
}

const ignoreListRegEx = /frontmatter|code/;

export function shouldCheckLine(instance: CodeMirror.Editor, pos: CodeMirror.Position) {
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
	editor.getAllMarks().forEach(mark => {
		if (from && to) {
			const marker = mark.find();

			if (marker) {
				const range = marker as CodeMirror.MarkerRange;

				// Clear the mark if either end are between from and to
				if (isPositionWithinRange(range.from, from, to)) {
					markerMap.delete(mark);
					return mark.clear();
				}

				if (isPositionWithinRange(range.to, from, to)) {
					markerMap.delete(mark);
					return mark.clear();
				}
			}

			return;
		}

		markerMap.delete(mark);
		mark.clear();
	});
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
