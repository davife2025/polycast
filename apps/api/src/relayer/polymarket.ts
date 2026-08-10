const CLOB_BASE_URL = "https://clob.polymarket.com";

/**
 * Fetches the current midpoint price for a Polymarket CLOB token —
 * i.e. the live "odds" for one side of a market. Confirmed against
 * Polymarket's real, public, unauthenticated docs: GET
 * https://clob.polymarket.com/midpoint?token_id=X returns
 * {"mid_price": "0.45"}.
 *
 * NOTE: this function has not been dynamically tested against the real
 * Polymarket API. Tested directly from this sandbox and got back:
 * "Host not in allowlist: clob.polymarket.com" — that's this sandbox's
 * own network egress restriction responding, not Polymarket rejecting
 * the request. Same restriction class as Coston2's RPC and the Solidity
 * compiler binary host elsewhere in this build. The URL, endpoint
 * shape, and response field were verified via Polymarket's own current
 * documentation and official client library source, not assumed — but
 * this specific function should still be tested against the live API
 * from an environment with normal internet access before relying on it.
 */
export async function fetchMidpointPrice(tokenId: string): Promise<number> {
  const res = await fetch(`${CLOB_BASE_URL}/midpoint?token_id=${encodeURIComponent(tokenId)}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; Polycast/1.0; +https://github.com/)",
    },
  });
  if (!res.ok) {
    throw new Error(`Polymarket CLOB midpoint request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { mid_price: string };
  const price = Number(data.mid_price);
  if (Number.isNaN(price) || price < 0 || price > 1) {
    throw new Error(`Unexpected midpoint price value from Polymarket: ${data.mid_price}`);
  }
  return price;
}
