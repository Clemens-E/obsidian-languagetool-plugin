import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { useEnvLanguageToolServer } from "../helpers";

const PLUGIN_ID = "obsidian-languagetool-plugin";

// The ribbon icon is driven by a setting, so the test flips the setting the
// way the settings tab does
async function setRibbonIcon(enabled: boolean): Promise<void> {
  await browser.executeObsidian(
    ({ app }, value: boolean) => {
      const plugin = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ];
      plugin.settings.showRibbonIcon = value;
      plugin.updateRibbonIcon();
    },
    enabled
  );
}

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
      "ltignore-suggestion",
      "ltautocheck-document"
    ]) {
      expect(commandIds).toContain(`${PLUGIN_ID}:${id}`);
    }
  });

  it("checks the current document from the ribbon icon (#114)", async function() {
    // Detached editors stay in the DOM, so start from a single clean pane
    await browser.executeObsidian(({ app }) => {
      app.workspace.detachLeavesOfType("markdown");
    });
    await obsidianPage.openFile("Grammar.md");

    const ribbonIcon = browser.$(
      '.side-dock-ribbon-action[aria-label*="LanguageTool"]'
    );
    // The icon is opt-in, so a fresh install shows nothing in the ribbon
    await expect(ribbonIcon).not.toExist();

    try {
      await setRibbonIcon(true);
      await expect(ribbonIcon).toExist();
      // A missing icon name would render an empty button
      await expect(ribbonIcon.$("svg")).toExist();

      await ribbonIcon.click();
      await browser.$(".lt-underline").waitForExist({ timeout: 10000 });
      await browser.executeObsidianCommand(`${PLUGIN_ID}:ltclear`);

      // Turning the setting back off removes the icon again
      await setRibbonIcon(false);
      await expect(ribbonIcon).not.toExist();
    } finally {
      await setRibbonIcon(false);
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
