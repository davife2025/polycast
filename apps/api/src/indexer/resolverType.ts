/**
 * A market's on-chain event only tells us the resolver's ADDRESS, not
 * which kind it is (FTSO, Web2Json, or manual). Rather than guess, we
 * consult a small address->type map from env, which you populate with
 * the addresses printed by `npm run deploy:coston2` in packages/contracts.
 *
 * This is a stopgap. A cleaner long-term fix would be for each resolver
 * contract to expose a `resolverType()` view function the indexer can
 * just call directly — worth adding in a later session once the resolver
 * interfaces are settled.
 *
 * Env format: RESOLVER_TYPE_MAP='{"0xabc...":"manual","0xdef...":"ftso"}'
 */
type ResolverType = "ftso" | "web2json" | "manual" | "unknown";

function loadMap(): Record<string, ResolverType> {
  const raw = process.env.RESOLVER_TYPE_MAP;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, ResolverType>;
    const normalized: Record<string, ResolverType> = {};
    for (const [address, type] of Object.entries(parsed)) {
      normalized[address.toLowerCase()] = type;
    }
    return normalized;
  } catch (err) {
    console.warn("RESOLVER_TYPE_MAP is not valid JSON, ignoring:", err);
    return {};
  }
}

const resolverMap = loadMap();

export function getResolverType(resolverAddress: string): ResolverType {
  return resolverMap[resolverAddress.toLowerCase()] ?? "unknown";
}
