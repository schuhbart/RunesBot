const tmi = require('tmi.js');
const request = require('request');

// The bot requires two files to be placed in the same folder: 
// A bot_definitions.json file with the following fields: 
/* { 
    "RiotKey": <Riot Api key>, 
    "TwitchUserName": <User name of the bot>, 
    "TwitchOAuthToken": <Twitch OAuth token of the bot>, 
    "TwitchChannel": <Channel name that the bot will connect to>, 
    "DefaultName": <Default name used for the !runes command>, 
    "DefaultRegion": <Default region used for the !runes command>
} */
const fs = require("fs");
if (!fs.existsSync("./bot_definitions.json")) fs.writeFileSync("./bot_definitions.json", JSON.stringify({}));
var bot_definitions = require('./bot_definitions.json')
const lib = require("./lib.js");

const credential_prompts = {
    TwitchUserName: "Enter the Twitch username of the account the bot will use:",
    TwitchOAuthToken: "Please go to https://twitchapps.com/tmi/, sign in with the bots account and copy paste the part after \"oauth:\"",
    TwitchChannel: "Enter the twitch channel the bot will be in:",
    TwitchUserName: "Enter the name of your account"



}


const LeagueHandler = require('./league_handler.js');
const league_handler = new LeagueHandler();

// And the runesReforged.json file from Riot's static data
var json = require('./runesReforged.json');




var last_message_sender = "";

// Define configuration options
const opts = {
    identity: {
        username: bot_definitions["TwitchUserName"],
        password: bot_definitions["TwitchOAuthToken"]
    },
    channels: [
        bot_definitions["TwitchChannel"]
    ]
};
    
const admin_config = {
    identity: {
        username: bot_definitions["TwitchChannel"],
        password: bot_definitions["AdminToken"]
    },
    channels: [
        bot_definitions["TwitchChannel"]
    ]
};

var id_cache = []; 
var key_valid = true;
const error_code = -1;
var twitch_channel = bot_definitions["TwitchChannel"];
var twitch_channel_target = "#" + twitch_channel;


// Champion list for converting champion name to id 
const champions = require('./champion.json')


function championNameToID(name) {
    name = name.toLowerCase()
    name = name.replace(name[0], name.toUpperCase()[0])
    return name;
}
 
// Region lookup table
var regions = {'br': 'br1', 'eune': 'eun1', 'euw': 'euw1', 'jp': 'jp1', 'kr': 'kr', 'lan': 'la1', 'las': 'la2', 'na': 'na1', 'oce': 'oc1', 'tr': 'tr1', 'ru': 'ru', 'pbe': 'pbe1'}

var key = bot_definitions["RiotKey"];
var default_names = bot_definitions["DefaultName"];
const rank_name = default_names;
var default_region = bot_definitions["DefaultRegion"];

function normalizeName(name) {
    return name.toUpperCase().replace(/\s+/g, '');
}

function isRegion(region) {
    if (region.toLowerCase() in regions) return true;
    else return false;
}

function getRegion(region) {
    //console.log("called getRegion on " + region);
    return regions[region.toString().toLowerCase()];
    console.log("success");
}

function getRuneById(id) {
    var name = 'Undefined';
    json.forEach(function(tree) {
        tree.slots.forEach(function(slot) {
            slot.runes.forEach(function(rune) {
                if(rune.id == id) {
                    name = rune.name;
                }
            })
        })
    })
    return name;
}

function getSummonerId(summoner_name_, region, callback) {
    //console.log("called getsummoners id with name", summoner_name_, "and region", region)
    var summoner_name = normalizeName(summoner_name_);
    if (summoner_name in id_cache){
        console.log("found name " + summoner_name + " in cache");
        callback(id_cache[summoner_name]["id"], id_cache[summoner_name]["name"]);
    } else { 
        //console.log("looking up " + summoner_name);
        var getId = {
            url: 'https://' + getRegion(region) + '.api.riotgames.com/lol/summoner/v4/summoners/by-name/' + summoner_name,
            headers: {
                'X-Riot-Token': key
            }
        }
        request(getId, function (error, response, body) {
            if (body != undefined) {        
                var info = JSON.parse(body);
                if (info.status == undefined) {          
                    var summoner_id = info.id;
                    var exact_summoner_name = info.name;
                    if (exact_summoner_name[exact_summoner_name.length - 1] == " ") {
                            exact_summoner_name = exact_summoner_name.slice(0, exact_summoner_name.length-1);
                    }
                    id_cache[summoner_name] = {"id": summoner_id, "name": exact_summoner_name}
                    callback(summoner_id, exact_summoner_name);        
                } else if (info.status.status_code == '403') {
                            key_valid = false;
                            console.log('------- invalid key ---------');
                } 
            } else {      
                console.log("--- undefined body for getsummonerid request ----", getId)  
                callback(error_code, null);
            }      
        });
    }
}

function getRank(name, region, callback) {
    console.log("Getting rank for " + name + ", " + region);
    getSummonerId(name, region, function(summoner_id, exact_summoner_name) {
        var get_rank = {
            url : 'https://' + getRegion(region) + '.api.riotgames.com/lol/league/v4/entries/by-summoner/' + summoner_id,
            headers: {
                'X-Riot-Token': key
            }
        }
        //console.log(get_rank.url);
        request(get_rank, function(error, response, body) {
            //console.log(body);
            var json = JSON.parse(body);
            //console.log(json);
            //console.log("---------");
            var rank;        
            var unranked = true;
            if (json[0] != undefined) {
                var tier = json[0]["tier"];
                tier = tier[0] + tier.slice(1, tier.length).toLowerCase();
                rank = tier + " " + json[0]["rank"] + " " + json[0]["leaguePoints"] + " LP";
                //console.log(rank);
                //console.log(string)
                unranked = false;
            } else {
                    rank = "unranked"
            }        
            var string = exact_summoner_name + " is " + rank
            //console.log("exact sum name is [" + exact_summoner_name + "]");
            //console.log("callback at start",callback);
            callback(string, unranked);
            //console.log(string)
        })
    })
}

function getStreamerRank(callback, index = 0, total_string = "") {
    if (index < default_names.length) {        
            //console.log("looking up rank for " + default_names[index])
            getRank(default_names[index], default_region, function(string, unranked){
                    if (!unranked) {
                            if (total_string != "") {
                                    total_string += ", ";
                            }
                            total_string += string;
                            //console.log("string is " + string + ", total string is now " + total_string)
                    }
                    index++;
                    getStreamerRank(callback, index, total_string);
            });
    } else {
            callback(total_string);
    }
}

// Takes a list of rune IDs and produces a formatted string
function formatRunes(runeIds) {
    var runes = "[";
    for (var i = 0; i < 3; i++) {
        runes += getRuneById(runeIds[i]) + ' / ';
    }
    runes += getRuneById(runeIds[3]) + '] + [';
    runes += getRuneById(runeIds[4]) + ' / ';
    runes += getRuneById(runeIds[5]) + ']';
    return runes;
}

// Filter function that gets the target summoner from the 10 summoners in the game
function getParticipant(summoner_name) {
    return function (participant) {
        var participant_name = normalizeName(participant.summonerName)
        return participant_name == normalizeName(summoner_name);
    }
}


// Get the formatted rune string for target summoner
function getRunes(summoner_name_param, region, callback) {
    getSummonerId(summoner_name_param, region, function (summoner_id, exact_summoner_name) {
        console.log("summoner id: ", summoner_id)
        var summoner_name = exact_summoner_name;
        var getMatch = {
            url: 'https://' + getRegion(region) + '.api.riotgames.com/lol/spectator/v4/active-games/by-summoner/' + summoner_id,
            headers: {
                'X-Riot-Token': key
            }
        }
        console.log("id", summoner_id);
        var runes = summoner_name + ' is currently not ingame.'
        var success = false;
        request(getMatch, function (error, response, body) {
            console.log('Getting match data for summoner', summoner_name);
            var info = JSON.parse(body);
            if (typeof info !== "undefined") {
                if (typeof info.participants !== "undefined") {
                    success = true;
                    var player = info.participants.filter(getParticipant(summoner_name))[0];
                    console.log("player", player);
                    runeIds = player.perks.perkIds;
                    runes = "Current runes for " + summoner_name + " are: " + formatRunes(runeIds);
                } else {
                    //console.log('participants undefined');
                }
            } else {
                //console.log('info undefined');
            }
            console.log(callback)
            callback(runes, success)
        });
    });
}

function getStreamerRunes(callback, index = 0) {
    getRunes(default_names[index], default_region, function(runes, success) {
        index++;
        if (success == true) {
            callback(runes, true); 
        } else if (index < default_names.length) {
            getStreamerRunes(callback, index) 
        } else {
            callback(undefined, false);
        }
    })
}
/*

getSummonerId("schuhBart", "euw", function(id, name) {
    console.log(id, name);
})

getSummonerId("schuhBart", "euw", function(id, name) {
    console.log(id, name);
})

getSummonerId("duaiistdusk", "euw", function(id, name) {
    console.log(id, name);
})

setTimeout(function(){
    getSummonerId("schuh barT", "euw", function(id, name) {
        console.log(id, name);
    })
}, 2000);

*/
// Create a client with our options
const client = new tmi.client(opts);
var admin_client;
if ("AdminToken" in bot_definitions) admin_client = new tmi.client(admin_config);

// Register our event handlers (defined below)
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

client.on('join', onJoinHandler);
client.on('part', onPartHandler);

client.on("raw_message", onRawMessagehandler);

// Id of the custom timeout rewards
const timeout_id_60 = "93dd8a68-3a7c-4835-8f3a-bb26161186dd";
const timeout_id_300 = "9475aff6-3be7-4637-8baa-b21b92a379f0";
const timeout_id_gamble = "6620386e-b2e6-4afa-b5ae-06e9d6c8eafb";
const timeout_mod_60 = "d77b5727-0d90-4906-9029-18cec6193cb3";
const timeout_mod_300 = "9c836494-faed-4cb1-91b7-8913a6e0b229";


const gamble_const = 321908382109321;


const timeout_ids = {[timeout_id_60]: 60, [timeout_id_300]: 300, [timeout_id_gamble]: gamble_const}
const timeout_mod_ids = {[timeout_mod_60]: 60, [timeout_mod_300]: 300} 
//console.log(timeout_ids);



function onJoinHandler(channel, username, self) {
    var current_time = Date.now()
    fs.appendFileSync("log.txt", "[" + current_time + "]" + username + " joined\n");
}

function onPartHandler(channel, username, self) {
    var current_time = Date.now()
    fs.appendFileSync("log.txt", "[" + current_time + "]" + username + " left\n");
}

// returns a random number between start and end
function getRandomNum(start, end) {
    if (end > start) {
        var range = end - start
        var random_num = Math.floor(Math.random() * range);
        return random_num + start;
    } else {
        return start
    }
}

// inflates the number a random amount up to the maximum (inclusive)
function inflateResult(number, max) {
    var range = max - number;
    var returnval = number + Math.round(Math.random() * range)
    return returnval;
}

// rolls a number so that the chances of rolling under the cutoff are equal to the given odds
function rollWithOdds(min, cutoff, odds) {
    var ratio = odds / (1 - odds);
    var max = cutoff + ((cutoff - min) * ratio);
    var precision = 1000;
    var scaled_min = Math.floor(min * precision);
    var scaled_max = Math.floor(max * precision);
    var scaled_roll = getRandomNum(scaled_min, scaled_max);
    var roll = Math.floor(scaled_roll / precision);  
    //console.log(min, cutoff, odds, max, scaled_min, scaled_max, scaled_roll, roll);
    return roll;
}

//var t_s = 0;
//var t_f = 0;
var mod_c = 0;
var n_c = 0;


function timeoutTargetRandom(target_name) {
    isTargetMod(target_name).then(is_mod => {    
        var min = 1;
        if (is_mod) {      
            mod_c++;
            var cutoff = 14;
            var chance = 0.033; 
            var result = rollWithOdds(min, cutoff, chance);
            console.log(target_name + "is mod");
            if (result >= cutoff) {
                //t_s++;
                duration = getRandomNum(1, 40);
                console.log("timed out moderator for " + duration + " seconds");
                timeoutTargetMod(target_name, duration);
            } else {
                //t_f++;
                console.log(twitch_channel_target, "Rolled a " + inflateResult(result, cutoff - 1) + " out of the required " + cutoff + " to time out a mod, nice try!");
                client.say(twitch_channel_target, "Rolled a " + inflateResult(result, cutoff - 1) + " out of the required " + cutoff + ", nice try!");
            }
        } else {    
            n_c++;  
            var cutoff = 10;
            var chance = 0.3333; 
            var result = rollWithOdds(min, cutoff, chance);
            if (result >= cutoff) {
                //t_s++;
                duration = getRandomNum(1, 100);
                console.log("timed out for " + duration + " seconds");
                timeoutWrapper(bot_definitions["TwitchChannel"], target_name, duration);
            } else {
                //t_f++;
                var channel_name = "#" + bot_definitions["TwitchChannel"];
                //console.log(channel_name, "Rolled a " + inflateResult(result, cutoff - 1) + " out of the required " + cutoff + ", nice try!");
                client.say(channel_name, "Rolled a " + inflateResult(result, cutoff - 1) + " out of the required " + cutoff + ", nice try!");
            }
        }
    })
}


function timeoutWrapper(channel, target_name, duration) {
    if (!(target_name in remod_list)) {
        client.timeout(channel, target_name, duration).then(() => {      
            console.log("timed out", target_name, "for", duration, "seconds");
        }).catch((err) => {
            console.log("failed to time out user " + target_name + " with error", err);
            //client.say("#" + channel, "Invalid target. If you were trying to time out a moderator you need to redeem the more expensive reward. Hope you didn't need those points!")
        });
    }
}

function timeoutTarget(target_name, duration) {
    if (duration == gamble_const) {
        timeoutTargetRandom(target_name) 
    } else {
        timeoutWrapper(bot_definitions["TwitchChannel"], target_name, duration)
    }
}

var remod_list = {};

function timeoutTargetMod(target_name, duration) {
    console.log("called timeoutTargetMod on " + target_name + " for duration " + duration);
    // put target on list of people to be remodded, back up list to file, unmod target, periodically check if there are users to mod again 
    if (target_name.toLowerCase() == twitch_channel.toLowerCase()) {
        client.say(twitch_channel_target, "good effort");
    }
    else if (target_name.toLowerCase() == bot_definitions["TwitchUserName"].toLowerCase()) {
        client.say(twitch_channel_target, "wtf man");
    } else {
        var current_time = Date.now();
        var timeout_end = current_time + (duration * 1000);
     /* remod_target = {[target_name]: timeout_end};
        remod_list.push(remod_target);
        remod_list.push(remod_target);*/
        var already_unmodded = false;
        var longer_timeout_present = false;
        if (target_name in remod_list) {
            if (remod_list[target_name] > timeout_end) {
                longer_timeout_present = true;
            } else {      
                remod_list[target_name] = Math.max(remod_list[target_name], timeout_end);
            }
            already_unmodded = true;
        }
        remod_list[target_name] = timeout_end;
        console.log("remod list", remod_list);
        var remod_list_json = JSON.stringify(remod_list);
        fs.writeFile("remod_list.json", remod_list_json, function() {    
            /*fs.readFile("remod_list.json", 'utf8', function(err, read_list) {
                console.log("read list", read_list);
            })*/
        })
        if (!already_unmodded) {
            admin_client.unmod(twitch_channel, target_name).then(
                () => {
                    console.log("unmodded " + target_name);
                    if (!longer_timeout_present) {
                        console.log("timing out " + target_name + " for " + duration);
                        client.timeout(twitch_channel, target_name, duration).catch(err => {console.log("------ timeout mod failed: " + err)});
                    }
                }
            ).catch(err => {console.log("------------------------------ unmod failed: ", err)});
        } else {
            if (!longer_timeout_present) {
                client.timeout(twitch_channel, target_name, duration).catch(err => {console.log("------ timeout mod failed: " + err)});
            }
        }
    }
}

function checkForRemod() {
    if (!"AdminToken" in bot_definitions) return
    var current_time = Date.now()
    for (let user in remod_list) {
        if (remod_list[user] < current_time) {
            
    console.log("checking for remod on list: " ,remod_list);
            console.log("timeout for user " + user + " has ended, remodding him");
            admin_client.mod(twitch_channel, user).then(() => {
                mod_list.push(user);
                console.log("added user " + user + " to mod list: " + mod_list);
                delete remod_list[user];        
                console.log("user should now be undefined: " + remod_list[user]);
            }).catch(err => {
                console.log(err);
            }); 
        }
    }
    var remod_list_json = JSON.stringify(remod_list)
    fs.writeFileSync("remod_list.json", remod_list_json)
}


async function isTargetMod(target_name) {
    console.log("called isTargetMod on " + target_name);
    var temp_unmodded = (target_name in remod_list); 
    if (mod_list !== undefined) {
        var current_mod = mod_list.includes(target_name.toLowerCase());
        console.log("remod list in isTargetMod is", remod_list);
        console.log("status for " + target_name + ": current mod = " + current_mod + ", temp unmod = " + temp_unmodded);
        if (current_mod || temp_unmodded) {
            return true;
        } else {
            return false;
        }
    } 
    console.log("Mod list has not been initialized yet");
    return false;
}


function handleTimeoutMod(target_name, duration) {  
    console.log("called mod timeout handler on " + target_name);
    isTargetMod(target_name).then(is_mod => {
        if (is_mod) {
            console.log(target_name + " apparently is mod, calling mod timeout function");
            timeoutTargetMod(target_name, duration);
        } else { 
            client.say(twitch_channel_target, target_name + " isn't even a mod. Weird flex but okay");
            timeoutTarget(target_name, duration);
        }
    })
}

function onRawMessagehandler(messageCloned, message) {
    var custom_reward_id = messageCloned["tags"]["custom-reward-id"]
    var target_name = messageCloned["params"][1]
    if (target_name != undefined) {
        target_name = target_name.replace("@", "");
    }
    if(custom_reward_id in timeout_ids) {
        timeoutTarget(target_name, timeout_ids[custom_reward_id]);
    } else if (custom_reward_id in timeout_mod_ids) {
        handleTimeoutMod(target_name, timeout_mod_ids[custom_reward_id]);
    }
}

// Connect to Twitch:
var client_connected = client.connect()
var admin_connected = admin_client.connect()
var mod_list;




// initialize lolpros.gg scraper
const Scraper = require('./scraper.js')
const scraper = new Scraper()


async function lolprosChampionLookup(name) {
    var response = await league_handler.getCurrentGameChampionPlayer(name);
    if (response.status == league_handler.NOT_INGAME) return "Currently not ingame.";
    else if (response.status == league_handler.CHAMPION_NOT_FOUND) return "No champion with the name " + name
        + " was found in the current game.";
    else if (response.status == league_handler.QUERY_SUCCESS) {
        var match = await scraper.getExactMatch(response.name);
        return "[" + response.champion_name + "] " + match.string;
    }
}

async function updateModList() {
    await client.mods(twitch_channel).then(result => {mod_list = result}).catch(err => {console.log("no response in .mods: " + err)});
}

async function init() {
    await client_connected;
    await admin_connected; 
    scraper.init();

    fs.readFile("remod_list.json", 'utf8', async function(err, read_list) {
        remod_list = JSON.parse(read_list);     
        checkForRemod();
        var remod_interval = setInterval(checkForRemod, 1000);
        var mod_list_update_interval = setInterval(updateModList, 30000);
        await updateModList();
    })
}

init();
var duo_partner = "No duo partner set";

if (!fs.existsSync("./text_commands.json")) fs.writeFileSync("./text_commands.json", JSON.stringify({}))
var text_commands = require("./text_commands.json");

var commands = {
    "!runes": runesCommand,
    "!rank": rankCommand,
    "!lolpros": lolprosCommand,
    "!time": timeCommand,
    "!duo": duoCommand
}

var mod_commands = {
    "!setduo": setduoCommand,
    "!addcommand": addCommand,
    "!editcommand": editCommand,
    "!removecommand": removeCommand
}

function duoCommand(args, output) {
    output(duo_partner);
}

function setduoCommand(args, output) {
    duo_partner = args[1];
    if (duo_partner !== undefined) {
        output("Set duo partner " + duo_partner + " successfully.");
    } else {
        output("Usage: !setduo <duo partner>")
    }
}

function timeCommand(args, output) {                
    date = new Date();
    time = date.toLocaleTimeString().split(" ");
    hr_min = time[0].split(":").splice(0, 2).join(":");
    am_pm = time[1]
    output("It is currently " + hr_min + " " + am_pm + " in Austria.")
}

function lolprosCommand(args, output) {
    if (args.length == 3) {
        args[1] += ' ' + args[2]
    }   
    name = args.slice(1);
    name = name.join(" ")
    if (league_handler.isChampion(name)) {
        lolprosChampionLookup(name).then((result) => output(result)).catch(console.log("err in lolpros champ lookup"))
    } else {
        scraper.getExactMatch(name).then((result) => {
            output(result.string)
        }).catch((err) => console.log("Error in scraper:", err))
    }
}

function isMessageSenderMod(context) {
    if (context.badges !== undefined) {
        if (context.badges.broadcaster == 1 || context.badges.moderator == 1) {
            return true;
        }
    }
    return false;
}

function onMessageHandler (target, context, msg, self) { 
    if (self) { return; }
    var msg_format = formatCommandArgs(msg);
    var command = msg_format.command;
    var args = msg_format.args;
    if (command in commands) {
        commands[command](args, twitchMessageWrapper(target));
    } else if (command in mod_commands) {
        if (isMessageSenderMod(context)) {
            mod_commands[command](args, twitchMessageWrapper(target));
        } else {
            client.say(target, "Invalid permissions for command " + command);
        }
    } else if (command in text_commands) {
        client.say(target, text_commands[command])
    }
}

function rankCommand(args, output) {
    if (args.length == 1) {
        getStreamerRank(function(rank) {
            output(rank)
        });
    }
}

function runesCommand(args, output) {
    if (args.length == 1) {
        // Call to !runes with default name and region
        getStreamerRunes(function(runes, found) {
            if (found) {
                output(runes);
            } else {
                output(`No current game found for any of the streamers accounts. If you meant to look up a specific player, type !runes [name] [region]`);
            }
        });
    } else if (args.length == 2) {
        // Call to !runes with a specified summoner name and the default region
        var summoner_name = args[1];
        getRunes(summoner_name, default_region, function(runes, success) {
            output(runes)
        });
    } else if (args.length == 3 && args[2] != undefined) {
        if (isRegion(args[2])) {     
        // Call to !runes with a specified summoner name and a specified region
        var summoner_name = args[1];
        var region = args[2];
        console.log("calling getRunes with region " + region + " from command " + args);
        getRunes(summoner_name, region, function(runes, success) {
            output(runes)
        });

        } 
    } else {
        output(`Usage: !runes [name] [server]`);
    }
}

function addCommand(args, output) {    
    var args = args[1].split(" ");
    var command_name = args[0];
    var command_text = args.splice(1).join(" ");    
    if (command_text.length > 0) {
        if (command_name in text_commands) {
            output("Command \"" + command_name + "\" already exists.");
        } else {
            text_commands[command_name] = command_text;
            fs.writeFileSync("./text_commands.json", JSON.stringify(text_commands))
            output("Added command \"" + command_name + "\".");
        }
    } else {
        output("Usage: !addcommand [command] [message]")
    }
}

function editCommand(args, output) {    
    var args = args[1].split(" ");
    var command_name = args[0];
    var command_text = args.splice(1).join(" ");
    var already_exists = command_name in text_commands;
    text_commands[command_name] = command_text;
    fs.writeFileSync("./text_commands.json", JSON.stringify(text_commands))
    if (command_text.length > 0) {
        if (already_exists) {        
            output("Updated command \"" + command_name + "\".");
        } else {
            output("Added command \"" + command_name + "\".");
        }
    } else {
        output("Usage: !editcommand [command] [message]")
    }
}

function removeCommand(args, output) {
    var command_name = args[1];
    if (command_name in text_commands) {
        delete text_commands[command_name]        
        fs.writeFileSync("./text_commands.json", JSON.stringify(text_commands))
        output("Removed command \"" + command_name + "\".")
    } else {
        output ("Command \"" + command_name + "\" does not exist.");
    }
}

function twitchMessageWrapper(target) {
    return (message) => client.say(target, message);
}

function formatCommandArgs(msg) {    
    var command = msg.trim().split(' ');
    const commandName = command[0];
    var command_length;
    // Move the middle arguments into one string. Consider the last argument as part of the name too if its not a valid region
    if (isRegion(command[command.length - 1])) {
        command_length = 3;
    } else {
        command_length = 2;
    }
    while (command.length > command_length) {
        command[1] = command[1] + ' ' + command[2];
        command.splice(2,1)
    }
    return {command: commandName, args: command};
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
    console.log(`* Connected to ${addr}:${port}`);
}

(async () => {
    const async_reader = new lib.asyncReader();
    var running = true;
    var all_commands = {...commands, ...mod_commands}
    while (running) {
        var input = await async_reader.readLineAsync();
        var formatted = formatCommandArgs(input);
        var command = formatted.command;
        var args = formatted.args;
        if (command in all_commands) all_commands[command](args, console.log);
        else if (command in text_commands) console.log(text_commands[command])
        else console.log("Available commands:", Object.keys(all_commands), "\nText commands:", Object.keys(text_commands));
    }
})();