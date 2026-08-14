"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushPriceOnChain = pushPriceOnChain;
const abi_1 = require("@polycast/abi");
/**
 * Pushes a single price update on-chain. Deliberately factored out from
 * both the Polymarket-fetching logic (polymarket.ts) and the polling
 * loop (index.ts) so this piece — the part that actually matters for
 * on-chain correctness — can be tested against a real local chain
 * without needing to reach Polymarket's API at all. See
 * test/relayer-push.test.ts.
 */
async function pushPriceOnChain(walletClient, oracleAddress, oracleMarketId, yesPriceWad) {
    return walletClient.writeContract({
        address: oracleAddress,
        abi: abi_1.polymarketPriceOracleAbi,
        functionName: "updatePrice",
        args: [oracleMarketId, yesPriceWad],
    });
}
//# sourceMappingURL=pushPrice.js.map