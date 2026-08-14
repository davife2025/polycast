import { Nav } from "@/components/Nav";
import { MarketsList } from "@/components/MarketsList";

export default function HomePage() {
  return (
    <main>
      <Nav />

      <section className="mx-auto max-w-6xl px-12 pb-10 pt-16">
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <div>
            <div className="mb-5 inline-block rounded-full bg-primary-dim px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wide text-primary">
              Built on Flare — interoperable by design
            </div>
            <h1 className="mb-5 font-display text-4xl font-semibold leading-tight tracking-tight text-text md:text-5xl">
              Every chain&apos;s data,
              <br />
              one resolved price.
            </h1>
            <p className="mb-8 max-w-md text-[16.5px] leading-relaxed text-muted">
              Polycast settles prediction markets against verified,
              cross-chain oracle consensus — so an outcome asset means the
              same thing no matter which network it moves through.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_4px_20px_rgba(20,22,43,0.05)]">
            <div className="flex h-52 items-center justify-center font-mono text-sm text-muted-dim">
              live convergence visual
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-12 pb-24">
        <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-wide text-muted-dim">
          Live markets
        </div>
        <MarketsList />
      </section>
    </main>
  );
}
