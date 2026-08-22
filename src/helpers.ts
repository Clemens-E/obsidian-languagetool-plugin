import { LanguageToolPluginSettings } from "./SettingsTab";
import { MatchesEntity } from "./LanguageToolTypings";

export const ignoreListRegEx = /frontmatter|code|math|templater|blockid|hashtag|internal/;

export function hashString(value: string) {
  let hash = 0;
  if (value.length === 0) {
    return hash;
  }
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32bit integer
  }
  return hash;
}

// The replacements offered to the user for a match. The tooltip buttons and
// the "Accept suggestion #N" commands share this list, so hotkey slot N always
// applies the same text as tooltip button N.
export function getVisibleReplacements(match: MatchesEntity): string[] {
  return (match.replacements ?? [])
    .slice(0, 3)
    .map(v => v.value)
    .filter(v => v.trim());
}

// The plugin appends /v2/check to the configured server URL itself, so the
// stored value must be the bare origin; strip API path suffixes that users
// copy from documentation or their browser (#143)
export function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/v2(\/check)?$/, "");
}

// LanguageTool operates on Unicode-normalized (NFC) text, so its match
// offsets count precomposed characters. When a note contains decomposed
// characters (base letter plus combining mark, common in text originating on
// macOS), those offsets drift and split underlined words (#131). We therefore
// send NFC text to the server and use this map to translate the returned
// offsets back to positions in the original string.
//
// Returns null when the text is already NFC (offsets can be used as-is) or
// when normalization composes across cluster boundaries (e.g. Hangul Jamo),
// where a per-cluster map would be inconsistent.
export function buildNfcOffsetMap(original: string): number[] | null {
  const normalized = original.normalize("NFC");
  if (normalized === original) {
    return null;
  }

  const combiningMark = /\p{M}/u;
  const map: number[] = [];
  const nfcPieces: string[] = [];
  let nfcPos = 0;
  let i = 0;

  while (i < original.length) {
    // A base character and its combining marks normalize independently of
    // the surrounding text, so process one such cluster at a time
    let j = i + (original.codePointAt(i)! > 0xffff ? 2 : 1);
    while (j < original.length) {
      const char = String.fromCodePoint(original.codePointAt(j)!);
      if (!combiningMark.test(char)) {
        break;
      }
      j += char.length;
    }

    const clusterNfc = original.slice(i, j).normalize("NFC");
    nfcPieces.push(clusterNfc);
    for (let k = 0; k < clusterNfc.length; k++) {
      map[nfcPos + k] = Math.min(i + k, j - 1);
    }
    nfcPos += clusterNfc.length;
    i = j;
  }

  // Cluster boundaries in NFC space map to cluster boundaries in the original
  map[nfcPos] = original.length;

  if (nfcPieces.join("") !== normalized) {
    return null;
  }

  return map;
}

// Assign a CSS class based on a rule's category ID
export function getIssueTypeClassName(categoryId: string) {
  switch (categoryId) {
    case "COLLOQUIALISMS":
    case "REDUNDANCY":
    case "STYLE":
      return "lt-style";
    case "PUNCTUATION":
    case "TYPOS":
      return "lt-major";
  }

  return "lt-minor";
}

// Construct a list of enabled / disabled rules
export function getRuleCategories(settings: LanguageToolPluginSettings) {
  const enabledCategories: string[] = settings.ruleOtherCategories
    ? settings.ruleOtherCategories.split(",")
    : [];
  const disabledCategories: string[] = settings.ruleOtherDisabledRules
    ? settings.ruleOtherDisabledRules.split(",")
    : [];

  return {
    enabledCategories,
    disabledCategories
  };
}
