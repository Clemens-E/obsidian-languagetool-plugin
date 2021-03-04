import CodeMirror from 'codemirror';
import {MarkdownView, Plugin} from 'obsidian';
import QuickLRU from 'quick-lru';
import {LanguageToolApi} from './LanguageToolTypings';

interface LanguageToolPluginSettings {
	serverUrl: string;
}

const DEFAULT_SETTINGS: LanguageToolPluginSettings = {
	serverUrl: 'https://api.languagetool.org/v2/check',
};

export default class LanguageToolPlugin extends Plugin {
	private settings: LanguageToolPluginSettings;
	private openButton: HTMLElement;
	private handleNextEvent = true;
	private readonly hashLru = new QuickLRU<number, LanguageToolApi>({
		maxSize: 10,
	});

	public async onload() {
		await this.loadSettings();
		this.registerDomEvent(document, 'click', e => {
			if (!this.handleNextEvent) {
				this.handleNextEvent = true;
				return;
			}
			if (!this.openButton) return;
			if (e.target === this.openButton) return;
			this.openButton.remove();
			this.openButton = undefined;
		});
		this.addCommand({
			id: 'ltcheck-text',
			name: 'Check Text',
			checkCallback: checking => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (checking) return Boolean(view);
				const cm = view.sourceMode.cmEditor;
				this.runDetection(cm);
			},
		});
	}

	private async getDetectionResult(text: string): Promise<LanguageToolApi> {
		const hash = hashString(text);
		if (this.hashLru.has(hash)) {
			return this.hashLru.get(hash);
		}
		const params = {
			text,
			language: 'auto',
		};
		const res: LanguageToolApi = await fetch(this.settings.serverUrl, {
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
		}).then(r => r.json());
		this.hashLru.set(hash, res);
		return res;
	}

	private async runDetection(editor: CodeMirror.Editor) {
		const text = editor.getSelection() || editor.getValue();
		const res = await this.getDetectionResult(text);
		editor.getAllMarks().forEach(mark => mark.clear());

		for (const match of res.matches) {
			const line = this.getLine(text, match.offset);
			const marker = editor.markText(
				{ ch: line.remaining, line: line.line },
				{ ch: line.remaining + match.length, line: line.line },
				{
					className: match.rule.issueType === 'typographical' ? 'lt-minor' : 'lt-major',
					clearOnEnter: false,
				},
			);

			marker.on('beforeCursorEnter', () => {
				if (this.openButton) return;
				this.handleNextEvent = false;
				this.openButton = document.createElement('button');
				this.openButton.style.zIndex = '99';
				if (match.replacements.length > 0) {
					this.openButton.innerText += match.replacements[0].value;
				} else {
					this.openButton.innerText = 'no fix available';
				}
				this.openButton.title = match.message;
				this.openButton.addEventListener('click', () => {
					this.openButton.remove();
					this.openButton = undefined;
					marker.clear();
					const newLine = this.getLine(text, match.offset);
					editor.replaceRange(
						match.replacements[0].value,
						{ ch: newLine.remaining, line: newLine.line },
						{ ch: newLine.remaining + match.length, line: newLine.line },
					);
					if (match.replacements.length < 1) return;
					const offsetOffset = match.replacements[0].value.length - match.length;
					if (!offsetOffset) return;
					const toAdjust = res.matches.slice(res.matches.indexOf(match));
					toAdjust.forEach(v => (v.offset += offsetOffset));
				});

				editor.addWidget({ ch: line.remaining, line: line.line }, this.openButton, true);
			});
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
