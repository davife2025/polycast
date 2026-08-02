import Fastify from "fastify";
import { marketsRoutes } from "./routes/markets";

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
  .then(() => app.log.info(`polycast-api listening on port ${port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
