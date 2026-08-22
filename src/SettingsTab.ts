/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  App,
  DropdownComponent,
  Modal,
  Notice,
  PluginSettingTab,
  SecretComponent,
  Setting,
  SliderComponent,
  TextComponent
} from "obsidian";
import LanguageToolPlugin from ".";
import { logs } from "./api";

const MinuteInSeconds = 60;
const SecondToMillisecondConversion = 1000;
const StandardMaxRequestsPerMinute = 20;
const PremiumMaxRequestsPerMinute = 80;

const MaxAutoCheckDelay = 5000;
const AutoCheckDelayStep = 50;
const MinStandardAutoCheckDelay =
  (MinuteInSeconds / StandardMaxRequestsPerMinute) *
  SecondToMillisecondConversion;
const MinPremiumAutoCheckDelay =
  (MinuteInSeconds / PremiumMaxRequestsPerMinute) *
  SecondToMillisecondConversion;

export interface LanguageToolPluginSettings {
  shouldAutoCheck: boolean;
  autoCheckDelay: number;

  serverUrl: string;
  urlMode: "standard" | "premium" | "custom";
  glassBg: boolean;
  apikey?: string;
  username?: string;
  // Where the API key lives: "local" = data.json (syncs across devices),
  // "secret" = Obsidian's encrypted SecretStorage (device-local). Undefined for
  // legacy installs; resolved on load by the plugin.
  apiKeyStorage?: "local" | "secret";
  // In "secret" mode, the name of the SecretStorage secret holding the API key
  // (the value itself is never stored here, only the reference).
  apikeySecretName?: string;
  staticLanguage?: string;
  motherTongue?: string;

  englishVeriety?:
    | undefined
    | "en-US"
    | "en-GB"
    | "en-CA"
    | "en-AU"
    | "en-ZA"
    | "en-NZ";
  germanVeriety?: undefined | "de-DE" | "de-AT" | "de-CH";
  portugueseVeriety?: undefined | "pt-BR" | "pt-PT" | "pt-AO" | "pt-MZ";
  catalanVeriety?: undefined | "ca-ES" | "ca-ES-valencia";

  pickyMode: boolean;

  ruleOtherCategories?: string;
  ruleOtherRules?: string;
  ruleOtherDisabledRules?: string;
}

export const DEFAULT_SETTINGS: LanguageToolPluginSettings = {
  serverUrl: "https://api.languagetool.org",
  urlMode: "standard",

  glassBg: false,
  shouldAutoCheck: false,
  autoCheckDelay: MinStandardAutoCheckDelay,

  pickyMode: false
};

function getServerUrl(value: string) {
  return value === "standard"
    ? "https://api.languagetool.org"
    : value === "premium"
    ? "https://api.languagetoolplus.com"
    : "";
}

function getMinAllowedAutoCheckDelay(value: string) {
  return value === "standard"
    ? MinStandardAutoCheckDelay
    : value === "premium"
    ? MinPremiumAutoCheckDelay
    : AutoCheckDelayStep;
}

export class LanguageToolSettingsTab extends PluginSettingTab {
  private readonly plugin: LanguageToolPlugin;
  private languages?: { name: string; code: string; longCode: string }[];
  public constructor(app: App, plugin: LanguageToolPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private configureAutoCheckDelaySlider(
    delaySlider: SliderComponent | null,
    value: string
  ) {
    const minAllowedAutoCheckDelay = getMinAllowedAutoCheckDelay(value);

    if (this.plugin.settings.autoCheckDelay < minAllowedAutoCheckDelay) {
      this.plugin.settings.autoCheckDelay = MinStandardAutoCheckDelay;
    }

    delaySlider?.setLimits(
      minAllowedAutoCheckDelay,
      MaxAutoCheckDelay,
      AutoCheckDelayStep
    );
  }

  public async requestLanguages() {
    if (this.languages) return this.languages;
    const languages = await fetch(
      `${this.plugin.settings.serverUrl}/v2/languages`
    ).then(res => res.json());
    this.languages = languages;
    return this.languages;
  }

  /**
   * Warn the user when an API key is set but the endpoint is not the premium
   * one. Shared by both the plaintext text input and the SecretComponent.
   */
  private maybeWarnNonPremium(
    hasKey: boolean,
    urlDropdown: DropdownComponent | null,
    onAcknowledge: () => void,
    disableUrlPopup: boolean
  ): void {
    if (
      !hasKey ||
      this.plugin.settings.urlMode === "premium" ||
      disableUrlPopup
    ) {
      return;
    }
    const modal = new Modal(this.app);
    modal.titleEl.createEl("span", { text: "Warning" });
    modal.contentEl.createEl("p", {
      text:
        "You have entered an API Key but you are not using the Premium Endpoint"
    });
    modal.contentEl.style.display = "grid";
    const container = modal.contentEl.createEl("div", {
      attr: { style: "justify-self:center" }
    });
    container.createEl("button", {
      text: "I know what I'm doing",
      attr: { style: "justify-self:flex-start; color:red;" }
    }).onclick = () => {
      onAcknowledge();
      modal.close();
    };
    container.createEl("button", {
      text: "Change to Premium",
      attr: { style: "justify-self:flex-end" }
    }).onclick = async () => {
      this.plugin.settings.urlMode = "premium";
      urlDropdown?.setValue("premium");
      this.plugin.settings.serverUrl = getServerUrl("premium");
      await this.plugin.saveSettings();
      return modal.close();
    };
    modal.open();
  }

  public display(): void {
    const { containerEl } = this;
    let urlDropdown: DropdownComponent | null = null;
    let autoCheckDelaySlider: SliderComponent | null = null;
    let disableUrlPopup = false;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Settings for LanguageTool" });
    const copyButton = containerEl.createEl("button", {
      text: "Copy failed Request Logs"
    });
    copyButton.onclick = async () => {
      await window.navigator.clipboard.writeText(logs.join("\n"));
      new Notice("Logs copied to clipboard");
    };
    copyButton.style.marginBottom = "5px";

    new Setting(containerEl)
      .setName("Endpoint")
      .setDesc("Endpoint that will be used to make requests to")
      .then(setting => {
        setting.controlEl.style.display = "inline-grid";
        let input: TextComponent | null = null;
        setting.addDropdown(component => {
          urlDropdown = component;
          component
            .addOptions({
              standard: "(Standard) api.languagetool.org",
              premium: "(Premium) api.languagetoolplus.com",
              custom: "Custom URL"
            })
            .setValue(this.plugin.settings.urlMode)
            .onChange(async value => {
              this.plugin.settings.urlMode = value as
                | "standard"
                | "premium"
                | "custom";
              this.plugin.settings.serverUrl = getServerUrl(value);
              input?.setValue(this.plugin.settings.serverUrl);
              input?.setDisabled(value !== "custom");

              this.configureAutoCheckDelaySlider(autoCheckDelaySlider, value);

              await this.plugin.saveSettings();
            });
        });
        setting.addText(text => {
          input = text;
          text
            .setPlaceholder("https://your-custom-url.com")
            .setValue(this.plugin.settings.serverUrl)
            .setDisabled(this.plugin.settings.urlMode === "custom")
            .onChange(async value => {
              this.plugin.settings.serverUrl = value
                .replace(/\/v2\/check\/$/, "")
                .replace(/\/$/, "");
              await this.plugin.saveSettings();
            });
        });
      });
    new Setting(containerEl)
      .setName("API Username")
      .setDesc("Enter a username/email for API Access")
      .addText(text =>
        text
          .setPlaceholder("peterlustig@gmail.com")
          .setValue(this.plugin.settings.username ?? "")
          .onChange(async value => {
            this.plugin.settings.username = value.replace(/\s+/g, "");
            await this.plugin.saveSettings();
          })
      )
      .then(setting => {
        setting.descEl.createEl("br");
        setting.descEl.createEl(
          "a",
          {
            text: "Click here for information about Premium Access",
            href:
              "https://github.com/Clemens-E/obsidian-languagetool-plugin#premium-accounts"
          },
          a => {
            a.setAttr("target", "_blank");
          }
        );
      });
    const apiKeySetting = new Setting(containerEl).setName("API Key");
    const useSecretStorage =
      this.plugin.settings.apiKeyStorage === "secret" &&
      this.plugin.isSecretStorageAvailable();
    if (useSecretStorage) {
      apiKeySetting
        .setDesc(
          "Select or create a secret in Obsidian's SecretStorage. Stored encrypted on this device only."
        )
        .addComponent(el =>
          new SecretComponent(this.app, el)
            .setValue(this.plugin.settings.apikeySecretName ?? "")
            .onChange(async value => {
              this.plugin.settings.apikeySecretName = value;
              await this.plugin.saveSettings();
              this.maybeWarnNonPremium(
                value.length > 0,
                urlDropdown,
                () => {
                  disableUrlPopup = true;
                },
                disableUrlPopup
              );
            })
        );
    } else {
      apiKeySetting.setDesc("Enter an API Key").addText(text =>
        text
          .setValue(this.plugin.settings.apikey ?? "")
          .onChange(async value => {
            this.plugin.settings.apikey = value.replace(/\s+/g, "");
            await this.plugin.saveSettings();
            this.maybeWarnNonPremium(
              this.plugin.settings.apikey.length > 0,
              urlDropdown,
              () => {
                disableUrlPopup = true;
              },
              disableUrlPopup
            );
          })
      );
    }
    apiKeySetting.then(setting => {
      setting.descEl.createEl("br");
      setting.descEl.createEl(
        "a",
        {
          text: "Click here for information about Premium Access",
          href:
            "https://github.com/Clemens-E/obsidian-languagetool-plugin#premium-accounts"
        },
        a => {
          a.setAttr("target", "_blank");
        }
      );
    });
    new Setting(containerEl)
      .setName("Store API key securely (this device only)")
      .setDesc(
        "Store your API key in Obsidian's encrypted SecretStorage instead of in plaintext in data.json. Secrets are not synced across devices, so you'll need to set your key once on each device. Your username stays in your synced settings."
      )
      .addToggle(component => {
        const available = this.plugin.isSecretStorageAvailable();
        component
          .setValue(this.plugin.settings.apiKeyStorage === "secret")
          .setDisabled(!available)
          .onChange(async value => {
            if (value) {
              const hadPlaintextKey = Boolean(this.plugin.settings.apikey);
              await this.plugin.enableSecretStorage();
              new Notice(
                hadPlaintextKey
                  ? "API key moved to secure storage on this device. It will not sync to your other devices."
                  : "Secure storage enabled. Select or create a secret for your API key in the setting above.",
                5000
              );
            } else {
              await this.plugin.disableSecretStorage();
            }
            // Re-render so the API key setting matches the storage mode that
            // actually took effect (a disable may be refused when the secret
            // is not set on this device).
            this.display();
          });
      })
      .then(setting => {
        setting.descEl.createEl("br");
        setting.descEl.createEl(
          "a",
          {
            text: "Read about the trade-offs of both storage options",
            href:
              "https://github.com/Clemens-E/obsidian-languagetool-plugin#api-key-storage-synced-plaintext-vs-secure-storage"
          },
          a => {
            a.setAttr("target", "_blank");
          }
        );
        if (!this.plugin.isSecretStorageAvailable()) {
          setting.descEl.createEl("br");
          setting.descEl.createEl("span", {
            text:
              "Not available on this device (requires Obsidian 1.11.4 or newer).",
            attr: { style: "color: var(--text-error)" }
          });
        }
      });
    new Setting(containerEl)
      .setName("Autocheck Text")
      .setDesc("Check text as you type")
      .addToggle(component => {
        component
          .setValue(this.plugin.settings.shouldAutoCheck)
          .onChange(async value => {
            this.plugin.settings.shouldAutoCheck = value;
            await this.plugin.saveSettings();
          });
      });
    new Setting(containerEl)
      .setName("AutoCheck Delay (ms)")
      .setDesc("Length of time to wait for AutoCheck after last key press")
      .addSlider(component => {
        autoCheckDelaySlider = component;
        if (urlDropdown) {
          this.configureAutoCheckDelaySlider(
            autoCheckDelaySlider,
            urlDropdown.getValue()
          );
        }

        component
          .setValue(this.plugin.settings.autoCheckDelay)
          .onChange(async value => {
            this.plugin.settings.autoCheckDelay = value;
            await this.plugin.saveSettings();
          });

        component.setDynamicTooltip();
      });
    new Setting(containerEl)
      .setName("Glass Background")
      .setDesc(
        "Use the secondary background color of the theme or a glass background"
      )
      .addToggle(component => {
        component
          .setValue(this.plugin.settings.glassBg)
          .onChange(async value => {
            this.plugin.settings.glassBg = value;
            await this.plugin.saveSettings();
          });
      });
    let staticLanguageComponent: DropdownComponent | null;
    let englishVarietyDropdown: DropdownComponent | null;
    let germanVarietyDropdown: DropdownComponent | null;
    let portugueseVarietyDropdown: DropdownComponent | null;
    let catalanVarietyDropdown: DropdownComponent | null;

    new Setting(containerEl)
      .setName("Static Language")
      .setDesc(
        "Set a static language that will always be used (LanguageTool tries to auto detect the language, this is usually not necessary)"
      )
      .addDropdown(component => {
        staticLanguageComponent = component;
        this.requestLanguages()
          .then(languages => {
            component.addOption("auto", "Auto Detect");
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            languages!.forEach(v => component.addOption(v.longCode, v.name));
            component.setValue(this.plugin.settings.staticLanguage ?? "auto");
            component.onChange(async value => {
              this.plugin.settings.staticLanguage = value;
              if (value !== "auto") {
                this.plugin.settings.englishVeriety = undefined;
                englishVarietyDropdown?.setValue("default");
                this.plugin.settings.germanVeriety = undefined;
                germanVarietyDropdown?.setValue("default");
                this.plugin.settings.portugueseVeriety = undefined;
                portugueseVarietyDropdown?.setValue("default");
                this.plugin.settings.catalanVeriety = undefined;
                catalanVarietyDropdown?.setValue("default");
              }
              await this.plugin.saveSettings();
            });
          })
          .catch(console.error);
      });

    new Setting(containerEl)
      .setName("Mother Tongue")
      .setDesc(
        "Set the language you are most comfortable with. This will be used to interpret the language you are writing in"
      )
      .addDropdown(component => {
        this.requestLanguages()
          .then(languages => {
            component.addOption("empty", "");
            languages!.forEach(v => component.addOption(v.longCode, v.name));
            component.onChange(async value => {
              this.plugin.settings.motherTongue = value;
              component.setValue(this.plugin.settings.motherTongue ?? "");

              await this.plugin.saveSettings();
            });
          })
          .catch(console.error);
      });

    containerEl.createEl("h3", { text: "Language Varieties" });

    containerEl.createEl("p", {
      text:
        "Some languages have varieties depending on the country they are spoken in."
    });

    new Setting(containerEl)
      .setName("Interpret English as")
      .addDropdown(component => {
        englishVarietyDropdown = component;
        component
          .addOptions({
            default: "---",
            "en-US": "English (US)",
            "en-GB": "English (British)",
            "en-CA": "English (Canada)",
            "en-AU": "English (Australia)",
            "en-ZA": "English (South Africa)",
            "en-NZ": "English (New Zealand)"
          })
          .setValue(this.plugin.settings.englishVeriety ?? "default")
          .onChange(async value => {
            if (value === "default") {
              this.plugin.settings.englishVeriety = undefined;
            } else {
              this.plugin.settings.staticLanguage = "auto";
              staticLanguageComponent?.setValue("auto");
              this.plugin.settings.englishVeriety = value as
                | "en-US"
                | "en-GB"
                | "en-CA"
                | "en-AU"
                | "en-ZA"
                | "en-NZ";
            }
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Interpret German as")
      .addDropdown(component => {
        germanVarietyDropdown = component;
        component
          .addOptions({
            default: "---",
            "de-DE": "German (Germany)",
            "de-CH": "German (Switzerland)",
            "de-AT": "German (Austria)"
          })
          .setValue(this.plugin.settings.germanVeriety ?? "default")
          .onChange(async value => {
            if (value === "default") {
              this.plugin.settings.germanVeriety = undefined;
            } else {
              this.plugin.settings.staticLanguage = "auto";
              staticLanguageComponent?.setValue("auto");
              this.plugin.settings.germanVeriety = value as
                | "de-DE"
                | "de-CH"
                | "de-AT";
            }
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Interpret Portuguese as")
      .addDropdown(component => {
        portugueseVarietyDropdown = component;
        component
          .addOptions({
            default: "---",
            "pt-BR": "Portuguese (Brazil)",
            "pt-PT": "Portuguese (Portugal)",
            "pt-AO": "Portuguese (Angola)",
            "pt-MZ": "Portuguese (Mozambique)"
          })
          .setValue(this.plugin.settings.portugueseVeriety ?? "default")
          .onChange(async value => {
            if (value === "default") {
              this.plugin.settings.portugueseVeriety = undefined;
            } else {
              this.plugin.settings.staticLanguage = "auto";
              staticLanguageComponent?.setValue("auto");
              this.plugin.settings.portugueseVeriety = value as
                | "pt-BR"
                | "pt-PT"
                | "pt-AO"
                | "pt-MZ";
            }
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Interpret Catalan as")
      .addDropdown(component => {
        catalanVarietyDropdown = component;
        component
          .addOptions({
            default: "---",
            "ca-ES": "Catalan",
            "ca-ES-valencia": "Catalan (Valencian)"
          })
          .setValue(this.plugin.settings.catalanVeriety ?? "default")
          .onChange(async value => {
            if (value === "default") {
              this.plugin.settings.catalanVeriety = undefined;
            } else {
              this.plugin.settings.staticLanguage = "auto";
              staticLanguageComponent?.setValue("auto");
              this.plugin.settings.catalanVeriety = value as
                | "ca-ES"
                | "ca-ES-valencia";
            }
            await this.plugin.saveSettings();
          });
      });

    containerEl.createEl("h3", { text: "Rule Categories" });

    new Setting(containerEl)
      .setName("Picky Mode")
      .setDesc(
        "Provides more style and tonality suggestions, detects long or complex sentences, recognizes colloquialism and redundancies, proactively suggests synonyms for commonly overused words"
      )
      .addToggle(component => {
        component
          .setValue(this.plugin.settings.pickyMode)
          .onChange(async value => {
            this.plugin.settings.pickyMode = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Other rule categories")
      .setDesc("Enter a comma-separated list of categories")
      .addText(text =>
        text
          .setPlaceholder("Eg. CATEGORY_1,CATEGORY_2")
          .setValue(this.plugin.settings.ruleOtherCategories ?? "")
          .onChange(async value => {
            this.plugin.settings.ruleOtherCategories = value.replace(
              /\s+/g,
              ""
            );
            await this.plugin.saveSettings();
          })
      )
      .then(setting => {
        setting.descEl.createEl("br");
        setting.descEl.createEl(
          "a",
          {
            text: "Click here for a list of rules and categories",
            href: "https://community.languagetool.org/rule/list"
          },
          a => {
            a.setAttr("target", "_blank");
          }
        );
      });

    new Setting(containerEl)
      .setName("Enable Specific Rules")
      .setDesc("Enter a comma-separated list of rules")
      .addText(text =>
        text
          .setPlaceholder("Eg. RULE_1,RULE_2")
          .setValue(this.plugin.settings.ruleOtherRules ?? "")
          .onChange(async value => {
            this.plugin.settings.ruleOtherRules = value.replace(/\s+/g, "");
            await this.plugin.saveSettings();
          })
      )
      .then(setting => {
        setting.descEl.createEl("br");
        setting.descEl.createEl(
          "a",
          {
            text: "Click here for a list of rules and categories",
            href: "https://community.languagetool.org/rule/list"
          },
          a => {
            a.setAttr("target", "_blank");
          }
        );
      });

    new Setting(containerEl)
      .setName("Disable Specific Rules")
      .setDesc("Enter a comma-separated list of rules")
      .addText(text =>
        text
          .setPlaceholder("Eg. RULE_1,RULE_2")
          .setValue(this.plugin.settings.ruleOtherDisabledRules ?? "")
          .onChange(async value => {
            this.plugin.settings.ruleOtherDisabledRules = value.replace(
              /\s+/g,
              ""
            );
            await this.plugin.saveSettings();
          })
      )
      .then(setting => {
        setting.descEl.createEl("br");
        setting.descEl.createEl(
          "a",
          {
            text: "Click here for a list of rules and categories",
            href: "https://community.languagetool.org/rule/list"
          },
          a => {
            a.setAttr("target", "_blank");
          }
        );
      });
  }
}
