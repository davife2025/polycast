import {
  polycastMarketAbi,
  polycastMarketFactoryAbi,
  polycastAMMAbi,
  polycastAMMFactoryAbi,
  erc20Abi,
} from "@polycast/abi";
import { marketFactoryAddress, ammFactoryAddress } from "./chain";

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

export const polycastAMMFactoryContract = {
  address: ammFactoryAddress,
  abi: polycastAMMFactoryAbi,
} as const;

export function polycastAMMContract(ammAddress: `0x${string}`) {
  return {
    address: ammAddress,
    abi: polycastAMMAbi,
  } as const;
}

export { erc20Abi };
