// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PolycastMarket} from "./PolycastMarket.sol";

/// @title PolycastAMM
/// @notice A Fixed Product Market Maker (FPMM) for one PolycastMarket —
///         the same family of mechanism as Gnosis's Conditional Tokens
///         market makers (used by Omen, and in Polymarket's early days
///         before it moved to an order book). Until Session 5, buying and
///         selling shares meant literally transferring ERC-1155 tokens
///         between wallets with no price discovery at all; this contract
///         is what gives YES/NO shares an actual, continuously-updating
///         market price.
///
/// HOW IT WORKS: the AMM's own YES and NO balances (held on the
/// PolycastMarket contract itself, read directly via balanceOf — there's
/// no separate reserve bookkeeping to drift out of sync) ARE the pool.
/// Liquidity is seeded by minting a full pair via `mintPair` and holding
/// both sides. A trade works by minting (or merging) a full pair for the
/// trade size, then swapping along the constant-product curve
/// (yesReserve * noReserve = k) to give the trader more of one side than
/// the other. This means the marginal price of YES is always
/// `noReserve / (yesReserve + noReserve)` — when more people have bought
/// YES, the pool's YES reserve is depleted relative to NO, which is
/// exactly what should make YES more expensive.
///
/// SCOPE NOTE: `addLiquidity` uses a simplified share-accounting formula
/// (see comment on that function) that's fine for an initial LP or for
/// adding to a freshly-seeded pool, but is NOT fully manipulation-resistant
/// against a sandwich attack (imbalance the pool, add liquidity at a
/// favorable implied price, trade back) once the pool has already seen
/// real trading activity. This is flagged clearly rather than presented
/// as production-hardened — a more careful design (e.g. Uniswap V2's
/// dual-asset deposit matching the current ratio) is a good follow-up
/// before this handles real value on Mainnet. There is also currently
/// **no trading fee** (0%) — every trade is exact-invariant, no skim to
/// LPs. Adding a fee is straightforward but was left out this session to
/// keep the core buy/sell math (the correctness-critical part) as simple
/// as possible to verify.
contract PolycastAMM is ERC1155Holder {
    using SafeERC20 for IERC20;

    uint256 public constant NO = 0;
    uint256 public constant YES = 1;
    uint256 private constant WAD = 1e18;

    PolycastMarket public immutable market;
    IERC20 public immutable collateralToken;

    mapping(address => uint256) public lpShares;
    uint256 public totalLpShares;

    event LiquidityAdded(address indexed provider, uint256 collateralIn, uint256 lpSharesMinted);
    event LiquidityRemoved(address indexed provider, uint256 lpSharesBurned, uint256 yesOut, uint256 noOut);
    event Bought(address indexed trader, uint256 indexed outcome, uint256 collateralIn, uint256 tokensOut);
    event Sold(address indexed trader, uint256 indexed outcome, uint256 tokensIn, uint256 collateralOut);

    constructor(address _market) {
        require(_market != address(0), "market required");
        market = PolycastMarket(_market);
        collateralToken = market.collateralToken();
        // Approved once, here, rather than per-call — this contract's own
        // code is the only thing that ever decides how much to mint, so
        // there's no additional risk in a standing approval to the market
        // it was constructed against.
        collateralToken.forceApprove(address(market), type(uint256).max);
    }

    function getReserves() public view returns (uint256 yesReserve, uint256 noReserve) {
        yesReserve = market.balanceOf(address(this), YES);
        noReserve = market.balanceOf(address(this), NO);
    }

    /// @notice The current marginal price of each side, in WAD (1e18 = $1).
    ///         Always sums to 1e18. Undefined (returns 50/50) if the pool
    ///         has no liquidity yet.
    function getPrices() external view returns (uint256 yesPriceWad, uint256 noPriceWad) {
        (uint256 yesReserve, uint256 noReserve) = getReserves();
        uint256 sum = yesReserve + noReserve;
        if (sum == 0) return (WAD / 2, WAD / 2);
        yesPriceWad = (noReserve * WAD) / sum;
        noPriceWad = (yesReserve * WAD) / sum;
    }

    /// @notice Seeds or adds to the pool. Always adds equal YES+NO (via
    ///         mintPair), so a deposit alone never moves the price on a
    ///         freshly-seeded (balanced) pool. LP share accounting uses
    ///         "sum of reserves" as a simplified value heuristic — see the
    ///         SCOPE NOTE on the contract for the manipulation caveat.
    function addLiquidity(uint256 collateralAmount) external returns (uint256 lpSharesMinted) {
        require(collateralAmount > 0, "amount must be > 0");

        collateralToken.safeTransferFrom(msg.sender, address(this), collateralAmount);
        (uint256 yesReserve, uint256 noReserve) = getReserves();
        uint256 poolValueBefore = yesReserve + noReserve;

        market.mintPair(collateralAmount);

        if (totalLpShares == 0 || poolValueBefore == 0) {
            lpSharesMinted = collateralAmount * 2;
        } else {
            lpSharesMinted = (totalLpShares * (2 * collateralAmount)) / poolValueBefore;
        }

        lpShares[msg.sender] += lpSharesMinted;
        totalLpShares += lpSharesMinted;

        emit LiquidityAdded(msg.sender, collateralAmount, lpSharesMinted);
    }

    /// @notice Withdraws a proportional share of whatever the pool
    ///         currently holds (YES and NO tokens, not automatically
    ///         converted to collateral, since after trading the two sides
    ///         are rarely equal in value). LPs can merge equal amounts back
    ///         to collateral themselves via the market's mergePair, or hold.
    function removeLiquidity(uint256 lpSharesToBurn) external returns (uint256 yesOut, uint256 noOut) {
        require(lpSharesToBurn > 0, "amount must be > 0");
        require(lpShares[msg.sender] >= lpSharesToBurn, "insufficient LP shares");

        (uint256 yesReserve, uint256 noReserve) = getReserves();
        yesOut = (yesReserve * lpSharesToBurn) / totalLpShares;
        noOut = (noReserve * lpSharesToBurn) / totalLpShares;

        lpShares[msg.sender] -= lpSharesToBurn;
        totalLpShares -= lpSharesToBurn;

        if (yesOut > 0) market.safeTransferFrom(address(this), msg.sender, YES, yesOut, "");
        if (noOut > 0) market.safeTransferFrom(address(this), msg.sender, NO, noOut, "");

        emit LiquidityRemoved(msg.sender, lpSharesToBurn, yesOut, noOut);
    }

    /// @notice Buy `outcome` (0=NO, 1=YES) with `collateralIn` collateral.
    ///         Mints a full pair for collateralIn, then swaps the unwanted
    ///         side along the constant-product curve for extra `outcome`
    ///         tokens, so the trader ends up with more `outcome` than a
    ///         plain mintPair would have given them.
    function buy(
        uint256 outcome,
        uint256 collateralIn,
        uint256 minTokensOut
    ) external returns (uint256 tokensOut) {
        require(outcome == YES || outcome == NO, "invalid outcome");
        require(collateralIn > 0, "amount must be > 0");

        collateralToken.safeTransferFrom(msg.sender, address(this), collateralIn);
        (uint256 yesReserve, uint256 noReserve) = getReserves();
        require(yesReserve > 0 && noReserve > 0, "no liquidity");
        uint256 k = yesReserve * noReserve;

        market.mintPair(collateralIn);

        // NOTE ON ROUNDING: we round k/otherAfter UP (ceiling), not down.
        // A naive floor division here makes tokensOut come out slightly
        // *larger* than the true continuous-math value on every trade
        // (since a smaller subtracted term means a bigger remainder) —
        // that rounds in the trader's favor and, over many trades, very
        // slightly leaks value out of the pool. Rounding up the divided
        // term instead makes tokensOut slightly smaller than ideal,
        // which is the safe direction: the pool never gives out more
        // than the invariant actually allows.
        if (outcome == YES) {
            uint256 otherAfter = noReserve + collateralIn;
            tokensOut = (yesReserve + collateralIn) - Math.ceilDiv(k, otherAfter);
        } else {
            uint256 otherAfter = yesReserve + collateralIn;
            tokensOut = (noReserve + collateralIn) - Math.ceilDiv(k, otherAfter);
        }

        require(tokensOut >= minTokensOut, "slippage: tokensOut below minimum");

        market.safeTransferFrom(address(this), msg.sender, outcome, tokensOut, "");

        emit Bought(msg.sender, outcome, collateralIn, tokensOut);
    }

    /// @notice Sell `outcome` (0=NO, 1=YES) shares for exactly
    ///         `collateralOut` collateral. The caller specifies the payout
    ///         they want (not the tokens they're putting in) because that
    ///         direction solves linearly — see the contract-level docs for
    ///         why. `maxTokensIn` is the slippage guard: if the pool would
    ///         require more shares than that to produce the requested
    ///         payout, the call reverts instead of silently taking more.
    ///
    /// NOTE: the caller must have called
    ///       `market.setApprovalForAll(address(thisAMM), true)` first —
    ///       standard ERC-1155 operator approval, analogous to ERC-20's
    ///       `approve`.
    function sell(
        uint256 outcome,
        uint256 collateralOut,
        uint256 maxTokensIn
    ) external returns (uint256 tokensIn) {
        require(outcome == YES || outcome == NO, "invalid outcome");
        require(collateralOut > 0, "amount must be > 0");

        (uint256 yesReserve, uint256 noReserve) = getReserves();
        uint256 k = yesReserve * noReserve;

        // Same rounding direction as buy(): round k/otherAfterRemoval UP,
        // so tokensIn comes out slightly larger than the exact continuous
        // value rather than smaller. That protects the pool from ever
        // paying out collateral for too few tokens.
        if (outcome == YES) {
            require(noReserve > collateralOut, "insufficient liquidity");
            uint256 otherAfterRemoval = noReserve - collateralOut;
            tokensIn = Math.ceilDiv(k, otherAfterRemoval) + collateralOut - yesReserve;
        } else {
            require(yesReserve > collateralOut, "insufficient liquidity");
            uint256 otherAfterRemoval = yesReserve - collateralOut;
            tokensIn = Math.ceilDiv(k, otherAfterRemoval) + collateralOut - noReserve;
        }

        require(tokensIn <= maxTokensIn, "slippage: tokensIn above maximum");

        market.safeTransferFrom(msg.sender, address(this), outcome, tokensIn, "");
        market.mergePair(collateralOut);
        collateralToken.safeTransfer(msg.sender, collateralOut);

        emit Sold(msg.sender, outcome, tokensIn, collateralOut);
    }
}
