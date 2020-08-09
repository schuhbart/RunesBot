/*
    HOW TO RUN THIS: 
    1. Download the zip file on github (https://github.com/schuhbart/RunesBot/archive/master.zip)
    2. Install node.js (https://nodejs.org/en/)
    3. Unzip and open cmd in the folder
    4. In cmd in the folder, enter
        npm i 
        to install packages
    5. Enter
        node league_handler.js interactive
        to start the program and follow the instructions

*/




class asyncReader {
    constructor() {
        this.readline = require("readline");
        this.rl = this.readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });    
    }

    async readLineAsync() {
        return new Promise(resolve => this.rl.question("> ", (ans) => resolve(ans))
        )
    }   
}

class LeagueHandler {
	constructor() {
        const fs = require("fs");
        if (fs.existsSync("champion.json")) this.champions = require('./champion.json')
		this.axios = require('axios')
		this.bot_definitions = require('./bot_definitions.json');
		this.regions = {'br': 'br1', 'eune': 'eun1', 'euw': 'euw1', 'jp': 'jp1', 'kr': 'kr', 'lan': 'la1', 'las': 'la2', 'na': 'na1', 'oce': 'oc1', 'tr': 'tr1', 'ru': 'ru', 'pbe': 'pbe1'}
		this.id_cache = []; 
		this.key = this.bot_definitions["RiotKey"];
		this.default_names = this.bot_definitions["DefaultName"];
		this.rank_name = this.default_names;
		this.default_region = this.bot_definitions["DefaultRegion"];
		this.riot_api_header = { headers: { 'X-Riot-Token': this.key } }
		this.rate_cap = 80;
		this.conserve_rate_limit = true;
		this.INVALID_KEY = -1
		
		this.QUERY_SUCCESS = 0;
		this.NOT_INGAME = 1;
		this.CHAMPION_NOT_FOUND = 2;

		this.axios.defaults.validateStatus = (status) => status < 600;
		this.axios.defaults.headers.common['X-Riot-Token'] = this.key;
	}

	normalizeName(name) {
		return name.toUpperCase().replace(/\s+/g, '');
	}

	isRegion(region) {
		if (region.toLowerCase() in this.regions) return true;
		else return false;
	}

	getRegion(region) {
		return this.regions[region.toString().toLowerCase()];
	}

	championNameCapitalization(name) {
		name = name.trim()
		name = name.split(" ");
		for (const [index, word] of name.entries()) {
			if (word !== undefined) name[index] = word.replace(word[0], word[0].toUpperCase()[0])
		}
		name = name.join("");
		name = name.replace("'", "");
		return name;
	}

	isChampion(name) {    
		name = this.championNameCapitalization(name)
		return name in this.champions.data;
	}

	championIDToName(id) {
		var champ_entries = Object.values(this.champions.data);
		var matched_champ = champ_entries.filter(entry => entry.key == id);
		if (matched_champ.length == 1) return matched_champ[0].name;
		else return "Did not find a champion with id " + id + " ."; 
	}

	championNameToID(name) {
		name = this.championNameCapitalization(name)
		if (name in this.champions.data) return this.champions.data[name].key 
		return undefined;
	}

	getExactChampionName(name) {
		name = this.championNameCapitalization(name)
		if (name in this.champions.data) return this.champions.data[name].id
		return undefined;
	}

	async getSummonerIDAsync(summoner_name_, region) {      
		var summoner_name = this.normalizeName(summoner_name_);		
		if (this.id_cache[region] === undefined) {
			this.id_cache[region] = [];
		}
		if (summoner_name in this.id_cache[region]){
			return this.id_cache[region][summoner_name];
		} else {
			var url = 'https://' + this.getRegion(region) + '.api.riotgames.com/lol/summoner/v4/summoners/by-name/' + summoner_name
			var response = await this.failsafeGet(url, this.riot_api_header).catch((err) => console.log("err in getsumm id"))
			if (response != undefined) {
				if (response.status == 200) {
					var data = response.data
					var summoner_id = data.id
					var exact_summoner_name = data.name          
					if (exact_summoner_name[exact_summoner_name.length - 1] == " ") {
						exact_summoner_name = exact_summoner_name.slice(0, exact_summoner_name.length-1);
					}          
					var account_id = data.accountId;
					this.id_cache[region][summoner_name] = { id: summoner_id, name: exact_summoner_name, account_id: account_id}
					return this.id_cache[region][summoner_name]
				} else if (response.status == 404) {
					return undefined;
				} else if (response.status == 403) {
					return this.INVALID_KEY
				} else console.log("Status code in getSummonerID:", response.status, "headers:", response.headers)
			} else console.log("Response in getSummonerID undefined")
		}
	}

	getBaseUrl(region) {
		return 'https://' + this.getRegion(region) + '.api.riotgames.com'
	}

	async getCurrentMatchInfo(summoner_name_, region) {
		var summoner_id = (await this.getSummonerIDAsync(summoner_name_, region)).id
		var url = 'https://' + this.getRegion(region) + '.api.riotgames.com/lol/spectator/v4/active-games/by-summoner/' + summoner_id
		var data = await this.axios.get(url, this.riot_api_header)
		return data
	}

	async getPlayerNameOfChampion(champion, summoner_name, region) {
		var champ_id = this.championNameToID(champion);
		var exact_name = this.getExactChampionName(champion)
		if (champ_id == undefined) return undefined;
		var match_data = await this.getCurrentMatchInfo(summoner_name, region)
		if (match_data.status == 200) {
			var players = match_data.data.participants;
			for (var i in players) {
				var player = players[i];
				if (player.championId == champ_id) return { status: this.QUERY_SUCCESS, name: player.summonerName, champion_name: exact_name };
			}
			return { status: this.CHAMPION_NOT_FOUND }
		}
		return { status: this.NOT_INGAME }
	}

	async getCurrentGameChampionPlayer(champion) {
		for (var i in this.default_names) {
			var name = this.default_names[i];
			var region = this.default_region;
			var response = await this.getPlayerNameOfChampion(champion, name, region);
			if (response.status != this.NOT_INGAME) {
				return response;
			}
		}
		return { status: this.NOT_INGAME }
	}
	
	// returns an array containing the matches
	async getMatchHistory(args_array, include_all) {
		var args = this.formatMatchHistoryArgs(args_array);
		if (include_all) args.queue = "all";
		console.log("Getting match history for " + args.name + " (" + args.region + ")");
		const account_data = (await this.getSummonerIDAsync(args.name, args.region));
		if (account_data == undefined) {
			return;
		}
		var id = account_data.account_id;
		var url = this.getBaseUrl(args.region) + "/lol/match/v4/matchlists/by-account/" + id +"?";
		if (args.champion != undefined && args.champion != "_") url += "champion=" + this.championNameToID(args.champion) + "&";
		if (args.queue != "all") url += "queue=420&";
		if (args.begin_time != undefined) {
			var date = new Date(args.begin_time);
			//console.log(date.getTime());
			var time = parseInt(date.getTime())
			if (!isNaN(time)) url += "beginTime=" + date.getTime() + "&";
		}
		if (args.end_time != undefined) {
			var date = new Date(args.end_time);
			//console.log(date.getTime());
			var time = parseInt(date.getTime())
			if (!isNaN(time)) url += "endTime=" + date.getTime() + "&";
		}
		var response = await this.failsafeGet(url, this.riot_api_header).catch(err => console.log("Error in getMatchHistory:", err));
		var data = response.data;
		if (data != undefined) {
			var matches = data.matches;
			var begin_index = 100;
			while (response.data.matches.length > 0) {
				var temp_url = url + "beginIndex=" + begin_index +"&";
				response = await this.failsafeGet(temp_url, this.riot_api_header);
				matches = matches.concat(response.data.matches);
				begin_index += 100;
			}
			return matches;
		}
		return [];
	}

	formatMatchHistoryArgs(args_array, mode = "default") {
		var args = {};
		args.flags = []
		var arg_names = ["name", "region", "champion", "begin_time", "end_time", "queue"]
		var default_vals = ["schuhbart", "euw", "sona", "2020/01/07", undefined, undefined]    
		if (mode == "help") return arg_names.join(" ");
		if (mode == "example") return default_vals.join(" ");
		if (args_array.length == 0) args_array = default_vals
		args_array.forEach((val, i) => {
			var arg_name = arg_names[i];
			if (val.slice(0,2) == "--") args.flags.push(val.slice(2)) 
			else if (val != "d") args[arg_name] = val;
			else if (val != "_") args[arg_name] = default_vals[i];      
		})  
		if (!(args.region in this.regions)) {
			console.log("ERROR: Invalid region specified. Make sure to remove all spaces from the summoner name, like \"past_names thetankman na\". Valid regions:\n ",
			Object.keys(this.regions));
		}  
		return args;    
	}

	async getDataFromMatches(args_array, include_all) {    
		var matches = await this.getMatchHistory(args_array, true);
		if (matches === undefined) return [];
		var region = this.formatMatchHistoryArgs(args_array).region;
		var name = this.formatMatchHistoryArgs(args_array).name;
		var account_id = (await this.getSummonerIDAsync(name, region)).account_id
		//console.log(name, account_id)
		var base_url = this.getBaseUrl(region) + "/lol/match/v4/matches/";
		var match_data = {};
		var cached_matches = {}
		const fs = require("fs");
		if (!fs.existsSync("./match_data")) fs.mkdirSync("./match_data")
		var file_path = "./match_data/" + account_id + ".json";
		if (fs.existsSync(file_path)) {
			cached_matches = JSON.parse(fs.readFileSync(file_path));
		}
		var urls = []

		console.log("Getting match data");
		matches.forEach(match => {
			var game_id = match.gameId;
			if (game_id in cached_matches) match_data[game_id] = cached_matches[game_id]
			else urls.push(base_url + game_id)
		})
		var i = 0;
		var skip_interval = 1
		var flag = this.formatMatchHistoryArgs(args_array).flags[0];
		if (flag !== undefined) {
			if (flag == "instant") {
				skip_interval = Math.ceil((urls.length / this.rate_cap) / 0.6)
			} else {
				var parsed = parseInt(flag)
				if (!isNaN(parsed)) {
					skip_interval = parsed;
				}				
			}			
		}
		var new_entries = 0;
		if (skip_interval > 1) console.log("Only one out of every " + skip_interval + " games will be downloaded.");
		for (var url of urls) {
			i++;
			if (i % skip_interval != 0) {
				continue;
			}
			new_entries++
			console.log("Downloading match " + i + " out of " + urls.length);
			var response = await this.failsafeGet(url);
			var data = response.data;
			if (data !== undefined) {
				match_data[data.gameId] = this.reduceMatchData(data);
				cached_matches[data.gameId] = match_data[data.gameId];
			}
			var rate_limit = response.headers["x-app-rate-limit-count"];
			rate_limit = rate_limit.split(",").map(s => s.split(":")[0]);
			if (this.conserve_rate_limit) {
				if (rate_limit[1] > this.rate_cap) {
					console.log("rate limit exceeded:", rate_limit, "waiting 10s. i is", i) 
					await sleep(10000); 
				}

			}
			if (new_entries % 100 == 0) fs.writeFileSync(file_path, JSON.stringify(cached_matches));
		}
		fs.writeFileSync(file_path, JSON.stringify(cached_matches));
		return match_data
	}

	async getChampionStats(args_array) {
		var match_data = await this.getDataFromMatches(args_array);
		var args = this.formatMatchHistoryArgs(args_array);
		var player_id =  (await this.getSummonerIDAsync(args.name, args.region)).account_id;
		var stats_with = new Map(); 
		var stats_against = new Map(); 
		var player_stats = [0, 0];
		for (const [match_id, match] of Object.entries(match_data)) {
			var player_team;
			match.participants.forEach((team, i) => { 
				team.forEach(p => {
					if (p.account_id == player_id) player_team = i;
				})
			})
			var player_win = player_team == match.winner;
			if (player_win) player_stats[0] += 1;
			else player_stats[1] += 1;
			var ally_participants = [];
			var enemy_participants = [];
			match.participants.forEach((participants, team) => {
				if (team == player_team) {
					ally_participants = participants.filter(p => p.account_id != player_id);
				} else {
					enemy_participants = participants;
				}
			})
			ally_participants.forEach(p => {
				this.updateMap(p.champion_id, stats_with, player_win);
			})
			enemy_participants.forEach(p => {
				this.updateMap(p.champion_id, stats_against, player_win);
			})
		}
		return {player_stats: player_stats, stats_with: stats_with, stats_against: stats_against};
	}

	async getPastNames(args_array) {
		var matches = await this.getDataFromMatches(args_array, true);
		var formated = this.formatMatchHistoryArgs(args_array)
		var names = {}
		var account_data = await this.getSummonerIDAsync(formated.name, formated.region);
		if (account_data === undefined) return ["Summoner not found."];
		var account_id = account_data.account_id
		for (var gameid in matches) {
			var match = matches[gameid]
			for (var team of match.participants) {
				for (var participant of team) {
					if (participant.account_id == account_id) {
						var name = participant.name;
						names[gameid] = name;
					}
				}
			}
		}
		var sorted_names = []
		Object.keys(names).sort().forEach(function(key) {
			sorted_names.push(names[key]);
		});
		var reduced_names = [];
		for(var i = 0; i < sorted_names.length; i++) {
			if (sorted_names[i] != sorted_names[i+1]) reduced_names.push(sorted_names[i])
		}
		return reduced_names.reverse();
	}

	updateMap(champion_id, map, win) {
		var stats;
		var champion_name = this.championIDToName(champion_id)
		if (map.has(champion_name)) stats = map.get(champion_name);
		else stats = [0, 0];
		if (win) stats[0] += 1;
		else stats[1] += 1;
		map.set(champion_name, stats)
	}

	sortStatsByGames(stats) {
		function compare(a, b) {			
			a = a[1];
			b = b[1];
			return b[0] + b[1] - (a[0] + a[1])
		}
		var stats_with = new Map([...stats.stats_with.entries()].sort(compare))
		var stats_against = new Map([...stats.stats_against.entries()].sort(compare))
		return {player_stats: stats.player_stats, stats_with: stats_with, stats_against: stats_against}
	}

	sortStatsByWR(stats) {	
		function compare(a, b) {
			a = a[1];
			b = b[1];
			if (a[1] == 0 && b[1] == 0) return b[0] - a[0];
			if ((a[0] + a[1]) < 3) return 1;
			if ((b[0] + b[1]) < 3) return -1;
			var res = (b[0] / (b[0] + b[1])) - (a[0] / (a[0] + a[1]))
			return (b[0] / (b[0] + b[1])) - (a[0] / (a[0] + a[1]))
		}	
		var stats_with = new Map([...stats.stats_with.entries()].sort(compare))
		var stats_against = new Map([...stats.stats_against.entries()].sort(compare))
		return {player_stats: stats.player_stats, stats_with: stats_with, stats_against: stats_against}
	}

	async getSortedChampionStats(args) {
		var stats = await this.getChampionStats(args);
		return {num_games: this.sortStatsByGames(stats), wr: this.sortStatsByWR(stats)};
	}	

	formatStats(stats, champion_name) {		
		var calcWR = wl => 100 * wl[0] / (wl[0] + wl[1]);
		var formatWL = wl => wl[0] + "W " + wl[1] + "L, " + calcWR(wl) + "%";
		if (champion_name == "_") champion_name = "all champions"
		var return_string = "Stats on " + champion_name + ":\n";
		return_string += "Total winrate: " + formatWL(stats.player_stats) +"\n";
		return_string += "Stats with champion on allied team:\n";
		var ally_stats = stats.stats_with;
		var enemy_stats = stats.stats_against;
		var formatMap =	map => {
			var string = "";
			map.forEach((stat, champ) => {
				string += champ + ": " + formatWL(stat) + "\n";
			})
			return string;
		}	
		return_string += formatMap(ally_stats)
		return_string += formatMap(enemy_stats);
		return return_string
	}

	async failsafeGet(url) {
		url = encodeURI(url);
		var response = await this.axios.get(url).catch(err => {
			console.log("Error in failsafeGet");
		})
		switch (response.status) {
			case 200:
				return response;
			case 403:
				console.log("\n\n\n----------------------------- Invalid Api key, please restart the program to update it ---------------------------\n\n\n")
				return response;
			case 404:
				return response;
			case 429: 
				var sleep_time = response.headers["retry-after"];
				console.log("Rate limit exceeded, trying again in " + sleep_time + " seconds");
				await sleep(sleep_time*1000);
			case 503:
			case 504:
				await sleep(2000);
				return this.failsafeGet(url);
			default: 
				console.log("Unknown error code in failsafe get:", response.status)
				return response;
		}
	}

	reduceMatchData(data) {
		var reduced = {}
		if (data.teams[0].win == "Win") reduced.winner = 0;
		else reduced.winner = 1;
		reduced.participants = [[], []];
		for (var i in data.participants) {
			var team = Math.floor(i / 5);
			var champ_id = data.participants[i].championId;
			var account_id;
			if ("currentAccountId" in data.participantIdentities[i].player) account_id = data.participantIdentities[i].player.currentAccountId
			else account_id = data.participantIdentities[i].player.accountId;
			var name = data.participantIdentities[i].player.summonerName;
			reduced.participants[team].push({ champion_id: champ_id, account_id: account_id, name: name });
		}
		return reduced;
	}

	async getRateLimit() {
		var url = this.getBaseUrl("euw") + "/lol/summoner/v4/summoners/by-name/schuhbart";
		var response = await this.axios.get(url)
		return response.headers["x-app-rate-limit-count"]
	}

	async isKeyInvalid() {		
		var url = this.getBaseUrl("euw") + "/lol/summoner/v4/summoners/by-name/schuhbart"
		var response = await this.axios.get(url)
		if (response.status == 403) {
			console.log("Invalid riot api key.");
			return true;
		}
		return false;
	}

	async updateRiotKey(reader) {	
		console.log("Please go to https://developer.riotgames.com/, log in (top right corner), then click \"REGENERATE API KEY\" and paste it here.");
		var key = await reader.readLineAsync();	
		this.bot_definitions["RiotKey"] = key;	
		this.key = this.bot_definitions["RiotKey"];			
		this.axios.defaults.headers.common['X-Riot-Token'] = this.key;
		if (await this.isKeyInvalid()) await this.updateRiotKey(reader)
		else {
			fs.writeFileSync("bot_definitions.json", JSON.stringify(this.bot_definitions));		
		}
	}

}


(async () => {
	if (process.argv[2] == "interactive") {
		const async_reader = new asyncReader();
		fs = require("fs")
		if (!fs.existsSync("bot_definitions.json")) fs.writeFileSync("bot_definitions.json", JSON.stringify({}))
		var league_handler = new LeagueHandler()
		if (!("RiotKey" in league_handler.bot_definitions)) {
			await league_handler.updateRiotKey(async_reader)
		} 	
		league_handler.conserve_rate_limit = false;
		var running = true;

		// test api key
		var key_invalid = await league_handler.isKeyInvalid();
		if (key_invalid) await league_handler.updateRiotKey(async_reader);


		console.log("To retrieve match data, type md with the following arguments: " + league_handler.formatMatchHistoryArgs([], "help"));
		console.log("The date is expected to be in the format year/month/day and end time is optional. Example arguments: " + league_handler.formatMatchHistoryArgs([], "example"))
		console.log("Riot development API keys are limited to 100 requests per 2 minutes so the process will take about 10 minutes per 500 games." +
			  " The downloaded data is also stored on disk to be used again later.");
		console.log("To get past names of an account, type past_names <name> <region>, like \"past_names schuhbart euw\". You can also skip matches to increase speed " +
			"by including --<number> in the command. Adding --instant tries to avoid rate limiting, like \"past_names schuhbart euw --instant\".");
		console.log("------- IMPORTANT -------\n Please remove spaces in the name, so \"G2 Jerkz\" becomes \"G2Jerkz\" (or \"g2jerkz\", the caps dont matter)");
		while(running) {
			var input = await async_reader.readLineAsync();
			var command, args;
			if (input != undefined) {
				input = input.trim().split(" ");
				command = input.shift(); // removes and returns the first element
				args = input;     
				if (args.length == 0) args = ["d", "d", "d", "d"]
			}
			switch(command) {
				case "q":
					running = false;
					console.log("Shutting down");
					break;
				case "id":
					console.log(await league_handler.getSummonerIDAsync(args[0], args[1]))
					break;
				case "champ_id":
					console.log("Champ id for " + league_handler.getExactChampionName(args[0]) + ": " + league_handler.championNameToID(args[0]))
					break;
				case "champ_name":
					console.log("Champ name for id " + args[0] + ": " + league_handler.championIDToName(args[0]));
					break;
				case "mh":
					console.log("Match history for " + args[0] + ":");
					var matches = await league_handler.getMatchHistory(args);
					console.log(matches.length)
					break;
				case "md": 
					console.log("Match data for " + args[0] + ":");
					var match_data = await league_handler.getDataFromMatches(args);
					console.log(match_data);
					break;
				case "rate": 
					console.log(await league_handler.getRateLimit());
					break;
				case "stats_test":
					console.log(await league_handler.getChampionStats(args));
					break;
				case "st_sort":
					var sorted = await league_handler.getSortedChampionStats(args);
					console.log("Sorted by number of games:", sorted.num_games);
					console.log("Sorted by winrate:", sorted.wr);
					break;
				case "past_names":
					var names = await league_handler.getPastNames(args);
					console.log("Names of this account over the last 2 years:\n", names);
					break;
			}
		}
		rl.close();
	}
})();

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = LeagueHandler
