import { tooltips } from '@codemirror/view';
import LanguageToolPlugin from 'src';
import { buildAutoCheckHandler } from './buildAutoCheckHandler';
import { buildTooltipField } from './tooltipField';
import { ignoredUnderlineField, underlineField } from './underlineStateField';

export function buildUnderlineExtension(plugin: LanguageToolPlugin) {
	return [
		tooltips({
			position: 'absolute',
			tooltipSpace: view => {
				const rect = view.dom.getBoundingClientRect();

				return {
					top: rect.top,
					left: rect.left,
					bottom: rect.bottom,
					right: rect.right,
				};
			},
		}),
		// ignoredUnderlineField must come before underlineField
		ignoredUnderlineField,
		underlineField,
		buildTooltipField(plugin),
		buildAutoCheckHandler(plugin),
	];
}
