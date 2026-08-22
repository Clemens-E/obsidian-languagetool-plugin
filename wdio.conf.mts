import * as path from "path";
import { parseObsidianVersions } from "wdio-obsidian-service";
import { env } from "process";

// wdio-obsidian-service downloads Obsidian versions into this directory
const cacheDir = path.resolve(".obsidian-cache");

// "appVersion/installerVersion" pairs, space separated. Override with e.g.
// OBSIDIAN_VERSIONS="earliest/earliest latest/latest" to test a matrix.
const versions = await parseObsidianVersions(
  env.OBSIDIAN_VERSIONS ?? "latest/latest",
  { cacheDir }
);

if (env.CI) {
  // The resolved versions serve as the cache key for .obsidian-cache in the
  // GitHub Actions workflow
  console.log("obsidian-cache-key:", JSON.stringify(versions));
}

export const config: WebdriverIO.Config = {
  runner: "local",
  framework: "mocha",

  specs: ["./test/specs/**/*.e2e.ts"],

  maxInstances: Number(env.WDIO_MAX_INSTANCES || 1),

  capabilities: versions.map<WebdriverIO.Capabilities>(
    ([appVersion, installerVersion]) => ({
      browserName: "obsidian",
      "wdio:obsidianOptions": {
        appVersion,
        installerVersion,
        plugins: ["."],
        vault: "test/vaults/simple"
      }
    })
  ),

  services: ["obsidian"],
  // spec-reporter wrapper that shows the Obsidian version instead of the
  // Chromium version
  reporters: ["obsidian"],

  mochaOpts: {
    ui: "bdd",
    timeout: 60 * 1000
  },
  waitforInterval: 250,
  waitforTimeout: 15 * 1000,
  logLevel: "warn",

  cacheDir,

  injectGlobals: false
};
