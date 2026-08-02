import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

// All amounts in this file are small raw integers (not scaled by 18
// decimals) specifically so the constant-product math can be verified
// by hand alongside each test — see the comments before each expectation.
describe("PolycastAMM — buy/sell math (hand-verified)", function () {
  let deployer: Signer, lp: Signer, buyer: Signer, seller: Signer;
  let collateral: any;
  let resolver: any;
  let market: any;
  let amm: any;
  const marketId = ethers.id("amm-test-market");

  beforeEach(async () => {
    [deployer, lp, buyer, seller] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateral = await MockERC20.deploy("Mock USD", "mUSD");
    await collateral.waitForDeployment();

    for (const signer of [lp, buyer, seller]) {
      await collateral.mint(await signer.getAddress(), 1_000_000n);
    }

    const ManualResolver = await ethers.getContractFactory("ManualResolver");
    resolver = await ManualResolver.deploy(await deployer.getAddress());
    await resolver.waitForDeployment();

    const PolycastMarket = await ethers.getContractFactory("PolycastMarket");
    market = await PolycastMarket.deploy(
      marketId,
      "Will this AMM math check out?",
      await collateral.getAddress(),
      await resolver.getAddress(),
    );
    await market.waitForDeployment();

    const PolycastAMM = await ethers.getContractFactory("PolycastAMM");
    amm = await PolycastAMM.deploy(await market.getAddress());
    await amm.waitForDeployment();
  });

  it("seeds a fresh pool at exactly 50/50 price", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), 1000n);
    await amm.connect(lp).addLiquidity(1000n);

    const [yesReserve, noReserve] = await amm.getReserves();
    expect(yesReserve).to.equal(1000n);
    expect(noReserve).to.equal(1000n);

    const [yesPrice, noPrice] = await amm.getPrices();
    const WAD = 10n ** 18n;
    expect(yesPrice).to.equal(WAD / 2n);
    expect(noPrice).to.equal(WAD / 2n);

    expect(await amm.totalLpShares()).to.equal(2000n);
    expect(await amm.lpShares(await lp.getAddress())).to.equal(2000n);
  });

  it("buy: matches hand-calculated tokensOut with correct (pool-favoring) rounding", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), 1000n);
    await amm.connect(lp).addLiquidity(1000n);

    // Hand calculation: pool at (1000, 1000), k = 1,000,000.
    // Mint pair with 100 -> temp reserves (1100, 1100).
    // otherAfter (NO side) = 1100. ceilDiv(1,000,000, 1100) = 910
    // (1,000,000 / 1100 = 909.09..., rounds UP to 910 — the safe direction,
    // see the contract's rounding comment).
    // tokensOut = 1100 - 910 = 190.
    await collateral.connect(buyer).approve(await amm.getAddress(), 100n);
    const tx = await amm.connect(buyer).buy(1, 100n, 0n); // outcome 1 = YES
    const receipt = await tx.wait();

    const boughtEvent = receipt?.logs
      .map((log: any) => {
        try {
          return amm.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "Bought");

    expect(boughtEvent?.args?.tokensOut).to.equal(190n);
    expect(await market.balanceOf(await buyer.getAddress(), 1)).to.equal(190n);

    // Pool's own reserves after the trade: yesReserve = 1100 - 190 = 910,
    // noReserve unchanged at 1100.
    const [yesReserve, noReserve] = await amm.getReserves();
    expect(yesReserve).to.equal(910n);
    expect(noReserve).to.equal(1100n);

    // Invariant check: the pool's product after the trade (910 * 1100 =
    // 1,001,000) must be >= the pre-trade k (1,000,000) — confirming the
    // rounding fix protects the pool rather than slowly leaking value.
    expect(yesReserve * noReserve >= 1_000_000n).to.equal(true);
  });

  it("price moves in the correct direction after a buy (YES gets more expensive after buying YES)", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), 1000n);
    await amm.connect(lp).addLiquidity(1000n);

    const [yesPriceBefore] = await amm.getPrices();

    await collateral.connect(buyer).approve(await amm.getAddress(), 100n);
    await amm.connect(buyer).buy(1, 100n, 0n);

    const [yesPriceAfter] = await amm.getPrices();
    expect(yesPriceAfter > yesPriceBefore).to.equal(true);
  });

  it("buy reverts on slippage when minTokensOut isn't met", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), 1000n);
    await amm.connect(lp).addLiquidity(1000n);

    await collateral.connect(buyer).approve(await amm.getAddress(), 100n);
    // We know the real tokensOut is 190 — ask for more than that.
    await expect(
      amm.connect(buyer).buy(1, 100n, 191n),
    ).to.be.revertedWith("slippage: tokensOut below minimum");
  });

  it("sell: matches hand-calculated tokensIn, and requires ERC-1155 approval first", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), 1000n);
    await amm.connect(lp).addLiquidity(1000n);

    // Seller gets their own YES/NO directly from the market (not via the
    // AMM), simulating someone who minted a pair earlier and now wants to
    // sell just the YES side into this pool.
    await collateral.connect(seller).approve(await market.getAddress(), 300n);
    await market.connect(seller).mintPair(300n);

    // Hand calculation: pool at (1000, 1000), k = 1,000,000.
    // Selling YES for collateralOut = 50:
    // otherAfterRemoval (NO side, since NO gets reduced by collateralOut
    // via the merge) = 1000 - 50 = 950.
    // ceilDiv(1,000,000, 950) = 1053 (1,000,000/950 = 1052.63..., rounds up).
    // tokensIn = 1053 + 50 - 1000 = 103.

    // Without approval first, the AMM can't pull the seller's YES tokens.
    await expect(
      amm.connect(seller).sell(1, 50n, 1000n),
    ).to.be.revertedWithCustomError(market, "ERC1155MissingApprovalForAll");

    await market.connect(seller).setApprovalForAll(await amm.getAddress(), true);

    const balBefore = await collateral.balanceOf(await seller.getAddress());
    const tx = await amm.connect(seller).sell(1, 50n, 1000n);
    const receipt = await tx.wait();
    const balAfter = await collateral.balanceOf(await seller.getAddress());

    const soldEvent = receipt?.logs
      .map((log: any) => {
        try {
          return amm.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "Sold");

    expect(soldEvent?.args?.tokensIn).to.equal(103n);
    expect(balAfter - balBefore).to.equal(50n);

    // Seller started with 300 YES, sold 103 of them.
    expect(await market.balanceOf(await seller.getAddress(), 1)).to.equal(197n);
  });

  it("sell reverts on slippage when maxTokensIn is too low", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), 1000n);
    await amm.connect(lp).addLiquidity(1000n);

    await collateral.connect(seller).approve(await market.getAddress(), 300n);
    await market.connect(seller).mintPair(300n);
    await market.connect(seller).setApprovalForAll(await amm.getAddress(), true);

    // We know the real tokensIn required is 103 — cap below that.
    await expect(
      amm.connect(seller).sell(1, 50n, 102n),
    ).to.be.revertedWith("slippage: tokensIn above maximum");
  });

  it("second liquidity addition to a still-balanced pool mints shares at the same ratio as the first", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), 1000n);
    await amm.connect(lp).addLiquidity(1000n);
    expect(await amm.totalLpShares()).to.equal(2000n);

    const secondLp = seller; // reusing a signer as a second LP for this test
    await collateral.connect(secondLp).approve(await amm.getAddress(), 500n);
    await amm.connect(secondLp).addLiquidity(500n);

    // poolValueBefore = 1000+1000 = 2000; lpSharesMinted = 2000 * (2*500) / 2000 = 1000
    expect(await amm.lpShares(await secondLp.getAddress())).to.equal(1000n);
    expect(await amm.totalLpShares()).to.equal(3000n);
  });

  it("removeLiquidity returns a proportional share of current reserves", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), 1000n);
    await amm.connect(lp).addLiquidity(1000n);

    // LP owns 100% of the pool (2000 of 2000 shares) — withdrawing half
    // their shares should return half of each reserve.
    await amm.connect(lp).removeLiquidity(1000n);

    expect(await market.balanceOf(await lp.getAddress(), 1)).to.equal(500n); // YES
    expect(await market.balanceOf(await lp.getAddress(), 0)).to.equal(500n); // NO

    const [yesReserve, noReserve] = await amm.getReserves();
    expect(yesReserve).to.equal(500n);
    expect(noReserve).to.equal(500n);
  });
});

describe("PolycastAMMFactory", function () {
  it("deploys one AMM per market and prevents duplicates", async () => {
    const [deployer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const collateral = await MockERC20.deploy("Mock USD", "mUSD");
    await collateral.waitForDeployment();

    const ManualResolver = await ethers.getContractFactory("ManualResolver");
    const resolver = await ManualResolver.deploy(await deployer.getAddress());
    await resolver.waitForDeployment();

    const PolycastMarket = await ethers.getContractFactory("PolycastMarket");
    const market = await PolycastMarket.deploy(
      ethers.id("amm-factory-test-market"),
      "Some question",
      await collateral.getAddress(),
      await resolver.getAddress(),
    );
    await market.waitForDeployment();

    const AMMFactory = await ethers.getContractFactory("PolycastAMMFactory");
    const ammFactory = await AMMFactory.deploy();
    await ammFactory.waitForDeployment();

    await ammFactory.createAMM(await market.getAddress());
    const ammAddress = await ammFactory.ammForMarket(await market.getAddress());
    expect(ammAddress).to.not.equal(ethers.ZeroAddress);

    await expect(
      ammFactory.createAMM(await market.getAddress()),
    ).to.be.revertedWith("AMM already exists for this market");
  });
});
