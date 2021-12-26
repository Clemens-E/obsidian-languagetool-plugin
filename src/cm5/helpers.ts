import { ignoreListRegEx } from 'src/helpers';
import { MatchesEntity } from 'src/LanguageToolTypings';

export function legacyShouldCheckTextAtPos(instance: CodeMirror.Editor, pos: CodeMirror.Position) {
	// Empty line
	if (!instance.getLine(pos.line)) {
		return false;
	}

	const tokens = instance.getTokenTypeAt(pos);

	// Plain text line
	if (!tokens) {
		return true;
	}

	// Not codeblock or frontmatter
	if (!ignoreListRegEx.test(tokens)) {
		return true;
	}

	return false;
}

export function legacyClearMarks(
	markerMap: Map<CodeMirror.TextMarker, MatchesEntity>,
	editor: CodeMirror.Editor,
	from?: CodeMirror.Position,
	to?: CodeMirror.Position,
) {
	const clearMark = (mark: CodeMirror.TextMarker<CodeMirror.MarkerRange>) => {
		if (mark.attributes?.isIgnored) return;
		markerMap.delete(mark);
		mark.clear();
	};

	if (from && to) {
		return editor.findMarks(from, to).forEach(clearMark);
	}

	editor.getAllMarks().forEach(clearMark);
}
