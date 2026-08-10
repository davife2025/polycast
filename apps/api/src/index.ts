// Must be the first import: loads .env into process.env before any other
// module (lib/chain.ts, lib/supabase.ts, the indexer) reads from it at
// module-load time. With "module": "commonjs" in tsconfig, imports run
// top-to-bottom in the order written, so this ordering is load-bearing.
import "dotenv/config";
import Fastify from "fastify";
import { marketsRoutes } from "./routes/markets";
import { startIndexer } from "./indexer";
import { startPolymarketRelayer } from "./relayer";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  service: "polycast-api",
  chain: "flare-coston2",
}));

app.register(marketsRoutes);

const port = Number(process.env.PORT ?? 4000);

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`polycast-api listening on port ${port}`);
    // Fire-and-forget: both run independently of request handling, and
    // neither ever throws (see indexer/index.ts and relayer/index.ts).
    startIndexer();
    startPolymarketRelayer();
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
