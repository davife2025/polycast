// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PolymarketPriceOracle
/// @notice A push oracle: a trusted off-chain relayer (apps/api, polling
///         Polymarket's public Gamma/CLOB API) periodically writes the
///         current YES probability for a given external market here.
///
/// IMPORTANT — READ BEFORE USING: this is NOT trustless the way FTSO or
/// FDC are. It depends entirely on the relayer address reporting honestly
/// and promptly. That's a deliberate, disclosed tradeoff for *speed* —
/// Polymarket's odds move continuously, and FDC's attestation voting
/// round isn't fast enough to track that in real time. This oracle is
/// meant to drive the *live tradeable price* of a tracking market; final
/// settlement should still go through FdcWeb2JsonResolver (verified,
/// trustless) rather than trusting this relayer's word for the final
/// outcome too. See PolycastOracleMinter.sol for how the two combine.
contract PolymarketPriceOracle is Ownable {
    struct PriceData {
        uint256 yesPriceWad; // 0 to 1e18 (1e18 = 100% YES)
        uint64 updatedAt;
    }

    mapping(bytes32 => PriceData) public prices;
    address public relayer;

    event PriceUpdated(bytes32 indexed marketId, uint256 yesPriceWad, uint64 updatedAt);
    event RelayerUpdated(address indexed newRelayer);

    modifier onlyRelayer() {
        require(msg.sender == relayer, "caller is not the relayer");
        _;
    }

    constructor(address initialOwner, address initialRelayer) Ownable(initialOwner) {
        relayer = initialRelayer;
    }

    /// @notice Owner can rotate the relayer address (e.g. if the backend's
    ///         signing key needs to change).
    function setRelayer(address newRelayer) external onlyOwner {
        require(newRelayer != address(0), "relayer required");
        relayer = newRelayer;
        emit RelayerUpdated(newRelayer);
    }

    /// @notice Called by the relayer on every price tick it observes.
    function updatePrice(bytes32 marketId, uint256 yesPriceWad) external onlyRelayer {
        require(yesPriceWad <= 1e18, "price must be <= 1e18 (100%)");
        prices[marketId] = PriceData({
            yesPriceWad: yesPriceWad,
            updatedAt: uint64(block.timestamp)
        });
        emit PriceUpdated(marketId, yesPriceWad, uint64(block.timestamp));
    }

    function getPrice(bytes32 marketId) external view returns (uint256 yesPriceWad, uint64 updatedAt) {
        PriceData memory data = prices[marketId];
        require(data.updatedAt > 0, "no price data for this market yet");
        return (data.yesPriceWad, data.updatedAt);
    }

    /// @notice Lets callers (like PolycastOracleMinter) refuse to trade
    ///         against a price that hasn't updated recently — protects
    ///         against trading on stale data if the relayer goes down.
    function isFresh(bytes32 marketId, uint256 maxAgeSeconds) external view returns (bool) {
        PriceData memory data = prices[marketId];
        if (data.updatedAt == 0) return false;
        return block.timestamp - data.updatedAt <= maxAgeSeconds;
    }
}
