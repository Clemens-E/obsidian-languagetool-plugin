import EventEmitter from 'events';

export declare interface Widget {
	on(event: 'click', listener: (name: string) => any): this;
	on(event: 'destroy', listener: () => any): this;
	on(event: string, listener: Function): this;
}

export class Widget extends EventEmitter {
	private readonly elem: HTMLElement;

	public get element() {
		return this.elem;
	}

	public constructor(args: { title: string; message: string; buttons: string[] }) {
		super();
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
				this.emit('click', btnText);
				rootDiv.remove();
			};
			buttonContainer.appendChild(button);
		}
		rootDiv.appendChild(buttonContainer);
		this.elem = rootDiv;
	}

	public destroy() {
		this.elem?.remove();
		this.emit('destroy');
	}
}
