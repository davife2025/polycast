import { ethers } from "hardhat";

/**
 * Session 1 deploy script — deploys just enough to prove the toolchain
 * works end-to-end against Coston2: a ManualResolver and one
 * PolycastMarket wired to it.
 *
 * Session 2 replaces/extends this with the real factory deployment,
 * FtsoPriceResolver, FdcWeb2JsonResolver, and collateral token wiring.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const ManualResolver = await ethers.getContractFactory("ManualResolver");
  const resolver = await ManualResolver.deploy(deployer.address);
  await resolver.waitForDeployment();
  console.log("ManualResolver deployed to:", await resolver.getAddress());

  const marketId = ethers.id("polycast-smoke-test-market-1");
  const PolycastMarket = await ethers.getContractFactory("PolycastMarket");
  const market = await PolycastMarket.deploy(
    marketId,
    "Will this Session 1 smoke test deploy succeed on Coston2?",
    ethers.ZeroAddress, // placeholder collateral token — real token wiring in Session 2
    await resolver.getAddress(),
  );
  await market.waitForDeployment();
  console.log("PolycastMarket deployed to:", await market.getAddress());

  console.log("\nDone. Verify on Coston2 explorer:");
  console.log(
    `https://coston2-explorer.flare.network/address/${await market.getAddress()}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
