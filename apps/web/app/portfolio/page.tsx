import { Nav } from "@/components/Nav";
import { PortfolioList } from "@/components/PortfolioList";

export default function PortfolioPage() {
  return (
    <main>
      <Nav />
      <section className="mx-auto max-w-3xl px-12 py-16">
        <h1 className="mb-2 font-display text-2xl font-semibold text-text">
          Your portfolio
        </h1>
        <p className="mb-8 text-sm text-muted">
          Markets you hold a position in, based on your wallet&apos;s
          on-chain balances.
        </p>
        <PortfolioList />
      </section>
    </main>
  );
}
