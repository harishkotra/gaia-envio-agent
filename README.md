# Gaia x Envio AI Agent

A powerful, configurable AI Agent that gossips about blockchain activity. Built with **Envio Hypersync** for high-speed data fetching and **Gaia** for snarky, intelligent commentary.

## Features

- **Real-time Blockchain Monitoring**: Uses Envio Hypersync to stream events from Ethereum Mainnet with low latency.
- **AI-Powered Commentary**: Uses a Gaia node (OpenAI-compatible) to generate unique, personality-driven reports on blockchain events.
- **Configurable Modes**:
  - 🐋 **USDC Whale Watcher**: Tracks large stablecoin movements (> $100k).
  - 🦄 **Uniswap High Roller**: Tracks massive swaps on Uniswap V3 (> 20 ETH / 50k USDC).

## Prerequisites

- Node.js (v18+)
- An **Envio API Token** (Get one for free at [envio.dev](https://envio.dev/app/api-tokens))

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Create a `.env` file in the `agent/` directory:
   ```env
   ENVIO_API_TOKEN=your_token_here
   ```

## Usage

Start the agent:
```bash
npm start
```

### Switching Modes

Open `index.js` and modify the `CURRENT_MODE` constant at the top of the file:

```javascript
// Switch to Uniswap Mode
const CURRENT_MODE = MODES.UNISWAP_HIGH_ROLLER;
```

## How It Works

1. **Hypersync Client**: Connects to `https://eth.hypersync.xyz` to query raw logs for specific contracts and topics.
2. **Filtering & Decoding**: Raw logs are decoded using `viem` and filtered based on the active mode's logic (e.g., value threshold).
3. **Gaia Inference**: When an interesting event is found, a prompt is constructed and sent to a Gaia Public Node.
4. **Output**: The agent prints the transaction details and the AI's witty commentary to the console.

## Project Structure

- `index.js`: Main entry point containing logic for Hypersync, Gaia, and configuration modes.
- `.env`: Stores your API secrets (gitignored).

## Technologies

- [Envio Hypersync](https://envio.dev): The fastest way to query blockchain data.
- [Gaia](https://docs.gaianet.ai/nodes): Decentralized AI compute nodes.
- [Viem](https://viem.sh): TypeScript Interface for Ethereum.