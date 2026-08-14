import { Nav } from "@/components/Nav";
import { CreateMarketForm } from "@/components/CreateMarketForm";

export default function CreateMarketPage() {
  return (
    <main>
      <Nav />
      <section className="mx-auto max-w-2xl px-12 py-16">
        <h1 className="mb-2 font-display text-2xl font-semibold text-text">
          Create a market
        </h1>
        <p className="mb-8 text-sm text-muted">
          Deploys a new PolycastMarket via the factory. Once created, you
          can deploy an AMM or tracking minter for it from the market
          page.
        </p>
        <CreateMarketForm />
      </section>
    </main>
  );
}
