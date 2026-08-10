/**
 * Verification script for the on-chain half of the Polymarket relayer.
 *
 * This does NOT touch Polymarket's API at all — it exists specifically
 * to test pushPriceOnChain() (the part of the relayer that writes to
 * PolymarketPriceOracle) against a real running chain, independent of
 * whether Polymarket itself is reachable.
 *
 * Run it yourself:
 *   1. cd packages/contracts && npx hardhat node          (leave running)
 *   2. cd packages/contracts && node build-artifacts.js   (if not already built)
 *   3. cd apps/api && npx tsx verify-relayer-push.ts
 *
 * Expected output ends with "VERIFIED: pushPriceOnChain() correctly
 * wrote to a real contract..." — if it doesn't, something in the
 * relayer's on-chain-writing logic is broken, independent of any
 * Polymarket connectivity issue.
 */
import { createWalletClient, createPublicClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "fs";
import path from "path";
import { pushPriceOnChain } from "./src/relayer/pushPrice";

const localChain = {
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
} as const;

async function main() {
  const artifactPath = path.resolve(
    __dirname,
    "../../packages/contracts/artifacts/contracts/oracles/PolymarketPriceOracle.sol/PolymarketPriceOracle.json",
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // Hardhat's well-known local dev account #0 — publicly known test key, never used for anything real.
  const deployerKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const account = privateKeyToAccount(deployerKey as `0x${string}`);

  const walletClient = createWalletClient({ account, chain: localChain, transport: http() });
  const publicClient = createPublicClient({ chain: localChain, transport: http() });

  console.log("Deploying PolymarketPriceOracle to local network...");
  const deployHash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [account.address, account.address], // owner = relayer = account0 for this test
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  const oracleAddress = deployReceipt.contractAddress as `0x${string}`;
  console.log("Deployed at", oracleAddress);

  const marketId = ("0x" + "11".repeat(32)) as `0x${string}`;
  const priceWad = parseUnits("0.73", 18);

  console.log("\nCalling the REAL pushPriceOnChain() from src/relayer/pushPrice.ts...");
  const txHash = await pushPriceOnChain(
    walletClient as any,
    oracleAddress,
    marketId,
    priceWad,
  );
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("Pushed. Tx hash:", txHash);

  const result = (await publicClient.readContract({
    address: oracleAddress,
    abi: artifact.abi,
    functionName: "getPrice",
    args: [marketId],
  })) as [bigint, bigint];

  console.log("\nRead back from chain: yesPriceWad =", result[0].toString());

  if (result[0] !== priceWad) {
    throw new Error(
      `MISMATCH: pushed ${priceWad} but read back ${result[0]} — pushPriceOnChain is broken!`,
    );
  }

  console.log(
    "\n✅ VERIFIED: pushPriceOnChain() correctly wrote to a real contract on a real " +
      "(local) chain, and the value read back matches exactly what was pushed.",
  );
}

main().catch((e) => {
  console.error("❌ VERIFICATION FAILED:", e);
  process.exit(1);
});
