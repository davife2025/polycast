// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {PolycastMarket} from "../PolycastMarket.sol";
import {PolymarketPriceOracle} from "../oracles/PolymarketPriceOracle.sol";

/// @title PolycastOracleMinter
/// @notice Lets traders buy/sell YES/NO shares of a PolycastMarket
///         directly at whatever price PolymarketPriceOracle currently
///         reports — a "tracking market" that mirrors Polymarket's live
///         odds, rather than discovering its own price the way
///         PolycastAMM.sol does.
///
/// ============================================================
/// READ THIS BEFORE PROVIDING LIQUIDITY — THIS IS NOT AN AMM POOL.
/// ============================================================
/// In PolycastAMM, an LP's worst case is bounded by the constant-product
/// curve itself (the classic "impermanent loss" LPs already understand).
/// Here, there is no curve — the protocol (funded by LPs) is the direct
/// counterparty to every trade, at a price it doesn't control. If flow is
/// one-sided (e.g. everyone buys YES because Polymarket shows 90%), the
/// pool accumulates NO inventory that becomes worthless if YES actually
/// resolves. This is much closer to bookmaker risk than AMM LPing: LPs
/// are directly exposed to the outcome, not just to price movement.
///
/// This is a genuinely different, higher-risk product than
/// PolycastAMM.sol, not a drop-in replacement. A serious deployment of
/// this contract would want LPs (or the protocol itself) actively
/// hedging net exposure — e.g. by trading the offsetting side on
/// Polymarket itself to stay roughly flat — which this contract does
/// NOT do for you. Treat this as a mechanism for tracking a price, not
/// as something where "providing liquidity" is safe by construction.
/// ============================================================
///
/// HOW A TRADE WORKS: to sell a trader `tokensOut` of YES at price P,
/// the contract mints `tokensOut` worth of a full pair (costing
/// `tokensOut` collateral total — the trader's payment plus a subsidy
/// from pool collateral, since P < 100% means tokensOut > collateral
/// paid), gives the trader all of the YES side, and keeps the NO side as
/// pool inventory. Selling is the mirror image, recycling matched
/// inventory back into collateral via mergePair where possible.
contract PolycastOracleMinter is ERC1155Holder {
    using SafeERC20 for IERC20;

    uint256 public constant NO = 0;
    uint256 public constant YES = 1;
    uint256 private constant WAD = 1e18;

    /// @dev How stale the oracle's price is allowed to be before trades
    ///      are refused. 5 minutes — generous enough for normal relayer
    ///      hiccups, tight enough that a dead relayer can't be traded
    ///      against indefinitely on a frozen price.
    uint256 public constant MAX_PRICE_AGE_SECONDS = 5 minutes;

    PolycastMarket public immutable market;
    PolymarketPriceOracle public immutable oracle;
    bytes32 public immutable oracleMarketId;
    IERC20 public immutable collateralToken;

    uint256 public poolCollateral;
    mapping(uint256 => uint256) public poolInventory; // outcome => amount held

    mapping(address => uint256) public lpShares;
    uint256 public totalLpShares;

    event LiquidityAdded(address indexed provider, uint256 collateralIn, uint256 lpSharesMinted);
    event LiquidityRemoved(
        address indexed provider,
        uint256 lpSharesBurned,
        uint256 collateralOut,
        uint256 yesOut,
        uint256 noOut
    );
    event Bought(address indexed trader, uint256 indexed outcome, uint256 collateralIn, uint256 tokensOut);
    event Sold(address indexed trader, uint256 indexed outcome, uint256 tokensIn, uint256 collateralOut);

    constructor(address _market, address _oracle, bytes32 _oracleMarketId) {
        require(_market != address(0), "market required");
        require(_oracle != address(0), "oracle required");

        market = PolycastMarket(_market);
        oracle = PolymarketPriceOracle(_oracle);
        oracleMarketId = _oracleMarketId;
        collateralToken = market.collateralToken();
        collateralToken.forceApprove(address(market), type(uint256).max);
    }

    function _currentPrice(uint256 outcome) internal view returns (uint256) {
        require(
            oracle.isFresh(oracleMarketId, MAX_PRICE_AGE_SECONDS),
            "oracle price is stale"
        );
        (uint256 yesPriceWad, ) = oracle.getPrice(oracleMarketId);
        return outcome == YES ? yesPriceWad : (WAD - yesPriceWad);
    }

    /// @notice Public read of the current price for `outcome`, for
    ///         frontends/indexers. Unlike the internal version used by
    ///         buy/sell, this does NOT revert on a stale price — it
    ///         still returns the last-known value, with `fresh` telling
    ///         the caller whether it's safe to treat as tradeable right
    ///         now. Trading itself always re-checks freshness directly.
    function currentPrice(uint256 outcome) external view returns (uint256 priceWad, bool fresh) {
        (uint256 yesPriceWad, ) = oracle.getPrice(oracleMarketId);
        priceWad = outcome == YES ? yesPriceWad : (WAD - yesPriceWad);
        fresh = oracle.isFresh(oracleMarketId, MAX_PRICE_AGE_SECONDS);
    }

    /// @dev Total value of the pool marked to the current oracle price —
    ///      used only to price LP shares fairly at deposit time.
    function _totalValue() internal view returns (uint256) {
        uint256 yesPrice = _currentPrice(YES);
        uint256 noPrice = WAD - yesPrice;
        return
            poolCollateral +
            (poolInventory[YES] * yesPrice) /
            WAD +
            (poolInventory[NO] * noPrice) /
            WAD;
    }

    function addLiquidity(uint256 collateralAmount) external returns (uint256 lpSharesMinted) {
        require(collateralAmount > 0, "amount must be > 0");

        uint256 valueBefore = totalLpShares == 0 ? 0 : _totalValue();

        collateralToken.safeTransferFrom(msg.sender, address(this), collateralAmount);
        poolCollateral += collateralAmount;

        if (totalLpShares == 0) {
            lpSharesMinted = collateralAmount;
        } else {
            lpSharesMinted = (totalLpShares * collateralAmount) / valueBefore;
        }

        lpShares[msg.sender] += lpSharesMinted;
        totalLpShares += lpSharesMinted;

        emit LiquidityAdded(msg.sender, collateralAmount, lpSharesMinted);
    }

    /// @notice Withdraws a proportional share of everything the pool
    ///         currently holds (collateral, YES inventory, NO inventory)
    ///         — not automatically converted or rebalanced.
    function removeLiquidity(
        uint256 lpSharesToBurn
    ) external returns (uint256 collateralOut, uint256 yesOut, uint256 noOut) {
        require(lpSharesToBurn > 0, "amount must be > 0");
        require(lpShares[msg.sender] >= lpSharesToBurn, "insufficient LP shares");

        collateralOut = (poolCollateral * lpSharesToBurn) / totalLpShares;
        yesOut = (poolInventory[YES] * lpSharesToBurn) / totalLpShares;
        noOut = (poolInventory[NO] * lpSharesToBurn) / totalLpShares;

        lpShares[msg.sender] -= lpSharesToBurn;
        totalLpShares -= lpSharesToBurn;

        poolCollateral -= collateralOut;
        poolInventory[YES] -= yesOut;
        poolInventory[NO] -= noOut;

        if (collateralOut > 0) collateralToken.safeTransfer(msg.sender, collateralOut);
        if (yesOut > 0) market.safeTransferFrom(address(this), msg.sender, YES, yesOut, "");
        if (noOut > 0) market.safeTransferFrom(address(this), msg.sender, NO, noOut, "");

        emit LiquidityRemoved(msg.sender, lpSharesToBurn, collateralOut, yesOut, noOut);
    }

    /// @notice Buy `outcome` at the oracle's current price.
    function buy(
        uint256 outcome,
        uint256 collateralIn,
        uint256 minTokensOut
    ) external returns (uint256 tokensOut) {
        require(outcome == YES || outcome == NO, "invalid outcome");
        require(collateralIn > 0, "amount must be > 0");

        uint256 price = _currentPrice(outcome);
        require(price > 0, "price is zero, cannot buy this side");

        // Floor division — rounds tokensOut DOWN, the safe direction:
        // the pool never gives out more than the collateral paid justifies.
        tokensOut = (collateralIn * WAD) / price;
        require(tokensOut >= minTokensOut, "slippage: tokensOut below minimum");

        uint256 poolSubsidy = tokensOut - collateralIn; // tokensOut > collateralIn whenever price < 100%
        require(poolCollateral >= poolSubsidy, "insufficient pool liquidity for this size");

        collateralToken.safeTransferFrom(msg.sender, address(this), collateralIn);
        poolCollateral -= poolSubsidy;

        market.mintPair(tokensOut);

        uint256 otherOutcome = outcome == YES ? NO : YES;
        poolInventory[otherOutcome] += tokensOut;

        market.safeTransferFrom(address(this), msg.sender, outcome, tokensOut, "");

        emit Bought(msg.sender, outcome, collateralIn, tokensOut);
    }

    /// @notice Sell `tokensIn` of `outcome` at the oracle's current price.
    function sell(
        uint256 outcome,
        uint256 tokensIn,
        uint256 minCollateralOut
    ) external returns (uint256 collateralOut) {
        require(outcome == YES || outcome == NO, "invalid outcome");
        require(tokensIn > 0, "amount must be > 0");

        uint256 price = _currentPrice(outcome);

        // Floor division — rounds collateralOut DOWN, protecting the pool.
        collateralOut = (tokensIn * price) / WAD;
        require(collateralOut >= minCollateralOut, "slippage: collateralOut below minimum");

        market.safeTransferFrom(msg.sender, address(this), outcome, tokensIn, "");
        poolInventory[outcome] += tokensIn;

        // Recycle as much as possible: merge matched YES+NO inventory
        // back into collateral, which is more capital-efficient than
        // just piling up unmatched single-sided inventory forever.
        uint256 otherOutcome = outcome == YES ? NO : YES;
        uint256 mergeable = poolInventory[outcome] < poolInventory[otherOutcome]
            ? poolInventory[outcome]
            : poolInventory[otherOutcome];
        if (mergeable > 0) {
            market.mergePair(mergeable);
            poolInventory[outcome] -= mergeable;
            poolInventory[otherOutcome] -= mergeable;
            poolCollateral += mergeable;
        }

        require(poolCollateral >= collateralOut, "insufficient pool liquidity for this size");
        poolCollateral -= collateralOut;
        collateralToken.safeTransfer(msg.sender, collateralOut);

        emit Sold(msg.sender, outcome, tokensIn, collateralOut);
    }
}
