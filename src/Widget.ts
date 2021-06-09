import { setIcon } from 'obsidian';
import { getIssueTypeClassName } from './helpers';
import { MatchesEntity } from './LanguageToolTypings';

interface WidgetArgs {
	match: MatchesEntity;
	matchedString: string;
	position: { left: number; bottom: number; top: number };
	onClick: (text: string) => void;
	addToDictionary: (text: string) => void;
}

export class Widget {
	private readonly elem: HTMLElement;

	public get element() {
		return this.elem;
	}

	public constructor(args: WidgetArgs, classToUse: string) {
		const message = args.match.message;
		const title = args.match.shortMessage;
		const buttons = (args.match.replacements || []).slice(0, 3).map(v => v.value);
		const category = args.match.rule.category.id;

		this.elem = createDiv({ cls: [classToUse, getIssueTypeClassName(category)] }, root => {
			root.style.setProperty('left', `${args.position.left}px`);
			root.style.setProperty('top', `${args.position.bottom}px`);

			if (title) {
				root.createSpan({ cls: 'lt-title' }, span => {
					span.createSpan({ text: title });
				});
			}

			if (message) {
				root.createSpan({ cls: 'lt-message', text: message });
			}

			if (buttons.length) {
				root.createDiv({ cls: 'lt-buttoncontainer' }, buttonContainer => {
					for (const btnText of buttons) {
						buttonContainer.createEl('button', { text: btnText }, button => {
							button.onclick = () => {
								args.onClick(btnText);
							};
						});
					}
				});
			}

			if (category === 'TYPOS') {
				root.createDiv({ cls: 'lt-ignorecontainer' }, container => {
					container.createEl('button', { cls: 'lt-ignore-btn' }, button => {
						setIcon(button.createSpan(), 'plus-with-circle');
						button.createSpan({ text: 'Add to personal dictionary' });
						button.onclick = () => {
							args.addToDictionary(args.matchedString);
						};
					});
				});
			}
		});

		document.body.append(this.elem);

		// Ensure widget is on screen
		const height = this.elem.clientHeight;
		const width = this.elem.clientWidth;

		if (args.position.bottom + height > window.innerHeight) {
			this.elem.style.setProperty('top', `${args.position.top - height}px`);
		}

		if (args.position.left + width > window.innerWidth) {
			this.elem.style.setProperty('left', `${window.innerWidth - width - 15}px`);
		}
	}

	public destroy() {
		this.elem?.remove();
	}
}
