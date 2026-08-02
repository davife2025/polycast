// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {PolycastAMM} from "./PolycastAMM.sol";

/// @title PolycastAMMFactory
/// @notice Deploys a PolycastAMM for a given market. Kept separate from
///         PolycastMarketFactory so an AMM stays an optional add-on to a
///         market rather than something every market is forced to have —
///         some markets might use a future order book instead, or none
///         at all (pure OTC via mintPair/mergePair).
contract PolycastAMMFactory {
    mapping(address => address) public ammForMarket;

    event AMMCreated(address indexed market, address indexed amm);

    function createAMM(address market) external returns (address amm) {
        require(market != address(0), "market required");
        require(ammForMarket[market] == address(0), "AMM already exists for this market");

        PolycastAMM created = new PolycastAMM(market);
        amm = address(created);
        ammForMarket[market] = amm;

        emit AMMCreated(market, amm);
    }
}
