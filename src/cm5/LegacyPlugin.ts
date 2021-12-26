import { App, debounce, Debouncer, MarkdownView } from 'obsidian';
import QuickLRU from 'quick-lru';
import { getIssueTypeClassName, hashString } from '../helpers';
import { LanguageToolApi, MatchesEntity } from '../LanguageToolTypings';
import { LegacyWidget } from './LegacyWidget';
import { getDetectionResult } from '../api';
import LanguageToolPlugin from 'src';
import { legacyClearMarks, legacyShouldCheckTextAtPos } from './helpers';

export default class LegacyLanguageToolPlugin {
	private hashLru: QuickLRU<number, LanguageToolApi>;

	private checkLines: Debouncer<CodeMirror.Editor[]>;
	private dirtyLines: WeakMap<CodeMirror.Editor, number[]>;
	public markerMap: Map<CodeMirror.TextMarker, MatchesEntity>;
	private openWidget: LegacyWidget | undefined;

	private readonly plugin: LanguageToolPlugin;
	private readonly app: App;

	public constructor(plugin: LanguageToolPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
	}

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

		this.initLegacyEditorHandler();
	}

	public onunload() {
		if (this.openWidget) {
			this.openWidget.destroy();
			this.openWidget = undefined;
		}

		this.app.workspace.iterateCodeMirrors(cm => {
			legacyClearMarks(this.markerMap, cm);
			cm.off('change', this.onCodemirrorChange);
		});
	}

	private initLegacyEditorHandler() {
		this.plugin.registerCodeMirror(cm => {
			cm.on('change', this.onCodemirrorChange);
		});

		// Using the click event won't trigger the widget consistently, so use pointerup instead
		this.plugin.registerDomEvent(document, 'pointerup', e => {
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

			const editor = (view.editor as any).cm;

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

			this.openWidget = new LegacyWidget(
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
				this.plugin.settings.glassBg ? 'lt-predictions-container-glass' : 'lt-predictions-container',
			);
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

		if (!this.plugin.settings.shouldAutoCheck || !delta.origin) {
			return;
		}

		if (delta.origin[0] === '+' || delta.origin === 'paste') {
			const dirtyLines: number[] = this.dirtyLines.has(instance) ? (this.dirtyLines.get(instance) as number[]) : [];

			delta.text.forEach((_, i) => {
				const line = delta.from.line + i;

				if (legacyShouldCheckTextAtPos(instance, { ...delta.from, line })) {
					dirtyLines.push(line);
				}
			});

			this.dirtyLines.set(instance, dirtyLines);

			this.plugin.setStatusBarWorking();
			this.checkLines(instance);
		}
	};

	private readonly runAutoDetection = async (instance: CodeMirror.Editor) => {
		const dirtyLines = this.dirtyLines.get(instance);

		if (!dirtyLines || dirtyLines.length === 0) {
			return this.plugin.setStatusBarReady();
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
			this.plugin.setStatusBarReady();
		}
	};

	public async runDetection(
		editor: CodeMirror.Editor,
		selectionFrom?: CodeMirror.Position,
		selectionTo?: CodeMirror.Position,
	) {
		this.plugin.setStatusBarWorking();

		const doc = editor.getDoc();
		const text = selectionFrom && selectionTo ? editor.getRange(selectionFrom, selectionTo) : editor.getValue();
		const offset = selectionFrom && selectionTo ? doc.indexFromPos(selectionFrom) : 0;

		const hash = hashString(text);

		if (this.hashLru.has(hash)) {
			return this.hashLru.get(hash)!;
		}

		let res: LanguageToolApi;
		try {
			res = await getDetectionResult(text, () => this.plugin.settings);
			this.hashLru.set(hash, res);
		} catch (e) {
			this.plugin.setStatusBarReady();
			return Promise.reject(e);
		}

		if (selectionFrom && selectionTo) {
			legacyClearMarks(this.markerMap, editor, selectionFrom, selectionTo);
		} else {
			legacyClearMarks(this.markerMap, editor);
		}

		if (!res.matches) {
			return this.plugin.setStatusBarReady();
		}

		for (const match of res.matches) {
			const start = doc.posFromIndex(match.offset + offset);
			const markers = editor.findMarksAt(start);

			if (markers && markers.length > 0) {
				continue;
			}

			const end = doc.posFromIndex(match.offset + offset + match.length);

			if (
				!legacyShouldCheckTextAtPos(editor, start) ||
				!legacyShouldCheckTextAtPos(editor, end) ||
				!this.matchAllowed(editor, match, start, end)
			) {
				continue;
			}

			const marker = editor.markText(start, end, {
				className: `lt-underline ${getIssueTypeClassName(match.rule.category.id)}`,
				clearOnEnter: false,
			});

			this.markerMap.set(marker, match);
		}

		this.plugin.setStatusBarReady();
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

		// Don't show whitespace warnings in tables
		if (lineTokens.length && lineTokens[0].type?.includes('table')) {
			if (match.rule.id === 'WHITESPACE_RULE') {
				return false;
			}
		}

		return true;
	}
}
