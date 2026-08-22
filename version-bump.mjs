// Bump the plugin version for a release.
//
// Usage: node version-bump.mjs <patch|minor|major|x.y.z>
//
// Updates the version in manifest.json and records the release's
// minAppVersion in versions.json, then prints the new version to stdout.
import { readFileSync, writeFileSync } from "node:fs";

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node version-bump.mjs <patch|minor|major|x.y.z>");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));

let newVersion;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  newVersion = arg;
} else {
  const [major, minor, patch] = manifest.version.split(".").map(Number);
  if (arg === "major") {
    newVersion = `${major + 1}.0.0`;
  } else if (arg === "minor") {
    newVersion = `${major}.${minor + 1}.0`;
  } else if (arg === "patch") {
    newVersion = `${major}.${minor}.${patch + 1}`;
  } else {
    console.error(`unknown bump type "${arg}"`);
    process.exit(1);
  }
}

manifest.version = newVersion;
writeFileSync("manifest.json", `${JSON.stringify(manifest, null, "\t")}\n`);

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[newVersion] = manifest.minAppVersion;
writeFileSync("versions.json", `${JSON.stringify(versions, null, "\t")}\n`);

console.log(newVersion);
