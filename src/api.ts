import * as Remark from 'annotatedtext-remark';
import { Notice } from 'obsidian';
import { getRuleCategories } from './helpers';
import { LanguageToolApi } from './LanguageToolTypings';
import { LanguageToolPluginSettings } from './SettingsTab';

export const logs: string[] = [];

let lastStatus: 'ok' | 'request-failed' | 'request-not-ok' | 'json-parse-error' = 'ok';
const listRegex = /^\s*(-|\d+\.) $/m;

export async function getDetectionResult(
	text: string,
	getSettings: () => LanguageToolPluginSettings,
): Promise<LanguageToolApi> {
	const parsedText = Remark.build(text, {
		...Remark.defaults,
		interpretmarkup(text = ''): string {
			// Don't collapse inline code
			if (/^`[^`]+`$/.test(text)) {
				return text;
			}
			const linebreaks = '\n'.repeat((text.match(/\n/g) || [])?.length ?? 0);

			// Support lists (annotation ends with marker)
			if (listRegex.exec(text)) {
				return `${linebreaks}• `; // this is the character, the online editor uses
			}

			return linebreaks;
		},
	});

	const settings = getSettings();

	const { enabledCategories, disabledCategories } = getRuleCategories(settings);

	const params: { [key: string]: string } = {
		data: JSON.stringify(parsedText),
		language: 'auto',
		enabledOnly: 'false',
		level: settings.pickyMode ? 'picky' : 'default',
	};

	if (enabledCategories.length) {
		params.enabledCategories = enabledCategories.join(',');
	}

	if (disabledCategories.length) {
		params.disabledCategories = disabledCategories.join(',');
	}

	if (settings.ruleOtherRules) {
		params.enabledRules = settings.ruleOtherRules;
	}

	if (settings.ruleOtherDisabledRules) {
		params.disabledRules = settings.ruleOtherDisabledRules;
	}

	if (settings.englishVeriety) {
		params.preferredVariants = `${params.preferredVariants ? `${params.preferredVariants},` : ''}${
			settings.englishVeriety
		}`;
	}

	if (settings.germanVeriety) {
		params.preferredVariants = `${params.preferredVariants ? `${params.preferredVariants},` : ''}${
			settings.germanVeriety
		}`;
	}

	if (settings.portugueseVeriety) {
		params.preferredVariants = `${params.preferredVariants ? `${params.preferredVariants},` : ''}${
			settings.portugueseVeriety
		}`;
	}

	if (settings.catalanVeriety) {
		params.preferredVariants = `${params.preferredVariants ? `${params.preferredVariants},` : ''}${
			settings.catalanVeriety
		}`;
	}

	if (settings.apikey && settings.username && settings.apikey.length > 1 && settings.username.length > 1) {
		params.username = settings.username;
		params.apiKey = settings.apikey;
	}

	if (settings.staticLanguage && settings.staticLanguage.length > 0 && settings.staticLanguage !== 'auto') {
		params.language = settings.staticLanguage;
	}

	if (settings.motherTongue && settings.motherTongue.length > 0) {
		params.motherTongue = settings.motherTongue;
	}

	let url = `${settings.serverUrl}/v2/check`;
	const headers: HeadersInit = {
		'Content-Type': 'application/x-www-form-urlencoded',
		Accept: 'application/json',
	};

	if (settings.urlMode === 'custom' && settings.customUrl && settings.authHeader) {
		url = `${settings.customUrl}/v2/check`;
		headers.Authorization = settings.authHeader;
	}

	let resEnglish: Response;
	let resSpanish: Response;
	try {
		params.language = 'en-US';
		resEnglish = await fetch(url, {
			method: 'POST',
			body: Object.keys(params)
				.map(key => {
					return `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
				})
				.join('&'),
			headers: headers,
		});
		params.language = 'es-ES';
		resSpanish = await fetch(url, {
			method: 'POST',
			body: Object.keys(params)
				.map(key => {
					return `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
				})
				.join('&'),
			headers: headers,
		});
	} catch (e) {
		const status = 'request-failed';
		if (lastStatus !== status || !settings.shouldAutoCheck) {
			new Notice(
				`Request to LanguageTool server failed. Please check your connection and LanguageTool server URL`,
				3000,
			);
			lastStatus = status;
		}
		return Promise.reject(e);
	}

	if (!resEnglish.ok) {
		const status = 'request-not-ok';
		await pushLogs(resEnglish, settings);
		if (lastStatus !== status || !settings.shouldAutoCheck) {
			new Notice(`Request to LanguageTool failed\n${resEnglish.statusText}Check Plugin Settings for Logs`, 3000);
			lastStatus = status;
		}
		return Promise.reject(new Error(`unexpected status ${resEnglish.status}, see network tab`));
	}

	if (!resSpanish.ok) {
		const status = 'request-not-ok';
		await pushLogs(resSpanish, settings);
		if (lastStatus !== status || !settings.shouldAutoCheck) {
			new Notice(`Request to LanguageTool failed\n${resSpanish.statusText}Check Plugin Settings for Logs`, 3000);
			lastStatus = status;
		}
		return Promise.reject(new Error(`unexpected status ${resSpanish.status}, see network tab`));
	}

	let bodySpanish: LanguageToolApi;
	let bodyEnglish: LanguageToolApi;
	try {
		bodySpanish = await resSpanish.json();
		bodyEnglish = await resEnglish.json();

		if (bodySpanish.matches && bodyEnglish.matches) {
			for (let i = 0; i < bodySpanish.matches.length; i++) {
				let match = false;
				const context = bodySpanish.matches[i].context;
				const word = context.text.substring(context.offset, context.length);
				for (const enMatch of bodyEnglish.matches) {
					if (word === enMatch.context.text.substring(enMatch.context.offset, enMatch.context.length)) {
						match = true;
						break;
					}
				}
				if (!match) {
					const context = bodySpanish.matches[i].context;
					new Notice(`Sp Removed: ${context.text.substring(context.offset, context.length)}`, 3000);
					bodySpanish.matches.splice(i, 1);
					i--;
				}
			}

			for (let i = 0; i < bodyEnglish.matches.length; i++) {
				let match = false;
				const context = bodyEnglish.matches[i].context;
				const word = context.text.substring(context.offset, context.length);
				for (const spMatch of bodySpanish.matches) {
					if (word === spMatch.context.text.substring(spMatch.context.offset, spMatch.context.length)) {
						match = true;
						break;
					}
				}
				if (!match) {
					const context = bodyEnglish.matches[i].context;
					new Notice(`En Removed: ${context.text.substring(context.offset, context.length)}`, 3000);
					bodyEnglish.matches.splice(i, 1);
					i--;
				}
			}

			bodySpanish.matches = bodySpanish.matches.concat(bodyEnglish.matches);
		}
	} catch (e) {
		const status = 'json-parse-error';
		if (lastStatus !== status || !settings.shouldAutoCheck) {
			new Notice(`Error processing response from LanguageTool server`, 3000);
			lastStatus = status;
		}
		return Promise.reject(e);
	}

	const status = 'ok';
	if (lastStatus !== status || !settings.shouldAutoCheck) {
		new Notice(`LanguageTool detection restored`, 5000);
		lastStatus = status;
	}

	return bodySpanish;
}

export async function pushLogs(res: Response, settings: LanguageToolPluginSettings): Promise<void> {
	let debugString = `${new Date().toLocaleString()}:
  url used for request: ${res.url}
  Status: ${res.status}
  Body: ${(await res.text()).slice(0, 200)}
  Settings: ${JSON.stringify({ ...settings, username: 'REDACTED', apikey: 'REDACTED' })}
  `;
	if (settings.username || settings.apikey) {
		debugString = debugString
			.replaceAll(settings.username ?? 'username', '<<username>>')
			.replaceAll(settings.apikey ?? 'apiKey', '<<apikey>>');
	}

	logs.push(debugString);

	if (logs.length > 10) {
		logs.shift();
	}
}
