# Obsidian LanguageTool Plugin

This is a plugin for [Obsidian.md](https://obsidian.md) that integrates [LanguageTool](https://languagetool.org/) to provide advanced Grammar and Spell Checking.

> **A note on AI usage:** I use Claude during development. It lets me build features and fixes faster than my free time would otherwise allow. Every change is still reviewed by me before it is released. If you are not comfortable with AI-assisted code, that's a fair position, and you should simply not use this plugin.

Note: if you are worried about the privacy of your notes you should selfhost languagetool, whether it be locally on your pc or on a server
[Docker Image](https://hub.docker.com/r/erikvl87/languagetool)

If you decide to self host the service, you need to change the link in the configuration accordingly.

## Installation

1. In Obsidian, under Settings / Community plugins, disable "Safe mode" (read the safety warning).
2. Click the Browse button for Community plugins.
3. In the top-left search field, search for "LanguageTool Integration". Click the Install button.
4. After the installation is successful, click Enable to enable the plugin. 

## Setting Up & Use case

After installing and enabling the plugin, you can set up three hotkeys (under Settings / Hotkeys) which can be found under the description "LanguageTool Integration" through the Filter search field, to find specific hotkey functions quicker. Make sure that there is no conflict with existing hotkeys and the spellcheck function within Obsidian, if enabled (Settings / Editor / Spellcheck ON/OFF).

* **"Check Text"** checks the whole document in view, if no text is selected. If you want to check only a word, sentence or paragraph, select the text of choice and press the keyboard shortcut you have previously setup. Click on the red underlined word that LanguageTool identified as a possible spelling mistake to get corrective suggestions in a popover window, with the option to add the word to a personal dictionary.
* **"Clear Suggestions"** clears the document or selected text of all red underlines from words or passages that were not corrected or changed.
* **"Toggle Automatic Checking"** toggles ON/OFF the automatic spellchecking function as you write or change the document's contents.

**LanguageTool tries to auto-detect the language used.** Selecting a specific language (under Settings / Plugin Options / LanguageTool Integration / Static language) is normally not necessary. **This feature enables the user to spellcheck in different languages within the same document** (e.g. a dissertation written in English with quotes in a foreign language), which is ordinarily not possible with the built-in spellcheck function of Obsidian.

### Ignoring Files
add the tag `lt-ignore` to the frontmatter of a file to ignore it from being spellchecked. All spellchecks, even manual ones, will be ignored.

## Premium Accounts
We finally support LanguageTool Premium.

⚠️ Please report any bugs, issues or suggestions related to this Plugin to us (this GitHub Repository) directly, and ***not*** to the LanguageTool Support, as this is an unofficial community plugin

To use the premium features, you (obviously) need a Premium Account, and an API key.
You can generate your API key at https://languagetool.org/editor/settings/access-tokens

Configure your email, API key, and the new URL (https://api.languagetoolplus.com) in the plugin settings

### API key storage: synced plaintext vs. secure storage

On Obsidian 1.11.4 and newer, the plugin can keep your API key in Obsidian's encrypted [SecretStorage](https://docs.obsidian.md/plugins/guides/secret-storage) instead of in plaintext in the plugin's `data.json`. Fresh installs use SecretStorage automatically when available; existing setups keep their plaintext key until you enable **"Store API key securely (this device only)"** in the plugin settings, which moves the key into a secret and removes it from `data.json`. Your username/email is not a secret and always stays in the synced settings.

**Upsides of secure storage**

- The key is stored encrypted by Obsidian instead of as plaintext in `.obsidian/plugins/obsidian-languagetool-plugin/data.json`, so vault backups, Git-synced vaults, and sync services never see it.
- The synced settings only contain the *name* of the secret, never the key itself.
- Secrets can be shared across plugins: several plugins can reference the same secret, so a rotated key only needs to be updated in one place.

**Downsides / trade-offs**

- Secrets are device-local and do not sync. You have to enter the API key once on every device you use.
- It requires Obsidian 1.11.4 or newer. On older devices the plugin falls back to a plaintext key field; a key entered there is automatically moved into the secret the next time the vault is opened on a device that supports SecretStorage.
- Turning secure storage off copies the key back into `data.json` (plaintext, synced). This is only possible on a device where the secret is actually set. On other devices the plugin refuses the switch, so the key reference is not lost for the device that holds it.
- Obsidian has no API to delete secrets, so switching back to plaintext leaves the no-longer-referenced secret in SecretStorage; you can manage secrets in Obsidian's own settings.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` from the latest release to your vault `VaultFolder/.obsidian/plugins/obsidian-languagetool-plugin/`.

# Demo

![demo-02022022](https://user-images.githubusercontent.com/98941594/152318322-83abb30d-fee0-44cf-9700-262f4c0de4c4.png)
