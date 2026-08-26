import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { useEnvLanguageToolServer } from "../helpers";

const PLUGIN_ID = "obsidian-languagetool-plugin";

describe("LanguageTool plugin", function() {
  before(async function() {
    await useEnvLanguageToolServer();
  });

  it("loads and is enabled", async function() {
    const loaded = await browser.executeObsidian(({ app }) =>
      Boolean((app as any).plugins.plugins["obsidian-languagetool-plugin"])
    );
    expect(loaded).toBe(true);
  });

  it("registers its commands", async function() {
    // The raw command registry, independent of what is currently executable
    const commandIds = await browser.executeObsidian(({ app }) =>
      Object.keys((app as any).commands.commands)
    );
    for (const id of [
      "ltcheck-text",
      "ltautocheck-text",
      "ltclear",
      "ltjump-to-next-suggestion",
      "ltjump-to-previous-suggestion",
      "ltaccept-suggestion-1",
      "ltadd-to-dictionary",
      "ltignore-suggestion"
    ]) {
      expect(commandIds).toContain(`${PLUGIN_ID}:${id}`);
    }
  });

  // Talks to api.languagetool.org, so this one needs network access
  it("underlines mistakes on Check Text and clears them again", async function() {
    await obsidianPage.openFile("Grammar.md");

    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);
    await expect(browser.$(".lt-underline")).toExist();

    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltclear`);
    await expect(browser.$(".lt-underline")).not.toExist();
  });
});
