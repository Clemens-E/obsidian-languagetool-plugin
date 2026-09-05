import * as Remark from "annotatedtext-remark";
import { Notice, requestUrl, RequestUrlResponse } from "obsidian";
import { LanguageToolApi } from "./LanguageToolTypings";
import { LanguageToolPluginSettings } from "./SettingsTab";
import { getRuleCategories } from "./helpers";

export const logs: string[] = [];

const MaxLogEntries = 10;

// Timestamped ring buffer behind the "Copy failed Request Logs" button in the
// settings tab. Callers must redact credentials before pushing.
function pushLogEntry(entry: string): void {
  logs.push(`${new Date().toLocaleString()}: ${entry}`);
  if (logs.length > MaxLogEntries) {
    logs.shift();
  }
}

/**
 * Resolved LanguageTool credentials. These may come from either the plugin
 * settings (data.json) or Obsidian's SecretStorage, depending on the user's
 * configured storage mode; the API layer is agnostic to the source.
 */
export interface LanguageToolApiCredentials {
  username?: string;
  apikey?: string;
}

let lastStatus:
  | "ok"
  | "request-failed"
  | "request-not-ok"
  | "json-parse-error" = "ok";
const listRegex = /^\s*(-|\d+\.) $/m;

// Obsidian wikilink: optional embed marker, target, optional alias after the
// first pipe
const wikilinkRegex = /(!?)\[\[([^[\]\n|]*)(\|([^[\]\n]*))?\]\]/g;

// One entry of the annotated text sent to LanguageTool: either prose to
// check, or markup with the text it stands for
interface AnnotationItem {
  text?: string;
  markup?: string;
  interpretAs?: string;
  offset: { start: number; end: number };
}

// Only the alias of an aliased wikilink is visible in the rendered note, so
// the link target is markup as far as the checker is concerned (#69). Plain
// links keep their target as text, since that is what the reader sees, and
// embeds are never prose. Markup keeps its raw length, so match offsets stay
// aligned with the document.
function annotateWikilinks(annotation: AnnotationItem[]): AnnotationItem[] {
  const result: AnnotationItem[] = [];

  for (const item of annotation) {
    if (item.text === undefined) {
      result.push(item);
      continue;
    }

    let position = item.offset.start;
    const push = (piece: Omit<AnnotationItem, "offset">, length: number) => {
      if (length > 0) {
        result.push({
          ...piece,
          offset: { start: position, end: position + length }
        });
        position += length;
      }
    };
    const pushText = (text: string) => push({ text }, text.length);
    const pushMarkup = (markup: string) =>
      push({ markup, interpretAs: "" }, markup.length);

    let cursor = 0;
    for (const match of item.text.matchAll(wikilinkRegex)) {
      const [whole, embed, target, aliasPart, alias] = match;
      pushText(item.text.slice(cursor, match.index));

      if (embed) {
        pushMarkup(whole);
      } else if (aliasPart !== undefined) {
        pushMarkup(`[[${target}|`);
        pushText(alias);
        pushMarkup("]]");
      } else {
        pushMarkup("[[");
        pushText(target);
        pushMarkup("]]");
      }

      cursor = match.index + whole.length;
    }
    pushText(item.text.slice(cursor));
  }

  return result;
}

/**
 * ✅ CommonMark-compliant inline code validator.
 * Handles multiple backtick delimiters and all edge cases
 * (matching sequences, newlines, spaces, embedded backticks, etc.)
 */
function isValidInlineCode(text: string): boolean {
  if (typeof text !== "string" || !text.startsWith("`")) return false;

  const openingMatch = text.match(/^`+/);
  if (!openingMatch) return false;

  const openingBackticks = openingMatch[0].length;
  const closingSequence = "`".repeat(openingBackticks);

  const closingIndex = text.lastIndexOf(closingSequence);
  if (closingIndex <= openingBackticks - 1) return false;

  let content = text.slice(openingBackticks, closingIndex);
  if (content === "") return false;

  content = content.replace(/\n/g, " ");

  if (
    content.length > 0 &&
    /[^ ]/.test(content) &&
    content.startsWith(" ") &&
    content.endsWith(" ")
  ) {
    content = content.slice(1, -1);
  }

  const matches = Array.from(content.matchAll(/`+/g));
  const longestSequence = matches.length
    ? Math.max(...matches.map(m => m[0].length))
    : 0;

  if (longestSequence >= openingBackticks) return false;

  return true;
}

export async function getDetectionResult(
  text: string,
  getSettings: () => LanguageToolPluginSettings,
  credentials: LanguageToolApiCredentials
): Promise<LanguageToolApi> {
  const parsedText = Remark.build(text, {
    ...Remark.defaults,
    interpretmarkup(text = ""): string {
      if (isValidInlineCode(text)) {
        return text;
      }

      const lineBreakCount = (text.match(/\n/g) ?? []).length ?? 0;
      const linebreaks = "\n".repeat(lineBreakCount);

      // Support lists (annotation ends with marker)
      if (listRegex.exec(text)) {
        return `${linebreaks}• `; // this is the character, the online editor uses
      }

      return linebreaks;
    }
  });

  const annotatedText = {
    annotation: annotateWikilinks(parsedText.annotation)
  };

  const settings = getSettings();
  const { enabledCategories, disabledCategories } = getRuleCategories(settings);

  const params: { [key: string]: string } = {
    data: JSON.stringify(annotatedText),
    language: "auto",
    enabledOnly: "false",
    level: settings.pickyMode ? "picky" : "default"
  };

  if (enabledCategories.length) {
    params.enabledCategories = enabledCategories.join(",");
  }

  if (disabledCategories.length) {
    params.disabledCategories = disabledCategories.join(",");
  }

  if (settings.ruleOtherRules) {
    params.enabledRules = settings.ruleOtherRules;
  }

  if (settings.ruleOtherDisabledRules) {
    params.disabledRules = settings.ruleOtherDisabledRules;
  }

  if (settings.englishVeriety) {
    params.preferredVariants = `${
      params.preferredVariants ? `${params.preferredVariants},` : ""
    }${settings.englishVeriety}`;
  }

  if (settings.germanVeriety) {
    params.preferredVariants = `${
      params.preferredVariants ? `${params.preferredVariants},` : ""
    }${settings.germanVeriety}`;
  }

  if (settings.portugueseVeriety) {
    params.preferredVariants = `${
      params.preferredVariants ? `${params.preferredVariants},` : ""
    }${settings.portugueseVeriety}`;
  }

  if (settings.catalanVeriety) {
    params.preferredVariants = `${
      params.preferredVariants ? `${params.preferredVariants},` : ""
    }${settings.catalanVeriety}`;
  }

  if (credentials.apikey && credentials.username) {
    params.username = credentials.username;
    params.apiKey = credentials.apikey;
  }

  if (
    settings.staticLanguage &&
    settings.staticLanguage.length > 0 &&
    settings.staticLanguage !== "auto"
  ) {
    params.language = settings.staticLanguage;
  }

  if (settings.motherTongue && settings.motherTongue.length > 0) {
    params.motherTongue = settings.motherTongue;
  }

  const checkUrl = `${settings.serverUrl}/v2/check`;
  let res: RequestUrlResponse;
  try {
    // requestUrl instead of fetch: it bypasses CORS restrictions, which
    // matters for self-hosted LanguageTool servers
    res = await requestUrl({
      url: checkUrl,
      method: "POST",
      body: Object.keys(params)
        .map(key => {
          return `${encodeURIComponent(key)}=${encodeURIComponent(
            params[key]
          )}`;
        })
        .join("&"),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      throw: false
    });
  } catch (e) {
    const status = "request-failed";
    pushLogEntry(`request to ${checkUrl} failed: ${String(e)}`);
    if (lastStatus !== status || !settings.shouldAutoCheck) {
      new Notice(
        `Request to LanguageTool server failed. Please check your connection and LanguageTool server URL`,
        3000
      );
      lastStatus = status;
    }
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }

  if (res.status < 200 || res.status >= 300) {
    const status = "request-not-ok";
    pushLogs(checkUrl, res, settings, credentials);
    if (lastStatus !== status || !settings.shouldAutoCheck) {
      new Notice(
        `Request to LanguageTool failed: ${res.status}\nCheck the plugin settings for logs`,
        3000
      );
      lastStatus = status;
    }
    return Promise.reject(
      new Error(`unexpected status ${res.status}, see plugin logs`)
    );
  }

  let body: LanguageToolApi;
  try {
    body = res.json as LanguageToolApi;
  } catch (e) {
    const status = "json-parse-error";
    if (lastStatus !== status || !settings.shouldAutoCheck) {
      new Notice(`Error processing response from LanguageTool server`, 3000);
      lastStatus = status;
    }
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  }

  // Only notify when recovering from a failed state
  if (lastStatus !== "ok") {
    new Notice(`LanguageTool detection restored`, 5000);
    lastStatus = "ok";
  }

  return body;
}

export function pushLogs(
  url: string,
  res: RequestUrlResponse,
  settings: LanguageToolPluginSettings,
  credentials: LanguageToolApiCredentials
): void {
  let debugString = `url used for request: ${url}
  Status: ${res.status}
  Body: ${res.text.slice(0, 200)}
  Settings: ${JSON.stringify({
    ...settings,
    username: "REDACTED",
    apikey: "REDACTED"
  })}
  `;
  if (credentials.username || credentials.apikey) {
    debugString = debugString
      .replaceAll(credentials.username ?? "username", "<<username>>")
      .replaceAll(credentials.apikey ?? "apiKey", "<<apikey>>");
  }

  pushLogEntry(debugString);
}
