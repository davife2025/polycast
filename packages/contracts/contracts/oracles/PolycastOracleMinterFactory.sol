// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {PolycastOracleMinter} from "./PolycastOracleMinter.sol";

/// @title PolycastOracleMinterFactory
/// @notice Deploys a PolycastOracleMinter for a given market + oracle +
///         oracleMarketId combination. Mirrors PolycastAMMFactory's
///         pattern — kept separate so a market can have an AMM, a
///         tracking minter, both, or neither.
contract PolycastOracleMinterFactory {
    mapping(address => address) public minterForMarket;

    event OracleMinterCreated(
        address indexed market,
        address indexed oracle,
        bytes32 oracleMarketId,
        address minter
    );

    function createOracleMinter(
        address market,
        address oracle,
        bytes32 oracleMarketId
    ) external returns (address minter) {
        require(market != address(0), "market required");
        require(minterForMarket[market] == address(0), "minter already exists for this market");

        PolycastOracleMinter created = new PolycastOracleMinter(market, oracle, oracleMarketId);
        minter = address(created);
        minterForMarket[market] = minter;

        emit OracleMinterCreated(market, oracle, oracleMarketId, minter);
    }
}
