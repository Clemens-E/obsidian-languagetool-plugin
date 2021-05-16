import { LanguageToolPluginSettings } from './SettingsTab';

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
