import * as Remark from 'annotatedtext-remark';
import CodeMirror from 'codemirror';
import { MarkdownView, Notice, Plugin } from 'obsidian';
import QuickLRU from 'quick-lru';
import { LanguageToolApi, MatchesEntity } from './LanguageToolTypings';
import { LanguageToolSettingsTab } from './SettingsTab';
import { Widget } from './Widget';
interface LanguageToolPluginSettings {
	serverUrl: string;
	glassBg: boolean;
}

const DEFAULT_SETTINGS: LanguageToolPluginSettings = {
	serverUrl: 'https://api.languagetool.org/v2/check',
	glassBg: false,
};

export default class LanguageToolPlugin extends Plugin {
	public settings: LanguageToolPluginSettings;
	private openWidget: Widget | undefined;
	private readonly statusBarText = this.addStatusBarItem();
	private readonly markerMap = new Map<CodeMirror.TextMarker, MatchesEntity>();
	private readonly mouseDownHandler = (editor: CodeMirror.Editor, event: MouseEvent) => {
		const lineCh = editor.coordsChar({ left: event.clientX, top: event.clientY });
		const markers = editor.findMarksAt(lineCh);
		if (markers.length < 1) return;
		// assume there is only a single marker
		const [marker] = markers;
		const match = this.markerMap.get(marker);
		if (!match) return;

		this.openWidget?.destroy();
		this.openWidget = new Widget(
			{
				message: match.message,
				title: match.shortMessage,
				buttons: match.replacements!.slice(0, 3).map(v => v.value),
			},
			this.settings.glassBg ? 'lt-predictions-container-glass' : 'lt-predictions-container',
		).on('click', text => {
			const { from, to } = marker.find();
			editor.replaceRange(text, from, to);
			marker.clear();
			this.openWidget?.destroy();
			this.openWidget = undefined;
		});
		editor.addWidget(marker.find().from, this.openWidget.element, true);
	};

	private readonly hashLru = new QuickLRU<number, LanguageToolApi>({
		maxSize: 10,
	});

	public async onload() {
		await this.loadSettings();
		this.addSettingTab(new LanguageToolSettingsTab(this.app, this));

		this.registerDomEvent(document, 'click', e => {
			if (!this.openWidget) {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				const editor = view!.sourceMode.cmEditor;
				const lineCh = editor.coordsChar({ left: e.clientX, top: e.clientY });
				const markers = editor.findMarksAt(lineCh);
				if (markers.length < 1) return;
				// assume there is only a single marker
				const [marker] = markers;
				const match = this.markerMap.get(marker);
				if (!match) return;

				this.openWidget = new Widget(
					{
						message: match.message,
						title: match.shortMessage,
						buttons: match.replacements!.slice(0, 3).map(v => v.value),
					},
					this.settings.glassBg ? 'lt-predictions-container-glass' : 'lt-predictions-container',
				).on('click', text => {
					const { from, to } = marker.find();
					editor.replaceRange(text, from, to);
					marker.clear();
					this.openWidget?.destroy();
					this.openWidget = undefined;
				});
				editor.addWidget(lineCh, this.openWidget.element, true);
				return;
			}
			if (
				e.target === this.openWidget.element ||
				Array.from(this.openWidget.element.childNodes).some(elem => e.target === elem)
			)
				return;
			this.openWidget.destroy();
			this.openWidget = undefined;
		});
		this.addCommand({
			id: 'ltcheck-text',
			name: 'Check Text',
			checkCallback: checking => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (checking) return Boolean(view);
				const cm = view!.sourceMode.cmEditor;
				this.runDetection(cm);
			},
		});
	}

	private async getDetectionResult(text: string): Promise<LanguageToolApi> {
		const hash = hashString(text);
		if (this.hashLru.has(hash)) {
			return this.hashLru.get(hash)!;
		}
		const params = {
			data: text,
			language: 'auto',
		};
		const res = await fetch(this.settings.serverUrl, {
			method: 'POST',
			body: Object.keys(params)
				.map(key => {
					return `${encodeURIComponent(key)}=${encodeURIComponent(
						// @ts-expect-error
						params[key],
					)}`;
				})
				.join('&'),
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: 'application/json',
			},
		});
		if (!res.ok) {
			new Notice(`request to languagetool failed\n${res.statusText}`, 5000);
			throw new Error(`unexpected status ${res.status}, see network tab`);
		}
		const body: LanguageToolApi = await res.json();
		this.hashLru.set(hash, body);
		return body;
	}

	private async runDetection(editor: CodeMirror.Editor) {
		let text: string;
		const fullText = editor.getValue();
		let offset = 0;
		if (editor.somethingSelected()) {
			text = editor.getSelection();
			offset = fullText.indexOf(editor.getSelection());
		} else {
			text = editor.getValue();
		}

		const parsedText = Remark.build(text, Remark.defaults);
		const res = await this.getDetectionResult(JSON.stringify(parsedText));

		editor.getAllMarks().forEach(mark => mark.clear());
		this.markerMap.clear();
		this.statusBarText.setText(res.language.name);
		for (const match of res.matches!) {
			const line = this.getLine(fullText, match.offset + offset);

			const marker = editor.markText(
				{ ch: line.remaining, line: line.line },
				{ ch: line.remaining + match.length, line: line.line },
				{
					className: match.rule.issueType === 'typographical' ? 'lt-minor' : 'lt-major',
					clearOnEnter: false,
				},
			);
			this.markerMap.set(marker, match);
		}
	}

	private getLine(text: string, offset: number): { line: number; remaining: number } {
		let lineCount = 0;
		let offsetC = offset;
		const lines = text.split('\n');
		for (const line of lines) {
			lineCount++;
			if (offsetC - line.length < 1) break;
			offsetC -= line.length + 1;
		}
		return { line: lineCount - 1, remaining: offsetC };
	}

	public async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	public async saveSettings() {
		await this.saveData(this.settings);
	}
}

function hashString(value: string) {
	let hash = 0;
	if (value.length === 0) {
		return hash;
	}
	for (let i = 0; i < value.length; i++) {
		const char = value.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash &= hash; // Convert to 32bit integer
	}
	return hash;
}
