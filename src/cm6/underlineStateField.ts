import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { tokenClassNodeProp } from '@codemirror/stream-parser';
import { Tree } from '@lezer/common';
import { getIssueTypeClassName, ignoreListRegEx } from '../helpers';
import { MatchesEntity } from '../LanguageToolTypings';

export interface UnderlineEffect {
	from: number;
	to: number;
	match: MatchesEntity;
}

export const addUnderline = StateEffect.define<UnderlineEffect>();
export const clearUnderlines = StateEffect.define();
export const clearUnderlinesInRange = StateEffect.define<{
	from: number;
	to: number;
}>();

function filterUnderlines(decorationStart: number, decorationEnd: number, rangeStart: number, rangeEnd: number) {
	// Decoration begins in defined range
	if (decorationStart >= rangeStart && decorationStart <= rangeEnd) {
		return false;
	}

	// Decoration ends in defined range
	if (decorationEnd >= rangeStart && decorationEnd <= rangeEnd) {
		return false;
	}

	// Defined range begins within decoration
	if (rangeStart >= decorationStart && rangeStart <= decorationEnd) {
		return false;
	}

	// Defined range ends within decoration
	if (rangeEnd >= decorationStart && rangeEnd <= decorationEnd) {
		return false;
	}

	return true;
}

export const underlineField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(underlines, tr) {
		const seenRanges = new Set<string>();

		// Memoize any positions we check so we can avoid some work
		const seenPositions: Record<number, boolean> = {};
		let tree: Tree | null = null;

		underlines = underlines.map(tr.changes);

		// Prevent decorations in codeblocks, etc...
		const canDecorate = (pos: number) => {
			if (seenPositions[pos] !== undefined) {
				return seenPositions[pos];
			}

			if (!tree) tree = syntaxTree(tr.state);

			const nodeProps = tree.resolveInner(pos, 1).type.prop(tokenClassNodeProp);

			if (nodeProps && ignoreListRegEx.test(nodeProps)) {
				seenPositions[pos] = false;
			} else {
				seenPositions[pos] = true;
			}

			return seenPositions[pos];
		};

		// Ignore certain rules in special cases
		const isRuleAllowed = (match: MatchesEntity, from: number, to: number) => {
			// Don't show spelling errors for entries in the user dictionary
			if (match.rule.category.id === 'TYPOS') {
				const spellcheckDictionary: string[] = ((window as any).app.vault as any).getConfig('spellcheckDictionary');
				const str = tr.state.sliceDoc(from, to);

				if (spellcheckDictionary && spellcheckDictionary.includes(str)) {
					return false;
				}
			}

			// Don't display whitespace rules in tables
			if (!tree) tree = syntaxTree(tr.state);

			const lineNodeProp = tree.resolve(tr.newDoc.lineAt(from).from, 1).type.prop(tokenClassNodeProp);

			if (lineNodeProp?.includes('table')) {
				if (match.rule.id === 'WHITESPACE_RULE') {
					return false;
				}
			}

			return true;
		};

		// Clear out any decorations when their contents are edited
		if (tr.docChanged && tr.selection && underlines.size) {
			underlines = underlines.update({
				filter: (from, to) => {
					return filterUnderlines(from, to, tr.selection!.main.from, tr.selection!.main.to);
				},
			});
		}

		for (const e of tr.effects) {
			if (e.is(addUnderline)) {
				const { from, to, match } = e.value;
				const key = `${from}${to}`;

				if (!seenRanges.has(key) && canDecorate(from) && canDecorate(to) && isRuleAllowed(match, from, to)) {
					seenRanges.add(key);
					underlines = underlines.update({
						add: [
							Decoration.mark({
								class: `lt-underline ${getIssueTypeClassName(match.rule.category.id)}`,
								match,
							}).range(from, to),
						],
					});
				}
			} else if (e.is(clearUnderlines)) {
				underlines = Decoration.none;
			} else if (e.is(clearUnderlinesInRange)) {
				underlines = underlines.update({
					filter: (from, to) => filterUnderlines(from, to, e.value.from, e.value.to),
				});
			}
		}

		return underlines;
	},
	provide: f => EditorView.decorations.from(f),
});
