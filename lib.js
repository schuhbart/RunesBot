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
    
    close() {
        this.rl.close()
    }
}

const sleep = ms => new Promise(res => setTimeout(res, ms))

module.exports = {
    asyncReader,
    sleep
}
