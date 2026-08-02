// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {TestFtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/TestFtsoV2Interface.sol";
import {IOutcomeResolver} from "../interfaces/IOutcomeResolver.sol";

/// @title FtsoPriceResolver
/// @notice Resolves "will <asset> be above/below <price> at <time>" markets
///         directly against Flare's FTSOv2 price feeds. No proposer, no
///         dispute window, no human in the loop — the feed value at or
///         after the target time IS the answer.
///
/// NOTE ON NETWORK: this imports from the `coston2` path of the Flare
/// periphery contracts package and uses `getTestFtsoV2()`, which is the
/// correct pairing for Coston2 testnet (see Flare's own getting-started
/// guide). When this moves to Flare Mainnet, swap these two imports for
/// the non-"Test" mainnet equivalents (`FtsoV2Interface` +
/// `ContractRegistry.getFtsoV2()`) — the rest of this contract is unchanged.
contract FtsoPriceResolver is IOutcomeResolver {
    struct MarketConfig {
        bytes21 feedId; // e.g. BTC/USD — see https://dev.flare.network/ftso/feeds
        uint256 strikeValue; // strike price, scaled by strikeDecimals
        int8 strikeDecimals;
        bool resolveYesIfAtOrAbove; // true: YES if price >= strike, false: YES if price < strike
        uint256 resolvesAfter; // unix timestamp; feed must be read at/after this time
        bool registered;
    }

    mapping(bytes32 => MarketConfig) public configs;
    mapping(bytes32 => bool) private _resolved;
    mapping(bytes32 => uint8) private _outcome;

    event MarketRegistered(
        bytes32 indexed marketId,
        bytes21 feedId,
        uint256 strikeValue,
        int8 strikeDecimals,
        bool resolveYesIfAtOrAbove,
        uint256 resolvesAfter
    );

    /// @notice Registers the price condition for a market. Called once, at
    ///         market creation time — the strike price and direction are
    ///         locked in before anyone knows what the price will actually do.
    function registerMarket(
        bytes32 marketId,
        bytes21 feedId,
        uint256 strikeValue,
        int8 strikeDecimals,
        bool resolveYesIfAtOrAbove,
        uint256 resolvesAfter
    ) external {
        require(!configs[marketId].registered, "market already registered");

        configs[marketId] = MarketConfig({
            feedId: feedId,
            strikeValue: strikeValue,
            strikeDecimals: strikeDecimals,
            resolveYesIfAtOrAbove: resolveYesIfAtOrAbove,
            resolvesAfter: resolvesAfter,
            registered: true
        });

        emit MarketRegistered(
            marketId,
            feedId,
            strikeValue,
            strikeDecimals,
            resolveYesIfAtOrAbove,
            resolvesAfter
        );
    }

    /// @notice Anyone can trigger resolution once `resolvesAfter` has passed —
    ///         there's nothing to dispute, so there's no reason to gate this
    ///         behind an admin key.
    function resolve(bytes32 marketId) external {
        MarketConfig memory cfg = configs[marketId];
        require(cfg.registered, "market not registered");
        require(!_resolved[marketId], "already resolved");
        require(block.timestamp >= cfg.resolvesAfter, "too early to resolve");

        TestFtsoV2Interface ftsoV2 = ContractRegistry.getTestFtsoV2();
        (uint256 value, int8 decimals, uint64 timestamp) = ftsoV2.getFeedById(
            cfg.feedId
        );
        require(timestamp >= cfg.resolvesAfter, "feed not yet updated past resolution time");

        // Normalize both values to the same decimal basis before comparing.
        uint256 normalizedFeedValue = value;
        uint256 normalizedStrike = cfg.strikeValue;
        if (decimals > cfg.strikeDecimals) {
            normalizedStrike *= 10 ** uint256(uint8(decimals - cfg.strikeDecimals));
        } else if (cfg.strikeDecimals > decimals) {
            normalizedFeedValue *= 10 ** uint256(uint8(cfg.strikeDecimals - decimals));
        }

        bool priceAtOrAboveStrike = normalizedFeedValue >= normalizedStrike;
        bool yes = cfg.resolveYesIfAtOrAbove
            ? priceAtOrAboveStrike
            : !priceAtOrAboveStrike;

        _resolved[marketId] = true;
        _outcome[marketId] = yes ? 1 : 0;

        emit OutcomeResolved(marketId, yes ? 1 : 0);
    }

    function isResolved(bytes32 marketId) external view override returns (bool) {
        return _resolved[marketId];
    }

    function getOutcome(bytes32 marketId) external view override returns (uint8) {
        require(_resolved[marketId], "not resolved");
        return _outcome[marketId];
    }
}
