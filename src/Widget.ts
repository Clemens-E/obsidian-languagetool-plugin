import { getIssueTypeClassName } from './helpers';

interface WidgetArgs {
	position: { left: number; bottom: number; top: number };
	title: string;
	message: string;
	buttons: string[];
	category: string;
	onClick: (text: string) => void;
}

export class Widget {
	private readonly elem: HTMLElement;

	public get element() {
		return this.elem;
	}

	public constructor(args: WidgetArgs, classToUse: string) {
		this.elem = createDiv({ cls: [classToUse, getIssueTypeClassName(args.category)] }, root => {
			root.style.setProperty('left', `${args.position.left}px`);
			root.style.setProperty('top', `${args.position.bottom}px`);

			if (args.title) {
				root.createSpan({ cls: 'lt-title' }, span => {
					span.createSpan({ text: args.title });
				});
			}
			root.createSpan({ cls: 'lt-message', text: args.message });
			root.createDiv({ cls: 'lt-buttoncontainer' }, buttonContainer => {
				for (const btnText of args.buttons) {
					buttonContainer.createEl('button', { text: btnText }, button => {
						button.onclick = () => {
							this.destroy();
							args.onClick(btnText);
						};
					});
				}
			});
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
