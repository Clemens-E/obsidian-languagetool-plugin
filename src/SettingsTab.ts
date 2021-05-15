import { App, PluginSettingTab, Setting } from 'obsidian';
import LanguageToolPlugin from '.';

export interface LanguageToolPluginSettings {
	serverUrl: string;
	glassBg: boolean;
	apikey?: string;
	username?: string;
	staticLanguage?: string;
}

export const DEFAULT_SETTINGS: LanguageToolPluginSettings = {
	serverUrl: 'https://api.languagetool.org/v2/check',
	glassBg: false,
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
		const languages = await fetch('https://api.languagetoolplus.com/v2/languages').then(res => res.json());
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
						this.plugin.settings.serverUrl = value;
						await this.plugin.saveSettings();
					}),
			);
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
	}
}
