# Obsidian LanguageTool Plugin

This is a plugin for [Obsidian.md](https://obsidian.md) that integrates [LanguageTool](https://languagetool.org/).

Note: if you are worried about the privacy of your notes you should selfhost languagetool, whether it be locally on your pc or on a server
[Docker Image](https://hub.docker.com/r/erikvl87/languagetool)

If you decide to self host the service, you need to change the link in the configuration accordingly.

## Usage

1. Add a Shortcut to the "Check Text" action.
2. Select lines you want to check (if there are no lines selected it will check the whole file)
3. Use your shortcut
4. Press on an underlined Word to open the popover and see the explanation and possible fixes

## Premium Accounts
*As far as I know*, it is not possible to use the premium features.
This is something that *can't* be implemented into this plugin.
For you to use the premium features, you need an API Key to the Premium API\
See details about that:
- https://languagetool.org/editor/settings/api
- https://languagetool.org/proofreading-api
- https://github.com/Clemens-E/obsidian-languagetool-plugin/issues/8#issuecomment-841726725

[a user commented](https://github.com/Clemens-E/obsidian-languagetool-plugin/issues/32#issuecomment-914673449) thats its possible to receive API access by requesting it,
but I dont know if this is really possible. I dont have Language Tool Premium


## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` from the latest release to your vault `VaultFolder/.obsidian/plugins/obsidian-languagetool-plugin/`.

# Demo

![demo](/demos/Demo1.png)
