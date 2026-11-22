const {spawn} = require("node:child_process")
const path = require("node:path")
const http = require("node:http")

const network = require("./js/networking.js")
const storage = require("./js/storage.js")
const sync = require("./js/sync.js")
require("./js/utils.js")
require("./js/new.js")
require("./js/mining.js")
const domain = require("node:domain");

const args = process.argv.slice(2)

async function startNode() {
	async function nodeRunning() {
		try {
			let response = await fetch("http://127.0.0.1:47821/online", {
				signal: AbortSignal.timeout(1000)
			})
			return response.ok
		}
		catch {
			return false
		}
	}
	if (await nodeRunning()) {
		console.log("Process already started")
		return
	}
	let daemonArgs = process.pkg ? ["daemon"] : [path.join(__dirname, "cli.js"), "daemon"]
	let child = spawn(process.execPath, daemonArgs,
		{
			detached: true,
			stdio: "ignore",
			env: {
				...process.env,
				PKG_EXECPATH: ""
			}
		}
	)
	child.unref()
}

async function runDaemon() {
	global.domains = storage.getDomains()
	global.allNodes = storage.getPeers()

	await network.getNodes()
	void network.runServer()
	void network.checkAllNodes()
	commands()
}

function commands() {
	const server = http.createServer(async (req, res) => {
		try {
			let url = new URL(req.url, "http://localhost")
			if (url.pathname === "/resolve" && req.method === "GET") {
				let domain = url.searchParams.get("domain")
				let result = global.domainToEndpoint(domain)
				res.end(JSON.stringify({result}))
				return
			}
			if (url.pathname === "/domainInfo" && req.method === "GET") {
				let domain = url.searchParams.get("domain")
				let result = global.domains.find(item => item[0] === domain)
				if (!result) {
					res.writeHead(404)
					res.end(JSON.stringify({error: "Domain not found"}))
					return
				}
				res.end(JSON.stringify({domain: result}))
				return
			}
			if (url.pathname === "/status" && req.method === "GET") {
				res.end(JSON.stringify({
					connected: global.connected,
					lastSync: Date.now() - sync.getLastSync(),
					domainCount: global.domains.length,
					nodeUrl: tunnelUrl
				}))
				return
			}
			if (url.pathname === "/online" && req.method === "GET") {
				res.end(JSON.stringify({success: true}))
				return
			}
			if (url.pathname === "/mine/info" && req.method === "GET") {
				res.end(JSON.stringify({data: getData()}))
				return
			}
			if (url.pathname === "/mine/stop" && req.method === "POST") {
				stopMining()
				res.end(JSON.stringify({success: true}))
				return
			}
			if (url.pathname === "/mine/start" && req.method === "POST") {
				let body = ""
				for await (let chunk of req) {
					body += chunk
				}
				body = JSON.parse(body)
				let seed = body.seed
				let domain = body.domain
				let endpoint = body.endpoint
				newKeys(seed)
				void mine(domain, endpoint)
				res.end(JSON.stringify({ success: true }))
				return
			}
			if (url.pathname === "/sync" && req.method === "POST") {
				let body = ""
				for await (let chunk of req) {
					body += chunk
				}
				let start = JSON.parse(body).start || ""
				void sync.sync([start])
				res.end(JSON.stringify({ success: true }))
				return
			}
			if (url.pathname === "/change" && req.method === "POST") {
				let body = ""
				for await (let chunk of req) {
					body += chunk
				}
				let data = JSON.parse(body)
				void updateDomain(data.domain, data.endpoint, data.seed)
				res.end(JSON.stringify({ success: true }))
				return
			}
			if (url.pathname === "/stop" && req.method === "POST") {
				storage.savePeers()
				storage.saveDomains()
				network.stopTunnel()

				res.end(JSON.stringify({success: true}))
				res.on("finish", () => process.exit(0))
				return
			}

			res.writeHead(404)
			res.end()
		}
		catch {
			res.end()
		}
	})
	server.listen(47821, "127.0.0.1")
}

async function resolve(domain) {
	if (!domain) {
		throw new Error(`Expected a domain name after 'resolve' but got none`)
	}
	let url = new URL("http://127.0.0.1:47821/resolve")
	if (!domain.includes("://")) {
		domain = "https://" + domain
	}
	url.searchParams.set("domain", domain)

	let response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Failed to resolve domain: ${response.status}`)
	}
	let data = await response.json()
	console.log(data.result)
}
async function domainInfo(domain, useJson) {
	if (!domain) {
		throw new Error(`Expected a domain name after 'info' but got none`)
	}
	let url = new URL("http://127.0.0.1:47821/domainInfo")
	url.searchParams.set("domain", domain)

	let response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Failed to get info: ${response.status}`)
	}
	let data = await response.json()
	if (useJson) {
		console.log(JSON.stringify(data.domain))
	}
	else {
		console.table(data.domain)
	}
}
async function nodeInfo(useJson) {
	let data = {connected: false, lastSync: null, domainCount: null, nodeUrl: null}
	try {
		let response = await fetch("http://127.0.0.1:47821/status")
		if (response.ok) {
			data = await response.json()
		}
	}
	catch {}

	if (useJson) {
		console.log(JSON.stringify(data))
	}
	else {
		console.table(data)
	}

}
async function syncNode(start) {
	if (start === undefined) {start = ""}
	let response = await fetch("http://127.0.0.1:47821/sync", {
		method: "POST",
		body: JSON.stringify({start: start})
	})
	if (!response.ok) {
		throw new Error(`Failed to sync: ${response.status}`)
	}
	console.log("Sync started")
}
async function changeEndpoint(domain, endpoint, seed) {
	if (domain === undefined || endpoint === undefined || seed === undefined) {
		throw new Error(`Expected 'change <domain> <new endpoint> <seed>' 
		but got 'change ${domain || ""} ${endpoint || ""} ${seed || ""}'`)
	}
	let response = await fetch("http://127.0.0.1:47821/change", {
		method: "POST",
		body: JSON.stringify({domain: domain, endpoint: endpoint, seed: seed})
	})
	if (!response.ok) {
		throw new Error(`Failed to change endpoint: ${response.status}`)
	}
	console.log("Endpoint change sent")
}
async function startMining(domain, endpoint, seed) {
	if (domain === undefined || endpoint === undefined || seed === undefined) {
		throw new Error(`Expected 'mine start <domain> <endpoint> <seed>' 
		but got 'mine start ${domain || ""} ${endpoint || ""} ${seed || ""}'`)
	}
	let response = await fetch("http://127.0.0.1:47821/mine/start", {
		method: "POST",
		body: JSON.stringify({domain: domain, endpoint: endpoint, seed: seed})
	})
	if (!response.ok) {
		throw new Error(`Failed to start mining: ${response.status}`)
	}
	console.log("Mining started")
}
async function stopMiningProcess() {
	let response = await fetch("http://127.0.0.1:47821/mine/stop", {
		method: "POST"
	})
	if (!response.ok) {
		throw new Error(`Failed to stop mining: ${response.status}`)
	}
	console.log("Mining stopped")
}
async function displayMiningInfo(useJson) {
	let response = await fetch("http://127.0.0.1:47821/mine/info")
	if (!response.ok) {
		throw new Error(`Failed to get info: ${response.status}`)
	}
	let data = (await response.json()).data
	if (data.domain === null) {
		data.bestHash = null
		data["hashrate(MH/s)"] = 0
	}
	if (useJson) {
		console.log(JSON.stringify(data))
	}
	else {
		console.table(data)
	}
}
async function stopNode() {
	let response = await fetch("http://127.0.0.1:47821/stop", {
		method: "POST"
	})
	if (!response.ok) {
		throw new Error(`Failed to stop node: ${response.status}`)
	}
	console.log("Mesh Web node stopped")
}

function displayHelp() {
	function c(command, description) {
		return `${command.padEnd(40)}${description}`
	}
	console.log(`
Mesh Web CLI

Usage:
  meshweb <command> [arguments] [options]

Commands:
  ${c("start", "Start a Mesh Web node")}
  ${c("stop", "Stop the running node")}
  ${c("nodeInfo", "Shows node status and statistics")}
  ${c("resolve <domain>", "Resolve a .mesh domain")}
  ${c("info <domain>", "Show full domain registration")}
  ${c("sync [start]", "Synchronise with the network")}
  ${c("mine start <domain> <endpoint> <seed>", "Start mining a domain")}
  ${c("mine stop", "Stop mining")}
  ${c("mine info", "Show mining status and statistics")}
  ${c("change <domain> <new endpoint> <seed>", "Change the endpoint of a domain")}

Options:
  ${c("--json", "Outputs results as json")}
`)
}

async function main() {
	let json = args.includes("--json")
	switch (args[0]) {
		case "help":
		case "--help":
		case undefined:
			displayHelp()
			break
		case "start":
			await startNode()
			break
		case "daemon":
			await runDaemon()
			break
		case "resolve":
			await resolve(args[1])
			break
		case "nodeInfo":
			await nodeInfo(json)
			break
		case "info":
			await domainInfo(args[1], json)
			break
		case "sync":
			await syncNode(args[1])
			break
		case "mine":
			switch (args[1]) {
				case "start":
					await startMining(args[2], args[3], args[4])
					break
				case "stop":
					await stopMiningProcess()
					break
				case "info":
					await displayMiningInfo(json)
					break
				default:
					console.log(`Expected either 'start', 'stop' or 'status' after 'mine', but got '${args[1]}'`)
			}
			break
		case "change":
			await changeEndpoint(args[1], args[2], args[3])
			break
		case "stop":
			await stopNode()
			break
		default:
			console.log(`Command ${args[0]} not found`)
	}
}
main().catch(error => {
	console.error(error)
	process.exitCode = 1
})