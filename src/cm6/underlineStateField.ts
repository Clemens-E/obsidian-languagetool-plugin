import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { tokenClassNodeProp } from '@codemirror/language';
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
export const ignoreUnderline = StateEffect.define<{
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

export const ignoredUnderlineField = StateField.define<{
	marks: DecorationSet;
	ignoredRanges: Set<string>;
}>({
	create() {
		return {
			// Using a decoration set allows us to update ignored ranges
			// when the document around them is changed
			marks: Decoration.none,

			// But we use this set to check if a range is ignored. See
			// underlineField below
			ignoredRanges: new Set(),
		};
	},
	update(state, tr) {
		state.marks = state.marks.map(tr.changes);

		// Rebuild ignoredRanges to account for tr.changes
		state.ignoredRanges.clear();
		state.marks.between(0, tr.newDoc.length, (from, to) => {
			state.ignoredRanges.add(`${from},${to}`);
		});

		// Clear out any decorations when their contents are edited
		if (tr.docChanged && tr.selection && state.marks.size) {
			state.marks = state.marks.update({
				filter: (from, to) => {
					const shouldKeepRange = filterUnderlines(from, to, tr.selection!.main.from, tr.selection!.main.to);

					if (!shouldKeepRange) {
						state.ignoredRanges.delete(`${from},${to}`);
					}

					return shouldKeepRange;
				},
			});
		}

		for (const e of tr.effects) {
			if (e.is(ignoreUnderline)) {
				const { from, to } = e.value;

				state.ignoredRanges.add(`${from},${to}`);
				state.marks = state.marks.update({
					add: [Decoration.mark({}).range(from, to)],
				});
			}
		}

		return state;
	},
});

export const underlineField = StateField.define<DecorationSet>({
	create() {
		return Decoration.none;
	},
	update(underlines, tr) {
		const { ignoredRanges } = tr.state.field(ignoredUnderlineField);
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
				const key = `${from},${to}`;

				if (
					!ignoredRanges.has(key) &&
					!seenRanges.has(key) &&
					canDecorate(from) &&
					canDecorate(to) &&
					isRuleAllowed(match, from, to)
				) {
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
			} else if (e.is(clearUnderlinesInRange) || e.is(ignoreUnderline)) {
				underlines = underlines.update({
					filter: (from, to) => filterUnderlines(from, to, e.value.from, e.value.to),
				});
			}
		}

		return underlines;
	},
	provide: f => EditorView.decorations.from(f),
});
