import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import {
  PLUGIN_ID,
  initWindows,
  openPluginSettings,
  closeSettings
} from "../helpers";

describe("Error handling", function() {
  before(async function() {
    await initWindows();
  });

  after(async function() {
    await closeSettings();
    await browser.executeObsidian(({ app }) => {
      const settings = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ].settings;
      settings.urlMode = "standard";
      settings.serverUrl = "https://api.languagetool.org";
    });
  });

  it("reports an unreachable server and records it in the logs", async function() {
    // Point the plugin at a closed local port; no network involved
    await browser.executeObsidian(({ app }) => {
      const settings = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ].settings;
      settings.urlMode = "custom";
      settings.serverUrl = "http://127.0.0.1:1";
    });

    await obsidianPage.openFile("Grammar.md");
    await browser.executeObsidianCommand(`${PLUGIN_ID}:ltcheck-text`);

    await expect(
      browser.$(".notice*=Request to LanguageTool server failed")
    ).toExist();

    // The failure must be inspectable afterwards: the copy button copies
    // logs instead of reporting that there are none
    await openPluginSettings();
    await browser.$("button=Copy failed Request Logs").click();
    await expect(browser.$(".notice*=Logs copied to clipboard")).toExist();
  });
});
