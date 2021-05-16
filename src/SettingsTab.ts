import { App, PluginSettingTab, Setting } from 'obsidian';
import LanguageToolPlugin from '.';

export interface LanguageToolPluginSettings {
	serverUrl: string;
	glassBg: boolean;
	apikey?: string;
	username?: string;
	staticLanguage?: string;

	pickyMode: boolean;
	ruleCasing: boolean;
	ruleColloquialisms: boolean;
	ruleCompounding: boolean;
	ruleConfusedWords: boolean;
	ruleFalseFriends: boolean;
	ruleGenderNeutrality: boolean;
	ruleGrammar: boolean;
	ruleMisc: boolean;
	rulePlainEnglish: boolean;
	rulePunctuation: boolean;
	ruleRedundancy: boolean;
	ruleRegionalisms: boolean;
	ruleRepetitions: boolean;
	ruleSemantics: boolean;
	ruleStyle: boolean;
	ruleTypography: boolean;
	ruleTypos: boolean;

	ruleOtherCategories?: string;
	ruleOtherRules?: string;
	ruleOtherDisabledRules?: string;
}

export const DEFAULT_SETTINGS: LanguageToolPluginSettings = {
	serverUrl: 'https://api.languagetool.org',
	glassBg: false,

	pickyMode: false,
	ruleGrammar: true,
	ruleGenderNeutrality: true,
	ruleColloquialisms: true,
	ruleStyle: true,
	ruleRegionalisms: true,
	ruleCasing: true,
	ruleCompounding: true,
	ruleConfusedWords: true,
	ruleFalseFriends: true,
	ruleMisc: true,
	rulePlainEnglish: true,
	ruleRedundancy: true,
	ruleRepetitions: true,
	ruleSemantics: true,
	rulePunctuation: true,
	ruleTypos: true,
	ruleTypography: true,
};

export class LanguageToolSettingsTab extends PluginSettingTab {
	private readonly plugin: LanguageToolPlugin;
	private languages: { name: string; code: string; longCode: string }[];
	public constructor(app: App, plugin: LanguageToolPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	public async requestLanguages() {
		if (this.languages) return this.languages;
		const languages = await fetch(`${this.plugin.settings.serverUrl}/v2/languages`).then(res => res.json());
		this.languages = languages;
		return this.languages;
	}

	public display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings for LanguageTool' });

		new Setting(containerEl)
			.setName('Endpoint')
			.setDesc('endpoint that will be used to make requests to')
			.addText(text =>
				text
					.setPlaceholder('Enter endpoint')
					.setValue(this.plugin.settings.serverUrl)
					.onChange(async value => {
						this.plugin.settings.serverUrl = value.replace(/\/v2\/check\/$/, '').replace(/\/$/, '');
						await this.plugin.saveSettings();
					}),
			)
			.addExtraButton(button => {
				button
					.setIcon('reset')
					.setTooltip('Reset to default')
					.onClick(async () => {
						this.plugin.settings.serverUrl = DEFAULT_SETTINGS.serverUrl;
						await this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName('Glass Background')
			.setDesc('use the secondary background color of the theme or a glass background')
			.addToggle(component => {
				component.setValue(this.plugin.settings.glassBg).onChange(async value => {
					this.plugin.settings.glassBg = value;
					await this.plugin.saveSettings();
				});
			});
		new Setting(containerEl)
			.setName('Static Langauge')
			.setDesc(
				'Set a static language that will always be used (LanguageTool tries to auto detect the language, this is usually not necessary)',
			)
			.addDropdown(component => {
				this.requestLanguages()
					.then(languages => {
						component.addOption('auto', 'Auto Detect');
						languages.forEach(v => component.addOption(v.longCode, v.name));
						component.setValue(this.plugin.settings.staticLanguage ?? 'auto');
						component.onChange(async value => {
							this.plugin.settings.staticLanguage = value;
							await this.plugin.saveSettings();
						});
					})
					.catch(console.error);
			});

		containerEl.createEl('h3', { text: 'Rule Categories' });

		new Setting(containerEl)
			.setName('Picky Mode')
			.setDesc(
				'Provides more style and tonality suggestions, detects long or complex sentences, recognizes colloquialism and redundancies, proactively suggests synonyms for commonly overused words',
			)
			.addToggle(component => {
				component.setValue(this.plugin.settings.pickyMode).onChange(async value => {
					this.plugin.settings.pickyMode = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Casing')
			.setDesc('Rules about detecting uppercase words where lowercase is required and vice versa')
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleCasing).onChange(async value => {
					this.plugin.settings.ruleCasing = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Colloquialisms')
			.setDesc('Colloquial style')
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleColloquialisms).onChange(async value => {
					this.plugin.settings.ruleColloquialisms = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Compounding')
			.setDesc('Rules about spelling terms as one word or as as separate words')
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleCompounding).onChange(async value => {
					this.plugin.settings.ruleCompounding = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Confused Words')
			.setDesc(`Words that are easily confused, like 'there' and 'their' in English.`)
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleConfusedWords).onChange(async value => {
					this.plugin.settings.ruleConfusedWords = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('False Friends')
			.setDesc(
				'False friends: words easily confused by language learners because a similar word exists in their native language',
			)
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleFalseFriends).onChange(async value => {
					this.plugin.settings.ruleFalseFriends = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName('Gender Neutrality').addToggle(component => {
			component.setValue(this.plugin.settings.ruleGenderNeutrality).onChange(async value => {
				this.plugin.settings.ruleGenderNeutrality = value;
				await this.plugin.saveSettings();
			});
		});

		new Setting(containerEl).setName('Grammar').addToggle(component => {
			component.setValue(this.plugin.settings.ruleGrammar).onChange(async value => {
				this.plugin.settings.ruleGrammar = value;
				await this.plugin.saveSettings();
			});
		});

		new Setting(containerEl)
			.setName('Misc')
			.setDesc(`Miscellaneous rules that don't fit elsewhere.`)
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleMisc).onChange(async value => {
					this.plugin.settings.ruleMisc = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName('Plain English').addToggle(component => {
			component.setValue(this.plugin.settings.rulePlainEnglish).onChange(async value => {
				this.plugin.settings.rulePlainEnglish = value;
				await this.plugin.saveSettings();
			});
		});

		new Setting(containerEl).setName('Punctuation').addToggle(component => {
			component.setValue(this.plugin.settings.rulePunctuation).onChange(async value => {
				this.plugin.settings.rulePunctuation = value;
				await this.plugin.saveSettings();
			});
		});

		new Setting(containerEl).setName('Redundancy').addToggle(component => {
			component.setValue(this.plugin.settings.ruleRedundancy).onChange(async value => {
				this.plugin.settings.ruleRedundancy = value;
				await this.plugin.saveSettings();
			});
		});

		new Setting(containerEl)
			.setName('Regionalisms')
			.setDesc(`Regionalisms: words used only in another language variant or used with different meanings.`)
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleRegionalisms).onChange(async value => {
					this.plugin.settings.ruleRegionalisms = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName('Repetitions').addToggle(component => {
			component.setValue(this.plugin.settings.ruleRepetitions).onChange(async value => {
				this.plugin.settings.ruleRepetitions = value;
				await this.plugin.saveSettings();
			});
		});

		new Setting(containerEl)
			.setName('Semantics')
			.setDesc(`Logic, content, and consistency problems.`)
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleSemantics).onChange(async value => {
					this.plugin.settings.ruleSemantics = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Style')
			.setDesc(`General style issues not covered by other categories, like overly verbose wording.`)
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleStyle).onChange(async value => {
					this.plugin.settings.ruleStyle = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Typography')
			.setDesc(`Problems like incorrectly used dash or quote characters.`)
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleTypography).onChange(async value => {
					this.plugin.settings.ruleTypography = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Typos')
			.setDesc(`Spelling issues.`)
			.addToggle(component => {
				component.setValue(this.plugin.settings.ruleTypos).onChange(async value => {
					this.plugin.settings.ruleTypos = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Other rule categories')
			.setDesc('Enter a comma-separated list of categories')
			.addText(text =>
				text
					.setPlaceholder('Eg. CATEGORY_1,CATEGORY_2')
					.setValue(this.plugin.settings.ruleOtherCategories || '')
					.onChange(async value => {
						this.plugin.settings.ruleOtherCategories = value.replace(/\s+/g, '');
						await this.plugin.saveSettings();
					}),
			)
			.then(setting => {
				setting.descEl.createEl('br');
				setting.descEl.createEl(
					'a',
					{
						text: 'Click here for a list of rules and categories',
						href: 'https://community.languagetool.org/rule/list',
					},
					a => {
						a.setAttr('target', '_blank');
					},
				);
			});

		new Setting(containerEl)
			.setName('Enable Specific Rules')
			.setDesc('Enter a comma-separated list of rules')
			.addText(text =>
				text
					.setPlaceholder('Eg. RULE_1,RULE_2')
					.setValue(this.plugin.settings.ruleOtherRules || '')
					.onChange(async value => {
						this.plugin.settings.ruleOtherRules = value.replace(/\s+/g, '');
						await this.plugin.saveSettings();
					}),
			)
			.then(setting => {
				setting.descEl.createEl('br');
				setting.descEl.createEl(
					'a',
					{
						text: 'Click here for a list of rules and categories',
						href: 'https://community.languagetool.org/rule/list',
					},
					a => {
						a.setAttr('target', '_blank');
					},
				);
			});

		new Setting(containerEl)
			.setName('Disable Specific Rules')
			.setDesc('Enter a comma-separated list of rules')
			.addText(text =>
				text
					.setPlaceholder('Eg. RULE_1,RULE_2')
					.setValue(this.plugin.settings.ruleOtherDisabledRules || '')
					.onChange(async value => {
						this.plugin.settings.ruleOtherDisabledRules = value.replace(/\s+/g, '');
						await this.plugin.saveSettings();
					}),
			)
			.then(setting => {
				setting.descEl.createEl('br');
				setting.descEl.createEl(
					'a',
					{
						text: 'Click here for a list of rules and categories',
						href: 'https://community.languagetool.org/rule/list',
					},
					a => {
						a.setAttr('target', '_blank');
					},
				);
			});
	}
}
