// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOutcomeResolver} from "../interfaces/IOutcomeResolver.sol";

/// @title ManualResolver
/// @notice Fallback resolver for markets that don't have a clean on-chain
///         verifiable data source (no FTSO feed, no approved Web2Json
///         endpoint yet). An owner/council posts the outcome directly.
///
/// This is intentionally the simplest possible resolver — it exists so:
///  (a) every market type has *some* working path to resolution from day one
///  (b) the rest of the stack (PolycastMarket, factory, indexer) has a real
///      IOutcomeResolver implementation to build and test against, before
///      the FTSO/FDC resolvers land in Session 2.
///
/// Session 2 will add a dispute window here (propose -> challenge period ->
/// finalize), similar in spirit to Polymarket's UMA-based flow but simpler,
/// since it's meant purely as a fallback rather than the primary path.
contract ManualResolver is IOutcomeResolver, Ownable {
    mapping(bytes32 => bool) private _resolved;
    mapping(bytes32 => uint8) private _outcome;

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Owner posts the final outcome for a market.
    /// @param marketId The market being resolved.
    /// @param outcome_ 0 = NO, 1 = YES
    function resolve(bytes32 marketId, uint8 outcome_) external onlyOwner {
        require(outcome_ <= 1, "outcome must be 0 or 1");
        require(!_resolved[marketId], "already resolved");

        _resolved[marketId] = true;
        _outcome[marketId] = outcome_;

        emit OutcomeResolved(marketId, outcome_);
    }

    function isResolved(bytes32 marketId) external view override returns (bool) {
        return _resolved[marketId];
    }

    function getOutcome(bytes32 marketId) external view override returns (uint8) {
        require(_resolved[marketId], "not resolved");
        return _outcome[marketId];
    }
}
