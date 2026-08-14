import { publicClient } from "../lib/chain";

/**
 * Coston2's public RPC caps eth_getLogs at 30 blocks per request, and the
 * chain is already millions of blocks tall, so a naive fromBlock: 0n /
 * toBlock: "latest" backfill query gets rejected outright. This wraps
 * publicClient.getContractEvents and fetches history in fixed-size chunks,
 * concatenating the results, so callers can keep asking for "everything
 * since genesis" without worrying about the provider's range limit.
 *
 * If your RPC provider supports a larger window, bump CHUNK_SIZE — just
 * keep it at or under whatever your provider allows for eth_getLogs.
 */
const CHUNK_SIZE = 30n;

type BaseParams = {
  address: `0x${string}`;
  abi: readonly unknown[];
  eventName: string;
  fromBlock?: bigint;
};

export async function getContractEventsChunked(params: BaseParams) {
  const latestBlock = await publicClient.getBlockNumber();
  const fromBlock = params.fromBlock ?? 0n;

  const allLogs: any[] = [];

  for (let start = fromBlock; start <= latestBlock; start += CHUNK_SIZE) {
    const end =
      start + CHUNK_SIZE - 1n > latestBlock
        ? latestBlock
        : start + CHUNK_SIZE - 1n;

    const logs = await publicClient.getContractEvents({
      ...params,
      fromBlock: start,
      toBlock: end,
    } as any);

    allLogs.push(...logs);
  }

  return allLogs;
}
