import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { PLUGIN_ID, useEnvLanguageToolServer } from "../helpers";

const ACTIVE = ".workspace-leaf.mod-active";

// Append a misspelled sentence the way an edit from the user would, so the
// auto-check handler sees a document change
async function typeMistake(): Promise<void> {
  await browser.executeObsidian(({ app, obsidian }) => {
    const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
    const editor = view!.editor;
    const lastLine = editor.lastLine();
    editor.replaceRange("\nThis line has a sentense mistake.", {
      line: lastLine,
      ch: editor.getLine(lastLine).length
    });
  });
}

async function setGlobalAutoCheck(enabled: boolean): Promise<void> {
  await browser.executeObsidian(
    ({ app }, value: boolean) => {
      const plugin = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ];
      plugin.settings.shouldAutoCheck = value;
      // Keep the debounce short: these tests wait out the full delay
      plugin.settings.autoCheckDelay = 1000;
    },
    enabled
  );
}

async function readNote(path: string): Promise<string> {
  return browser.executeObsidian(({ app }, file: string) =>
    (app as any).vault.read((app as any).vault.getAbstractFileByPath(file))
  , path);
}

describe("Per-document automatic checking (#64)", function() {
  this.retries(1);

  before(async function() {
    await useEnvLanguageToolServer();
  });

  beforeEach(async function() {
    await browser.executeObsidian(({ app }) => {
      app.workspace.detachLeavesOfType("markdown");
    });
    await obsidianPage.resetVault();
  });

  after(async function() {
    await setGlobalAutoCheck(false);
  });

  it("skips a note that pins lt-autocheck: false", async function() {
    await setGlobalAutoCheck(true);
    await obsidianPage.openFile("AutoCheckOff.md");
    await typeMistake();

    // Give the debounce and a full API round trip time to have happened
    await browser.pause(8000);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();

    // The note is opted out of automatic checking only, not out of checking
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);
    await browser
      .$(`${ACTIVE} .lt-underline`)
      .waitForExist({ timeout: 10000 });
  });

  it("checks a note that pins lt-autocheck: true while the global setting is off", async function() {
    await setGlobalAutoCheck(false);
    await obsidianPage.openFile("AutoCheckOn.md");
    await typeMistake();

    await browser
      .$(`${ACTIVE} .lt-underline`)
      .waitForExist({ timeout: 20000 });
  });

  it("leaves notes without the key on the global setting", async function() {
    await setGlobalAutoCheck(false);
    await obsidianPage.openFile("AutoCheckDefault.md");
    await typeMistake();

    await browser.pause(8000);
    await expect(browser.$(`${ACTIVE} .lt-underline`)).not.toExist();
  });

  it("writes and removes the frontmatter key with the toggle command", async function() {
    await setGlobalAutoCheck(false);
    await obsidianPage.openFile("AutoCheckDefault.md");

    // Global setting is off, so the first toggle pins checking on
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltautocheck-document`);
    await browser.waitUntil(
      async () =>
        (await readNote("AutoCheckDefault.md")).includes("lt-autocheck: true"),
      { timeout: 5000, timeoutMsg: "the toggle did not pin lt-autocheck" }
    );

    // Toggling back matches the global setting again, so the key is dropped
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltautocheck-document`);
    await browser.waitUntil(
      async () =>
        !(await readNote("AutoCheckDefault.md")).includes("lt-autocheck"),
      { timeout: 5000, timeoutMsg: "the toggle did not remove lt-autocheck" }
    );
  });
});
