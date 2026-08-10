import { expect } from "chai";
import { ethers, network } from "hardhat";
import type { Signer } from "ethers";

describe("PolymarketPriceOracle", function () {
  it("only the relayer can push prices, owner can rotate the relayer", async () => {
    const [owner, relayer, notRelayer] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("PolymarketPriceOracle");
    const oracle = await Oracle.deploy(await owner.getAddress(), await relayer.getAddress());
    await oracle.waitForDeployment();

    const marketId = ethers.id("will-x-happen");

    await expect(
      oracle.connect(notRelayer).updatePrice(marketId, ethers.parseUnits("0.7", 18)),
    ).to.be.revertedWith("caller is not the relayer");

    await oracle.connect(relayer).updatePrice(marketId, ethers.parseUnits("0.7", 18));
    const [price] = await oracle.getPrice(marketId);
    expect(price).to.equal(ethers.parseUnits("0.7", 18));

    // Rotate relayer, old one loses access
    const newRelayer = notRelayer;
    await oracle.connect(owner).setRelayer(await newRelayer.getAddress());
    await expect(
      oracle.connect(relayer).updatePrice(marketId, ethers.parseUnits("0.8", 18)),
    ).to.be.revertedWith("caller is not the relayer");
    await oracle.connect(newRelayer).updatePrice(marketId, ethers.parseUnits("0.8", 18));
  });

  it("rejects a price above 100%", async () => {
    const [owner, relayer] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("PolymarketPriceOracle");
    const oracle = await Oracle.deploy(await owner.getAddress(), await relayer.getAddress());
    await oracle.waitForDeployment();

    await expect(
      oracle.connect(relayer).updatePrice(ethers.id("m"), ethers.parseUnits("1.01", 18)),
    ).to.be.revertedWith("price must be <= 1e18 (100%)");
  });

  it("isFresh correctly reflects staleness", async () => {
    const [owner, relayer] = await ethers.getSigners();
    const Oracle = await ethers.getContractFactory("PolymarketPriceOracle");
    const oracle = await Oracle.deploy(await owner.getAddress(), await relayer.getAddress());
    await oracle.waitForDeployment();

    const marketId = ethers.id("m");
    expect(await oracle.isFresh(marketId, 300)).to.equal(false); // no data yet

    await oracle.connect(relayer).updatePrice(marketId, ethers.parseUnits("0.5", 18));
    expect(await oracle.isFresh(marketId, 300)).to.equal(true);

    await network.provider.send("evm_increaseTime", [301]);
    await network.provider.send("evm_mine");
    expect(await oracle.isFresh(marketId, 300)).to.equal(false);
  });
});

describe("PolycastOracleMinter — trade-at-oracle-price math (hand-verified)", function () {
  let deployer: Signer, relayer: Signer, lp: Signer, buyer: Signer, seller: Signer;
  let collateral: any;
  let resolver: any;
  let market: any;
  let oracle: any;
  let minter: any;
  const marketId = ethers.id("oracle-minter-test-market");
  const oracleMarketId = ethers.id("polymarket-will-x-happen");
  const LP_SEED = 1_000_000n;

  beforeEach(async () => {
    [deployer, relayer, lp, buyer, seller] = await ethers.getSigners();

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
      "Tracking market: mirrors a Polymarket question",
      await collateral.getAddress(),
      await resolver.getAddress(),
    );
    await market.waitForDeployment();

    const Oracle = await ethers.getContractFactory("PolymarketPriceOracle");
    oracle = await Oracle.deploy(await deployer.getAddress(), await relayer.getAddress());
    await oracle.waitForDeployment();

    const Minter = await ethers.getContractFactory("PolycastOracleMinter");
    minter = await Minter.deploy(
      await market.getAddress(),
      await oracle.getAddress(),
      oracleMarketId,
    );
    await minter.waitForDeployment();

    // Seed the oracle at 70% YES.
    await oracle.connect(relayer).updatePrice(oracleMarketId, ethers.parseUnits("0.7", 18));

    // LP seeds the pool.
    await collateral.connect(lp).approve(await minter.getAddress(), LP_SEED);
    await minter.connect(lp).addLiquidity(LP_SEED);
  });

  it("first LP deposit mints 1:1 shares with no oracle read needed", async () => {
    expect(await minter.totalLpShares()).to.equal(LP_SEED);
    expect(await minter.lpShares(await lp.getAddress())).to.equal(LP_SEED);
    expect(await minter.poolCollateral()).to.equal(LP_SEED);
  });

  it("buy: matches hand-calculated tokensOut at the oracle price, pool subsidizes the gap", async () => {
    // Hand calculation: price = 0.7e18. collateralIn = 100,000.
    // tokensOut = floor(100,000 * 1e18 / 0.7e18) = floor(142,857.142857...) = 142,857
    // poolSubsidy = 142,857 - 100,000 = 42,857
    await collateral.connect(buyer).approve(await minter.getAddress(), 100_000n);
    const tx = await minter.connect(buyer).buy(1, 100_000n, 0n); // 1 = YES
    const receipt = await tx.wait();

    const boughtEvent = receipt?.logs
      .map((log: any) => {
        try {
          return minter.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "Bought");

    expect(boughtEvent?.args?.tokensOut).to.equal(142_857n);
    expect(await market.balanceOf(await buyer.getAddress(), 1)).to.equal(142_857n);

    // Pool collateral: 1,000,000 - 42,857 (subsidy) = 957,143
    expect(await minter.poolCollateral()).to.equal(957_143n);
    // Pool now holds the NO side as inventory (the unwanted byproduct of the mint).
    expect(await minter.poolInventory(0)).to.equal(142_857n); // 0 = NO
  });

  it("buy reverts on slippage when minTokensOut isn't met", async () => {
    await collateral.connect(buyer).approve(await minter.getAddress(), 100_000n);
    // We know the real tokensOut is 142,857 — ask for more.
    await expect(
      minter.connect(buyer).buy(1, 100_000n, 142_858n),
    ).to.be.revertedWith("slippage: tokensOut below minimum");
  });

  it("buy reverts if the oracle price is stale", async () => {
    await network.provider.send("evm_increaseTime", [301]); // past MAX_PRICE_AGE_SECONDS (5 min)
    await network.provider.send("evm_mine");

    await collateral.connect(buyer).approve(await minter.getAddress(), 100_000n);
    await expect(minter.connect(buyer).buy(1, 100_000n, 0n)).to.be.revertedWith(
      "oracle price is stale",
    );
  });

  it("sell: matches hand-calculated collateralOut, recycles matched inventory via merge", async () => {
    // First, create some NO inventory in the pool via a buy (same as the
    // buy test above), so there's something for a YES sell to merge against.
    await collateral.connect(buyer).approve(await minter.getAddress(), 100_000n);
    await minter.connect(buyer).buy(1, 100_000n, 0n); // pool now holds 142,857 NO

    // Seller independently mints their own pair directly from the market
    // (not through the minter), then sells YES into the minter.
    await collateral.connect(seller).approve(await market.getAddress(), 200_000n);
    await market.connect(seller).mintPair(200_000n);
    await market.connect(seller).setApprovalForAll(await minter.getAddress(), true);

    // Hand calculation: selling 50,000 YES at price 0.7e18:
    // collateralOut = floor(50,000 * 0.7e18 / 1e18) = 35,000 (exact)
    const poolCollateralBefore = await minter.poolCollateral();
    const tx = await minter.connect(seller).sell(1, 50_000n, 0n);
    const receipt = await tx.wait();

    const soldEvent = receipt?.logs
      .map((log: any) => {
        try {
          return minter.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed?.name === "Sold");

    expect(soldEvent?.args?.collateralOut).to.equal(35_000n);

    // Merge recycling: mergeable = min(poolInventory[YES]=50,000 (just
    // received), poolInventory[NO]=142,857) = 50,000. That merge adds
    // 50,000 back to poolCollateral, then 35,000 is paid out to the seller.
    // Net change in poolCollateral: +50,000 - 35,000 = +15,000.
    expect(await minter.poolCollateral()).to.equal(poolCollateralBefore + 15_000n);
    expect(await minter.poolInventory(1)).to.equal(0n); // YES fully merged away
    expect(await minter.poolInventory(0)).to.equal(142_857n - 50_000n); // NO: 92,857
  });

  it("sell reverts on slippage when minCollateralOut isn't met", async () => {
    await collateral.connect(seller).approve(await market.getAddress(), 200_000n);
    await market.connect(seller).mintPair(200_000n);
    await market.connect(seller).setApprovalForAll(await minter.getAddress(), true);

    // We know the real collateralOut is 35,000 — ask for more.
    await expect(
      minter.connect(seller).sell(1, 50_000n, 35_001n),
    ).to.be.revertedWith("slippage: collateralOut below minimum");
  });

  it("currentPrice() reflects freshness without reverting on stale data", async () => {
    const [yesPrice, freshBefore] = await minter.currentPrice(1); // YES
    expect(yesPrice).to.equal(ethers.parseUnits("0.7", 18));
    expect(freshBefore).to.equal(true);

    await network.provider.send("evm_increaseTime", [301]);
    await network.provider.send("evm_mine");

    const [stillSamePrice, freshAfter] = await minter.currentPrice(1);
    expect(stillSamePrice).to.equal(ethers.parseUnits("0.7", 18)); // doesn't revert, still returns last value
    expect(freshAfter).to.equal(false); // but correctly flags it as stale now
  });

  it("removeLiquidity returns a proportional share of collateral + inventory", async () => {
    // Create some inventory first via a buy, so withdrawal isn't trivial.
    await collateral.connect(buyer).approve(await minter.getAddress(), 100_000n);
    await minter.connect(buyer).buy(1, 100_000n, 0n);

    const poolCollateralBefore = await minter.poolCollateral(); // 957,143
    const poolNoBefore = await minter.poolInventory(0); // 142,857

    // LP withdraws half their shares (500,000 of 1,000,000).
    await minter.connect(lp).removeLiquidity(500_000n);

    expect(await collateral.balanceOf(await lp.getAddress())).to.equal(
      10_000_000n - LP_SEED + poolCollateralBefore / 2n,
    );
    expect(await market.balanceOf(await lp.getAddress(), 0)).to.equal(poolNoBefore / 2n);
    expect(await minter.lpShares(await lp.getAddress())).to.equal(500_000n);
    expect(await minter.totalLpShares()).to.equal(500_000n);
  });
});

describe("PolycastOracleMinterFactory", function () {
  it("deploys one minter per market and prevents duplicates", async () => {
    const [deployer, relayer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const collateral = await MockERC20.deploy("Mock USD", "mUSD");
    await collateral.waitForDeployment();

    const ManualResolver = await ethers.getContractFactory("ManualResolver");
    const resolver = await ManualResolver.deploy(await deployer.getAddress());
    await resolver.waitForDeployment();

    const PolycastMarket = await ethers.getContractFactory("PolycastMarket");
    const market = await PolycastMarket.deploy(
      ethers.id("factory-test-market"),
      "Some question",
      await collateral.getAddress(),
      await resolver.getAddress(),
    );
    await market.waitForDeployment();

    const Oracle = await ethers.getContractFactory("PolymarketPriceOracle");
    const oracle = await Oracle.deploy(await deployer.getAddress(), await relayer.getAddress());
    await oracle.waitForDeployment();

    const Factory = await ethers.getContractFactory("PolycastOracleMinterFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const oracleMarketId = ethers.id("polymarket-question");
    await factory.createOracleMinter(
      await market.getAddress(),
      await oracle.getAddress(),
      oracleMarketId,
    );
    const minterAddress = await factory.minterForMarket(await market.getAddress());
    expect(minterAddress).to.not.equal(ethers.ZeroAddress);

    await expect(
      factory.createOracleMinter(await market.getAddress(), await oracle.getAddress(), oracleMarketId),
    ).to.be.revertedWith("minter already exists for this market");
  });
});
