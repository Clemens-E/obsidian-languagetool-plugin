import {
  Command,
  MarkdownView,
  Menu,
  Notice,
  Plugin,
  requireApiVersion,
  setIcon
} from "obsidian";
import { Decoration, EditorView } from "@codemirror/view";
import { StateEffect } from "@codemirror/state";
import QuickLRU from "quick-lru";
import {
  DEFAULT_SETTINGS,
  LanguageToolPluginSettings,
  LanguageToolSettingsTab,
  getServerUrl
} from "./SettingsTab";
import { LanguageToolApi, MatchesEntity } from "./LanguageToolTypings";
import {
  hashString,
  getVisibleReplacements,
  normalizeServerUrl,
  buildNfcOffsetMap,
  editorToCodeMirror
} from "./helpers";
import { getDetectionResult, LanguageToolApiCredentials } from "./api";
import { buildUnderlineExtension } from "./cm6/underlineExtension";
import {
  addUnderline,
  clearUnderlines,
  clearUnderlinesInRange,
  underlineField
} from "./cm6/underlineStateField";

// Default SecretStorage secret name used when migrating an existing plaintext
// key. Secret names must be lowercase alphanumeric with optional dashes.
const DEFAULT_APIKEY_SECRET_NAME = "languagetool-api-key";

// The explicit return type is load-bearing: it keeps the value assigned
// inside the between() callback from being narrowed back to null at the
// return statement.
function findUnderlineRange(
  editorView: EditorView,
  searchFrom: number,
  searchTo: number,
  pick: "first" | "last"
): { from: number; to: number } | null {
  let match: { from: number; to: number } | null = null;
  editorView.state
    .field(underlineField)
    .between(searchFrom, searchTo, (from, to) => {
      if (
        !match ||
        (pick === "first" ? match.from > from : match.from < from)
      ) {
        match = { from, to };
      }
    });
  return match;
}

export default class LanguageToolPlugin extends Plugin {
  public settings: LanguageToolPluginSettings;
  private statusBarText: HTMLElement;

  private readonly hashLru = new QuickLRU<number, LanguageToolApi>({
    maxSize: 10
  });

  private isloading = false;

  public async onload() {
    // Settings
    await this.loadSettings();
    let unmodifiedSettings = (await this.loadData()) as LanguageToolPluginSettings | null;
    if (!unmodifiedSettings || Object.keys(unmodifiedSettings).length === 0) {
      unmodifiedSettings = this.settings;
    }
    if (
      !unmodifiedSettings.urlMode ||
      unmodifiedSettings.urlMode.length === 0
    ) {
      // Compare against the normalized URL so stray API path suffixes do
      // not misclassify an official endpoint as a custom server
      const serverUrl = normalizeServerUrl(this.settings.serverUrl);
      this.settings.urlMode =
        serverUrl === "https://api.languagetool.org"
          ? "standard"
          : serverUrl === "https://api.languagetoolplus.com"
          ? "premium"
          : "custom";
      try {
        await this.saveSettings();
        await this.loadSettings();
        new Notice(
          "updated LanguageTool Settings, please confirm your server URL in the settings tab",
          10000
        );
      } catch (e) {
        console.error(e);
      }
    }

    // The standard and premium endpoints have fixed URLs, and custom URLs
    // must be the bare origin because the plugin appends /v2/check itself.
    // Repair stored values that deviate, since the URL field is only
    // editable in custom mode (#143)
    const repairedServerUrl =
      this.settings.urlMode === "standard" ||
      this.settings.urlMode === "premium"
        ? getServerUrl(this.settings.urlMode)
        : normalizeServerUrl(this.settings.serverUrl);
    if (repairedServerUrl !== this.settings.serverUrl) {
      this.settings.serverUrl = repairedServerUrl;
      try {
        await this.saveSettings();
      } catch (e) {
        console.error(e);
      }
    }

    // A stored mother tongue of "empty" means "not set"; clear it so it is
    // never sent to the API as a language code
    if (this.settings.motherTongue === "empty") {
      this.settings.motherTongue = undefined;
      try {
        await this.saveSettings();
      } catch (e) {
        console.error(e);
      }
    }

    await this.resolveApiKeyStorageMode();
    await this.migrateStrayPlaintextKey();

    this.addSettingTab(new LanguageToolSettingsTab(this.app, this));

    // Status bar
    this.app.workspace.onLayoutReady(() => {
      this.statusBarText = this.addStatusBarItem();
      this.setStatusBarReady();
      this.registerDomEvent(
        this.statusBarText,
        "click",
        this.handleStatusBarClick
      );
    });

    this.registerEditorExtension(buildUnderlineExtension(this));

    // Commands
    this.registerCommands();
  }

  public onunload() {
    this.hashLru.clear();
  }

  private registerCommands() {
    this.addCommand({
      id: "ltcheck-text",
      name: "Check Text",
      editorCallback: (editor, view) => {
        this.runDetection(
          editorToCodeMirror(editor),
          view as MarkdownView
        ).catch(e => {
          console.error(e);
        });
      }
    });

    this.addCommand({
      id: "ltautocheck-text",
      name: "Toggle Automatic Checking",
      callback: async () => {
        this.settings.shouldAutoCheck = !this.settings.shouldAutoCheck;
        await this.saveSettings();
      }
    });

    this.addCommand({
      id: "ltclear",
      name: "Clear Suggestions",
      editorCallback: editor => {
        editorToCodeMirror(editor).dispatch({
          effects: [clearUnderlines.of(null)]
        });
      }
    });
    this.addCommand({
      id: "ltjump-to-next-suggestion",
      name: "Jump to next Suggestion",
      editorCheckCallback: (checking, editor) => {
        const editorView = editorToCodeMirror(editor);
        // Use "to" to search after the current selection end (fixes #130)
        const cursorOffset = editor.posToOffset(editor.getCursor("to"));
        const firstMatch = findUnderlineRange(
          editorView,
          cursorOffset + 1,
          Infinity,
          "first"
        );
        if (checking) {
          return Boolean(firstMatch);
        }
        if (!firstMatch) {
          return;
        }
        editorView.dispatch({
          selection: { anchor: firstMatch.from, head: firstMatch.to },
          // Scroll to make the suggestion visible (fixes #130)
          scrollIntoView: true
        });
      }
    });
    this.addCommand({
      id: "ltjump-to-previous-suggestion",
      name: "Jump to previous Suggestion",
      editorCheckCallback: (checking, editor) => {
        const editorView = editorToCodeMirror(editor);
        const cursorOffset = editor.posToOffset(editor.getCursor("from"));
        const lastMatch = findUnderlineRange(
          editorView,
          0,
          cursorOffset - 1,
          "last"
        );
        if (checking) {
          return Boolean(lastMatch);
        }
        if (!lastMatch) {
          return;
        }
        editorView.dispatch({
          selection: { anchor: lastMatch.from, head: lastMatch.to },
          // Scroll to make the suggestion visible
          scrollIntoView: true
        });
      }
    });

    this.addCommand(this.getApplySuggestionCommand(1));
    this.addCommand(this.getApplySuggestionCommand(2));
    this.addCommand(this.getApplySuggestionCommand(3));
  }

  private getApplySuggestionCommand(n: number): Command {
    return {
      id: `ltaccept-suggestion-${n}`,
      name: `Accept suggestion #${n} when the cursor is within a Language-Tool-Hint`,
      editorCheckCallback(checking, editor) {
        const editorView = editorToCodeMirror(editor);
        const cursorOffset = editor.posToOffset(editor.getCursor());

        const relevantMatches: {
          from: number;
          to: number;
          value: Decoration;
        }[] = [];

        // Get underline-matches at cursor
        editorView.state
          .field(underlineField)
          .between(cursorOffset, cursorOffset, (from, to, value) => {
            relevantMatches.push({ from, to, value });
          });

        // The same filtered list the tooltip renders as buttons, so slot n
        // matches button n.
        const spec = relevantMatches[0]?.value.spec as
          | { match?: MatchesEntity }
          | undefined;
        const match = spec?.match;
        const replacements = match ? getVisibleReplacements(match) : [];

        // Check that there is exactly one match that has a replacement in the slot that is called.
        const preconditionsSuccessfull =
          relevantMatches.length === 1 && replacements.length >= n;

        if (checking) return preconditionsSuccessfull;

        if (!preconditionsSuccessfull) {
          console.error(
            "Preconditions were not successfull to apply LT-suggestions."
          );
          return;
        }

        // At this point, the check must have been successful.
        const { from, to } = relevantMatches[0];
        const change = {
          from,
          to,
          insert: replacements[n - 1]
        };

        // Insert the text of the match
        editorView.dispatch({
          changes: [change],
          effects: [clearUnderlinesInRange.of({ from, to })]
        });
      }
    };
  }

  public setStatusBarReady() {
    this.isloading = false;
    this.statusBarText.empty();
    this.statusBarText.createSpan({ cls: "lt-status-bar-btn" }, span => {
      span.createSpan({
        cls: "lt-status-bar-check-icon",
        text: "Aa"
      });
    });
  }

  public setStatusBarWorking() {
    if (this.isloading) return;

    this.isloading = true;
    this.statusBarText.empty();
    this.statusBarText.createSpan(
      { cls: ["lt-status-bar-btn", "lt-loading"] },
      span => {
        setIcon(span, "sync-small");
      }
    );
  }

  private readonly handleStatusBarClick = () => {
    const statusBarRect = this.statusBarText.parentElement?.getBoundingClientRect();
    const statusBarIconRect = this.statusBarText.getBoundingClientRect();

    new Menu()
      .addItem(item => {
        item.setTitle("Check current document");
        item.setIcon("checkbox-glyph");
        item.onClick(async () => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view || view.getMode() !== "source") {
            new Notice("Open a note in editing mode to check it", 3000);
            return;
          }
          try {
            await this.runDetection(editorToCodeMirror(view.editor), view);
          } catch (e) {
            console.error(e);
          }
        });
      })
      .addItem(item => {
        item.setTitle(
          this.settings.shouldAutoCheck
            ? "Disable automatic checking"
            : "Enable automatic checking"
        );
        item.setIcon("uppercase-lowercase-a");
        item.onClick(async () => {
          this.settings.shouldAutoCheck = !this.settings.shouldAutoCheck;
          await this.saveSettings();
        });
      })
      .addItem(item => {
        item.setTitle("Clear suggestions");
        item.setIcon("reset");
        item.onClick(() => {
          const view = this.app.workspace.getActiveViewOfType(MarkdownView);
          if (!view) return;
          editorToCodeMirror(view.editor).dispatch({
            effects: [clearUnderlines.of(null)]
          });
        });
      })
      .showAtPosition({
        x: statusBarIconRect.right + 5,
        y: (statusBarRect?.top ?? 0) - 5
      });
  };

  public async runDetection(
    editor: EditorView,
    view: MarkdownView,
    from?: number,
    to?: number
  ) {
    // Auto-check always passes an explicit range, so a call without one was
    // triggered by the user and deserves feedback
    const manuallyTriggered = from === undefined && to === undefined;

    // ignore lt-ignore tags; frontmatter tags can be a list or a
    // comma-separated string, and either form must match whole tags only
    const frontmatter = view.file
      ? this.app.metadataCache.getFileCache(view.file)?.frontmatter
      : undefined;
    const tags: unknown = frontmatter?.tags;
    const tagList: string[] = Array.isArray(tags)
      ? tags.map(String)
      : typeof tags === "string"
      ? tags.split(",").map(t => t.trim())
      : [];
    if (tagList.includes("lt-ignore")) {
      return;
    }

    this.setStatusBarWorking();

    const state = editor.state;
    const selection = state.selection.main;
    const currentDoc = state.doc;

    let text = view.data;
    let offset = 0;
    let isRange = false;
    let rangeFrom = 0;
    let rangeTo = 0;

    if (from === undefined && selection && selection.from !== selection.to) {
      from = selection.from;
      to = selection.to;
    }

    if (from !== undefined && to !== undefined) {
      text = state.sliceDoc(from, to);
      offset = from;
      rangeFrom = from;
      rangeTo = to;
      isRange = true;
    }

    // LanguageTool counts offsets in NFC text; send NFC and translate the
    // matches back to positions in the possibly-decomposed document (#131)
    const nfcOffsetMap = buildNfcOffsetMap(text);
    if (nfcOffsetMap) {
      text = text.normalize("NFC");
    }
    const toDocOffset = (pos: number) =>
      nfcOffsetMap ? nfcOffsetMap[pos] ?? pos : pos;

    const hash = hashString(text);

    let res: LanguageToolApi;
    if (this.hashLru.has(hash)) {
      res = this.hashLru.get(hash)!;
    } else {
      try {
        res = await getDetectionResult(
          text,
          () => this.settings,
          this.getCredentials()
        );
        this.hashLru.set(hash, res);
      } catch (e) {
        this.setStatusBarReady();
        return Promise.reject(e instanceof Error ? e : new Error(String(e)));
      }

      // Avoid updating the underlines if the document has changed.
      // As the CodeMirror state is immutable, we can directly compare
      // the text objects.
      if (currentDoc !== editor.state.doc) {
        this.setStatusBarReady();
        return;
      }
    }

    const effects: StateEffect<unknown>[] = [];

    if (isRange) {
      effects.push(
        clearUnderlinesInRange.of({
          from: rangeFrom,
          to: rangeTo
        })
      );
    } else {
      effects.push(clearUnderlines.of(null));
    }

    if (res.matches) {
      for (const match of res.matches) {
        const start = toDocOffset(match.offset) + offset;
        const end = toDocOffset(match.offset + match.length) + offset;

        effects.push(
          addUnderline.of({
            from: start,
            to: end,
            match
          })
        );
      }
    }

    if (effects.length) {
      editor.dispatch({
        effects
      });
    }

    if (manuallyTriggered && (res.matches?.length ?? 0) === 0) {
      new Notice("LanguageTool found no issues", 3000);
    }

    this.setStatusBarReady();
  }

  public async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<LanguageToolPluginSettings> | null
    );
  }

  public async saveSettings() {
    // Cached results depend on the settings (language, rules, picky mode), so
    // any settings change invalidates them
    this.hashLru.clear();
    await this.saveData(this.settings);
  }

  /**
   * Whether Obsidian's native SecretStorage is available on this device.
   * Added in Obsidian 1.11.4, so it is undefined on older versions (and we
   * fall back to storing credentials in data.json).
   */
  public isSecretStorageAvailable(): boolean {
    if (requireApiVersion("1.11.4")) {
      return Boolean(this.app.secretStorage);
    }
    return false;
  }

  /**
   * Resolve credentials for an API request. The username always lives in
   * data.json (it is not a secret). In "secret" mode the API key value is read
   * from SecretStorage by the name we have stored; otherwise it comes from the
   * plaintext settings.
   */
  public getCredentials(): LanguageToolApiCredentials {
    const username = this.settings.username;
    if (
      requireApiVersion("1.11.4") &&
      this.settings.apiKeyStorage === "secret" &&
      this.isSecretStorageAvailable() &&
      this.settings.apikeySecretName
    ) {
      return {
        username,
        apikey:
          this.app.secretStorage.getSecret(this.settings.apikeySecretName) ??
          undefined
      };
    }
    return { username, apikey: this.settings.apikey };
  }

  /**
   * Migrate an existing user to SecretStorage. We seed the secret once from the
   * existing plaintext key (the only setSecret call we make; afterwards the
   * SecretComponent in the settings tab owns the secret), then drop the
   * plaintext copy from data.json.
   */
  public async enableSecretStorage(): Promise<void> {
    if (!this.isSecretStorageAvailable()) {
      return;
    }
    if (requireApiVersion("1.11.4") && this.settings.apikey) {
      const name = this.settings.apikeySecretName ?? DEFAULT_APIKEY_SECRET_NAME;
      this.app.secretStorage.setSecret(name, this.settings.apikey);
      this.settings.apikeySecretName = name;
    }
    this.settings.apikey = undefined;
    this.settings.apiKeyStorage = "secret";
    await this.saveSettings();
  }

  /**
   * Switch back to data.json: copy the secret's current value back into the
   * settings so it syncs across devices again. The secret itself is left in
   * SecretStorage (there is no delete API, and the named secret may be shared
   * with other plugins), so we simply stop referencing it.
   *
   * Refuses the switch (returning false) when a secret is referenced but not
   * set on this device: the secret name syncs via data.json, so clearing it
   * here would break the key on the device that actually holds the secret,
   * without recovering any key value on this one.
   */
  public async disableSecretStorage(): Promise<boolean> {
    if (
      requireApiVersion("1.11.4") &&
      this.settings.apikeySecretName &&
      this.isSecretStorageAvailable()
    ) {
      const value = this.app.secretStorage.getSecret(
        this.settings.apikeySecretName
      );
      if (value === null) {
        new Notice(
          `The secret "${this.settings.apikeySecretName}" is not set on this device, so there is no API key to copy back into the synced settings. Set the secret here first, or disable secure storage on the device that holds the key.`,
          10000
        );
        return false;
      }
      this.settings.apikey = value;
    }
    this.settings.apikeySecretName = undefined;
    this.settings.apiKeyStorage = "local";
    await this.saveSettings();
    return true;
  }

  /**
   * A plaintext API key can coexist with "secret" mode when it was entered on
   * a device without SecretStorage support and the settings then synced here.
   * The plaintext copy is the user's most recent input, so it wins: move it
   * into the secret and drop it from data.json, so no key lingers unencrypted
   * (and invisible, since the settings UI only shows the secret picker in
   * this mode).
   */
  private async migrateStrayPlaintextKey(): Promise<void> {
    if (
      this.settings.apiKeyStorage === "secret" &&
      this.isSecretStorageAvailable() &&
      this.settings.apikey
    ) {
      await this.enableSecretStorage();
    }
  }

  /**
   * Decide the default credential storage backend on first run / for legacy
   * installs that predate this setting. Existing users with a key already in
   * data.json keep using it (so cross-device sync is not silently broken),
   * while fresh installs default to SecretStorage when it is available.
   */
  private async resolveApiKeyStorageMode(): Promise<void> {
    if (this.settings.apiKeyStorage) return;

    const hasExistingCredentials =
      (this.settings.apikey?.length ?? 0) > 0 ||
      (this.settings.username?.length ?? 0) > 0;

    if (hasExistingCredentials) {
      this.settings.apiKeyStorage = "local";
    } else if (this.isSecretStorageAvailable()) {
      this.settings.apiKeyStorage = "secret";
    } else {
      this.settings.apiKeyStorage = "local";
    }

    try {
      await this.saveSettings();
    } catch (e) {
      console.error(e);
    }
  }
}
