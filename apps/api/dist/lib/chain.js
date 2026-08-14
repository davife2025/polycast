"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicClient = exports.costonTwo = void 0;
const viem_1 = require("viem");
exports.costonTwo = {
    id: 114,
    name: "Flare Testnet Coston2",
    nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
    rpcUrls: {
        default: {
            http: [
                process.env.RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc",
            ],
        },
    },
    testnet: true,
};
/**
 * Read-only client used by the indexer (Session 4) to watch for
 * market events (MarketCreated, SharesMinted, MarketResolved, etc.)
 * and mirror them into Supabase.
 */
exports.publicClient = (0, viem_1.createPublicClient)({
    chain: exports.costonTwo,
    transport: (0, viem_1.http)(),
});
//# sourceMappingURL=chain.js.map