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

// The popover must be fully visible, sit directly above or below its
// underline, and stay put once it opened; #65 reported it drifting sideways
async function expectStableAnchoredTooltip(): Promise<void> {
  await browser
    .$("//div[contains(@class, 'lt-predictions-container')]")
    .waitForDisplayed({ timeout: 5000 });

  interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  const samples: { tip: Rect; word: Rect; inViewport: boolean }[] = [];
  for (let i = 0; i < 6; i++) {
    const sample = await browser.execute(() => {
      const inner = document.querySelector(
        "[class*='lt-predictions-container']"
      );
      const tipEl = inner?.closest(".cm-tooltip") ?? inner;
      const underline = document.querySelector(
        ".workspace-leaf.mod-active .lt-underline"
      );
      if (!tipEl || !underline) return null;
      const t = tipEl.getBoundingClientRect();
      const u = underline.getBoundingClientRect();
      return {
        tip: { x: t.x, y: t.y, w: t.width, h: t.height },
        word: { x: u.x, y: u.y, w: u.width, h: u.height },
        inViewport:
          t.width > 0 &&
          t.height > 0 &&
          t.x >= 0 &&
          t.y >= 0 &&
          t.x + t.width <= window.innerWidth &&
          t.y + t.height <= window.innerHeight
      };
    });
    if (!sample) throw new Error("popover or underline disappeared");
    samples.push(sample);
    await browser.pause(100);
  }

  for (const { tip, word, inViewport } of samples) {
    expect(inViewport).toBe(true);
    // Horizontal anchor: the popover overlaps the word it belongs to
    expect(tip.x).toBeLessThanOrEqual(word.x + word.w);
    expect(tip.x + tip.w).toBeGreaterThanOrEqual(word.x);
    // Vertical anchor: its edge touches the word's line
    const gap = Math.min(
      Math.abs(tip.y + tip.h - word.y),
      Math.abs(word.y + word.h - tip.y)
    );
    expect(gap).toBeLessThanOrEqual(20);
  }

  const first = samples[0];
  for (const sample of samples) {
    expect(sample.tip.x).toBe(first.tip.x);
    expect(sample.tip.y).toBe(first.tip.y);
  }
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

  it("closes the popover with Escape and keeps the underline (#100)", async function() {
    await obsidianPage.openFile("Suggestion.md");
    const before = await getEditorText();
    await checkText();

    const popover = browser.$(`${ACTIVE} .lt-predictions-container`);
    await browser.$(`${ACTIVE} .lt-underline`).click();
    await expect(popover).toExist();

    await browser.keys("Escape");
    await expect(popover).not.toExist();

    // Escape only closes the popover: the match stays underlined and the
    // text is untouched
    await expect(browser.$(`${ACTIVE} .lt-underline`)).toExist();
    expect(await getEditorText()).toBe(before);

    // Moving off the match and back onto it opens the popover again
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      view!.editor.setCursor({ line: 0, ch: 0 });
    });
    await expect(popover).not.toExist();
    await browser.$(`${ACTIVE} .lt-underline`).click();
    await expect(popover).toExist();
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

  it("ignores the suggestion at the cursor via command (#123)", async function() {
    await obsidianPage.openFile("IgnoreGrammar.md");
    await checkText();

    // Clicking the underline puts the cursor inside the match, which is what
    // the command works from
    await browser.$(`${ACTIVE} .lt-underline`).click();
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltignore-suggestion`);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();

    // Like the popover button, the command ignores the range for the rest of
    // the session, so a re-check does not bring the underline back
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);
    await browser.pause(1500);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
  });

  it("treats each list item as its own sentence (#68)", async function() {
    // Capitalized bullets without trailing punctuation: read as one running
    // sentence, LanguageTool would flag the capital letters mid-sentence
    await obsidianPage.openFile("ListItems.md");
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);

    // Absence check: give a real check enough time to have produced results
    await browser.pause(3000);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
  });

  it("checks only the alias of an aliased wikilink (#69)", async function() {
    await obsidianPage.openFile("AliasLink.md");

    // The readability rule counts words per sentence; the long link target
    // trips it only if it is sent as prose
    await browser.executeObsidian(({ app }) => {
      (app as any).plugins.plugins["obsidian-languagetool-plugin"].settings
        .ruleOtherRules = "READABILITY_RULE_DIFFICULT";
    });
    try {
      await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);

      // Absence check: give a real check enough time to have produced results
      await browser.pause(3000);
      await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
    } finally {
      await browser.executeObsidian(({ app }) => {
        (app as any).plugins.plugins["obsidian-languagetool-plugin"].settings
          .ruleOtherRules = undefined;
      });
    }
  });

  it("checks the alias of a wikilink as part of its sentence (#69)", async function() {
    // "The dogs barks" is an agreement error LanguageTool can only see when
    // the alias, and not the raw link, is what it reads
    await obsidianPage.openFile("AliasAgreement.md");
    await checkText();

    const underlined = await browser
      .$$(`${ACTIVE} .lt-underline`)
      .map(el => el.getText());
    expect(underlined).toEqual(["barks"]);
  });

  // A correct German sentence is full of "typos" once it is checked as
  // English, which makes the pinned language observable
  it("checks a note in the language pinned by lt-language (#52)", async function() {
    await obsidianPage.openFile("LanguagePinned.md");
    await checkText();
  });

  it("accepts the lang frontmatter key of other plugins (#52)", async function() {
    await obsidianPage.openFile("LanguageLang.md");
    await checkText();
  });

  it("detects the language of notes without a pinned one (#52)", async function() {
    await obsidianPage.openFile("LanguageAuto.md");
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);

    // Absence check: give a real check enough time to have produced results
    await browser.pause(3000);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
  });

  it("underlines whole words containing umlauts (#131)", async function() {
    await obsidianPage.openFile("UmlautNFC.md");
    await checkText();

    const underlined = await browser
      .$$(`${ACTIVE} .lt-underline`)
      .map(el => el.getText());
    expect(underlined.map(t => t.normalize("NFC"))).toEqual(["schöönes"]);
  });

  it("underlines whole words in decomposed Unicode text (#131)", async function() {
    // Same sentence as UmlautNFC.md but with umlauts stored decomposed
    // (base letter plus combining mark), as text originating on macOS
    // often is; the misspelled word must still be underlined exactly
    await obsidianPage.openFile("UmlautNFD.md");
    await checkText();

    const underlined = await browser
      .$$(`${ACTIVE} .lt-underline`)
      .map(el => el.getText());
    expect(underlined.map(t => t.normalize("NFC"))).toEqual(["schöönes"]);
  });

  it("applies a suggestion inside a callout (#65)", async function() {
    await obsidianPage.openFile("Callout.md");
    // Live preview renders callouts as widgets; the source (and with it the
    // underline) is only shown while the cursor is inside
    await setCursorInWord("sentense");
    await checkText();

    await browser.$(`${ACTIVE} .lt-underline`).click();
    const suggestion = browser.$(`${ACTIVE} .lt-buttoncontainer button`);
    await expect(suggestion).toExist();
    await suggestion.click();

    expect(await getEditorText()).toContain("sentence");
  });

  it("keeps the popover visible and anchored to its underline (#65)", async function() {
    await obsidianPage.openFile("Suggestion.md");
    await checkText();

    await browser.$(`${ACTIVE} .lt-underline`).click();
    await expectStableAnchoredTooltip();
  });

  it("opens an anchored popover in a callout entered from its rendered state (#65)", async function() {
    await obsidianPage.openFile("CalloutJump.md");
    await setCursorInWord("sentense");
    await checkText();

    // Leave the callout so it renders as its live-preview widget
    await browser.executeObsidian(({ app, obsidian }) => {
      const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
      view!.editor.setCursor({ line: 0, ch: 0 });
    });
    await browser.$(`${ACTIVE} .cm-callout`).waitForExist({ timeout: 5000 });

    // A rendered callout is one atomic widget to the editor, so the first
    // click can only collapse it to source with the cursor at its start
    await browser.$(`${ACTIVE} .cm-callout`).click();

    // The second click lands on the underline and must open a stable popover
    const underline = browser.$(`${ACTIVE} .lt-underline`);
    await underline.waitForExist({ timeout: 5000 });
    await underline.click();
    await expectStableAnchoredTooltip();
  });

  it("keeps the popover in place while a suggestion is clicked in a callout (#65)", async function() {
    await obsidianPage.openFile("CalloutTitle.md");

    // Enter the callout's edit mode the way a user does
    await browser.$(`${ACTIVE} .cm-callout`).click();
    await checkText();

    await browser.$(`${ACTIVE} .lt-underline`).click();
    await expectStableAnchoredTooltip();

    const buttonCenter = await browser.execute(() => {
      const el = document.querySelector(
        ".workspace-leaf.mod-active .lt-buttoncontainer button"
      );
      const r = el!.getBoundingClientRect();
      return {
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2)
      };
    });
    // Record the popover's position every frame while the pointer presses
    // and releases the button. A mousedown that blurs the editor makes live
    // preview re-render the callout as a widget, which shoves the popover
    // aside so the release misses the button.
    await browser.execute(() => {
      const w = window as any;
      w.__lt65samples = [];
      w.__lt65stop = false;
      const sample = () => {
        const inner = document.querySelector(
          "[class*='lt-predictions-container']"
        );
        const tipEl = inner ? inner.closest(".cm-tooltip") ?? inner : null;
        if (tipEl) {
          const r = tipEl.getBoundingClientRect();
          w.__lt65samples.push({
            x: r.x,
            y: r.y,
            widget: Boolean(
              document.querySelector(".workspace-leaf.mod-active .cm-callout")
            )
          });
        }
        if (!w.__lt65stop) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });

    await browser
      .action("pointer")
      .move(buttonCenter)
      .down()
      .pause(400)
      .up()
      .perform();

    const samples = await browser.execute(() => {
      const w = window as any;
      w.__lt65stop = true;
      return w.__lt65samples as { x: number; y: number; widget: boolean }[];
    });

    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) {
      expect(sample.widget).toBe(false);
      expect(sample.x).toBe(samples[0].x);
      expect(sample.y).toBe(samples[0].y);
    }

    // And the released click applied the suggestion
    await browser.waitUntil(
      async () => (await getEditorText()).includes("don't"),
      { timeout: 3000, timeoutMsg: "suggestion was not applied" }
    );
  });

  it("undoes an accidental add to the personal dictionary (#138)", async function() {
    await obsidianPage.openFile("Suggestion.md");
    await checkText();

    await browser.$(`${ACTIVE} .lt-underline`).click();
    const dictionaryButton = browser.$(`${ACTIVE} .lt-ignorecontainer button`);
    await expect(dictionaryButton).toHaveText(
      expect.stringContaining("Add to personal dictionary")
    );
    await dictionaryButton.click();
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();

    const undoButton = browser.$(".notice").$("button=Undo");
    await expect(undoButton).toExist();
    await undoButton.click();

    // The word is out of the dictionary again and the underline is restored
    const inDictionary = await browser.executeObsidian(({ app }) =>
      (
        ((app as any).vault.getConfig("spellcheckDictionary") as string[]) ??
        []
      ).includes("sentense")
    );
    expect(inDictionary).toBe(false);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).toExist();
  });

  it("adds the word at the cursor to the dictionary via command (#126)", async function() {
    await obsidianPage.openFile("Suggestion.md");
    await checkText();

    await setCursorInWord("sentense");
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltadd-to-dictionary`);

    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
    const inDictionary = await browser.executeObsidian(({ app }) =>
      (
        ((app as any).vault.getConfig("spellcheckDictionary") as string[]) ??
        []
      ).includes("sentense")
    );
    expect(inDictionary).toBe(true);

    // The command shares the popover button's undo, which also keeps the
    // dictionary clean for the tests that follow
    const undoButton = browser.$(".notice").$("button=Undo");
    await expect(undoButton).toExist();
    await undoButton.click();
    await expect(browser.$(`${ACTIVE} .lt-underline`)).toExist();
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
