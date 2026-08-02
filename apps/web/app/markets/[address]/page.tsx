import { MarketDetail } from "@/components/MarketDetail";
import { Nav } from "@/components/Nav";

export default function MarketDetailPage({
  params,
}: {
  params: { address: string };
}) {
  return (
    <main>
      <Nav />
      <section className="mx-auto max-w-3xl px-12 py-16">
        <MarketDetail address={params.address as `0x${string}`} />
      </section>
    </main>
  );
}
