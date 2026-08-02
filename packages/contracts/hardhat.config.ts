import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const COSTON2_RPC_URL =
  process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    coston2: {
      url: COSTON2_RPC_URL,
      chainId: 114,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    hardhat: {
      // local sandbox network for tests — no Flare-specific precompiles
      // (FTSO/FDC) available here, so resolver contracts are tested against
      // mocks. See test/ once Session 2 lands.
    },
  },
  etherscan: {
    apiKey: {
      coston2: "not-required-for-flarescan",
    },
    customChains: [
      {
        network: "coston2",
        chainId: 114,
        urls: {
          apiURL: "https://coston2-explorer.flare.network/api",
          browserURL: "https://coston2-explorer.flare.network",
        },
      },
    ],
  },
};

export default config;
