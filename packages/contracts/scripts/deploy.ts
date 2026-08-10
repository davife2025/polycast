import { ethers } from "hardhat";

/**
 * Deploy script — deploys the full contract set: the market factory,
 * the AMM factory, all three resolvers, a demo market, and a demo AMM
 * seeded with liquidity so the frontend has a real price to show
 * immediately after deploy.
 *
 * NOTE: uses MockERC20 as collateral for this smoke-test deployment.
 * A later session swaps this for a real Coston2 collateral token address
 * (USDT0, or an FAsset like FXRP) once that's decided.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const collateral = await MockERC20.deploy("Polycast Test USD", "pUSD");
  await collateral.waitForDeployment();
  console.log("MockERC20 (test collateral) deployed to:", await collateral.getAddress());
  await (await collateral.mint(deployer.address, ethers.parseUnits("10000", 18))).wait();

  const ManualResolver = await ethers.getContractFactory("ManualResolver");
  const manualResolver = await ManualResolver.deploy(deployer.address);
  await manualResolver.waitForDeployment();
  console.log("ManualResolver deployed to:", await manualResolver.getAddress());

  const FtsoPriceResolver = await ethers.getContractFactory("FtsoPriceResolver");
  const ftsoResolver = await FtsoPriceResolver.deploy();
  await ftsoResolver.waitForDeployment();
  console.log("FtsoPriceResolver deployed to:", await ftsoResolver.getAddress());

  const FdcWeb2JsonResolver = await ethers.getContractFactory("FdcWeb2JsonResolver");
  const fdcResolver = await FdcWeb2JsonResolver.deploy();
  await fdcResolver.waitForDeployment();
  console.log("FdcWeb2JsonResolver deployed to:", await fdcResolver.getAddress());

  const Factory = await ethers.getContractFactory("PolycastMarketFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  console.log("PolycastMarketFactory deployed to:", await factory.getAddress());

  const AMMFactory = await ethers.getContractFactory("PolycastAMMFactory");
  const ammFactory = await AMMFactory.deploy();
  await ammFactory.waitForDeployment();
  console.log("PolycastAMMFactory deployed to:", await ammFactory.getAddress());

  const marketId = ethers.id("polycast-demo-market-1");
  const tx = await factory.createMarket(
    marketId,
    "Demo market: does the full mint/merge/settle/redeem flow work end to end on Coston2?",
    await collateral.getAddress(),
    await manualResolver.getAddress(),
  );
  const receipt = await tx.wait();
  const event = receipt?.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "MarketCreated");
  const marketAddress = event?.args?.market;
  console.log("Demo PolycastMarket deployed to:", marketAddress);

  const ammTx = await ammFactory.createAMM(marketAddress);
  const ammReceipt = await ammTx.wait();
  const ammEvent = ammReceipt?.logs
    .map((log) => {
      try {
        return ammFactory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === "AMMCreated");
  const ammAddress = ammEvent?.args?.amm;
  console.log("Demo PolycastAMM deployed to:", ammAddress);

  // Seed the demo AMM with some initial liquidity so the frontend has a
  // real, non-zero price to show immediately after deploy.
  const amm = await ethers.getContractAt("PolycastAMM", ammAddress);
  await (await collateral.approve(ammAddress, ethers.parseUnits("1000", 18))).wait();
  await (await amm.addLiquidity(ethers.parseUnits("1000", 18))).wait();
  console.log("Seeded demo AMM with 1000 pUSD of liquidity (50/50 starting price).");

  console.log("\nDone. Verify on Coston2 explorer:");
  console.log(`https://coston2-explorer.flare.network/address/${marketAddress}`);
  console.log("\nSet these in your .env.local / .env files:");
  console.log(`NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=${await factory.getAddress()}`);
  console.log(`NEXT_PUBLIC_AMM_FACTORY_ADDRESS=${await ammFactory.getAddress()}`);
  console.log(`MARKET_FACTORY_ADDRESS=${await factory.getAddress()}`);
  console.log(`AMM_FACTORY_ADDRESS=${await ammFactory.getAddress()}`);
  console.log(
    `RESOLVER_TYPE_MAP={"${await manualResolver.getAddress()}":"manual"}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

