import { browser, expect } from "@wdio/globals";
import {
  initWindows,
  openPluginSettings,
  closeSettings,
  inMainWindow,
  getSetting,
  hasSecretStorage,
  settingItem
} from "../helpers";

const STANDARD_URL = "https://api.languagetool.org";
const PREMIUM_URL = "https://api.languagetoolplus.com";

describe("Settings tab", function() {
  before(async function() {
    await initWindows();
  });

  beforeEach(async function() {
    await closeSettings();
    await browser.executeObsidian(({ app }) => {
      const settings = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ].settings;
      settings.urlMode = "standard";
      settings.serverUrl = "https://api.languagetool.org";
      settings.autoCheckDelay = 3000;
      settings.motherTongue = undefined;
      settings.apikey = undefined;
    });
  });

  after(async function() {
    await closeSettings();
  });

  it("only allows editing the endpoint URL in custom mode", async function() {
    await openPluginSettings();
    const endpoint = settingItem("Endpoint");
    const urlInput = endpoint.$('input[type="text"]');
    const dropdown = endpoint.$("select:not(.is-measuring)");

    await expect(urlInput).not.toBeEnabled();

    await dropdown.selectByAttribute("value", "custom");
    await expect(urlInput).toBeEnabled();
    expect(await getSetting<string>("serverUrl")).toBe("");

    await dropdown.selectByAttribute("value", "premium");
    await expect(urlInput).not.toBeEnabled();
    expect(await getSetting<string>("serverUrl")).toBe(PREMIUM_URL);

    await dropdown.selectByAttribute("value", "standard");
    await expect(urlInput).not.toBeEnabled();
    expect(await getSetting<string>("serverUrl")).toBe(STANDARD_URL);
  });

  it("strips API path suffixes from a custom endpoint URL (#143)", async function() {
    await openPluginSettings();
    const endpoint = settingItem("Endpoint");
    await endpoint.$("select:not(.is-measuring)").selectByAttribute("value", "custom");
    const urlInput = endpoint.$('input[type="text"]');

    // The plugin appends /v2/check itself, so a URL copied with the API
    // path must be reduced to the bare origin
    for (const typed of [
      "https://example.com/v2/check",
      "https://example.com/v2/check/",
      "https://example.com/v2",
      "https://example.com/"
    ]) {
      await urlInput.setValue(typed);
      expect(await getSetting<string>("serverUrl")).toBe(
        "https://example.com"
      );
    }
  });

  it("repairs a stored premium URL carrying a stale /v2 suffix (#143)", async function() {
    // A stored serverUrl with an /v2 suffix makes every request hit
    // /v2/v2/check (404), and outside custom mode the URL field is not
    // editable, so the plugin must repair the value on load
    await browser.executeObsidian(async ({ app }) => {
      const plugins = (app as any).plugins;
      const plugin = plugins.plugins["obsidian-languagetool-plugin"];
      plugin.settings.urlMode = "premium";
      plugin.settings.serverUrl = "https://api.languagetoolplus.com/v2";
      await plugin.saveSettings();
      await plugins.disablePlugin("obsidian-languagetool-plugin");
      await plugins.enablePlugin("obsidian-languagetool-plugin");
    });

    expect(await getSetting<string>("urlMode")).toBe("premium");
    expect(await getSetting<string>("serverUrl")).toBe(PREMIUM_URL);

    await browser.executeObsidian(async ({ app }) => {
      const plugin = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ];
      plugin.settings.urlMode = "standard";
      plugin.settings.serverUrl = "https://api.languagetool.org";
      await plugin.saveSettings();
    });
  });

  it("clamps the autocheck delay to the endpoint's minimum", async function() {
    await openPluginSettings();
    const dropdown = settingItem("Endpoint").$("select:not(.is-measuring)");
    const slider = settingItem("AutoCheck Delay (ms)").$('input[type="range"]');

    await dropdown.selectByAttribute("value", "custom");
    await inMainWindow(() =>
      browser.executeObsidian(({ app }) => {
        (app as any).plugins.plugins["obsidian-languagetool-plugin"].settings
          .autoCheckDelay = 50;
      })
    );

    await dropdown.selectByAttribute("value", "premium");
    expect(await getSetting<number>("autoCheckDelay")).toBe(750);
    expect(await slider.getAttribute("min")).toBe("750");

    await dropdown.selectByAttribute("value", "standard");
    expect(await getSetting<number>("autoCheckDelay")).toBe(3000);
    expect(await slider.getAttribute("min")).toBe("3000");
  });

  it("presents the storage toggle according to SecretStorage support", async function() {
    const secretStorageAvailable = await hasSecretStorage();
    await openPluginSettings();
    const storageItem = settingItem(
      "Store API key securely (this device only)"
    );
    const toggle = storageItem.$(".checkbox-container");
    await expect(toggle).toExist();

    if (secretStorageAvailable) {
      expect(await toggle.getAttribute("class")).not.toContain("is-disabled");
      // Fresh installs on supported versions default to secret storage, so
      // the API key setting must render the secret picker, not a text field
      expect(await getSetting<string>("apiKeyStorage")).toBe("secret");
      await expect(
        settingItem("API Key").$('input[type="text"]')
      ).not.toExist();
    } else {
      expect(await toggle.getAttribute("class")).toContain("is-disabled");
      await expect(
        storageItem.$(
          "span=Not available on this device (requires Obsidian 1.11.4 or newer)."
        )
      ).toExist();
      // Without SecretStorage the plaintext key field must be offered
      await expect(settingItem("API Key").$('input[type="text"]')).toExist();
    }
  });

  it("offers auto-detect immediately and remembers the mother tongue", async function() {
    await browser.executeObsidian(({ app }) => {
      (app as any).plugins.plugins["obsidian-languagetool-plugin"].settings
        .motherTongue = "de-DE";
    });
    await openPluginSettings();

    const staticDropdown = settingItem("Static Language").$("select:not(.is-measuring)");
    await expect(staticDropdown.$('option[value="auto"]')).toExist();
    expect(await staticDropdown.getValue()).toBe("auto");

    // Once the language list arrives from the server, the stored mother
    // tongue must be shown as the selected value
    const motherDropdown = settingItem("Mother Tongue").$("select:not(.is-measuring)");
    await motherDropdown.$('option[value="de-DE"]').waitForExist();
    expect(await motherDropdown.getValue()).toBe("de-DE");

    // Picking the blank entry unsets the value instead of storing a sentinel
    await motherDropdown.selectByAttribute("value", "default");
    const isUnset = await inMainWindow(() =>
      browser.executeObsidian(
        ({ app }) =>
          (app as any).plugins.plugins["obsidian-languagetool-plugin"]
            .settings.motherTongue === undefined
      )
    );
    expect(isUnset).toBe(true);
  });

  it("explains itself when there are no logs to copy", async function() {
    await openPluginSettings();
    await browser.$("button=Copy failed Request Logs").click();
    await expect(
      browser.$(".notice*=No failed requests have been logged yet")
    ).toExist();
  });

  it("warns when an API key is entered on a non-premium endpoint", async function() {
    if (await hasSecretStorage()) {
      // In secret mode there is no plaintext key field, so the warning flow
      // does not apply
      this.skip();
    }
    await openPluginSettings();

    const keyInput = settingItem("API Key").$('input[type="text"]');
    await keyInput.addValue("abc123");

    // No interruption while the user is still typing
    const warning = browser.$(
      "p=You have entered an API Key but you are not using the Premium Endpoint"
    );
    expect(await warning.isExisting()).toBe(false);

    // Leaving the field triggers the warning
    await browser.keys("Tab");
    await expect(warning).toExist();
    await browser.$("button=I know what I'm doing").click();
    await expect(warning).not.toExist();
  });
});
