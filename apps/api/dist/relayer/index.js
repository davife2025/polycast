"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startPolymarketRelayer = startPolymarketRelayer;
const viem_1 = require("viem");
const accounts_1 = require("viem/accounts");
const chain_1 = require("../lib/chain");
const polymarket_1 = require("./polymarket");
const pushPrice_1 = require("./pushPrice");
function loadTrackedMarkets() {
    const raw = process.env.TRACKING_MARKETS;
    if (!raw)
        return [];
    try {
        return JSON.parse(raw);
    }
    catch (err) {
        console.warn("TRACKING_MARKETS is not valid JSON, ignoring:", err);
        return [];
    }
}
/**
 * Starts the Polymarket relayer: polls each tracked market's live
 * midpoint price and pushes it to PolymarketPriceOracle. Never throws —
 * same fail-gracefully philosophy as the rest of apps/api (see
 * indexer/index.ts) — a Polymarket outage or a bad RPC shouldn't be able
 * to take down the API.
 */
async function startPolymarketRelayer() {
    const oracleAddress = process.env.PRICE_ORACLE_ADDRESS;
    const relayerKey = process.env.RELAYER_PRIVATE_KEY;
    const pollIntervalMs = Number(process.env.RELAYER_POLL_INTERVAL_MS ?? 15_000);
    if (!oracleAddress || !relayerKey) {
        console.warn("PRICE_ORACLE_ADDRESS / RELAYER_PRIVATE_KEY not set — Polymarket relayer idle. " +
            "Deploy PolymarketPriceOracle and set these env vars to start tracking live prices.");
        return;
    }
    const trackedMarkets = loadTrackedMarkets();
    if (trackedMarkets.length === 0) {
        console.warn("TRACKING_MARKETS is empty — Polymarket relayer idle (nothing configured to track).");
        return;
    }
    let account;
    try {
        account = (0, accounts_1.privateKeyToAccount)(relayerKey);
    }
    catch (err) {
        console.error("RELAYER_PRIVATE_KEY is not a valid private key, relayer idle:", err);
        return;
    }
    const walletClient = (0, viem_1.createWalletClient)({
        account,
        chain: chain_1.costonTwo,
        transport: (0, viem_1.http)(),
    });
    console.log(`Polymarket relayer started (${account.address}), tracking ${trackedMarkets.length} market(s), polling every ${pollIntervalMs}ms`);
    async function tick() {
        for (const tm of trackedMarkets) {
            try {
                const midpoint = await (0, polymarket_1.fetchMidpointPrice)(tm.polymarketTokenId);
                const yesPriceWad = (0, viem_1.parseUnits)(midpoint.toFixed(6), 18);
                const txHash = await (0, pushPrice_1.pushPriceOnChain)(walletClient, oracleAddress, tm.oracleMarketId, yesPriceWad);
                console.log(`Updated ${tm.label}: ${(midpoint * 100).toFixed(1)}% YES (${txHash})`);
            }
            catch (err) {
                // One market's failure (Polymarket down, bad token_id, RPC hiccup)
                // must never stop the others or kill the polling loop entirely.
                console.error(`Failed to update price for "${tm.label}":`, err);
            }
        }
    }
    await tick();
    setInterval(tick, pollIntervalMs);
}
//# sourceMappingURL=index.js.map