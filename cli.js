const {spawn} = require("node:child_process")
const path = require("node:path")
const http = require("node:http")

const network = require("./js/networking.js")
const storage = require("./js/storage.js")
const sync = require("./js/sync.js")
require("./js/utils.js")
require("./js/new.js")
require("./js/mining.js")
const {validateField} = require("@noble/curves/abstract/modular.js");

let args = process.argv.slice(2)

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
			if (url.pathname === "/find/prefix" && req.method === "GET") {
				let prefix = url.searchParams.get("prefix")
				let matches = []
				matches.push(...domains.filter((d) => d[0].startsWith(prefix)))
				res.end(JSON.stringify({matches}))
				return
			}
			if (url.pathname === "/find/key" && req.method === "GET") {
				let key = url.searchParams.get("key")
				let matches = []
				matches.push(...domains.filter((d) => d[1].split("-----")[2].replaceAll("\n", "") === key))
				console.log(domains[0][1].split("-----")[2].replaceAll("\n", ""))
				console.log(key)
				res.end(JSON.stringify({matches}))
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
			if (url.pathname === "/website/info" && req.method === "GET") {
				res.end(JSON.stringify({websites: network.getWebsites()}))
				return
			}
			if (url.pathname === "/website/add" && req.method === "POST") {
				let body = ""
				for await (let chunk of req) {
					body += chunk
				}
				body = JSON.parse(body)
				let index = body.index
				let endpoint = body.endpoint
				network.setWebsite(index, endpoint)
				res.end(JSON.stringify({success: true}))
				return
			}
			if (url.pathname === "/website/remove" && req.method === "POST") {
				let body = ""
				for await (let chunk of req) {
					body += chunk
				}
				body = JSON.parse(body)
				let index = body.index
				let success = network.removeWebsite(String(index))
				res.end(JSON.stringify({success: success}))
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
async function addWebsite(endpoint, index) {
	if (endpoint === undefined || index === undefined) {
		throw new Error(`Expected 'website add <endpoint> <index>' 
		but got 'website add ${endpoint || ""} ${index || ""}'`)
	}
	let response = await fetch("http://127.0.0.1:47821/website/add", {
		method: "POST",
		body: JSON.stringify({index: index, endpoint: endpoint})
	})
	if (!response.ok) {
		throw new Error(`Failed to create website: ${response.status}`)
	}
}
async function removeWebsite(index) {
	if (index === undefined) {
		throw new Error(`Expected 'website remove <index>' 
		but got 'website remove `)
	}
	let response = await fetch("http://127.0.0.1:47821/website/remove", {
		method: "POST",
		body: JSON.stringify({index: index})
	})
	if (!response.ok) {
		throw new Error(`Failed to remove website at index ${index}: ${response.status}`)
	}
	let data = await response.json()
	if (!data.success) {
		throw new Error(`Website at index ${index} not found`)
	}
	console.log(`Website at index ${index} removed`)
}
async function websiteInfo(useJson) {
	let response = await fetch("http://127.0.0.1:47821/website/info")
	if (!response.ok) {
		throw new Error(`Failed to get info: ${response.status}`)
	}
	let websites = (await response.json()).websites
	if (useJson) {
		console.log(JSON.stringify(websites))
	}
	else {
		console.table(websites)
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
async function findStartsWith(prefix, useJson) {
	if (!prefix) {
		throw new Error(`Expected a prefix after 'info startsWith' but got none`)
	}
	let url = new URL("http://127.0.0.1:47821/find/prefix")
	url.searchParams.set("prefix", prefix)
	await displayFind(url, useJson)
}
async function findKey(key, useJson) {
	if (!key) {
		throw new Error(`Expected a key after 'info key' but got none`)
	}
	let url = new URL("http://127.0.0.1:47821/find/key")
	url.searchParams.set("key", key)
	await displayFind(url, useJson)
}
async function displayFind(url, useJson) {
	let response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Failed to find: ${response.status}`)
	}
	let data = (await response.json()).matches
	if (useJson) {
		console.log(JSON.stringify(data))
	}
	else {
		for (let domain of data) {
			console.table(domain)
		}
	}
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
  ${c("find startsWith <prefix>", "Find domains starting with prefix")}
  ${c("find key <key>", "Find domains with a specific key")}
  ${c("website add <endpoint> <id>", "Points tunnel/site/<id> to the localhost endpoint")}
  ${c("website remove <id>", "Removes tunnel/site/<id> from the localhost endpoint")}
  ${c("website info", "Displays all website endpoints and ids")}

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
					console.error(`Expected either 'start', 'stop' or 'status' after 'mine', but got '${args[1]}'`)
			}
			break
		case "find":
			switch (args[1]) {
				case "startsWith":
					await findStartsWith(args[2], json)
					break
				case "key":
					await findKey(args[2], json)
					break
				default:
					console.error(`Expected either 'startsWith' or 'key' after 'find', but got '${args[1]}'`)
			}
			break
		case "website":
			switch (args[1]) {
				case "add":
					await addWebsite(args[2], args[3])
					break
				case "info":
					await websiteInfo(json)
					break
				case "remove":
					await removeWebsite(args[2])
					break
				default:
					console.error(`Expected either 'add', 'info' or 'new' after 'website', but got '${args[1]}'`)
			}
			break
		case "change":
			await changeEndpoint(args[1], args[2], args[3])
			break
		case "stop":
			await stopNode()
			break
		default:
			console.error(`Command ${args[0]} not found`)
	}
}
main().catch(error => {
	console.error(error)
	process.exitCode = 1
})