import { Tooltip, showTooltip } from '@codemirror/tooltip';
import { EditorView } from '@codemirror/view';
import { StateField, EditorState } from '@codemirror/state';
import { getIssueTypeClassName } from '../helpers';
import { setIcon } from 'obsidian';
import LanguageToolPlugin from 'src';
import { UnderlineEffect, clearUnderlinesInRange, underlineField, ignoreUnderline } from './underlineStateField';

function contructTooltip(plugin: LanguageToolPlugin, view: EditorView, underline: UnderlineEffect) {
	const match = underline.match;
	const message = match.message;
	const title = match.shortMessage;
	const buttons = (match.replacements || [])
		.slice(0, 3)
		.map(v => v.value)
		.filter(v => v.trim());
	const category = match.rule.category.id;

	const mainClass = plugin.settings.glassBg ? 'lt-predictions-container-glass' : 'lt-predictions-container';

	return createDiv({ cls: [mainClass, getIssueTypeClassName(category)] }, root => {
		if (title) {
			root.createSpan({ cls: 'lt-title' }, span => {
				span.createSpan({ text: title });
			});
		}

		if (message) {
			root.createSpan({ cls: 'lt-message', text: message });
		}

		const clearUnderlineEffect = clearUnderlinesInRange.of({
			from: view.state.selection.main.from,
			to: view.state.selection.main.to,
		});

		const ignoreUnderlineEffect = ignoreUnderline.of({
			from: view.state.selection.main.from,
			to: view.state.selection.main.to,
		});

		if (buttons.length) {
			root.createDiv({ cls: 'lt-buttoncontainer' }, buttonContainer => {
				for (const btnText of buttons) {
					buttonContainer.createEl('button', { text: btnText }, button => {
						button.onclick = () => {
							view.dispatch({
								changes: [
									{
										from: underline.from,
										to: underline.to,
										insert: btnText,
									},
								],
								effects: [clearUnderlineEffect],
							});
						};
					});
				}
			});
		}

		root.createDiv({ cls: 'lt-ignorecontainer' }, container => {
			container.createEl('button', { cls: 'lt-ignore-btn' }, button => {
				if (category === 'TYPOS') {
					setIcon(button.createSpan(), 'plus-with-circle');
					button.createSpan({ text: 'Add to personal dictionary' });
					button.onclick = () => {
						const spellcheckDictionary: string[] = (plugin.app.vault as any).getConfig('spellcheckDictionary') || [];

						(plugin.app.vault as any).setConfig('spellcheckDictionary', [
							...spellcheckDictionary,
							view.state.sliceDoc(underline.from, underline.to),
						]);

						view.dispatch({
							effects: [clearUnderlineEffect],
						});
					};
				} else {
					setIcon(button.createSpan(), 'cross');
					button.createSpan({ text: 'Ignore suggestion' });
					button.onclick = () => {
						view.dispatch({
							effects: [ignoreUnderlineEffect],
						});
					};
				}
			});
		});
	});
}

function getTooltip(tooltips: readonly Tooltip[], plugin: LanguageToolPlugin, state: EditorState): readonly Tooltip[] {
	const underlines = state.field(underlineField);

	if (underlines.size === 0 || state.selection.ranges.length > 1) {
		return [];
	}

	let primaryUnderline: UnderlineEffect | null = null;

	underlines.between(state.selection.main.from, state.selection.main.to, (from, to, value) => {
		primaryUnderline = {
			from,
			to,
			match: value.spec.match,
		} as UnderlineEffect;
	});

	if (primaryUnderline !== null) {
		const { from, to } = primaryUnderline as UnderlineEffect;

		if (tooltips.length) {
			const tooltip = tooltips[0];

			if (tooltip.pos === from && tooltip.end === to) {
				return tooltips;
			}
		}

		return [
			{
				pos: from,
				end: to,
				above: true,
				strictSide: false,
				arrow: false,
				create: view => {
					return {
						dom: contructTooltip(plugin, view, primaryUnderline as UnderlineEffect),
					};
				},
			},
		];
	}

	return [];
}

export function buildTooltipField(plugin: LanguageToolPlugin) {
	return StateField.define<readonly Tooltip[]>({
		create: state => getTooltip([], plugin, state),
		update: (tooltips, tr) => getTooltip(tooltips, plugin, tr.state),
		provide: f => showTooltip.computeN([f], state => state.field(f)),
	});
}
