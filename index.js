import 'dotenv/config';
import OpenAI from 'openai';
import { HypersyncClient } from "@envio-dev/hypersync-client";
import { decodeEventLog, parseAbiItem, formatUnits } from "viem";

// --- CONFIGURATION ---

// 1. Envio & Gaia Setup
const HYPERSYNC_URL = "https://eth.hypersync.xyz";
const ENVIO_API_TOKEN = process.env.ENVIO_API_TOKEN || "";
const GAIA_BASE_URL = 'https://llama3b.gaia.domains/v1';
const GAIA_API_KEY = 'gaia';

// 2. Define Available Modes
const MODES = {
    USDC_WHALE: {
        name: "USDC Whale Watcher",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase(), // USDC
        abi: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
        topic: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        threshold: 100000 * 1000000, // 100k USDC
        filter: (event, threshold) => Number(event.args.value) >= threshold,
        format: (event) => {
            const val = Number(event.args.value) / 1000000;
            return {
                amount: val,
                amountStr: val.toLocaleString(undefined, { maximumFractionDigits: 0 }) + " USDC",
                tx: event.transactionHash
            };
        },
        prompt: (data) => `
            You are a dramatic crypto gossip columnist named "Gossip Protocol".
            A massive whale just moved ${data.amountStr} on Ethereum!
            Transaction Hash: ${data.tx}
            Write a 1-sentence breaking rumor about what they might be buying. 
            Be funny, speculative, and dramatic.
        `
    },
    UNISWAP_HIGH_ROLLER: {
        name: "Uniswap High Roller",
        address: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640".toLowerCase(), // USDC/ETH 500 Pool
        abi: parseAbiItem('event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'),
        topic: "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67",
        threshold: 10 * 1000000000000000000, // 10 ETH (approx, strictly checking amount0 or amount1 magnitude)
        filter: (event, threshold) => {
            // Check if either amount is > threshold (taking absolute value)
            const abs0 = event.args.amount0 < 0n ? -event.args.amount0 : event.args.amount0;
            const abs1 = event.args.amount1 < 0n ? -event.args.amount1 : event.args.amount1;
            // amount1 is ETH (18 decimals), amount0 is USDC (6 decimals) in this pool?
            // Actually: Token0 is USDC, Token1 is WETH.
            // Let's simplified thresholds: 50k USDC (50000 * 10^6) or 20 ETH (20 * 10^18)
            const usdcThreshold = 50000n * 1000000n;
            const ethThreshold = 20n * 1000000000000000000n;

            return abs0 >= usdcThreshold || abs1 >= ethThreshold;
        },
        format: (event) => {
            const usdc = Number(event.args.amount0) / 1000000;
            const eth = Number(event.args.amount1) / 1e18;
            return {
                amount: Math.abs(eth), // focus on ETH size for display
                amountStr: `${Math.abs(eth).toFixed(2)} ETH and ${Math.abs(usdc).toFixed(0)} USDC`,
                tx: event.transactionHash
            };
        },
        prompt: (data) => `
            You are a degen DeFi trader named "Alpha Leaker".
            A massive trade just happened on Uniswap: ${data.amountStr} were swapped!
            Transaction Hash: ${data.tx}
            Hype up this trade. Is it a dump? A pump? 
            Use DeFi slang (wagmi, rekt, apeing). Max 2 sentences.
        `
    }
};

// 3. SELECT ACTIVE MODE HERE
const CURRENT_MODE = MODES.UNISWAP_HIGH_ROLLER;
// Change to MODES.UNISWAP_HIGH_ROLLER to switch!

// --- SETUP CLIENTS ---
const openai = new OpenAI({
    baseURL: GAIA_BASE_URL,
    apiKey: GAIA_API_KEY,
});

const client = new HypersyncClient({
    url: HYPERSYNC_URL,
    apiToken: ENVIO_API_TOKEN,
});

let lastScannedBlock = 0;

async function getLatestHeight() {
    try {
        return await client.getHeight();
    } catch (e) {
        console.error("Error fetching height:", e.message);
        return 0;
    }
}

async function fetchEvents() {
    try {
        const currentHeight = await getLatestHeight();
        if (currentHeight === 0 || currentHeight <= lastScannedBlock) {
            return [];
        }

        // Initial scan: last 10 blocks
        if (lastScannedBlock === 0) {
            lastScannedBlock = currentHeight - 10;
            console.log(`Initial start: Scanning from block ${lastScannedBlock} to ${currentHeight}`);
        }

        console.log(`Scanning blocks ${lastScannedBlock + 1} to ${currentHeight}...`);

        const query = {
            fromBlock: lastScannedBlock + 1,
            toBlock: currentHeight,
            logs: [
                {
                    address: [CURRENT_MODE.address],
                    topics: [[CURRENT_MODE.topic]]
                }
            ],
            fieldSelection: {
                log: [
                    "Address",
                    "Topic0", "Topic1", "Topic2", "Topic3",
                    "Data",
                    "BlockNumber",
                    "TransactionHash",
                    "LogIndex"
                ]
            }
        };

        const res = await client.get(query);
        lastScannedBlock = currentHeight;

        // Decode & Filter
        const events = res.data.logs.map(log => {
            try {
                const decoded = decodeEventLog({
                    abi: [CURRENT_MODE.abi],
                    data: log.data,
                    topics: log.topics
                });

                // Add tx info to args for filter convenience if needed, but usually strictly args
                const eventWithMeta = { ...decoded, transactionHash: log.transactionHash, blockNumber: log.blockNumber };

                if (CURRENT_MODE.filter(eventWithMeta, CURRENT_MODE.threshold)) {
                    return CURRENT_MODE.format(eventWithMeta);
                }
                return null;
            } catch (e) {
                return null;
            }
        }).filter(t => t !== null);

        return events;

    } catch (error) {
        console.error("Error fetching from Hypersync:", error.message);
        return [];
    }
}

async function analyzeAndReport(data) {
    console.log(`\n� ALERT: ${data.amountStr}`);
    console.log(`   Tx: ${data.tx}`);

    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: CURRENT_MODE.prompt(data) }],
            model: "llama",
            max_tokens: 150,
        });

        const response = completion.choices[0].message.content;
        console.log(`\n🤖 GAIA SAYS:\n"${response.trim()}"\n`);
        console.log("-".repeat(50));

    } catch (error) {
        console.error("Error contacting Gaia:", error.message);
    }
}

async function startAgent() {
    console.log(`Starting Gaia x Envio Agent`);
    console.log(`Mode: ${CURRENT_MODE.name}`);

    if (ENVIO_API_TOKEN) {
        console.log(`✅ API Token loaded: ${ENVIO_API_TOKEN.slice(0, 4)}...`);
    } else {
        console.warn("⚠️  WARNING: No ENVIO_API_TOKEN provided.");
    }

    await fetchEvents();

    setInterval(async () => {
        const events = await fetchEvents();

        if (events.length > 0) {
            console.log(`Found ${events.length} interesting events!`);
            // Report largest one (naive sort by 'amount' property we made)
            const largest = events.reduce((prev, current) => (prev.amount > current.amount) ? prev : current);
            await analyzeAndReport(largest);
        } else {
            process.stdout.write(".");
        }
    }, 10000);
}

startAgent();
