
const {chromium} = require("playwright")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {pathToFileURL} = require("node:url")

const BATCH_SIZE = 50_000_000
const MAX_NONCE = (1n << 64n) - 1n

let gpuBrowser = null
let gpuPage = null
let gpuMinerReady = null
let miningQueue = Promise.resolve()

function getMinerPagePath() {
    if (!process.pkg) {
        return path.join(__dirname, "gpuMinerWindow.html")
    }

    const targetDir = path.join(
        os.homedir(),
        ".meshweb-cli",
        "gpu"
    )

    fs.mkdirSync(targetDir, {
        recursive: true,
        mode: 0o700
    })

    for (const filename of [
        "gpuMinerWindow.html",
        "gpuMinerWindow.js"
    ]) {
        const sourcePath = path.join(__dirname, filename)
        const targetPath = path.join(targetDir, filename)

        fs.writeFileSync(
            targetPath,
            fs.readFileSync(sourcePath),
            {mode: 0o600}
        )
    }

    return path.join(targetDir, "gpuMinerWindow.html")
}

async function initGpuMiner() {
    if (gpuMinerReady) {
        return gpuMinerReady
    }

    gpuMinerReady = (async () => {
        gpuBrowser = await chromium.launch({
            headless: true,
            channel: "chromium",
            args: ["--enable-unsafe-webgpu"]
        })

        gpuPage = await gpuBrowser.newPage()

        await gpuPage.goto(
            pathToFileURL(getMinerPagePath()).href
        )

        const gpuInfo = await gpuPage.evaluate(async () => {
            if (typeof window.gpuMine !== "function") {
                throw new Error("GPU mining script failed to load")
            }

            if (!navigator.gpu) {
                throw new Error("WebGPU is unavailable")
            }

            const adapter = await navigator.gpu.requestAdapter({
                powerPreference: "high-performance"
            })

            if (!adapter) {
                throw new Error("No WebGPU adapter available")
            }

            return {
                fallback: adapter.isFallbackAdapter,
                info: adapter.info
            }
        })

        if (gpuInfo.fallback === true) {
            throw new Error("Software GPU fallback detected")
        }

        console.error("GPU initialized:", gpuInfo.info)

        return true
    })().catch(async error => {
        await gpuBrowser?.close().catch(() => {})

        gpuBrowser = null
        gpuPage = null
        gpuMinerReady = null

        throw error
    })

    return gpuMinerReady
}

async function mineBatch(domain, publicKey, startNonce) {
    await initGpuMiner()

    try {
        startNonce = BigInt(startNonce)
    } catch {
        throw new Error("startNonce must be an integer")
    }

    if (startNonce < 0n) {
        throw new Error("startNonce must be non-negative")
    }

    if (startNonce + BigInt(BATCH_SIZE) - 1n > MAX_NONCE) {
        throw new Error("Mining batch exceeds uint64 range")
    }

    const prefix = domain + publicKey

    const startNonceLow = Number(
        startNonce & 0xffffffffn
    )

    const startNonceHigh = Number(
        (startNonce >> 32n) & 0xffffffffn
    )

    const result = await gpuPage.evaluate(async job => {
        return await window.gpuMine(
            job.prefix,
            job.startNonceLow,
            job.startNonceHigh,
            job.attempts
        )
    }, {
        prefix,
        startNonceLow,
        startNonceHigh,
        attempts: BATCH_SIZE
    })

    if (!result || !result.ok) {
        throw new Error(result?.error || "GPU mining failed")
    }

    const nonce = BigInt(result.nonce)

    if (
        nonce < startNonce ||
        nonce >= startNonce + BigInt(BATCH_SIZE)
    ) {
        throw new Error("GPU returned a nonce outside the batch")
    }

    const actualHash = crypto
        .createHash("sha256")
        .update(prefix + nonce.toString())
        .digest("hex")

    if (actualHash !== result.hash) {
        throw new Error(
            `GPU SHA-256 mismatch: GPU=${result.hash}, CPU=${actualHash}`
        )
    }

    return result
}

function mine(domain, publicKey, startNonce = 0n) {
    const job = miningQueue.then(() =>
        mineBatch(domain, publicKey, startNonce)
    )

    miningQueue = job.catch(() => {})

    return job
}

async function closeGpuMiner() {
    await miningQueue

    await gpuBrowser?.close()

    gpuBrowser = null
    gpuPage = null
    gpuMinerReady = null
}

module.exports = {
    mine,
    initGpuMiner,
    closeGpuMiner,
    BATCH_SIZE,
    MAX_NONCE
}
