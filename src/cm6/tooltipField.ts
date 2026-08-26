import { EditorView, Tooltip, keymap, showTooltip } from "@codemirror/view";
import {
  StateField,
  StateEffect,
  EditorState,
  Prec
} from "@codemirror/state";
import { getIssueTypeClassName, getVisibleReplacements } from "../helpers";
import { MatchesEntity } from "../LanguageToolTypings";
import { setIcon } from "obsidian";
import LanguageToolPlugin from "src";
import {
  UnderlineEffect,
  clearUnderlinesInRange,
  underlineField,
  ignoreUnderline
} from "./underlineStateField";
import { addWordToDictionaryWithUndo } from "./dictionaryAction";

function contructTooltip(
  plugin: LanguageToolPlugin,
  view: EditorView,
  underline: UnderlineEffect
) {
  const match = underline.match;
  const message = match.message;
  const title = match.shortMessage;
  const buttons = getVisibleReplacements(match);
  const category = match.rule.category.id;
  const ruleId = match.rule.id;

  const mainClass = plugin.settings.glassBg
    ? "lt-predictions-container-glass"
    : "lt-predictions-container";

  return createDiv(
    { cls: [mainClass, getIssueTypeClassName(category)] },
    root => {
      // Keep the editor focused while the popover is clicked: a mousedown
      // that blurs the editor makes live preview re-render the surrounding
      // callout as a widget, which shoves the popover aside before the
      // click completes (#65)
      root.addEventListener("mousedown", event => {
        event.preventDefault();
      });

      if (title) {
        root.createSpan({ cls: "lt-title" }, span => {
          span.createSpan({ text: title });
        });
      }

      if (message) {
        root.createSpan({ cls: "lt-message", text: message });
      }

      const clearUnderlineEffect = clearUnderlinesInRange.of({
        from: underline.from,
        to: underline.to
      });

      const ignoreUnderlineEffect = ignoreUnderline.of({
        from: underline.from,
        to: underline.to
      });

      root.createDiv({ cls: "lt-bottom" }, bottom => {
        if (buttons.length) {
          bottom.createDiv({ cls: "lt-buttoncontainer" }, buttonContainer => {
            for (const btnText of buttons) {
              buttonContainer.createEl("button", { text: btnText }, button => {
                button.onclick = () => {
                  view.dispatch({
                    changes: [
                      {
                        from: underline.from,
                        to: underline.to,
                        insert: btnText
                      }
                    ],
                    effects: [clearUnderlineEffect]
                  });
                };
              });
            }
          });
        }
        bottom.createDiv({ cls: "lt-info-container" }, infoContainer => {
          infoContainer.createEl(
            "button",
            { cls: "lt-info-button clickable-icon" },
            button => {
              setIcon(button, "info");
              button.onclick = () => {
                const popup = document
                  .getElementsByClassName("lt-info-box")
                  .item(0);
                if (!popup) {
                  throw Error(
                    "Programming error: failed to create popup. Please notify the LanguageTool maintainer if this problem persists."
                  );
                }
                if (popup.hasClass("hidden")) {
                  popup.removeClass("hidden");
                } else {
                  popup.addClass("hidden");
                }
              };
            }
          );

          infoContainer.createDiv({ cls: "lt-info-box hidden" }, popup => {
            // \u00A0 is a non-breaking space
            popup.createDiv({
              cls: "lt-info",
              text: `Category:\u00A0${category}`
            });
            popup.createDiv({ cls: "lt-info", text: `Rule:\u00A0${ruleId}` });
          });
        });
      });

      root.createDiv({ cls: "lt-ignorecontainer" }, container => {
        container.createEl("button", { cls: "lt-ignore-btn" }, button => {
          if (category === "TYPOS") {
            setIcon(button.createSpan(), "plus-with-circle");
            button.createSpan({ text: "Add to personal dictionary" });
            button.onclick = () => {
              addWordToDictionaryWithUndo(plugin, view, underline);
            };
          } else {
            setIcon(button.createSpan(), "cross");
            button.createSpan({ text: "Ignore suggestion" });
            button.onclick = () => {
              view.dispatch({
                effects: [ignoreUnderlineEffect]
              });
            };
          }
        });
      });
    }
  );
}

interface DismissedRange {
  from: number;
  to: number;
}

interface TooltipState {
  tooltips: readonly Tooltip[];
  // The match whose popover Escape closed. Kept until the cursor leaves it,
  // so moving back onto the underline opens the popover again (#100)
  dismissed: DismissedRange | null;
}

export const dismissTooltip = StateEffect.define();

function getTooltip(
  tooltips: readonly Tooltip[],
  plugin: LanguageToolPlugin,
  state: EditorState,
  dismissed: DismissedRange | null
): readonly Tooltip[] {
  const underlines = state.field(underlineField);

  if (underlines.size === 0 || state.selection.ranges.length > 1) {
    return [];
  }

  // Don't show tooltip when user is selecting text (fixes #120)
  const selection = state.selection.main;
  const isSelectingText = selection.from !== selection.to;

  const underlinesAtCursor: UnderlineEffect[] = [];

  underlines.between(
    state.selection.main.from,
    state.selection.main.to,
    (from, to, value) => {
      underlinesAtCursor.push({
        from,
        to,
        match: (value.spec as { match: MatchesEntity }).match
      });
    }
  );

  const primaryUnderline =
    underlinesAtCursor[underlinesAtCursor.length - 1] ?? null;

  if (primaryUnderline !== null) {
    const { from, to } = primaryUnderline;

    if (dismissed && dismissed.from === from && dismissed.to === to) {
      return [];
    }

    // Don't show tooltip when user is actively selecting text that doesn't match the underline (fixes #120)
    if (isSelectingText) {
      const matchesUnderline = selection.from === from && selection.to === to;

      if (!matchesUnderline) {
        return [];
      }
    }

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
            dom: contructTooltip(plugin, view, primaryUnderline)
          };
        }
      }
    ];
  }

  return [];
}

export function buildTooltipExtension(plugin: LanguageToolPlugin) {
  const tooltipField = StateField.define<TooltipState>({
    create: state => ({
      tooltips: getTooltip([], plugin, state, null),
      dismissed: null
    }),
    update: (value, tr) => {
      // Close tooltip when document changes to prevent stale positions
      // from being used when applying suggestions (fixes #92). An edit also
      // retires the dismissal, since the match it belonged to is gone.
      if (tr.docChanged) {
        return { tooltips: [], dismissed: null };
      }

      let dismissed = value.dismissed;

      for (const e of tr.effects) {
        if (e.is(dismissTooltip)) {
          const shown = value.tooltips[0];
          if (shown) {
            dismissed = { from: shown.pos, to: shown.end ?? shown.pos };
          }
        }
      }

      // Once the cursor leaves the dismissed match, its popover is available
      // again
      if (dismissed) {
        const selection = tr.state.selection.main;
        if (selection.to < dismissed.from || selection.from > dismissed.to) {
          dismissed = null;
        }
      }

      return {
        tooltips: getTooltip(value.tooltips, plugin, tr.state, dismissed),
        dismissed
      };
    },
    provide: f =>
      showTooltip.computeN([f], state => state.field(f).tooltips)
  });

  return [
    tooltipField,
    // Escape closes the popover but keeps the underline, so the match can be
    // reviewed again later (#100). Other Escape handlers, vim mode included,
    // still see the key whenever no popover is open.
    Prec.highest(
      keymap.of([
        {
          key: "Escape",
          run: view => {
            if (!view.state.field(tooltipField).tooltips.length) {
              return false;
            }
            view.dispatch({ effects: [dismissTooltip.of(null)] });
            return true;
          }
        }
      ])
    )
  ];
}
