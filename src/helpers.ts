import { LanguageToolPluginSettings } from './SettingsTab';

export const ignoreListRegEx = /frontmatter|code|math|templater|blockid|hashtag|internal/;

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
