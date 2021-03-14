## Obsidian LanguageTool Plugin

This is simple plugin for Obsidian.md (https://obsidian.md).

This uses the API at https://languagetool.org/

I would recommend if possible to self host languagetool if possible. Either on a local docker instance or on a VPS or dedicated Server.

[Link to Docker](https://hub.docker.com/r/erikvl87/languagetool "https://hub.docker.com/r/erikvl87/languagetool")

If you decide to self host the service, change the link in the configuration accordingly:

![Settings tab](/Settings.png "Here you can change the URL the requests are sent to.")

# WIP
You may experience some bugs while using this plugin. This version does currently not fully represent the final version. There will be some bug fixes coming in the future.

## Usage

1. Add a Shortcut to the "Check Text" action.
2. Select lines you want to check (if there are no lines selected it will check the whole file)
3. Use your shortcut
4. Press on an underlined Word to get a suggestions or hover over the suggestion to get an explanation

### Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` from the latest release to your vault `VaultFolder/.obsidian/plugins/obsidian-languagetool-plugin/`.



# Usage Demo (using Obsidian's Quick Search feature)

![Text](/Demo1.png "Here you can see some random text.")

![Text](/Demo2.png "Press [Shift + P] to open up the Quick Search and enter Language Tool")

![Text](/Demo3.png "Now all text areas with grammatical errors or with improvement suggestions will be underlined.")

![Text](/Demo.gif "A quick showcase on how to interact with the suggestions.")