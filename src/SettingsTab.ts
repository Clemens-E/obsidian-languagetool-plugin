import {App, PluginSettingTab, Setting} from 'obsidian';
import LanguageToolPlugin from '.';

export class LanguageToolSettingsTab extends PluginSettingTab {
	private readonly plugin: LanguageToolPlugin;

	public constructor(app: App, plugin: LanguageToolPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	public display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings for language tool' });

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
	}
}
