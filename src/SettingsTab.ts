import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
import LanguageToolPlugin from '.';

export interface LanguageToolPluginSettings {
	shouldAutoCheck: boolean;

	serverUrl: string;
	glassBg: boolean;
	apikey?: string;
	username?: string;
	staticLanguage?: string;

	pickyMode: boolean;

	ruleOtherCategories?: string;
	ruleOtherRules?: string;
	ruleOtherDisabledRules?: string;
}

export const DEFAULT_SETTINGS: LanguageToolPluginSettings = {
	serverUrl: 'https://api.languagetool.org',
	glassBg: false,
	shouldAutoCheck: false,

	pickyMode: false,
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
			.setDesc('Endpoint that will be used to make requests to')
			.then(setting => {
				let input: TextComponent | null = null;

				setting
					.addText(text => {
						input = text;
						text
							.setPlaceholder('Enter endpoint')
							.setValue(this.plugin.settings.serverUrl)
							.onChange(async value => {
								this.plugin.settings.serverUrl = value.replace(/\/v2\/check\/$/, '').replace(/\/$/, '');
								await this.plugin.saveSettings();
							});
					})
					.addExtraButton(button => {
						button
							.setIcon('reset')
							.setTooltip('Reset to default')
							.onClick(async () => {
								this.plugin.settings.serverUrl = DEFAULT_SETTINGS.serverUrl;
								input?.setValue(DEFAULT_SETTINGS.serverUrl);
								await this.plugin.saveSettings();
							});
					});
			});
		new Setting(containerEl)
			.setName('Autocheck Text')
			.setDesc('Check text as you type')
			.addToggle(component => {
				component.setValue(this.plugin.settings.shouldAutoCheck).onChange(async value => {
					this.plugin.settings.shouldAutoCheck = value;
					await this.plugin.saveSettings();
				});
			});
		new Setting(containerEl)
			.setName('Glass Background')
			.setDesc('Use the secondary background color of the theme or a glass background')
			.addToggle(component => {
				component.setValue(this.plugin.settings.glassBg).onChange(async value => {
					this.plugin.settings.glassBg = value;
					await this.plugin.saveSettings();
				});
			});
		new Setting(containerEl)
			.setName('Static Language')
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

		new Setting(containerEl)
			.setName('API Username')
			.setDesc('Enter a username/email for API Access')
			.addText(text =>
				text
					.setPlaceholder('peterlustig@gmail.com')
					.setValue(this.plugin.settings.username || '')
					.onChange(async value => {
						this.plugin.settings.username = value.replace(/\s+/g, '');
						await this.plugin.saveSettings();
					}),
			)
			.then(setting => {
				setting.descEl.createEl('br');
				setting.descEl.createEl(
					'a',
					{
						text: 'Click here for information about Premium Access',
						href: 'https://github.com/Clemens-E/obsidian-languagetool-plugin#premium-accounts',
					},
					a => {
						a.setAttr('target', '_blank');
					},
				);
			});

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Enter an API Key')
			.addText(text =>
				text.setValue(this.plugin.settings.apikey || '').onChange(async value => {
					this.plugin.settings.apikey = value.replace(/\s+/g, '');
					await this.plugin.saveSettings();
				}),
			)
			.then(setting => {
				setting.descEl.createEl('br');
				setting.descEl.createEl(
					'a',
					{
						text: 'Click here for information about Premium Access',
						href: 'https://github.com/Clemens-E/obsidian-languagetool-plugin#premium-accounts',
					},
					a => {
						a.setAttr('target', '_blank');
					},
				);
			});
	}
}
