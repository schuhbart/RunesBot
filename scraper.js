

class Scraper {

    // constructor for scraper object
    constructor() {
        this.puppeteer = require('puppeteer');
        const Mutex = require('async-mutex').Mutex;
        this.mutex = new Mutex()
    }
    
    // initializes the scraper to point at lolpros.gg/search, set headless: false for easier debugging
    async init() {        
        const release = await this.mutex.acquire()
        this.browser = await this.puppeteer.launch({headless: true, slowMo: 0})
        this.page = await this.browser.newPage();
        this.page.setViewport({
            width: 1920,
            height: 480,
            deviceScaleFactor: 1,
        })
        await this.page.goto('https://lolpros.gg/search')
        console.log("Lolpros scraper initialized")
        release()
    }
    

    // does a lolpros.gg search with the name and returns an array containing one of the following object for each player found:
    // { name: <name>, country: <country>, account_names: <array of player account names>, role: <role>, rank: <highest rank> }
    async lookup(name) {
        // the scraper uses one single page for all actions to improve speed and reduce load on lolpros servers,
        // the mutex ensures that the page can only be accessed by one thread at a time
        const release = await this.mutex.acquire()
        await this.page.type('#gg-search', name)
        await this.page.click('[type=submit]');
        await this.page.waitForSelector('.loader-wrapper', { hidden: true })
        const content = await this.page.evaluate( () => {
            const players = Array.from(document.querySelectorAll('.result-card'))
            return players.map((player) => {
                // spaghetti code that extracts account data from the website, will probably break at some point
                account_children = Array.from(player.childNodes)
                info_node = account_children[0]
                player_info = info_node.childNodes
                name = player_info[0].textContent
                country = player_info[0].childNodes[0].title
                if (country == "Austria") country = "Australia"
                role = player_info[1].textContent
                account_node = account_children[1]
                account_names = Array.from(account_node.childNodes).map((account_node) => {
                    return account_node.childNodes[0].textContent
                })
                rank_node = account_node.childNodes[0].childNodes[1].childNodes[0]
                rank = rank_node.childNodes[2].textContent + rank_node.childNodes[4].childNodes[1].textContent
                return { name: name, country: country, account_names: account_names, role: role, rank: rank }
            })
        })
        release()
        return content
    }

    // formatting for the players role
    formatRole(role) {
        return role + " player"
    }

    // looks for an exact match with the given account name (case insensitive), returns the following object:
    // { found: <if a player with the name was found>, string: <formatted return string> }
    async getExactMatch(name) {
        var players = await this.lookup(name)
        for (const player_index in players) {
            const player = players[player_index]
            const account_names = player.account_names
            for (const account_name_index in account_names) {
                if (account_names[account_name_index].toLowerCase() == name.toLowerCase()) {
                    return { found: true, string: "Found lolpros.gg entry for account name " + name + ": " + player.name + ", " + this.formatRole(player.role) + 
                        " from " + player.country + " [" + player.rank + "]" + this.formatOPGG(account_names)}
                }
            }
        }
        return { found: false, string: "Did not find a lolpros.gg entry for account name " + name + "." }
    }

    formatOPGG(account_names) {
        return "";
        var string = " https://euw.op.gg/multi/query=";
        for (var i in account_names) {
            if (i > 0) string += "%2C";
            string += account_names[i].replace(/ /g, "");
        }
        console.log(string)
        return string;
    }
}

(async () => {
    //scraper = new Scraper();
    //await scraper.init();
    //console.log(await scraper.getExactMatch("schuhbart"))
})();

module.exports = Scraper