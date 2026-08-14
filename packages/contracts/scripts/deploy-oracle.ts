import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const OracleMinterFactory = await ethers.getContractFactory("PolycastOracleMinterFactory");
  const oracleMinterFactory = await OracleMinterFactory.deploy();
  await oracleMinterFactory.waitForDeployment();
  const oracleMinterFactoryAddress = await oracleMinterFactory.getAddress();
  console.log("PolycastOracleMinterFactory deployed to:", oracleMinterFactoryAddress);

  let relayerAddress = process.env.RELAYER_ADDRESS;
  if (!relayerAddress && process.env.RELAYER_PRIVATE_KEY) {
    relayerAddress = new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY).address;
  }
  let usedFallbackRelayer = false;
  if (!relayerAddress) {
    relayerAddress = deployer.address;
    usedFallbackRelayer = true;
  }

  const PriceOracle = await ethers.getContractFactory("PolymarketPriceOracle");
  const priceOracle = await PriceOracle.deploy(deployer.address, relayerAddress);
  await priceOracle.waitForDeployment();
  const priceOracleAddress = await priceOracle.getAddress();
  console.log("PolymarketPriceOracle deployed to:", priceOracleAddress);
  console.log("  owner:", deployer.address);
  console.log("  relayer:", relayerAddress, usedFallbackRelayer ? "(fallback: deployer — see note below)" : "");

  if (usedFallbackRelayer) {
    console.log(
      "\nNOTE: no RELAYER_ADDRESS / RELAYER_PRIVATE_KEY was set, so the deployer " +
        "was registered as the relayer. Before running the real apps/api relayer, " +
        "either set RELAYER_PRIVATE_KEY here and redeploy, or call " +
        "priceOracle.setRelayer(<address matching apps/api's RELAYER_PRIVATE_KEY>) " +
        "from the owner account.",
    );
  }

  console.log("\nVerify on Coston2 explorer:");
  console.log(`https://coston2-explorer.flare.network/address/${oracleMinterFactoryAddress}`);
  console.log(`https://coston2-explorer.flare.network/address/${priceOracleAddress}`);

  console.log("\nSet these in apps/api/.env:");
  console.log(`ORACLE_MINTER_FACTORY_ADDRESS=${oracleMinterFactoryAddress}`);
  console.log(`PRICE_ORACLE_ADDRESS=${priceOracleAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});