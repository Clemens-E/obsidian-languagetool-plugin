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

const STORAGE_TOGGLE = "Store API key securely (this device only)";
const DEFAULT_SECRET_NAME = "languagetool-api-key";

async function getSecret(name: string): Promise<string | null> {
  return inMainWindow(() =>
    browser.executeObsidian(
      ({ app }, n: string) => (app as any).secretStorage.getSecret(n),
      name
    )
  );
}

describe("Secret storage", function() {
  before(async function() {
    await initWindows();
    if (!(await hasSecretStorage())) {
      // The whole feature is gated behind Obsidian 1.11.4
      this.skip();
    }
  });

  beforeEach(async function() {
    await closeSettings();
  });

  after(async function() {
    await closeSettings();
  });

  it("moves the plaintext key into a secret when enabling secure storage", async function() {
    await browser.executeObsidian(({ app }) => {
      const settings = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ].settings;
      settings.apiKeyStorage = "local";
      settings.apikey = "plain-key-123";
      settings.apikeySecretName = undefined;
    });
    await openPluginSettings();

    await settingItem(STORAGE_TOGGLE).$(".checkbox-container").click();

    await expect(
      browser.$(".notice*=API key moved to secure storage")
    ).toExist();
    expect(await getSetting<string>("apiKeyStorage")).toBe("secret");
    expect(await getSetting<string>("apikeySecretName")).toBe(
      DEFAULT_SECRET_NAME
    );
    expect(await getSecret(DEFAULT_SECRET_NAME)).toBe("plain-key-123");

    // The synced data.json on disk must no longer contain the key
    const savedData = await inMainWindow(() =>
      browser.executeObsidian(async ({ app }) =>
        (app as any).plugins.plugins["obsidian-languagetool-plugin"].loadData()
      )
    );
    expect(JSON.stringify(savedData)).not.toContain("plain-key-123");

    // The re-rendered API key setting offers the secret picker, not a
    // plaintext field
    await expect(settingItem("API Key").$('input[type="text"]')).not.toExist();
  });

  it("copies the key back into the settings when disabling secure storage", async function() {
    await browser.executeObsidian(({ app }) => {
      (app as any).secretStorage.setSecret(
        "languagetool-api-key",
        "roundtrip-key"
      );
      const settings = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ].settings;
      settings.apiKeyStorage = "secret";
      settings.apikey = undefined;
      settings.apikeySecretName = "languagetool-api-key";
    });
    await openPluginSettings();

    await settingItem(STORAGE_TOGGLE).$(".checkbox-container").click();

    expect(await getSetting<string>("apiKeyStorage")).toBe("local");
    expect(await getSetting<string>("apikey")).toBe("roundtrip-key");

    // The re-rendered plaintext field shows the recovered key
    const keyInput = settingItem("API Key").$('input[type="text"]');
    await expect(keyInput).toExist();
    expect(await keyInput.getValue()).toBe("roundtrip-key");
  });

  it("refuses to disable secure storage when the secret is missing here", async function() {
    await browser.executeObsidian(({ app }) => {
      const settings = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ].settings;
      settings.apiKeyStorage = "secret";
      settings.apikey = undefined;
      settings.apikeySecretName = "secret-only-on-another-device";
    });
    await openPluginSettings();

    await settingItem(STORAGE_TOGGLE).$(".checkbox-container").click();

    await expect(
      browser.$(".notice*=is not set on this device")
    ).toExist();
    // The reference must survive, or the device that holds the secret would
    // lose its key when the settings sync back
    expect(await getSetting<string>("apiKeyStorage")).toBe("secret");
    expect(await getSetting<string>("apikeySecretName")).toBe(
      "secret-only-on-another-device"
    );
    // The re-rendered toggle is back in the on position
    expect(
      await settingItem(STORAGE_TOGGLE)
        .$(".checkbox-container")
        .getAttribute("class")
    ).toContain("is-enabled");
  });

  it("migrates a stray plaintext key into the secret on load", async function() {
    // A plaintext key entered on a device without SecretStorage can sync
    // into a vault that runs in secret mode; the next load moves it
    await browser.executeObsidian(async ({ app }) => {
      const plugin = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ];
      plugin.settings.apiKeyStorage = "secret";
      plugin.settings.apikey = "synced-plain-key";
      plugin.settings.apikeySecretName = undefined;
      await plugin.saveSettings();
    });

    await browser.executeObsidian(async ({ app }) => {
      await (app as any).plugins.disablePlugin("obsidian-languagetool-plugin");
      await (app as any).plugins.enablePlugin("obsidian-languagetool-plugin");
    });
    await browser.waitUntil(async () =>
      browser.executeObsidian(({ app }) =>
        Boolean(
          (app as any).plugins.plugins["obsidian-languagetool-plugin"]
            ?.settings?.apikeySecretName
        )
      )
    );

    expect(await getSetting<string>("apiKeyStorage")).toBe("secret");
    expect(await getSetting<string>("apikeySecretName")).toBe(
      DEFAULT_SECRET_NAME
    );
    expect(await getSecret(DEFAULT_SECRET_NAME)).toBe("synced-plain-key");
    const savedData = await browser.executeObsidian(async ({ app }) =>
      (app as any).plugins.plugins["obsidian-languagetool-plugin"].loadData()
    );
    expect(JSON.stringify(savedData)).not.toContain("synced-plain-key");
  });
});
