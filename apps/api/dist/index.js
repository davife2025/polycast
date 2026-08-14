"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Must be the first import: loads .env into process.env before any other
// module (lib/chain.ts, lib/supabase.ts, the indexer) reads from it at
// module-load time. With "module": "commonjs" in tsconfig, imports run
// top-to-bottom in the order written, so this ordering is load-bearing.
require("dotenv/config");
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const markets_1 = require("./routes/markets");
const portfolio_1 = require("./routes/portfolio");
const indexer_1 = require("./indexer");
const relayer_1 = require("./relayer");
const app = (0, fastify_1.default)({ logger: true });
// Read-only public data — safe to allow any origin. Nothing behind CORS
// here can write anything; all writes go through the user's own wallet
// directly to the chain, never through this API.
app.register(cors_1.default, { origin: true });
app.get("/health", async () => ({
    status: "ok",
    service: "polycast-api",
    chain: "flare-coston2",
}));
app.register(markets_1.marketsRoutes);
app.register(portfolio_1.portfolioRoutes);
const port = Number(process.env.PORT ?? 4000);
app
    .listen({ port, host: "0.0.0.0" })
    .then(() => {
    app.log.info(`polycast-api listening on port ${port}`);
    // Fire-and-forget: both run independently of request handling, and
    // neither ever throws (see indexer/index.ts and relayer/index.ts).
    (0, indexer_1.startIndexer)();
    (0, relayer_1.startPolymarketRelayer)();
})
    .catch((err) => {
    app.log.error(err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map