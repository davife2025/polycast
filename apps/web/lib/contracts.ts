import {
  polycastMarketAbi,
  polycastMarketFactoryAbi,
} from "@polycast/abi";
import { marketFactoryAddress } from "./chain";

/**
 * Reusable {address, abi} configs for wagmi's useReadContract /
 * useWriteContract / useReadContracts hooks. Individual markets don't have
 * a fixed address (there can be many), so their config is built per-market
 * via `polycastMarketContract(address)` instead of exported as a constant.
 */
export const polycastMarketFactoryContract = {
  address: marketFactoryAddress,
  abi: polycastMarketFactoryAbi,
} as const;

export function polycastMarketContract(marketAddress: `0x${string}`) {
  return {
    address: marketAddress,
    abi: polycastMarketAbi,
  } as const;
}

// Minimal ERC-20 ABI — just enough for the mint/merge/redeem flow
// (balance, allowance, approve). Collateral tokens are arbitrary ERC-20s
// (or FAssets), so we don't need their full ABI, just the standard bits.
export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;
