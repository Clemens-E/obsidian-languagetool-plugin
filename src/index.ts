import * as Remark from 'annotatedtext-remark';
import { debounce, MarkdownView, Notice, Plugin, setIcon } from 'obsidian';
import QuickLRU from 'quick-lru';
import { clearMarks, getIssueTypeClassName, getLine, getRuleCategories, hashString } from './helpers';
import { LanguageToolApi, MatchesEntity } from './LanguageToolTypings';
import { DEFAULT_SETTINGS, LanguageToolPluginSettings, LanguageToolSettingsTab } from './SettingsTab';
import { Widget } from './Widget';

interface DirtyLineMap {
	[k: string]: { [line: number]: true };
}

export default class LanguageToolPlugin extends Plugin {
	public settings: LanguageToolPluginSettings;
	private openWidget: Widget | undefined;
	private readonly statusBarText = this.addStatusBarItem();
	private readonly markerMap = new Map<CodeMirror.TextMarker, MatchesEntity>();
	private readonly hashLru = new QuickLRU<number, LanguageToolApi>({
		maxSize: 10,
	});

	private readonly dirtyLines: DirtyLineMap = {};

	public onunload() {
		if (this.markerMap.size === 0) return;
		const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');

		if (markdownLeaves) {
			markdownLeaves.forEach(leaf => {
				const cm = (leaf.view as MarkdownView)?.sourceMode?.cmEditor;
				if (cm) {
					clearMarks(this.markerMap, cm);
				}
			});
		}
	}

	public async onload() {
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

		this.registerCodeMirror(cm => {
			const id = this.getCodeMirrorID(cm);
			const checkLines = debounce(
				async () => {
					if (!this.dirtyLines[id]) return;

					const linesToCheck = Object.keys(this.dirtyLines[id]).sort((a, b) => {
						return Number(a) - Number(b);
					});

					if (!linesToCheck.length) {
						return;
					}

					delete this.dirtyLines[id];

					const start: CodeMirror.Position = {
						line: Number(linesToCheck[0]),
						ch: 0,
					};

					const lastLineIndex = Number(linesToCheck[linesToCheck.length - 1]);
					const lastLine = cm.getLine(lastLineIndex);

					const end: CodeMirror.Position = {
						line: Number(linesToCheck[linesToCheck.length - 1]),
						ch: lastLine.length,
					};

					try {
						await this.runDetection(cm, start, end);
					} catch (e) {
						console.error(e);
					}
				},
				// The API has a rate limit of 1 request every 3 seconds
				3000,
				true,
			);

			cm.on('change', (_, delta) => {
				if (this.openWidget) {
					this.openWidget.destroy();
					this.openWidget = undefined;
				}

				// Clear markers on edit
				if (this.markerMap.size > 0 && delta.origin && delta.origin[0] === '+') {
					const marks = cm.findMarksAt(delta.from);

					if (marks.length) {
						marks.forEach(mark => mark.clear());
					}
				}

				if (!this.settings.shouldAutoCheck || !delta.origin) {
					return;
				}

				if (delta.origin[0] === '+' || delta.origin === 'paste') {
					if (!this.dirtyLines[id]) {
						this.dirtyLines[id] = {};
					}

					delta.text.forEach((_, i) => {
						this.dirtyLines[id][delta.from.line + i] = true;
					});

					checkLines();
				}
			});
		});

		this.app.workspace.on('layout-change', () => {
			this.cleanDirtyLines();
		});

		this.statusBarText.onClickEvent(async () => {
			const activeLeaf = this.app.workspace.activeLeaf;
			if (activeLeaf.view instanceof MarkdownView && activeLeaf.view.getMode() === 'source') {
				try {
					await this.runDetection(activeLeaf.view.sourceMode.cmEditor);
				} catch (e) {
					console.error(e);
				}
			}
		});

		this.setStatusBarReady();

		this.addSettingTab(new LanguageToolSettingsTab(this.app, this));

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
			const coords = editor.cursorCoords(from);

			this.openWidget = new Widget(
				{
					position: coords,
					message: match.message,
					title: match.shortMessage,
					buttons: match.replacements!.slice(0, 3).map(v => v.value),
					category: match.rule.category.id,
					onClick: text => {
						editor.replaceRange(text, from, to);
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

	private async runDetection(
		editor: CodeMirror.Editor,
		selectionFrom?: CodeMirror.Position,
		selectionTo?: CodeMirror.Position,
	) {
		this.setStatusBarWorking();

		const fullText = editor.getValue();
		let text = fullText;
		let offset = 0;

		if (selectionFrom && selectionTo) {
			text = editor.getRange(selectionFrom, selectionTo);
			offset = editor.getRange({ line: 0, ch: 0 }, selectionFrom).length;
		}

		const parsedText = Remark.build(text, Remark.defaults);

		let res: LanguageToolApi;
		try {
			res = await this.getDetectionResult(JSON.stringify(parsedText));
		} catch (e) {
			return Promise.reject(e);
		}

		if (selectionFrom && selectionTo) {
			clearMarks(this.markerMap, editor, selectionFrom, selectionTo);
		} else {
			clearMarks(this.markerMap, editor);
		}

		for (const match of res.matches!) {
			const line = getLine(fullText, match.offset + offset);
			const marker = editor.markText(
				{ ch: line.remaining, line: line.line },
				{ ch: line.remaining + match.length, line: line.line },
				{
					className: `lt-underline ${getIssueTypeClassName(match.rule.category.id)}`,
					clearOnEnter: false,
				},
			);
			this.markerMap.set(marker, match);
		}

		this.setStatusBarReady();
	}

	private setStatusBarReady() {
		this.statusBarText.empty();
		this.statusBarText.createSpan({ cls: 'lt-status-bar-btn' }, span => {
			setIcon(span, 'check-small');
			span.createSpan({ text: 'LanguageTool' });
		});
	}

	private setStatusBarWorking() {
		this.statusBarText.empty();
		this.statusBarText.createSpan({ cls: ['lt-status-bar-btn', 'lt-loading'] }, span => {
			setIcon(span, 'sync-small');
			span.createSpan({ text: 'LanguageTool' });
		});
	}

	private getCodeMirrorID(cm: CodeMirror.Editor) {
		const gutter = cm.getGutterElement();
		const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
		const containingLeaf = markdownLeaves.find(l => l.view.containerEl.contains(gutter));

		if (containingLeaf) {
			return (containingLeaf as any).id;
		}

		return null;
	}

	private cleanDirtyLines() {
		const ids = Object.keys(this.dirtyLines);
		const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');

		const toRemove = ids.filter(id => {
			return Boolean(markdownLeaves.find(leaf => (leaf as any).id === id));
		});

		toRemove.forEach(id => {
			delete this.dirtyLines[id];
		});
	}

	public async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	public async saveSettings() {
		await this.saveData(this.settings);
	}
}
