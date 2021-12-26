import { tooltips } from '@codemirror/tooltip';
import LanguageToolPlugin from 'src';
import { buildAutoCheckHandler } from './buildAutoCheckHandler';
import { buildTooltipField } from './tooltipField';
import { underlineField } from './underlineStateField';

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
		underlineField,
		buildTooltipField(plugin),
		buildAutoCheckHandler(plugin),
	];
}
