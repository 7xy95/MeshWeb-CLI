const net = require("node:net")
const network = require("./js/networking.js")
const storage = require("./js/storage.js")
const sync = require("./js/sync.js")
require("./js/utils.js")
require("./js/new.js")
require("./js/mining.js")

global.domains = []
global.allNodes = storage.getPeers()
global.privateKey = null
global.publicKey = null

let appStarted = false

global.require = require
global.__dirname = __dirname

async function startApp() {//todo all of this
    if (appStarted) {return}
    appStarted = true

    await network.getNodes()
    void network.runServer()
    void network.checkAllNodes()

    if (ss === null) {
        ss = setInterval(() => {if (global.domains.length !== 0) {
                storage.saveDomains()
                storage.savePeers()
                storage.saveHistory()
                storage.saveSettings()
                storage.saveBookmarks()
            }
        }, 30_000)
    }
}