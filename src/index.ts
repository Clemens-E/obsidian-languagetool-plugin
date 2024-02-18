import { Command, MarkdownView, Menu, Notice, Plugin, setIcon } from 'obsidian';
import { Decoration, EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import QuickLRU from 'quick-lru';
import { DEFAULT_SETTINGS, LanguageToolPluginSettings, LanguageToolSettingsTab } from './SettingsTab';
import { LanguageToolApi } from './LanguageToolTypings';
import { hashString } from './helpers';
import { getDetectionResult } from './api';
import { buildUnderlineExtension } from './cm6/underlineExtension';
import { addUnderline, clearUnderlines, clearUnderlinesInRange, underlineField } from './cm6/underlineStateField';
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
		let unmodifiedSettings = await this.loadData();
		if (!unmodifiedSettings || Object.keys(unmodifiedSettings).length === 0) {
			unmodifiedSettings = this.settings;
		}
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
				await this.loadSettings();
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
		this.addCommand({
			id: 'ltjump-to-next-suggestion',
			name: 'Jump to next Suggestion',
			editorCheckCallback: (checking, editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorOffset = editor.posToOffset(editor.getCursor());
				let firstMatch: { from: number; to: number } | null = null;
				editorView.state.field(underlineField).between(cursorOffset + 1, Infinity, (from, to) => {
					if (!firstMatch || firstMatch.from > from) {
						firstMatch = { from, to };
					}
				});
				if (checking) {
					return Boolean(firstMatch);
				}
				if (!firstMatch) {
					return;
				}
				// @ts-expect-error 2339
				// ts cant handle that the variable gets assigned in a callback
				editorView.dispatch({ selection: { anchor: firstMatch.from, head: firstMatch.to } });
			},
		});
		this.addCommand({
			id: 'ltjump-to-previous-suggestion',
			name: 'Jump to previous Suggestion',
			editorCheckCallback: (checking, editor) => {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorOffset = editor.posToOffset(editor.getCursor('from'));
				let lastMatch: { from: number; to: number } | null = null;
				editorView.state.field(underlineField).between(0, cursorOffset - 1, (from, to) => {
					if (!lastMatch || lastMatch.from < from) {
						lastMatch = { from, to };
					}
				});
				if (checking) {
					return Boolean(lastMatch);
				}
				if (!lastMatch) {
					return;
				}
				// @ts-expect-error 2339
				// ts cant handle that the variable gets assigned in a callback
				editorView.dispatch({ selection: { anchor: lastMatch.from, head: lastMatch.to } });
			},
		});

		this.addCommand(this.getApplySuggestionCommand(1));
		this.addCommand(this.getApplySuggestionCommand(2));
		this.addCommand(this.getApplySuggestionCommand(3));
	}

	private getApplySuggestionCommand(n: number): Command {
		return {
			id: `ltaccept-suggestion-${n}`,
			name: `Accept suggestion #${n} when the cursor is within a Language-Tool-Hint`,
			editorCheckCallback(checking, editor) {
				// @ts-expect-error, not typed
				const editorView = editor.cm as EditorView;
				const cursorOffset = editor.posToOffset(editor.getCursor());

				const relevantMatches: {
					from: number;
					to: number;
					value: Decoration;
				}[] = [];

				// Get underline-matches at cursor
				editorView.state.field(underlineField).between(cursorOffset, cursorOffset, (from, to, value) => {
					relevantMatches.push({ from, to, value });
				});

				// Check that there is exactly one match that has a replacement in the slot that is called.
				const preconditionsSuccessfull =
					relevantMatches.length === 1 && relevantMatches[0]?.value?.spec?.match?.replacements?.length >= n;

				if (checking) return preconditionsSuccessfull;

				if (!preconditionsSuccessfull) {
					console.error('Preconditions were not successfull to apply LT-suggestions.');
					return;
				}

				// At this point, the check must have been successful.
				const { from, to, value } = relevantMatches[0];
				const change = {
					from,
					to,
					insert: value.spec.match.replacements[n - 1].value,
				};

				// Insert the text of the match
				editorView.dispatch({
					changes: [change],
					effects: [clearUnderlinesInRange.of({ from, to })],
				});
			},
		};
	}

	public setStatusBarReady() {
		this.isloading = false;
		this.statusBarText.empty();
		this.statusBarText.createSpan({ cls: 'lt-status-bar-btn' }, span => {
			span.createSpan({
				cls: 'lt-status-bar-check-icon',
				text: 'Aa',
			});
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

		let res: LanguageToolApi;
		if (this.hashLru.has(hash)) {
			res = this.hashLru.get(hash)!;
		} else {
			try {
				res = await getDetectionResult(text, () => this.settings);
				this.hashLru.set(hash, res);
			} catch (e) {
				this.setStatusBarReady();
				return Promise.reject(e);
			}
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
