// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IOutcomeResolver} from "./interfaces/IOutcomeResolver.sol";

/// @title PolycastMarket
/// @notice A single prediction market: a question, a collateral asset, and
///         a resolver that eventually says YES or NO.
///
/// SESSION 1 NOTE: this is a structural skeleton only. It defines the market's
/// shape and wiring so the rest of the stack (factory, indexer, frontend
/// types) can be built against a stable interface. The actual conditional-token
/// mechanics (mint pair, split, merge, redeem) land in Session 2, modeled on
/// Gnosis's Conditional Tokens Framework: $1 of collateral in always mints
/// exactly one YES share + one NO share; a winning share redeems for $1,
/// a losing share redeems for $0.
contract PolycastMarket {
    /// @notice The question this market resolves, kept on-chain for transparency.
    string public question;

    /// @notice ERC-20 collateral this market accepts (e.g. USDT0, or an FAsset like FXRP).
    address public collateralToken;

    /// @notice The resolver contract that will determine this market's outcome.
    IOutcomeResolver public resolver;

    /// @notice Unique id this market is registered under with its resolver.
    bytes32 public marketId;

    /// @notice Total collateral currently locked in this market (backing outstanding shares).
    uint256 public totalCollateral;

    /// @notice Whether this market has been finalized (see Session 2 for redeem logic).
    bool public settled;

    /// @notice Final outcome once settled. 0 = NO, 1 = YES. Meaningless until `settled` is true.
    uint8 public outcome;

    event MarketCreated(
        bytes32 indexed marketId,
        string question,
        address collateralToken,
        address resolver
    );

    event Settled(bytes32 indexed marketId, uint8 outcome);

    constructor(
        bytes32 _marketId,
        string memory _question,
        address _collateralToken,
        address _resolver
    ) {
        marketId = _marketId;
        question = _question;
        collateralToken = _collateralToken;
        resolver = IOutcomeResolver(_resolver);

        emit MarketCreated(_marketId, _question, _collateralToken, _resolver);
    }

    /// @notice Anyone can call this once the resolver has an answer; it just
    ///         pulls the outcome across and flips `settled`. Actual share
    ///         redemption (paying out collateral) is implemented in Session 2.
    function settle() external {
        require(!settled, "already settled");
        require(resolver.isResolved(marketId), "not resolved yet");

        outcome = resolver.getOutcome(marketId);
        settled = true;

        emit Settled(marketId, outcome);
    }

    // --- Session 2 will add here ---
    // function mintPair(uint256 collateralAmount) external { ... }
    // function merge(uint256 shareAmount) external { ... }
    // function redeem() external { ... }
}
