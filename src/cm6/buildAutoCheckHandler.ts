import { ViewPlugin, ViewUpdate } from "@codemirror/view";
import { editorInfoField, MarkdownView } from "obsidian";
import LanguageToolPlugin from "src";

export function buildAutoCheckHandler(plugin: LanguageToolPlugin) {
  // A ViewPlugin gets one instance per editor, so the debounce timer and the
  // accumulated range are isolated per pane and cleaned up with the editor.
  return ViewPlugin.define(view => {
    let debounceTimer = -1;
    let minRange = Infinity;
    let maxRange = -Infinity;

    return {
      update(update: ViewUpdate) {
        if (!plugin.settings.shouldAutoCheck || !update.docChanged) {
          return;
        }

        // Keep positions accumulated from earlier edits valid in the new doc
        if (minRange !== Infinity) {
          minRange = update.changes.mapPos(minRange, -1);
          maxRange = update.changes.mapPos(maxRange, 1);
        }

        update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
          minRange = Math.min(minRange, fromB);
          maxRange = Math.max(maxRange, toB);
        });

        window.clearTimeout(debounceTimer);

        debounceTimer = window.setTimeout(() => {
          const docLength = view.state.doc.length;
          const from = Math.min(minRange, docLength);
          const to = Math.min(maxRange, docLength);

          minRange = Infinity;
          maxRange = -Infinity;

          const startLine = view.lineBlockAt(from);
          const endLine = view.lineBlockAt(to);

          const markdownView = view.state.field(editorInfoField);

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
      },
      destroy() {
        window.clearTimeout(debounceTimer);
      }
    };
  });
}
