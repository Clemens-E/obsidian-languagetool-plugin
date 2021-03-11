import CodeMirror from 'codemirror';
import {MarkdownView, Notice, Plugin} from 'obsidian';
import QuickLRU from 'quick-lru';
import {LanguageToolApi} from './LanguageToolTypings';
import {LanguageToolSettingsTab} from './SettingsTab';

interface LanguageToolPluginSettings {
	serverUrl: string;
}

const DEFAULT_SETTINGS: LanguageToolPluginSettings = {
	serverUrl: 'https://api.languagetool.org/v2/check',
};

export default class LanguageToolPlugin extends Plugin {
	public settings: LanguageToolPluginSettings;
	private openDiv: HTMLElement;
	private readonly statusBarText = this.addStatusBarItem();
	private handleNextEvent = true;
	private readonly hashLru = new QuickLRU<number, LanguageToolApi>({
		maxSize: 10,
	});

	public async onload() {
		await this.loadSettings();
		this.addSettingTab(new LanguageToolSettingsTab(this.app, this));
		this.registerDomEvent(document, 'click', e => {
			if (!this.handleNextEvent) {
				this.handleNextEvent = true;
				return;
			}
			if (!this.openDiv) return;
			if (e.target === this.openDiv) return;
			this.openDiv.remove();
			this.openDiv = undefined;
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
		})
			.then(r => r.json())
			.catch(e => {
				new Notice(`request failed to languagetool  ${e.message}`, 5000);
				throw e;
			});
		this.hashLru.set(hash, res);
		return res;
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
		const res = await this.getDetectionResult(text);
		editor.getAllMarks().forEach(mark => mark.clear());
		this.statusBarText.setText(res.language.name);
		for (const match of res.matches) {
			const bench = [Date.now()];
			const line = this.getLine(fullText, match.offset + offset);
			bench.push();

			const marker = editor.markText(
				{ ch: line.remaining, line: line.line },
				{ ch: line.remaining + match.length, line: line.line },
				{
					className: match.rule.issueType === 'typographical' ? 'lt-minor' : 'lt-major',
					clearOnEnter: false,
				},
			);

			marker.on('beforeCursorEnter', () => {
				if (this.openDiv) return;
				this.handleNextEvent = false;

				const popover = this.getPopOver(
					{
						message: match.message,
						title: match.shortMessage,
						buttons: match.replacements.slice(0, 3).map(v => v.value),
					},
					btn => {
						this.openDiv = undefined;
						const { from, to } = marker.find();
						editor.replaceRange(btn, from, to);
						marker.clear();
					},
				);
				this.openDiv = popover;
				editor.addWidget({ ch: line.remaining, line: line.line }, popover, true);
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

	private getPopOver(
		args: { title: string; message: string; buttons: string[] },
		cb: (btn: string) => any,
	): HTMLElement {
		const rootDiv = document.createElement('div');
		rootDiv.style.zIndex = '99';
		rootDiv.classList.add('lt-predictions-container');
		const titleSpan = document.createElement('span');
		titleSpan.classList.add('lt-title');
		titleSpan.innerText = args.title;

		const messageSpan = document.createElement('span');
		messageSpan.classList.add('lt-message');
		messageSpan.innerText = args.message;

		rootDiv.appendChild(titleSpan);
		rootDiv.appendChild(messageSpan);
		const buttonContainer = document.createElement('div');
		buttonContainer.classList.add('lt-buttoncontainer');
		for (const btnText of args.buttons) {
			const button = document.createElement('button');
			button.innerText = btnText;
			button.onclick = () => {
				cb(btnText);
				rootDiv.remove();
			};
			buttonContainer.appendChild(button);
		}
		rootDiv.appendChild(buttonContainer);
		return rootDiv;
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
