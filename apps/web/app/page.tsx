import { Wordmark } from "@/components/Logo";
import { OddsCard } from "@/components/OddsCard";

const MARKETS = [
  {
    label: "Will Flare FTSO cross $2B in secured value by Q4?",
    yes: 73,
    volume: "$1.2M",
    chains: 4,
  },
  {
    label: "ETH spot ETF inflow exceeds $500M this week",
    yes: 61,
    volume: "$860K",
    chains: 3,
  },
  {
    label: "New cross-chain stablecoin launches on Flare by EOY",
    yes: 38,
    volume: "$410K",
    chains: 5,
  },
];

export default function HomePage() {
  return (
    <main>
      <nav className="flex items-center justify-between border-b border-border bg-surface px-12 py-5">
        <Wordmark size={19} />
        <div className="flex items-center gap-8">
          <span className="cursor-pointer text-sm font-medium text-muted">
            Markets
          </span>
          <span className="cursor-pointer text-sm font-medium text-muted">
            Portfolio
          </span>
          <span className="cursor-pointer text-sm font-medium text-muted">
            Docs
          </span>
          <button className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white">
            Connect wallet
          </button>
        </div>
      </nav>

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
            <div className="flex gap-3.5">
              <button className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(108,92,231,0.3)]">
                Explore markets
              </button>
              <button className="rounded-xl border border-border bg-surface px-6 py-3 text-sm font-medium text-text">
                Read the docs
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[0_4px_20px_rgba(20,22,43,0.05)]">
            <div className="flex h-52 items-center justify-center font-mono text-sm text-muted-dim">
              live convergence visual — wired up in Session 3
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-12 pb-24">
        <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-wide text-muted-dim">
          Live markets
        </div>
        <div className="grid gap-3.5">
          {MARKETS.map((m) => (
            <OddsCard key={m.label} {...m} />
          ))}
        </div>
      </section>
    </main>
  );
}
