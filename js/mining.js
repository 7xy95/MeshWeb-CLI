const gpuMiner = require("./gpuMiner")

let stop = false
let best = 0
let domainTo = null
let endpointTo = null
let lastT = null
let isMining = false
async function mine(domain, endpoint) {
    if (isMining) {return}
    let key = global.publicKey
    isMining = true
    domainTo = domain
    endpointTo = endpoint
    let i = require("crypto").randomBytes(8).readBigUInt64BE() % (18n * 10n**18n)
    best = global.getDomainDifficulty(domain)
    while (true) {
        if (stop) {stop = false; break}

        let t = performance.now()

        let result = await gpuMiner.mine(domain, key, i)
        let hash = 256 - Math.log2(Number(BigInt("0x" + result.hash)))

        if (best < hash) {
            best = hash
            if (best > 31) {
                global.createNewDomain(domain, endpoint, result.nonce)
            }
        }

        i += 50_000_000n
        lastT = performance.now()-t
    }
}
function stopMining() {
    stop = true
    domainTo = null
    endpointTo = null
    isMining = false
    best = 0
}
function getData() {
    return {"bestHash": best, "domain": domainTo, "endpoint": endpointTo, "hashrate(MH/s)": 50/(lastT/1000)}
}

global.mine = mine
global.stopMining = stopMining
global.getData = getData