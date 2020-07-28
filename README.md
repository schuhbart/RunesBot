# RunesBot
A Twitch.tv bot that handles custom channel point rewards and uses the Riot Games API to retrieve live game rune information.

# Setup
1. Install Node.js from https://nodejs.org/en/.
2. Install tmi.js and request.js with the console commands `npm install tmi.js` and `npm install request.js`.
3. Replace the six fields in bot_definitions.json with actual values. You can get a Riot API key from https://developer.riotgames.com/ and a Twitch OAuth token from https://twitchapps.com/tmi/.
4. Download the League of Legends static data from https://ddragon.leagueoflegends.com/cdn/dragontail-VERSION.tgz. In the URL replace VERSION with the first entry in https://ddragon.leagueoflegends.com/api/versions.json. For patch 9.11 the URL would be https://ddragon.leagueoflegends.com/cdn/dragontail-9.11.1.tgz.
5. Extract the static data archive and move the file dragontail-VERSION\VERSION\data\en_US\runesReforged.json to the source directory where bot.js is located.
6. Run the bot with `node bot.js`.
