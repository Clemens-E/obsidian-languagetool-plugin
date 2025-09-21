import { EditorView } from "@codemirror/view";
import { editorViewField, MarkdownView } from "obsidian";
import LanguageToolPlugin from "src";

export function buildAutoCheckHandler(plugin: LanguageToolPlugin) {
  let debounceTimer = -1;
  let minRange = Infinity;
  let maxRange = -Infinity;

  return EditorView.inputHandler.of((view, from, to, text) => {
    if (!plugin.settings.shouldAutoCheck || !text.trim()) {
      return false;
    }

    // @ts-ignore
    const markdownView = view.state.field(editorViewField);

    minRange = Math.min(minRange, Math.min(from, to));
    maxRange = Math.max(maxRange, Math.max(from, to));

    clearTimeout(debounceTimer);

    debounceTimer = window.setTimeout(() => {
      const startLine = view.lineBlockAt(minRange);
      const endLine = view.lineBlockAt(maxRange);

      plugin
        .runDetection(
          view,
          markdownView as MarkdownView,
          startLine.from,
          endLine.to
        )
        .catch(e => {
          console.error(e);
        });
    }, plugin.settings.autoCheckDelay);

    return false;
  });
}
