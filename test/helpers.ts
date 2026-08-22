import { browser, expect } from "@wdio/globals";
import { env } from "node:process";

export const PLUGIN_ID = "obsidian-languagetool-plugin";

// Obsidian can open the settings dialog in a popout OS window (a separate
// webdriver window handle). The executeObsidian bridge only exists in the
// main window, so DOM interactions happen in the settings window while
// plugin-state reads/writes hop back to the main one.
let mainHandle: string;
let settingsHandle: string;

// Call once in a before() hook while the main window is current
export async function initWindows(): Promise<void> {
  mainHandle = await browser.getWindowHandle();
  settingsHandle = mainHandle;
}

export function settingItem(name: string) {
  return browser.$(
    `//div[contains(@class,"setting-item") and .//div[contains(@class,"setting-item-name") and normalize-space()="${name}"]]`
  );
}

export async function openPluginSettings(): Promise<void> {
  await browser.switchToWindow(mainHandle);
  await browser.executeObsidian(({ app }) => {
    (app as any).setting.open();
    (app as any).setting.openTabById("obsidian-languagetool-plugin");
  });
  await browser.waitUntil(async () => {
    for (const handle of await browser.getWindowHandles()) {
      await browser.switchToWindow(handle);
      if (await browser.$(".modal.mod-settings").isExisting()) return true;
    }
    return false;
  });
  settingsHandle = await browser.getWindowHandle();
  await expect(settingItem("Endpoint")).toExist();
}

export async function closeSettings(): Promise<void> {
  await browser.switchToWindow(mainHandle);
  await browser.executeObsidian(({ app }) => (app as any).setting.close());
  settingsHandle = mainHandle;
}

export async function inMainWindow<T>(fn: () => Promise<T>): Promise<T> {
  await browser.switchToWindow(mainHandle);
  try {
    return await fn();
  } finally {
    await browser.switchToWindow(settingsHandle);
  }
}

export async function getSetting<T>(key: string): Promise<T> {
  return inMainWindow(() =>
    browser.executeObsidian(
      ({ app }, k: string) =>
        (app as any).plugins.plugins["obsidian-languagetool-plugin"]
          .settings[k],
      key
    ) as Promise<T>
  );
}

// Point the plugin at a self-hosted LanguageTool server when the environment
// provides one. CI uses this to avoid the public API's per-IP rate limit,
// which shared GitHub runner IPs exhaust quickly.
export async function useEnvLanguageToolServer(): Promise<void> {
  const url = env.LANGUAGETOOL_URL;
  if (!url) return;
  await browser.executeObsidian(
    ({ app }, serverUrl: string) => {
      const settings = (app as any).plugins.plugins[
        "obsidian-languagetool-plugin"
      ].settings;
      settings.urlMode = "custom";
      settings.serverUrl = serverUrl;
    },
    url
  );
}

export async function hasSecretStorage(): Promise<boolean> {
  return inMainWindow(() =>
    browser.executeObsidian(({ app }) => Boolean((app as any).secretStorage))
  );
}
