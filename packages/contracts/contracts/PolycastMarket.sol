// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IOutcomeResolver} from "./interfaces/IOutcomeResolver.sol";

/// @title PolycastMarket
/// @notice A single prediction market: a question, a collateral asset, and
///         a resolver that eventually says YES or NO.
///
/// Modeled on Gnosis's Conditional Tokens Framework, the same design
/// Polymarket is built on: depositing 1 unit of collateral always mints
/// exactly 1 YES share + 1 NO share (tokenIds 1 and 0 respectively, as
/// ERC-1155 tokens of this contract). A winning share redeems for 1 unit
/// of collateral after settlement; a losing share redeems for nothing.
/// Shares can also be merged back into collateral at any time before
/// settlement, which is what makes a pair "fungible with cash" and is
/// the basis for market makers/order books to quote prices without
/// needing to pre-fund both sides.
///
/// This contract deliberately does NOT include an order book or AMM —
/// that's a separate concern (a market maker contract, or an off-chain
/// matching engine that settles trades by moving these ERC-1155 tokens
/// between users). This contract only guarantees the collateral <-> shares
/// invariant and the eventual payout.
contract PolycastMarket is ERC1155 {
    using SafeERC20 for IERC20;

    uint256 public constant NO = 0;
    uint256 public constant YES = 1;

    /// @notice The question this market resolves, kept on-chain for transparency.
    string public question;

    /// @notice ERC-20 collateral this market accepts (e.g. USDT0, or an FAsset like FXRP).
    IERC20 public immutable collateralToken;

    /// @notice The resolver contract that will determine this market's outcome.
    IOutcomeResolver public immutable resolver;

    /// @notice Unique id this market is registered under with its resolver.
    bytes32 public immutable marketId;

    /// @notice Total collateral currently locked in this market (backing outstanding shares).
    uint256 public totalCollateral;

    /// @notice Whether this market has been finalized.
    bool public settled;

    /// @notice Final outcome once settled. 0 = NO, 1 = YES. Meaningless until `settled` is true.
    uint8 public outcome;

    event MarketCreated(
        bytes32 indexed marketId,
        string question,
        address collateralToken,
        address resolver
    );
    event PairMinted(address indexed account, uint256 amount);
    event PairMerged(address indexed account, uint256 amount);
    event Settled(bytes32 indexed marketId, uint8 outcome);
    event Redeemed(address indexed account, uint256 amount);

    constructor(
        bytes32 _marketId,
        string memory _question,
        address _collateralToken,
        address _resolver
    ) ERC1155("") {
        require(_collateralToken != address(0), "collateral token required");
        require(_resolver != address(0), "resolver required");

        marketId = _marketId;
        question = _question;
        collateralToken = IERC20(_collateralToken);
        resolver = IOutcomeResolver(_resolver);

        emit MarketCreated(_marketId, _question, _collateralToken, _resolver);
    }

    /// @notice Deposit `amount` of collateral, receive `amount` of YES and
    ///         `amount` of NO shares. This is the only way new shares enter
    ///         existence, which is what keeps 1 YES + 1 NO always redeemable
    ///         for exactly 1 unit of collateral.
    function mintPair(uint256 amount) external {
        require(!settled, "market settled");
        require(amount > 0, "amount must be > 0");

        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        totalCollateral += amount;

        _mint(msg.sender, YES, amount, "");
        _mint(msg.sender, NO, amount, "");

        emit PairMinted(msg.sender, amount);
    }

    /// @notice The inverse of mintPair: burn equal YES+NO shares, get the
    ///         collateral back. Only meaningful before settlement — once
    ///         settled, one side is worthless and merging no longer makes
    ///         sense (use redeem instead).
    function mergePair(uint256 amount) external {
        require(!settled, "market settled, use redeem");
        require(amount > 0, "amount must be > 0");

        _burn(msg.sender, YES, amount);
        _burn(msg.sender, NO, amount);
        totalCollateral -= amount;

        collateralToken.safeTransfer(msg.sender, amount);

        emit PairMerged(msg.sender, amount);
    }

    /// @notice Anyone can call this once the resolver has an answer; it
    ///         pulls the outcome across and flips `settled`, unlocking redeem().
    function settle() external {
        require(!settled, "already settled");
        require(resolver.isResolved(marketId), "not resolved yet");

        outcome = resolver.getOutcome(marketId);
        settled = true;

        emit Settled(marketId, outcome);
    }

    /// @notice After settlement, holders of the winning outcome token redeem
    ///         1:1 for collateral. Losing shares are simply worthless — no
    ///         action needed or possible on them.
    function redeem() external {
        require(settled, "not settled yet");

        uint256 amount = balanceOf(msg.sender, outcome);
        require(amount > 0, "no winning shares to redeem");

        _burn(msg.sender, outcome, amount);
        totalCollateral -= amount;

        collateralToken.safeTransfer(msg.sender, amount);

        emit Redeemed(msg.sender, amount);
    }
}
