const path = require("path")
const fs = require("fs")
const os = require("os")

const dataDir = path.join(os.homedir(), ".meshweb-cli")
fs.mkdirSync(dataDir, {recursive: true})
const session = path.join(dataDir, "domains.json")
const peers = path.join(dataDir, "peers.json")

function getDomains() {
	try {
		if (!fs.existsSync(session)) {
			fs.writeFileSync(session, "[]")
		}
		let domains = JSON.parse(fs.readFileSync(session, "utf-8"))
		let result = []
		for (let domain of domains) {
			result.push(require("./optimise.js").revertDomain(domain))
		}
		return result
	}
	catch {
		return []
	}
}
function saveDomains() {
	let n = []
	for (let domain of global.domains) {
		n.push(require("./optimise.js").optimiseDomain(domain))
	}
	fs.writeFileSync(session, JSON.stringify(n))
}

function getPeers() {
	try {
		if (!fs.existsSync(peers)) {
			fs.writeFileSync(peers, JSON.stringify(["https://node.meshcoin.org/"]))
		}
		return JSON.parse(fs.readFileSync(peers, "utf-8"))
	}
	catch {
		return ["https://node.meshcoin.org/"]
	}
}
function savePeers() {
	fs.writeFileSync(peers, JSON.stringify(global.allNodes))
}

module.exports = {
	getDomains,
	saveDomains,
	getPeers,
	savePeers
}