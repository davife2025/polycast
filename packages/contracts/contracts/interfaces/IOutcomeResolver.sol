// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @title IOutcomeResolver
/// @notice Common interface every Polycast market resolver implements,
///         regardless of *how* it determines the outcome. A PolycastMarket
///         doesn't need to know if it's talking to an FTSO price feed, an
///         FDC Web2Json attestation, or a manual/council fallback — it just
///         asks "is this resolved, and if so, what happened?"
///
/// Implementations planned for Session 2:
///  - FtsoPriceResolver   — for crypto price markets, reads FTSOv2 feeds directly, no dispute window
///  - FdcWeb2JsonResolver — for real-world event markets, verifies an FDC Web2Json attestation proof
///  - ManualResolver      — admin/council fallback with a dispute window, for markets with no clean
///                          on-chain-verifiable data source (used while Web2Json coverage is still growing)
interface IOutcomeResolver {
    /// @notice Whether this resolver has reached a final answer for the given market.
    function isResolved(bytes32 marketId) external view returns (bool);

    /// @notice The resolved outcome. Only meaningful when isResolved(marketId) is true.
    /// @return outcome 0 = NO, 1 = YES
    function getOutcome(bytes32 marketId) external view returns (uint8 outcome);

    /// @notice Emitted the moment a market becomes resolved, so indexers
    ///         (apps/api) can pick it up without polling.
    event OutcomeResolved(bytes32 indexed marketId, uint8 outcome);
}
