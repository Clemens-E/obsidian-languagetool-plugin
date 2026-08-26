# LanguageTool Integration

Check grammar and spelling with [LanguageTool](https://languagetool.org/) without leaving [Obsidian](https://obsidian.md). Run a check on the whole document or just the selected text, or let the plugin check automatically as you type. Mistakes are underlined in the editor; click one to review suggestions, apply a correction, or add the word to your personal dictionary.

The plugin works with the free public LanguageTool API, with [LanguageTool Premium](#premium-accounts), and with [self-hosted servers](#privacy-and-self-hosting), so your notes never have to leave your own infrastructure.

![demo-02022022](https://user-images.githubusercontent.com/98941594/152318322-83abb30d-fee0-44cf-9700-262f4c0de4c4.png)

> **A note on AI usage:** I use Claude during development. It lets me build features and fixes faster than my free time would otherwise allow. Every change is still reviewed by me before it is released. If you are not comfortable with AI-assisted code, that's a fair position, and you should simply not use this plugin.

## Installation

1. In Obsidian, open Settings, then Community plugins, and turn off "Restricted mode" (read the safety warning).
2. Click Browse, search for "LanguageTool Integration", and click Install.
3. Click Enable.

<details>
<summary>Manual installation</summary>

Copy `main.js`, `styles.css`, and `manifest.json` from the [latest release](https://github.com/Clemens-E/obsidian-languagetool-plugin/releases/latest) into `VaultFolder/.obsidian/plugins/obsidian-languagetool-plugin/`. Release assets are signed with [GitHub artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds); you can verify them with `gh attestation verify main.js -R Clemens-E/obsidian-languagetool-plugin`.

</details>

## Usage

### Checking text

Run **Check Text** from the command palette (or bind it to a hotkey under Settings, Hotkeys; filter for "LanguageTool" to find all of the plugin's commands). With no selection, the whole document is checked; with a selection, only the selected text is checked.

Potential issues are underlined. Click an underline to open a popover with the message, up to three suggested replacements, and an ignore button. For spelling errors the ignore button is **Add to personal dictionary**, which stores the word in Obsidian's own spellcheck dictionary, so both the plugin and Obsidian's built-in spellcheck accept it from then on.

Press `Escape` to close the popover without changing anything; the underline stays, so you can come back to it by clicking the word again.

Underlines disappear on their own when you edit the text they cover. Text inside code blocks, math, frontmatter, and similar regions is never underlined.

### Automatic checking

Enable **Autocheck Text** in the settings (or run **Toggle Automatic Checking**) to check as you type. The plugin waits until you stop typing for the configured **AutoCheck Delay** and then checks only the lines you changed.

Single notes can deviate from that global setting with the `lt-autocheck` frontmatter key, which works in both directions and is remembered every time the note is opened, because it lives in the note itself:

```yaml
---
lt-autocheck: false
---
```

`false` keeps a note off automatic checking even when the setting is on, `true` checks a note automatically even when the setting is off. Manual checks are unaffected in both cases. Run **Toggle automatic checking for current document** (or use the status bar menu) to set the key without editing the frontmatter by hand; toggling back to the global behavior removes the key again.

### The status bar button

The `Aa` button in the status bar shows a sync icon while a check is running. Clicking it opens a small menu: check the current document, enable or disable automatic checking globally or for the current document only, or clear all suggestions.

### Commands

| Command | What it does |
| --- | --- |
| Check Text | Checks the document, or only the selection if there is one |
| Clear Suggestions | Removes all underlines without changing the text |
| Toggle Automatic Checking | Turns autocheck on or off |
| Toggle automatic checking for current document | Pins autocheck on or off for the current note through its `lt-autocheck` frontmatter key |
| Jump to next Suggestion | Selects the next underline after the cursor and scrolls to it |
| Jump to previous Suggestion | Selects the previous underline before the cursor |
| Accept suggestion #1 / #2 / #3 | With the cursor inside an underline, applies the first, second, or third suggested replacement directly, without opening the popover |
| Ignore suggestion at cursor | With the cursor inside an underline, ignores that match for the rest of the session, like the popover's ignore button |
| Add word at cursor to personal dictionary | With the cursor inside a spelling underline, adds the word to your personal dictionary (the same one Obsidian's own spellchecker uses). A notice offers an undo |

### Ignoring files

Add the tag `lt-ignore` to a file's frontmatter to exclude it from all checks, including manual ones:

```yaml
---
tags:
  - lt-ignore
---
```

## Settings

### General

- **Endpoint**: which LanguageTool server to use.
  - **(Standard) api.languagetool.org**: the free public API. Rate-limited to 20 requests per minute per IP, texts up to 20,000 characters.
  - **(Premium) api.languagetoolplus.com**: the paid API. Requires the username and API key described under [Premium Accounts](#premium-accounts).
  - **Custom URL**: your own server, see [Privacy and self-hosting](#privacy-and-self-hosting). Enter only the base URL (for example `http://localhost:8010`); the plugin adds the API path itself.
- **API Username**: the email address of your LanguageTool Premium account. Only needed for the premium endpoint.
- **API Key**: your LanguageTool Premium API key. Only needed for the premium endpoint.
- **Store API key securely (this device only)**: keeps the API key in Obsidian's encrypted SecretStorage instead of in plaintext in the plugin settings. Requires Obsidian 1.11.4 or newer. See [API key storage](#api-key-storage-synced-plaintext-vs-secure-storage) for the trade-offs.
- **Autocheck Text**: check automatically as you type.
- **AutoCheck Delay (ms)**: how long to wait after the last keystroke before checking. The minimum depends on the endpoint, because each endpoint allows a different number of requests per minute: 3000 ms on standard, 750 ms on premium, 50 ms on custom.
- **Glass Background**: renders the suggestion popover with a translucent background instead of the theme's secondary background color.
- **Static Language**: forces one language for all checks. The default, **Auto Detect**, is usually the better choice: LanguageTool detects the language per paragraph, so you can mix languages within one document. Setting a static language clears any configured language varieties.
- **Mother Tongue**: your native language. LanguageTool uses it to detect false friends, words that look right to you but mean something else in the language you are writing.
- **Failed request logs**: copies the details of recent failed LanguageTool requests to the clipboard. Useful when reporting a bug.

### Language Varieties

When auto-detect recognizes a language that has regional variants, it cannot know which one you write. These dropdowns pin the variant used for English, German, Portuguese, and Catalan (for example "English (US)" vs "English (British)", which differ in spelling rules). Picking a variety switches Static Language back to Auto Detect, since the two settings would otherwise conflict.

### Rule Categories

- **Picky Mode**: enables LanguageTool's stricter rule set: more style and tonality suggestions, detection of long or complex sentences, colloquialisms, redundancies, and synonyms for overused words.
- **Other rule categories**: comma-separated list of additional [category IDs](https://community.languagetool.org/rule/list) to enable, for example `PUNCTUATION,CASING`.
- **Enable Specific Rules**: comma-separated list of individual [rule IDs](https://community.languagetool.org/rule/list) to enable.
- **Disable Specific Rules**: comma-separated list of rule IDs to turn off. Handy when one rule keeps flagging something intentional in your notes.

## Privacy and self-hosting

Checking text means sending it to the configured LanguageTool server. With the standard or premium endpoint, that is LanguageTool's cloud; their [privacy policy](https://languagetool.org/legal/privacy) applies. The plugin only ever sends the text being checked (the whole document, the selection, or the changed lines during autocheck), never your whole vault.

If you do not want your notes to leave your machine, run your own LanguageTool server and point the plugin at it with the **Custom URL** endpoint. The easiest way is the [Docker image](https://hub.docker.com/r/erikvl87/languagetool):

```bash
docker run -d --name languagetool -p 8010:8010 erikvl87/languagetool
```

Then set the endpoint to Custom URL and enter `http://localhost:8010`.

## Premium Accounts

The plugin supports LanguageTool Premium:

1. Generate an API key at https://languagetool.org/editor/settings/access-tokens (a Premium account is required).
2. In the plugin settings, switch the endpoint to **(Premium) api.languagetoolplus.com**.
3. Enter your account email as the API Username and the generated key as the API Key.

⚠️ Please report bugs and issues with this plugin to this GitHub repository, and ***not*** to the LanguageTool support: this is an unofficial community plugin.

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
