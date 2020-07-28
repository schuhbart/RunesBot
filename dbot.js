
var bot_definitions = require('./bot_definitions.json')

const Discord = require('discord.js');
const client = new Discord.Client();

const discord_token = bot_definitions["DiscordToken"];
const streams = bot_definitions["Streams"];
const sona_streams = bot_definitions["SonaStreams"];
const client_id = bot_definitions["TwitchClientID"];
const stream_announce = bot_definitions["StreamAnnounce"]
const sona_stream_channel = bot_definitions["SonaStreamChannel"];
const axios = require("axios");
const rp = require('request')

const ONLINE = 1;
const OFFLINE = 2;
const FOUND_ONLINE = 3;
const INIT = 4;

var user_ids = [];
var check_streams_url = "";
var check_sona_streams_url = "";
var stream_list = [];
const guild_id = bot_definitions["DiscordGuild"];
var guild;

const lib = require("./lib.js");
const Scraper = require('./scraper.js')
const scraper = new Scraper()
scraper.init().then(
    client.login(discord_token))

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);  
  initStreamArray();
  getUserIDs().then(() => checkStreams(15000));
});


function parseCommand(msg) {
    var command = msg.toString().trim().split(' ');
    var command_length;
    // Move the middle arguments into one string. Consider the last argument as part of the name too if its not a valid region
    command_length = 2;
    while (command.length > command_length) {
        command[1] = command[1] + ' ' + command[2];
        command.splice(2,1)
    }
    return {command: command[0], args: command[1]}
}

client.on("message", message => {
    var parsed = parseCommand(message.content);
    var command = parsed.command;
    var args = parsed.args
    if (command in commands) {
        commands[command](args, discordMessageWrapper(message.channel), message);
    }
})

function discordMessageWrapper(channel) {
    return (message) => {
        channel.send(message)
    }
}

var commands = {
    "!postthisdog": postDog,
    "!lolpros": lolprosCommand,
    "!setrole": setRole,
    "!removerole": removeRole
}

async function setRole(args, output, message) {
    if (args in roles) {
        var role = await message.guild.roles.fetch(roles[args])  
        var rolemanager = message.member.roles;
        rolemanager.add(role)
        output("Set role " + role.name)
    } else {
        output("Available roles: " + Object.keys(roles).join(", "));
    }
}

function removeRole(args, output, message) {
    if (args in roles) {
        message.member.roles.remove(roles[args])
    }
}

function postDog(args, output, message) {
    output('', {
        files: [
            "https://i.imgur.com/0Nebbhw.png"
        ]
    });
}

async function lolprosCommand(args, output, message) {
    scraper.getExactMatch(args[1]).then((result) => {
        output(result.string);
    }).catch((err) => console.log(err))
}


var roles = {"aram": "735477623181803571"}

var bearer_token = 'Bearer ' + bot_definitions["BearerToken"]
const twitch_header = { 'Client-ID': client_id, 'Authorization': bearer_token };
var default_stream_value = OFFLINE;
if (process.argv[2] == "restart") {
    console.log("Not sending notification for streams currently online");
    default_stream_value = INIT;
}




function initStreamArray() {
    for (const i in streams) {
        stream_list[streams[i]] = default_stream_value
    }
    for (const i in sona_streams) {
        stream_list[sona_streams[i]] = default_stream_value
    }
}


async function getUserIDs() {
    var request_url = 'https://api.twitch.tv/helix/users?'
    var first = true;
    for(const name in streams) {
        if(!first) request_url += '&' 
        else first = false;
        request_url += 'login=' + streams[name];
    }
    check_streams_url = 'https://api.twitch.tv/helix/streams?'
    first = true;
    var response = await axios.get(request_url, { headers: twitch_header })
        .catch(function(err) {console.log(err)})
    var data = response["data"]["data"];
    for (const index in data) {
        var id = data[index]["id"];
        if (!first) check_streams_url += '&'
        else first = false;
        check_streams_url += 'user_id=' + id;
    }
    var request_url = 'https://api.twitch.tv/helix/users?'
    var first = true;
    for(const name in sona_streams) {
        if(!first) request_url += '&' 
        else first = false;
        request_url += 'login=' + sona_streams[name];
    }
    check_sona_streams_url = 'https://api.twitch.tv/helix/streams?'
    first = true;
    var response = await axios.get(request_url, { headers: twitch_header });
    var data = response["data"]["data"];
    for (const index in data) {
        var id = data[index]["id"];
        if (!first) check_sona_streams_url += '&'
        else first = false;
        check_sona_streams_url += 'user_id=' + id;
    }
}

function checkResponse(r) {
    if (r == undefined) {
        return false;
    } 
    if (r["data"] == undefined) {
        return false;
    }
    return true
}

async function checkOnlineStreams() {
    var r = await axios.get(check_streams_url, { headers: twitch_header }).catch();
    if (!checkResponse(r)) return;
    data = r["data"]["data"]
    for (const i in data) {
        var stream = data[i];
        var name = stream["user_name"].toLowerCase();
        var title = stream["title"];
        if (stream_list[name] == OFFLINE) {
            console.log("stream " + name + " went online with title " + title)
            stream_list[name] = FOUND_ONLINE;
            var message = name + " just went live! \"" + title + "\"\nhttps://twitch.tv/" + name;
            client.channels.fetch(stream_announce).then(channel => channel.send(message));
        } else {
            stream_list[name] = FOUND_ONLINE
        }
    }
    var r = await axios.get(check_sona_streams_url, { headers: twitch_header }).catch();
    if (!checkResponse(r)) return false
    data = r["data"]["data"]
    for (const i in data) {
        var stream = data[i];
        var name = stream["user_name"].toLowerCase();
        var title = stream["title"];
        if (stream_list[name] == OFFLINE) {
            console.log("stream " + name + " went online with title " + title)
            stream_list[name] = FOUND_ONLINE;
            var message = name + " just went live! \"" + title + "\"\nhttps://twitch.tv/" + name;
            client.channels.fetch(sona_stream_channel).then(channel => channel.send(message));
        } else {
            stream_list[name] = FOUND_ONLINE
        }
    }
    for (const name in stream_list) {
        if (stream_list[name] == ONLINE) {            
            stream_list[name] = OFFLINE;
            console.log("stream " + name + " went offline.");
        } else if (stream_list[name] == INIT) {
            stream_list[name] = OFFLINE;
        }  else if (stream_list[name] == FOUND_ONLINE) {
            stream_list[name] = ONLINE;
        }            
    }
}


const timeout = ms => new Promise(res => setTimeout(res, ms))

async function checkStreams(delay) {
    while(true) {
        await checkOnlineStreams().catch(error => console.log(error));
        await timeout(delay);
    }
}

function testIDs() {
    initStreamArray();
    getUserIDs().then(() => checkStreams(5000));}

(async () => {
    const async_reader = new lib.asyncReader();
    var running = true;
    while (running) {
        var rl = await async_reader.readLineAsync();
        var input = rl.split(" ");
        var command = input[0]
        if (command in commands) commands[command](args)
        else console.log("Command not found, available commands:", Object.keys(commands).join(", "));
    }
})();
