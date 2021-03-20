# Obsidian LanguageTool Plugin

This is a plugin for [Obsidian.md](https://obsidian.md) that integrates [LanguageTool](https://languagetool.org/).

Note: if you are worried about the privacy of your notes you should selfhost languagetool, wether it be locally on your pc or on a server
[Docker Image](https://hub.docker.com/r/erikvl87/languagetool)

If you decide to self host the service, you need to change the link in the configuration accordingly.

## Usage

1. Add a Shortcut to the "Check Text" action.
2. Select lines you want to check (if there are no lines selected it will check the whole file)
3. Use your shortcut
4. Press on an underlined Word to open the popover and see the explanation and possible fixes

## WIP

This Plugin is still very young with not too much time spent on it, so there are a few (known?) bugs, you can help by reporting them on discord/issue tracker and maybe even contributing yourself.

### todo:

- differ between rules (yellow, red and purple markers like languagetool)
- allow users to ignore rules

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` from the latest release to your vault `VaultFolder/.obsidian/plugins/obsidian-languagetool-plugin/`.

# Demo

![](/demos/demo1.png)
