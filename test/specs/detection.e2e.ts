import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { useEnvLanguageToolServer } from "../helpers";

const PLUGIN_ID = "obsidian-languagetool-plugin";

// Background tabs stay mounted in the DOM, so every selector must be scoped
// to the active leaf or it can match stale editors from earlier tests
const ACTIVE = ".workspace-leaf.mod-active";

async function getEditorText(): Promise<string> {
  return browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    return view ? view.editor.getValue() : "";
  });
}

// Place the cursor right inside the first occurrence of `word`
async function setCursorInWord(word: string): Promise<void> {
  await browser.executeObsidian(
    ({ app, obsidian }, target: string) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      if (!view) throw new Error("no active markdown view");
      const offset = view.editor.getValue().indexOf(target);
      if (offset < 0) throw new Error(`"${target}" not found in note`);
      view.editor.setCursor(view.editor.offsetToPos(offset + 2));
    },
    word
  );
}

async function checkText(): Promise<void> {
  await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);
  await expect(browser.$(`${ACTIVE} .lt-underline`)).toExist();
}

describe("Detection and suggestions", function() {
  // The public LanguageTool API rate-limits per IP; one retry rides out a
  // throttled request without masking real regressions
  this.retries(1);

  before(async function() {
    await useEnvLanguageToolServer();
  });

  beforeEach(async function() {
    // Close all editors so no underline state or buffer survives, then
    // restore the vault files
    await browser.executeObsidian(({ app }) => {
      app.workspace.detachLeavesOfType("markdown");
    });
    await obsidianPage.resetVault();
  });

  it("applies a suggestion from the tooltip", async function() {
    await obsidianPage.openFile("Suggestion.md");
    const before = await getEditorText();
    await checkText();

    await browser.$(`${ACTIVE} .lt-underline`).click();
    const suggestion = browser.$(`${ACTIVE} .lt-buttoncontainer button`);
    await expect(suggestion).toExist();
    await suggestion.click();

    expect(await getEditorText()).not.toBe(before);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
  });

  it("applies a suggestion via the accept-suggestion command", async function() {
    await obsidianPage.openFile("Suggestion.md");
    await checkText();

    await setCursorInWord("sentense");
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltaccept-suggestion-1`);

    expect(await getEditorText()).toContain("sentence");
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
  });

  it("jumps to the next suggestion", async function() {
    await obsidianPage.openFile("Suggestion.md");
    await checkText();

    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      view!.editor.setCursor({ line: 0, ch: 0 });
    });
    await browser.executeObsidianCommand(
      `${PLUGIN_ID}:ltjump-to-next-suggestion`
    );

    const selection = await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      return view!.editor.getSelection();
    });
    expect(selection).toBe("sentense");
  });

  it("checks only the selected text", async function() {
    await obsidianPage.openFile("Selection.md");
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      const firstLine = view!.editor.getLine(0);
      view!.editor.setSelection(
        { line: 0, ch: 0 },
        { line: 0, ch: firstLine.length }
      );
    });

    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).toExist();

    // Only the mistake inside the selection may be underlined; the identical
    // mistake on the unselected line must stay clean
    const underlined = await browser
      .$$(`${ACTIVE} .lt-underline`)
      .map(el => el.getText());
    expect(underlined).toEqual(["mistkae"]);
  });

  it("never underlines notes tagged lt-ignore", async function() {
    await obsidianPage.openFile("Ignored.md");
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);

    // Absence check: give a real check enough time to have produced results
    await browser.pause(3000);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
  });

  it("removes the underline when its text is edited", async function() {
    await obsidianPage.openFile("Suggestion.md");
    await checkText();

    // Typing inside the underlined word invalidates the match
    await browser.$(`${ACTIVE} .lt-underline`).click();
    await browser.keys("x");

    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
  });

  it("keeps the underline anchored when text is inserted before it", async function() {
    await obsidianPage.openFile("Suggestion.md");
    await checkText();

    await browser.$(`${ACTIVE} .cm-content`).click();
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      view!.editor.setCursor({ line: 0, ch: 0 });
    });
    await browser.keys("Hello ");

    const underline = browser.$(`${ACTIVE} .lt-underline`);
    await expect(underline).toExist();
    expect(await underline.getText()).toBe("sentense");
    expect(await getEditorText()).toContain("Hello This is a sentense");
  });

  it("underlines mistakes automatically while typing", async function() {
    await obsidianPage.openFile("Typing.md");
    await browser.executeObsidian(({ app }) => {
      (app as any).plugins.plugins["obsidian-languagetool-plugin"].settings
        .shouldAutoCheck = true;
    });

    try {
      await browser.$(`${ACTIVE} .cm-content`).click();
      await browser.keys(["End", "Enter"]);
      await browser.keys("This is another sentense with a spelling mistake.");

      // Auto-check fires after the 3 second debounce plus one API round trip
      await browser.$(`${ACTIVE} .lt-underline`).waitForExist({ timeout: 20000 });
    } finally {
      await browser.executeObsidian(({ app }) => {
        (app as any).plugins.plugins["obsidian-languagetool-plugin"].settings
          .shouldAutoCheck = false;
      });
    }
  });

  it("never underlines matches inside code, frontmatter, or math", async function() {
    await obsidianPage.openFile("Exclusions.md");
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).toExist();

    // The same misspelling appears in prose, frontmatter, inline code, a
    // fenced code block, and inline math; only the prose one may be marked
    const underlined = await browser
      .$$(`${ACTIVE} .lt-underline`)
      .map(el => el.getText());
    expect(underlined).toEqual(["sentense"]);
  });

  it("ignores a suggestion for the rest of the session", async function() {
    await obsidianPage.openFile("IgnoreGrammar.md");
    await checkText();

    await browser.$(`${ACTIVE} .lt-underline`).click();
    const ignoreButton = browser.$(`${ACTIVE} .lt-ignorecontainer button`);
    await expect(ignoreButton).toHaveText(
      expect.stringContaining("Ignore suggestion")
    );
    await ignoreButton.click();
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();

    // The ignored range survives a re-check of the unchanged text
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);
    await browser.pause(1500);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
  });

  // Keep this test last: the added word suppresses every later "sentense"
  // underline in this Obsidian instance
  it("adds a typo to the personal dictionary", async function() {
    await obsidianPage.openFile("Suggestion.md");
    await checkText();

    await browser.$(`${ACTIVE} .lt-underline`).click();
    const dictionaryButton = browser.$(`${ACTIVE} .lt-ignorecontainer button`);
    await expect(dictionaryButton).toHaveText(
      expect.stringContaining("Add to personal dictionary")
    );
    await dictionaryButton.click();
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();

    const inDictionary = await browser.executeObsidian(({ app }) =>
      (
        ((app as any).vault.getConfig("spellcheckDictionary") as string[]) ??
        []
      ).includes("sentense")
    );
    expect(inDictionary).toBe(true);

    // Future checks skip dictionary words
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);
    await browser.pause(1500);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
  });
});
