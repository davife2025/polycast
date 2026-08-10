import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

// All amounts in this file are small raw integers (not scaled by 18
// decimals) specifically so the constant-product math can be verified
// by hand alongside each test — see the comments before each expectation.
//
// Seed size note: liquidity seeding uses 1,000,000 (not a smaller round
// number) specifically so MINIMUM_LIQUIDITY (1,000) is a small, clean
// fraction of it rather than dominating the numbers.
describe("PolycastAMM — buy/sell math (hand-verified)", function () {
  let deployer: Signer, lp: Signer, buyer: Signer, seller: Signer;
  let collateral: any;
  let resolver: any;
  let market: any;
  let amm: any;
  const marketId = ethers.id("amm-test-market");
  const SEED = 1_000_000n;

  beforeEach(async () => {
    [deployer, lp, buyer, seller] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateral = await MockERC20.deploy("Mock USD", "mUSD");
    await collateral.waitForDeployment();

    for (const signer of [lp, buyer, seller]) {
      await collateral.mint(await signer.getAddress(), 10_000_000n);
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

  it("seeds a fresh pool at exactly 50/50 price, locking MINIMUM_LIQUIDITY", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), SEED);
    await amm.connect(lp).addLiquidity(SEED);

    const [yesReserve, noReserve] = await amm.getReserves();
    expect(yesReserve).to.equal(SEED);
    expect(noReserve).to.equal(SEED);

    const [yesPrice, noPrice] = await amm.getPrices();
    const WAD = 10n ** 18n;
    expect(yesPrice).to.equal(WAD / 2n);
    expect(noPrice).to.equal(WAD / 2n);

    // liquidity = sqrt(1,000,000 * 1,000,000) = 1,000,000 (exact — perfect square).
    // MINIMUM_LIQUIDITY (1,000) is locked, never credited to the LP.
    expect(await amm.totalLpShares()).to.equal(1_000_000n);
    expect(await amm.lpShares(await lp.getAddress())).to.equal(999_000n);
  });

  it("buy: matches hand-calculated tokensOut with fee + correct (pool-favoring) rounding", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), SEED);
    await amm.connect(lp).addLiquidity(SEED);

    // Hand calculation: pool at (1,000,000, 1,000,000), k = 1e12.
    // Buying YES with collateralIn = 100,000, FEE_BPS = 200 (2%):
    //   fee = 100,000 * 200 / 10,000 = 2,000
    //   netIn = 98,000
    // Full 100,000 is minted as a pair (fee portion becomes bonus reserve),
    // but only netIn drives the swap:
    //   otherAfter = noReserve + netIn = 1,098,000
    //   ceilDiv(1e12, 1,098,000) = 910,747 (1e12/1,098,000 = 910,746.29...,
    //   rounds up)
    //   tokensOut = (1,000,000 + 98,000) - 910,747 = 187,253
    await collateral.connect(buyer).approve(await amm.getAddress(), 100_000n);
    const tx = await amm.connect(buyer).buy(1, 100_000n, 0n); // outcome 1 = YES
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

    expect(boughtEvent?.args?.tokensOut).to.equal(187_253n);
    expect(await market.balanceOf(await buyer.getAddress(), 1)).to.equal(187_253n);

    // Pool's own reserves after the trade: yesReserve = 1,100,000 - 187,253
    // = 912,747 (full collateralIn was minted, only tokensOut was removed);
    // noReserve unchanged at 1,100,000 (full collateralIn minted, nothing
    // removed from this side).
    const [yesReserve, noReserve] = await amm.getReserves();
    expect(yesReserve).to.equal(912_747n);
    expect(noReserve).to.equal(1_100_000n);

    // Invariant check: the pool's product after the trade must be >= the
    // pre-trade k (1e12) — confirming the fee + rounding both protect the
    // pool rather than leaking value.
    expect(yesReserve * noReserve >= 1_000_000_000_000n).to.equal(true);
  });

  it("price moves in the correct direction after a buy (YES gets more expensive after buying YES)", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), SEED);
    await amm.connect(lp).addLiquidity(SEED);

    const [yesPriceBefore] = await amm.getPrices();

    await collateral.connect(buyer).approve(await amm.getAddress(), 100_000n);
    await amm.connect(buyer).buy(1, 100_000n, 0n);

    const [yesPriceAfter] = await amm.getPrices();
    expect(yesPriceAfter > yesPriceBefore).to.equal(true);
  });

  it("buy reverts on slippage when minTokensOut isn't met", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), SEED);
    await amm.connect(lp).addLiquidity(SEED);

    await collateral.connect(buyer).approve(await amm.getAddress(), 100_000n);
    // We know the real tokensOut is 187,253 — ask for more than that.
    await expect(
      amm.connect(buyer).buy(1, 100_000n, 187_254n),
    ).to.be.revertedWith("slippage: tokensOut below minimum");
  });

  it("sell: matches hand-calculated tokensIn (no fee yet on sell), and requires ERC-1155 approval first", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), SEED);
    await amm.connect(lp).addLiquidity(SEED);

    // Seller gets their own YES/NO directly from the market (not via the
    // AMM), simulating someone who minted a pair earlier and now wants to
    // sell just the YES side into this pool. This doesn't touch the AMM's
    // own reserves at all.
    await collateral.connect(seller).approve(await market.getAddress(), 300_000n);
    await market.connect(seller).mintPair(300_000n);

    // Hand calculation: pool at (1,000,000, 1,000,000), k = 1e12.
    // Selling YES for collateralOut = 50,000 (no fee applies to sell yet):
    // otherAfterRemoval (NO side) = 1,000,000 - 50,000 = 950,000
    // ceilDiv(1e12, 950,000) = 1,052,632 (1e12/950,000 = 1,052,631.58...,
    // rounds up)
    // tokensIn = 1,052,632 + 50,000 - 1,000,000 = 102,632

    // Without approval first, the AMM can't pull the seller's YES tokens.
    await expect(
      amm.connect(seller).sell(1, 50_000n, 1_000_000n),
    ).to.be.revertedWithCustomError(market, "ERC1155MissingApprovalForAll");

    await market.connect(seller).setApprovalForAll(await amm.getAddress(), true);

    const balBefore = await collateral.balanceOf(await seller.getAddress());
    const tx = await amm.connect(seller).sell(1, 50_000n, 1_000_000n);
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

    expect(soldEvent?.args?.tokensIn).to.equal(102_632n);
    expect(balAfter - balBefore).to.equal(50_000n);

    // Seller started with 300,000 YES, sold 102,632 of them.
    expect(await market.balanceOf(await seller.getAddress(), 1)).to.equal(197_368n);
  });

  it("sell reverts on slippage when maxTokensIn is too low", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), SEED);
    await amm.connect(lp).addLiquidity(SEED);

    await collateral.connect(seller).approve(await market.getAddress(), 300_000n);
    await market.connect(seller).mintPair(300_000n);
    await market.connect(seller).setApprovalForAll(await amm.getAddress(), true);

    // We know the real tokensIn required is 102,632 — cap below that.
    await expect(
      amm.connect(seller).sell(1, 50_000n, 102_631n),
    ).to.be.revertedWith("slippage: tokensIn above maximum");
  });

  it("second liquidity addition to a still-balanced pool mints shares proportionally via sqrt(reserves)", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), SEED);
    await amm.connect(lp).addLiquidity(SEED);
    expect(await amm.totalLpShares()).to.equal(1_000_000n);

    const secondLp = seller; // reusing a signer as a second LP for this test
    await collateral.connect(secondLp).approve(await amm.getAddress(), 500_000n);
    await amm.connect(secondLp).addLiquidity(500_000n);

    // liquidityBefore = sqrt(1,000,000 * 1,000,000) = 1,000,000
    // mint(500,000) -> reserves become (1,500,000, 1,500,000)
    // liquidityAfter = sqrt(1,500,000 * 1,500,000) = 1,500,000
    // lpSharesMinted = 1,000,000 * (1,500,000 - 1,000,000) / 1,000,000 = 500,000
    expect(await amm.lpShares(await secondLp.getAddress())).to.equal(500_000n);
    expect(await amm.totalLpShares()).to.equal(1_500_000n);
  });

  it("removeLiquidity returns a proportional share of current reserves", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), SEED);
    await amm.connect(lp).addLiquidity(SEED);

    // LP owns 999,000 of the 1,000,000 total shares (the other 1,000 is
    // permanently locked). Withdrawing 500,000 of their own shares should
    // return exactly 500,000 * (1,000,000/1,000,000) = 500,000 of each
    // reserve (share fraction is against totalLpShares, which includes
    // the locked amount).
    await amm.connect(lp).removeLiquidity(500_000n);

    expect(await market.balanceOf(await lp.getAddress(), 1)).to.equal(500_000n); // YES
    expect(await market.balanceOf(await lp.getAddress(), 0)).to.equal(500_000n); // NO

    const [yesReserve, noReserve] = await amm.getReserves();
    expect(yesReserve).to.equal(500_000n);
    expect(noReserve).to.equal(500_000n);

    expect(await amm.lpShares(await lp.getAddress())).to.equal(499_000n);
    expect(await amm.totalLpShares()).to.equal(500_000n);
  });

  it("rejects a first deposit too small to clear MINIMUM_LIQUIDITY", async () => {
    await collateral.connect(lp).approve(await amm.getAddress(), 500n);
    // sqrt(500*500) = 500, which is not > MINIMUM_LIQUIDITY (1,000).
    await expect(amm.connect(lp).addLiquidity(500n)).to.be.revertedWith(
      "insufficient initial liquidity",
    );
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
