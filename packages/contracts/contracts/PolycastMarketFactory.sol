// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {PolycastMarket} from "./PolycastMarket.sol";

/// @title PolycastMarketFactory
/// @notice Deploys new PolycastMarket instances and keeps a public registry
///         of every market ever created, so apps/api's indexer has a single
///         event stream to watch instead of needing to know about markets
///         in advance.
contract PolycastMarketFactory {
    address[] public allMarkets;

    /// @dev Prevents accidentally reusing a marketId across two different
    ///      markets, which would let one market's resolution answer the
    ///      other's `settle()` call too.
    mapping(bytes32 => bool) public marketIdUsed;

    event MarketCreated(
        address indexed market,
        bytes32 indexed marketId,
        string question,
        address collateralToken,
        address resolver
    );

    function createMarket(
        bytes32 marketId,
        string calldata question,
        address collateralToken,
        address resolver
    ) external returns (address market) {
        require(!marketIdUsed[marketId], "marketId already used");
        marketIdUsed[marketId] = true;

        PolycastMarket m = new PolycastMarket(
            marketId,
            question,
            collateralToken,
            resolver
        );
        market = address(m);
        allMarkets.push(market);

        emit MarketCreated(market, marketId, question, collateralToken, resolver);
    }

    function allMarketsLength() external view returns (uint256) {
        return allMarkets.length;
    }

    /// @notice Convenience getter so a frontend can fetch every market
    ///         address in a single call instead of looping allMarkets(i).
    function getAllMarkets() external view returns (address[] memory) {
        return allMarkets;
    }
}
