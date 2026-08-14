"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenSymbol = getTokenSymbol;
const abi_1 = require("@polycast/abi");
const chain_1 = require("../lib/chain");
const symbolCache = new Map();
/**
 * Reads and caches an ERC-20 token's symbol. Used to populate
 * markets.collateral_symbol without needing the frontend to know about
 * every collateral token in advance.
 */
async function getTokenSymbol(tokenAddress) {
    const cached = symbolCache.get(tokenAddress);
    if (cached)
        return cached;
    try {
        const symbol = await chain_1.publicClient.readContract({
            address: tokenAddress,
            abi: abi_1.erc20Abi,
            functionName: "symbol",
        });
        symbolCache.set(tokenAddress, symbol);
        return symbol;
    }
    catch (err) {
        console.warn(`Could not read symbol() for token ${tokenAddress}:`, err);
        return "UNKNOWN";
    }
}
//# sourceMappingURL=erc20.js.map