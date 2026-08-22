import { browser } from "@wdio/globals";

describe("Multi-pane auto-check", function() {
  after(async function() {
    await browser.executeObsidian(({ app }) => {
      (app as any).plugins.plugins["obsidian-languagetool-plugin"].settings
        .shouldAutoCheck = false;
    });
  });

  it("checks each pane independently", async function() {
    await browser.executeObsidian(async ({ app }) => {
      (app as any).plugins.plugins["obsidian-languagetool-plugin"].settings
        .shouldAutoCheck = true;
      const vault = (app as any).vault;
      const leaf1 = (app as any).workspace.getLeaf(false);
      await leaf1.openFile(vault.getAbstractFileByPath("Typing.md"));
      const leaf2 = (app as any).workspace.getLeaf("split");
      await leaf2.openFile(vault.getAbstractFileByPath("Suggestion.md"));
    });

    // Edit both panes inside the same debounce window; each editor keeps its
    // own timer and range, so both panes must end up checked
    await browser.executeObsidian(({ app }) => {
      for (const leaf of (app as any).workspace.getLeavesOfType("markdown")) {
        const editor = leaf.view.editor;
        const lastLine = editor.lastLine();
        editor.replaceRange("\nThis line was typed with a sentense mistake.", {
          line: lastLine,
          ch: editor.getLine(lastLine).length
        });
      }
    });

    await browser.waitUntil(
      async () =>
        browser.executeObsidian(({ app }) => {
          const leaves = (app as any).workspace.getLeavesOfType("markdown");
          return (
            leaves.length === 2 &&
            leaves.every((leaf: any) =>
              Array.from(
                leaf.view.containerEl.querySelectorAll(".lt-underline")
              ).some((mark: any) => mark.textContent === "sentense")
            )
          );
        }),
      {
        timeout: 25000,
        timeoutMsg: "expected an underline on the mistake in each pane"
      }
    );
  });
});
