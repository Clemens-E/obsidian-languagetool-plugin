import { Notice } from "obsidian";
import { EditorView } from "@codemirror/view";
import LanguageToolPlugin from "src";
import {
  addToSpellcheckDictionary,
  removeFromSpellcheckDictionary
} from "../helpers";
import {
  UnderlineEffect,
  addUnderline,
  clearUnderlinesInRange
} from "./underlineStateField";

/**
 * Add the underlined word to Obsidian's personal dictionary and drop its
 * underline. The popover button sits right next to the suggestions and the
 * command can be bound to a hotkey, so both entry points are easy to hit by
 * accident; the confirmation therefore carries an undo (#138).
 */
export function addWordToDictionaryWithUndo(
  plugin: LanguageToolPlugin,
  view: EditorView,
  underline: UnderlineEffect
): void {
  const { from, to } = underline;
  const word = view.state.sliceDoc(from, to);

  addToSpellcheckDictionary(plugin.app.vault, word);

  view.dispatch({
    effects: [clearUnderlinesInRange.of({ from, to })]
  });

  const notice = new Notice(
    createFragment(fragment => {
      fragment.appendText(`Added "${word}" to the personal dictionary `);
      fragment.createEl(
        "button",
        { text: "Undo", cls: "lt-dict-undo-btn" },
        undoButton => {
          undoButton.onclick = () => {
            removeFromSpellcheckDictionary(plugin.app.vault, word);
            // Restore the underline, unless edits made in the
            // meantime invalidated its position
            if (view.state.sliceDoc(from, to) === word) {
              view.dispatch({ effects: [addUnderline.of(underline)] });
            }
            notice.hide();
          };
        }
      );
    }),
    10000
  );
}
