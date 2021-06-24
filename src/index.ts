import * as Remark from 'annotatedtext-remark';
import { debounce, Debouncer, MarkdownView, Menu, Notice, Plugin, setIcon } from 'obsidian';
import QuickLRU from 'quick-lru';
import { clearMarks, getIssueTypeClassName, getRuleCategories, hashString, shouldCheckLine } from './helpers';
import { LanguageToolApi, MatchesEntity } from './LanguageToolTypings';
import { DEFAULT_SETTINGS, LanguageToolPluginSettings, LanguageToolSettingsTab } from './SettingsTab';
import { Widget } from './Widget';

export default class LanguageToolPlugin extends Plugin {
	public settings: LanguageToolPluginSettings;
	private openWidget: Widget | undefined;
	private statusBarText: HTMLElement;
	private markerMap: Map<CodeMirror.TextMarker, MatchesEntity>;
	private hashLru: QuickLRU<number, LanguageToolApi>;

	private dirtyLines: WeakMap<CodeMirror.Editor, number[]>;
	private checkLines: Debouncer<CodeMirror.Editor[]>;
	private isloading = false;

	public async onload() {
		this.markerMap = new Map<CodeMirror.TextMarker, MatchesEntity>();
		this.hashLru = new QuickLRU<number, LanguageToolApi>({
			maxSize: 10,
		});
		this.dirtyLines = new WeakMap();
		this.checkLines = debounce(
			this.runAutoDetection,
			// The API has a rate limit of 1 request every 3 seconds
			3000,
			true,
		);

		await this.loadSettings();

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

		this.app.workspace.onLayoutReady(() => {
			this.statusBarText = this.addStatusBarItem();
			this.setStatusBarReady();
			this.registerDomEvent(this.statusBarText, 'click', async () => {
				const statusBarRect = this.statusBarText.parentElement?.getBoundingClientRect();
				const statusBarIconRect = this.statusBarText.getBoundingClientRect();

				new Menu(this.app)
					.addItem(item => {
						item.setTitle('Check current document');
						item.setIcon('checkbox-glyph');
						item.onClick(async () => {
							const activeLeaf = this.app.workspace.activeLeaf;
							if (activeLeaf.view instanceof MarkdownView && activeLeaf.view.getMode() === 'source') {
								try {
									await this.runDetection(activeLeaf.view.sourceMode.cmEditor);
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

							const cm = view!.sourceMode.cmEditor;
							clearMarks(this.markerMap, cm);
						});
					})
					.showAtPosition({
						x: statusBarIconRect.right + 5,
						y: (statusBarRect?.top || 0) - 5,
					});
			});
		});

		this.registerCodeMirror(cm => {
			cm.on('change', this.onCodemirrorChange);
		});

		// Using the click event won't trigger the widget consistently, so use pointerup instead
		this.registerDomEvent(document, 'pointerup', e => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return;

			if (e.target === this.openWidget?.element || this.openWidget?.element.contains(e.target as ChildNode)) {
				return;
			}

			// Destroy any open widgets if we're not clicking in one
			if (this.openWidget) {
				this.openWidget.destroy();
				this.openWidget = undefined;
			}

			// Don't open if we have no marks or aren't clicking on a mark
			if (this.markerMap.size === 0 || (e.target instanceof HTMLElement && !e.target.hasClass('lt-underline'))) {
				return;
			}

			const editor = view.sourceMode.cmEditor;

			// return if element is not in the editor
			if (!editor.getWrapperElement().contains(e.target as ChildNode)) return;

			const lineCh = editor.coordsChar({ left: e.clientX, top: e.clientY });
			const markers = editor.findMarksAt(lineCh);

			if (markers.length === 0) return;

			// assume there is only a single marker
			const marker = markers[0];
			const match = this.markerMap.get(marker);
			if (!match) return;

			const { from, to } = marker.find() as CodeMirror.MarkerRange;
			const position = editor.cursorCoords(from);
			const matchedString = editor.getRange(from, to);

			this.openWidget = new Widget(
				{
					match,
					matchedString,
					position,
					onClick: text => {
						editor.replaceRange(text, from, to);

						marker.clear();

						this.openWidget?.destroy();
						this.openWidget = undefined;
					},
					addToDictionary: text => {
						const spellcheckDictionary: string[] = (this.app.vault as any).getConfig('spellcheckDictionary') || [];
						(this.app.vault as any).setConfig('spellcheckDictionary', [...spellcheckDictionary, text]);

						marker.clear();

						this.openWidget?.destroy();
						this.openWidget = undefined;
					},
					ignoreSuggestion: () => {
						editor.markText(from, to, {
							clearOnEnter: false,
							attributes: {
								isIgnored: 'true',
							},
						});

						marker.clear();

						this.openWidget?.destroy();
						this.openWidget = undefined;
					},
				},
				this.settings.glassBg ? 'lt-predictions-container-glass' : 'lt-predictions-container',
			);
		});

		this.addCommand({
			id: 'ltcheck-text',
			name: 'Check Text',
			checkCallback: checking => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (checking) return Boolean(view);
				if (!view) return;

				const cm = view.sourceMode.cmEditor;
				if (cm.somethingSelected()) {
					this.runDetection(cm, cm.getCursor('from'), cm.getCursor('to')).catch(e => {
						console.error(e);
					});
				} else {
					this.runDetection(cm).catch(e => {
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
			checkCallback: checking => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (checking) return Boolean(view) || this.markerMap.size > 0;
				if (!view) return;

				const cm = view!.sourceMode.cmEditor;
				clearMarks(this.markerMap, cm);
			},
		});
	}

	public onunload() {
		if (this.openWidget) {
			this.openWidget.destroy();
			this.openWidget = undefined;
		}

		this.app.workspace.iterateCodeMirrors(cm => {
			clearMarks(this.markerMap, cm);
			cm.off('change', this.onCodemirrorChange);
		});
	}

	private readonly onCodemirrorChange = (instance: CodeMirror.Editor, delta: CodeMirror.EditorChangeLinkedList) => {
		if (this.openWidget) {
			this.openWidget.destroy();
			this.openWidget = undefined;
		}

		// Clear markers on edit
		if (this.markerMap.size > 0 && delta.origin && delta.origin[0] === '+') {
			const marks = instance.findMarksAt(delta.from);

			if (marks.length) {
				marks.forEach(mark => mark.clear());
			}
		}

		if (!this.settings.shouldAutoCheck || !delta.origin) {
			return;
		}

		if (delta.origin[0] === '+' || delta.origin === 'paste') {
			const dirtyLines: number[] = this.dirtyLines.has(instance) ? (this.dirtyLines.get(instance) as number[]) : [];

			delta.text.forEach((_, i) => {
				const line = delta.from.line + i;

				if (shouldCheckLine(instance, { ...delta.from, line })) {
					dirtyLines.push(line);
				}
			});

			this.dirtyLines.set(instance, dirtyLines);

			this.setStatusBarWorking();
			this.checkLines(instance);
		}
	};

	private async getDetectionResult(text: string): Promise<LanguageToolApi> {
		const hash = hashString(text);
		if (this.hashLru.has(hash)) {
			return this.hashLru.get(hash)!;
		}

		const { enabledCategories, disabledCategories } = getRuleCategories(this.settings);

		const params: { [key: string]: string } = {
			data: text,
			language: 'auto',
			enabledOnly: 'false',
			level: this.settings.pickyMode ? 'picky' : 'default',
		};

		if (enabledCategories.length) {
			params.enabledCategories = enabledCategories.join(',');
		}

		if (disabledCategories.length) {
			params.disabledCategories = disabledCategories.join(',');
		}

		if (this.settings.ruleOtherRules) {
			params.enabledRules = this.settings.ruleOtherRules;
		}

		if (this.settings.ruleOtherDisabledRules) {
			params.disabledRules = this.settings.ruleOtherDisabledRules;
		}

		if (
			this.settings.apikey &&
			this.settings.username &&
			this.settings.apikey.length > 1 &&
			this.settings.username.length > 1
		) {
			params.username = this.settings.username;
			params.apiKey = this.settings.apikey;
		}
		if (
			this.settings.staticLanguage &&
			this.settings.staticLanguage.length > 0 &&
			this.settings.staticLanguage !== 'auto'
		) {
			params.language = this.settings.staticLanguage;
		}

		let res: Response;
		try {
			res = await fetch(`${this.settings.serverUrl}/v2/check`, {
				method: 'POST',
				body: Object.keys(params)
					.map(key => {
						return `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
					})
					.join('&'),
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'application/json',
				},
			});
		} catch (e) {
			return Promise.reject(e);
		}

		if (!res.ok) {
			new Notice(`request to LanguageTool failed\n${res.statusText}`, 5000);
			return Promise.reject(new Error(`unexpected status ${res.status}, see network tab`));
		}

		let body: LanguageToolApi;
		try {
			body = await res.json();
		} catch (e) {
			return Promise.reject(e);
		}

		this.hashLru.set(hash, body);

		return body;
	}

	private readonly runAutoDetection = async (instance: CodeMirror.Editor) => {
		const dirtyLines = this.dirtyLines.get(instance);

		if (!dirtyLines || dirtyLines.length === 0) {
			return this.setStatusBarReady();
		}

		this.dirtyLines.delete(instance);

		const linesToCheck = dirtyLines.sort((a, b) => {
			return a - b;
		});

		const lastLineIndex = linesToCheck[linesToCheck.length - 1];
		const lastLine = instance.getLine(lastLineIndex);

		const start: CodeMirror.Position = {
			line: linesToCheck[0],
			ch: 0,
		};

		const end: CodeMirror.Position = {
			line: linesToCheck[linesToCheck.length - 1],
			ch: lastLine.length,
		};

		try {
			await this.runDetection(instance, start, end);
		} catch (e) {
			console.error(e);
			this.setStatusBarReady();
		}
	};

	private async runDetection(
		editor: CodeMirror.Editor,
		selectionFrom?: CodeMirror.Position,
		selectionTo?: CodeMirror.Position,
	) {
		this.setStatusBarWorking();

		const doc = editor.getDoc();
		const text = selectionFrom && selectionTo ? editor.getRange(selectionFrom, selectionTo) : editor.getValue();
		const offset = selectionFrom && selectionTo ? doc.indexFromPos(selectionFrom) : 0;

		const parsedText = Remark.build(text, Remark.defaults);

		let res: LanguageToolApi;
		try {
			res = await this.getDetectionResult(JSON.stringify(parsedText));
		} catch (e) {
			this.setStatusBarReady();
			return Promise.reject(e);
		}

		if (selectionFrom && selectionTo) {
			clearMarks(this.markerMap, editor, selectionFrom, selectionTo);
		} else {
			clearMarks(this.markerMap, editor);
		}

		if (!res.matches) {
			return this.setStatusBarReady();
		}

		for (const match of res.matches) {
			const start = doc.posFromIndex(match.offset + offset);
			const markers = editor.findMarksAt(start);

			if (markers && markers.length > 0) {
				continue;
			}

			const end = doc.posFromIndex(match.offset + offset + match.length);

			if (!shouldCheckLine(editor, start) || !this.matchAllowed(editor, match, start, end)) {
				continue;
			}

			const marker = editor.markText(start, end, {
				className: `lt-underline ${getIssueTypeClassName(match.rule.category.id)}`,
				clearOnEnter: false,
			});

			this.markerMap.set(marker, match);
		}

		this.setStatusBarReady();
	}

	private matchAllowed(
		editor: CodeMirror.Editor,
		match: MatchesEntity,
		start: CodeMirror.Position,
		end: CodeMirror.Position,
	) {
		const str = editor.getRange(start, end);

		// Don't show spelling errors for entries in the user dictionary
		if (match.rule.category.id === 'TYPOS') {
			const spellcheckDictionary: string[] = (this.app.vault as any).getConfig('spellcheckDictionary');

			if (spellcheckDictionary && spellcheckDictionary.includes(str)) {
				return false;
			}
		}

		const lineTokens = editor.getLineTokens(start.line);

		// Don't show whitewpace warnings in tables
		if (lineTokens.length && lineTokens[0].type?.includes('table')) {
			if (match.rule.id === 'WHITESPACE_RULE') {
				return false;
			}
		}

		return true;
	}

	private setStatusBarReady() {
		this.isloading = false;
		this.statusBarText.empty();
		this.statusBarText.createSpan({ cls: 'lt-status-bar-btn' }, span => {
			span.createSpan({ cls: 'lt-status-bar-check-icon', text: 'Aa' });
		});
	}

	private setStatusBarWorking() {
		if (this.isloading) return;

		this.isloading = true;
		this.statusBarText.empty();
		this.statusBarText.createSpan({ cls: ['lt-status-bar-btn', 'lt-loading'] }, span => {
			setIcon(span, 'sync-small');
		});
	}

	public async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	public async saveSettings() {
		await this.saveData(this.settings);
	}
}
