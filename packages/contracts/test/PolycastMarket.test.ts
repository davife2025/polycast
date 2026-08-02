import { expect } from "chai";
import { ethers } from "hardhat";
import type { Signer } from "ethers";

describe("PolycastMarket — core lifecycle", function () {
  let deployer: Signer, alice: Signer, bob: Signer;
  let collateral: any;
  let resolver: any;
  let market: any;
  const marketId = ethers.id("will-btc-close-above-100k");
  const QUESTION = "Will BTC close above $100k on the test date?";

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    collateral = await MockERC20.deploy("Mock USD", "mUSD");
    await collateral.waitForDeployment();

    // Fund alice and bob with collateral
    await collateral.mint(await alice.getAddress(), ethers.parseUnits("1000", 18));
    await collateral.mint(await bob.getAddress(), ethers.parseUnits("1000", 18));

    const ManualResolver = await ethers.getContractFactory("ManualResolver");
    resolver = await ManualResolver.deploy(await deployer.getAddress());
    await resolver.waitForDeployment();

    const PolycastMarket = await ethers.getContractFactory("PolycastMarket");
    market = await PolycastMarket.deploy(
      marketId,
      QUESTION,
      await collateral.getAddress(),
      await resolver.getAddress(),
    );
    await market.waitForDeployment();
  });

  it("mints equal YES and NO shares against deposited collateral", async () => {
    const amount = ethers.parseUnits("100", 18);
    await collateral.connect(alice).approve(await market.getAddress(), amount);
    await market.connect(alice).mintPair(amount);

    expect(await market.balanceOf(await alice.getAddress(), 1)).to.equal(amount); // YES
    expect(await market.balanceOf(await alice.getAddress(), 0)).to.equal(amount); // NO
    expect(await market.totalCollateral()).to.equal(amount);
    expect(await collateral.balanceOf(await market.getAddress())).to.equal(amount);
  });

  it("lets a user merge a pair back into collateral before settlement", async () => {
    const amount = ethers.parseUnits("50", 18);
    await collateral.connect(alice).approve(await market.getAddress(), amount);
    await market.connect(alice).mintPair(amount);

    const balBefore = await collateral.balanceOf(await alice.getAddress());
    await market.connect(alice).mergePair(amount);
    const balAfter = await collateral.balanceOf(await alice.getAddress());

    expect(balAfter - balBefore).to.equal(amount);
    expect(await market.balanceOf(await alice.getAddress(), 1)).to.equal(0);
    expect(await market.balanceOf(await alice.getAddress(), 0)).to.equal(0);
    expect(await market.totalCollateral()).to.equal(0);
  });

  it("rejects settle() before the resolver has an answer", async () => {
    await expect(market.settle()).to.be.revertedWith("not resolved yet");
  });

  it("full flow: mint, resolve YES, winning side redeems, losing side gets nothing", async () => {
    const amount = ethers.parseUnits("100", 18);

    // Alice and Bob both mint pairs (so both hold YES and NO shares)
    await collateral.connect(alice).approve(await market.getAddress(), amount);
    await market.connect(alice).mintPair(amount);
    await collateral.connect(bob).approve(await market.getAddress(), amount);
    await market.connect(bob).mintPair(amount);

    // Bob sells his YES to Alice, Alice sells her NO to Bob — simulating a
    // trade (in the real product this happens via an order book/AMM; here
    // we just move the ERC-1155 tokens directly to prove redeem logic).
    await market.connect(bob).safeTransferFrom(
      await bob.getAddress(),
      await alice.getAddress(),
      1, // YES
      amount,
      "0x",
    );
    await market.connect(alice).safeTransferFrom(
      await alice.getAddress(),
      await bob.getAddress(),
      0, // NO
      amount,
      "0x",
    );

    // Now Alice holds 2x YES, Bob holds 2x NO.
    expect(await market.balanceOf(await alice.getAddress(), 1)).to.equal(amount * 2n);
    expect(await market.balanceOf(await bob.getAddress(), 0)).to.equal(amount * 2n);

    // Resolver says YES.
    await resolver.connect(deployer).resolve(marketId, 1);
    await market.settle();
    expect(await market.settled()).to.equal(true);
    expect(await market.outcome()).to.equal(1);

    // Alice (holds YES) redeems successfully.
    const aliceBalBefore = await collateral.balanceOf(await alice.getAddress());
    await market.connect(alice).redeem();
    const aliceBalAfter = await collateral.balanceOf(await alice.getAddress());
    expect(aliceBalAfter - aliceBalBefore).to.equal(amount * 2n);

    // Bob (holds only NO, the losing side) has nothing to redeem.
    await expect(market.connect(bob).redeem()).to.be.revertedWith(
      "no winning shares to redeem",
    );
  });

  it("prevents merging after settlement (must use redeem instead)", async () => {
    const amount = ethers.parseUnits("10", 18);
    await collateral.connect(alice).approve(await market.getAddress(), amount);
    await market.connect(alice).mintPair(amount);

    await resolver.connect(deployer).resolve(marketId, 1);
    await market.settle();

    await expect(market.connect(alice).mergePair(amount)).to.be.revertedWith(
      "market settled, use redeem",
    );
  });
});

describe("ManualResolver — access control", function () {
  it("only the owner can post a resolution", async () => {
    const [deployer, notOwner] = await ethers.getSigners();
    const ManualResolver = await ethers.getContractFactory("ManualResolver");
    const resolver = await ManualResolver.deploy(await deployer.getAddress());
    await resolver.waitForDeployment();

    const marketId = ethers.id("some-market");
    await expect(
      resolver.connect(notOwner).resolve(marketId, 1),
    ).to.be.revertedWithCustomError(resolver, "OwnableUnauthorizedAccount");
  });

  it("rejects an outcome value outside 0/1", async () => {
    const [deployer] = await ethers.getSigners();
    const ManualResolver = await ethers.getContractFactory("ManualResolver");
    const resolver = await ManualResolver.deploy(await deployer.getAddress());
    await resolver.waitForDeployment();

    const marketId = ethers.id("some-other-market");
    await expect(resolver.resolve(marketId, 2)).to.be.revertedWith(
      "outcome must be 0 or 1",
    );
  });
});

describe("PolycastMarketFactory", function () {
  it("deploys a market and prevents reusing the same marketId", async () => {
    const [deployer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const collateral = await MockERC20.deploy("Mock USD", "mUSD");
    await collateral.waitForDeployment();

    const ManualResolver = await ethers.getContractFactory("ManualResolver");
    const resolver = await ManualResolver.deploy(await deployer.getAddress());
    await resolver.waitForDeployment();

    const Factory = await ethers.getContractFactory("PolycastMarketFactory");
    const factory = await Factory.deploy();
    await factory.waitForDeployment();

    const marketId = ethers.id("factory-test-market");
    await factory.createMarket(
      marketId,
      "Some question",
      await collateral.getAddress(),
      await resolver.getAddress(),
    );

    expect(await factory.allMarketsLength()).to.equal(1);

    await expect(
      factory.createMarket(
        marketId,
        "Duplicate marketId question",
        await collateral.getAddress(),
        await resolver.getAddress(),
      ),
    ).to.be.revertedWith("marketId already used");
  });
});
