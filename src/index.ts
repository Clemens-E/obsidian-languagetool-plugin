import { MarkdownView, Menu, Notice, Plugin, setIcon } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import QuickLRU from 'quick-lru';
import { DEFAULT_SETTINGS, LanguageToolPluginSettings, LanguageToolSettingsTab } from './SettingsTab';
import { LanguageToolApi } from './LanguageToolTypings';
import { hashString } from './helpers';
import { getDetectionResult } from './api';
import { buildUnderlineExtension } from './cm6/underlineExtension';
import { addUnderline, clearUnderlines, clearUnderlinesInRange } from './cm6/underlineStateField';
import LegacyLanguageToolPlugin from './cm5/LegacyPlugin';
import { legacyClearMarks } from './cm5/helpers';

export default class LanguageToolPlugin extends Plugin {
	public settings: LanguageToolPluginSettings;
	private statusBarText: HTMLElement;

	private hashLru: QuickLRU<number, LanguageToolApi>;
	private isloading = false;

	// Legacy editor
	private isLegacyEditor: boolean;
	private legacyPlugin: LegacyLanguageToolPlugin;

	public async onload() {
		this.isLegacyEditor = Boolean(!(this.app as any).isMobile && (this.app.vault as any).getConfig('legacyEditor'));

		// Settings
		await this.loadSettings();
		const unmodifiedSettings = await this.loadData();
		if (!unmodifiedSettings.urlMode || unmodifiedSettings.urlMode.length === 0) {
			const { serverUrl } = this.settings;
			this.settings.urlMode =
				serverUrl === 'https://api.languagetool.org'
					? 'standard'
					: serverUrl === 'https://api.languagetoolplus.com'
					? 'premium'
					: 'custom';
			try {
				await this.saveSettings();
				new Notice('updated LanguageTool Settings, please confirm your server URL in the settings tab', 10000);
			} catch (e) {
				console.error(e);
			}
		}

		if (this.settings.serverUrl.includes('/v2/check')) {
			new Notice(
				"invalid or outdated LanguageTool Settings, I'm trying to fix it.\nIf it does not work, simply reinstall the plugin",
				10000,
			);
			this.settings.serverUrl = this.settings.serverUrl.replace('/v2/check', '');
			try {
				await this.saveSettings();
			} catch (e) {
				console.error(e);
			}
		}

		this.addSettingTab(new LanguageToolSettingsTab(this.app, this));

		// Status bar
		this.app.workspace.onLayoutReady(() => {
			this.statusBarText = this.addStatusBarItem();
			this.setStatusBarReady();
			this.registerDomEvent(this.statusBarText, 'click', this.handleStatusBarClick);
		});

		// Editor functionality
		if (this.isLegacyEditor) {
			this.legacyPlugin = new LegacyLanguageToolPlugin(this);
			await this.legacyPlugin.onload();
		} else {
			this.hashLru = new QuickLRU<number, LanguageToolApi>({
				maxSize: 10,
			});
			this.registerEditorExtension(buildUnderlineExtension(this));
		}

		// Commands
		this.registerCommands();
	}

	public onunload() {
		if (this.isLegacyEditor) {
			this.legacyPlugin.onunload();
		}

		this.hashLru.clear();
	}

	private registerCommands() {
		this.addCommand({
			id: 'ltcheck-text',
			name: 'Check Text',
			editorCallback: (editor, view) => {
				if (this.isLegacyEditor) {
					const cm = (editor as any).cm as CodeMirror.Editor;

					if (editor.somethingSelected()) {
						this.legacyPlugin.runDetection(cm, cm.getCursor('from'), cm.getCursor('to')).catch(e => {
							console.error(e);
						});
					} else {
						this.legacyPlugin.runDetection(cm).catch(e => {
							console.error(e);
						});
					}
				} else {
					this.runDetection((editor as any).cm as EditorView, view).catch(e => {
						console.error(e);
					});
				}
			},
		});

		this.addCommand({
			id: 'ltautocheck-text',
			name: 'Toggle Automatic Checking',
			callback: async () => {
				this.settings.shouldAutoCheck = !this.settings.shouldAutoCheck;
				await this.saveSettings();
			},
		});

		this.addCommand({
			id: 'ltclear',
			name: 'Clear Suggestions',
			editorCallback: editor => {
				if (this.isLegacyEditor) {
					if (this.legacyPlugin.markerMap.size > 0) {
						const cm = (editor as any).cm as CodeMirror.Editor;
						legacyClearMarks(this.legacyPlugin.markerMap, cm);
					}
				} else {
					const cm = (editor as any).cm as EditorView;
					cm.dispatch({
						effects: [clearUnderlines.of(null)],
					});
				}
			},
		});
	}

	public setStatusBarReady() {
		this.isloading = false;
		this.statusBarText.empty();
		this.statusBarText.createSpan({ cls: 'lt-status-bar-btn' }, span => {
			span.createSpan({ cls: 'lt-status-bar-check-icon', text: 'Aa' });
		});
	}

	public setStatusBarWorking() {
		if (this.isloading) return;

		this.isloading = true;
		this.statusBarText.empty();
		this.statusBarText.createSpan({ cls: ['lt-status-bar-btn', 'lt-loading'] }, span => {
			setIcon(span, 'sync-small');
		});
	}

	private readonly handleStatusBarClick = () => {
		const statusBarRect = this.statusBarText.parentElement?.getBoundingClientRect();
		const statusBarIconRect = this.statusBarText.getBoundingClientRect();

		new Menu(this.app)
			.addItem(item => {
				item.setTitle('Check current document');
				item.setIcon('checkbox-glyph');
				item.onClick(async () => {
					const activeLeaf = this.app.workspace.activeLeaf;
					if (activeLeaf?.view instanceof MarkdownView && activeLeaf.view.getMode() === 'source') {
						try {
							if (this.isLegacyEditor) {
								await this.legacyPlugin.runDetection((activeLeaf.view.editor as any).cm);
							} else {
								await this.runDetection((activeLeaf.view.editor as any).cm, activeLeaf.view);
							}
						} catch (e) {
							console.error(e);
						}
					}
				});
			})
			.addItem(item => {
				item.setTitle(this.settings.shouldAutoCheck ? 'Disable automatic checking' : 'Enable automatic checking');
				item.setIcon('uppercase-lowercase-a');
				item.onClick(async () => {
					this.settings.shouldAutoCheck = !this.settings.shouldAutoCheck;
					await this.saveSettings();
				});
			})
			.addItem(item => {
				item.setTitle('Clear suggestions');
				item.setIcon('reset');
				item.onClick(() => {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
					if (!view) return;

					if (this.isLegacyEditor) {
						const cm = (view.editor as any).cm as CodeMirror.Editor;
						legacyClearMarks(this.legacyPlugin.markerMap, cm);
					} else {
						const cm = (view.editor as any).cm as EditorView;
						cm.dispatch({
							effects: [clearUnderlines.of(null)],
						});
					}
				});
			})
			.showAtPosition({
				x: statusBarIconRect.right + 5,
				y: (statusBarRect?.top || 0) - 5,
			});
	};

	public async runDetection(editor: EditorView, view: MarkdownView, from?: number, to?: number) {
		this.setStatusBarWorking();

		const selection = editor.state.selection.main;

		let text = view.data;
		let offset = 0;
		let isRange = false;
		let rangeFrom = 0;
		let rangeTo = 0;

		if (from === undefined && selection && selection.from !== selection.to) {
			from = selection.from;
			to = selection.to;
		}

		if (from !== undefined && to !== undefined) {
			text = editor.state.sliceDoc(from, to);
			offset = from;
			rangeFrom = from;
			rangeTo = to;
			isRange = true;
		}

		const hash = hashString(text);

		if (this.hashLru.has(hash)) {
			return this.hashLru.get(hash)!;
		}

		let res: LanguageToolApi;
		try {
			res = await getDetectionResult(text, () => this.settings);
			this.hashLru.set(hash, res);
		} catch (e) {
			this.setStatusBarReady();
			return Promise.reject(e);
		}

		const effects: StateEffect<any>[] = [];

		if (isRange) {
			effects.push(
				clearUnderlinesInRange.of({
					from: rangeFrom,
					to: rangeTo,
				}),
			);
		} else {
			effects.push(clearUnderlines.of(null));
		}

		if (res.matches) {
			for (const match of res.matches) {
				const start = match.offset + offset;
				const end = match.offset + offset + match.length;

				effects.push(
					addUnderline.of({
						from: start,
						to: end,
						match,
					}),
				);
			}
		}

		if (effects.length) {
			editor.dispatch({
				effects,
			});
		}

		this.setStatusBarReady();
	}

	public async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	public async saveSettings() {
		await this.saveData(this.settings);
	}
}
