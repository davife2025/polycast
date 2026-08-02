// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {IFdcVerification} from "@flarenetwork/flare-periphery-contracts/coston2/IFdcVerification.sol";
import {IWeb2Json} from "@flarenetwork/flare-periphery-contracts/coston2/IWeb2Json.sol";
import {IOutcomeResolver} from "../interfaces/IOutcomeResolver.sol";

/// @title FdcWeb2JsonResolver
/// @notice Resolves real-world event markets ("did team A win", "was the
///         election called for candidate X") against a verified Web2Json
///         attestation from Flare's Data Connector (FDC), instead of a
///         human proposer + dispute window (which is how Polymarket's
///         UMA-based resolution works today).
///
/// HOW THIS WORKS END TO END (the on-chain part is only the last step):
///  1. At market creation, the market creator decides on a data source: a
///     URL, an optional jq filter to extract just the relevant field, and
///     an ABI signature for the extracted result. To keep this contract
///     simple and generic across arbitrary questions, every Polycast
///     Web2Json market is required to reduce its jq filter down to a
///     single `bool` (true = YES). E.g. for "did the Lakers win on <date>",
///     the jq filter extracts the winning team and compares it to "Lakers".
///  2. That exact request configuration is registered on this contract via
///     `registerMarket`, locking in the data source *before* the outcome
///     is known.
///  3. Off-chain, someone submits the same request to FDC (via the FdcHub,
///     paying the attestation fee) and waits for it to be included in a
///     voting round, then fetches the resulting Merkle proof from Flare's
///     Data Availability layer.
///  4. That proof is submitted here via `resolveWithProof`. This contract
///     verifies the proof is genuine FDC output (via IFdcVerification),
///     checks it's answering the *exact* request that was registered for
///     this market (so nobody can slip in a different data source at
///     resolution time), and decodes the boolean result.
///
/// NOTE ON NETWORK: Web2Json is, as of this writing, only available on
/// Coston and Coston2 — not yet Flare Mainnet. Markets that need this
/// resolver should stay on Coston2 until that changes; see the root
/// README and packages/contracts/README.md for the ManualResolver
/// fallback used for real-world markets in the meantime on networks
/// where Web2Json isn't live.
contract FdcWeb2JsonResolver is IOutcomeResolver {
    struct MarketConfig {
        bytes32 expectedRequestHash; // keccak256 of the registered IWeb2Json.RequestBody
        bool registered;
    }

    mapping(bytes32 => MarketConfig) public configs;
    mapping(bytes32 => bool) private _resolved;
    mapping(bytes32 => uint8) private _outcome;

    event MarketRegistered(bytes32 indexed marketId, bytes32 expectedRequestHash);

    /// @notice Locks in the exact data-source configuration for a market.
    /// @param requestBody The full Web2Json request (url, jq filter,
    ///        ABI signature — which must decode to a single `bool`) that
    ///        will be considered authoritative for this market.
    function registerMarket(
        bytes32 marketId,
        IWeb2Json.RequestBody calldata requestBody
    ) external {
        require(!configs[marketId].registered, "market already registered");

        bytes32 requestHash = keccak256(abi.encode(requestBody));
        configs[marketId] = MarketConfig({
            expectedRequestHash: requestHash,
            registered: true
        });

        emit MarketRegistered(marketId, requestHash);
    }

    /// @notice Submits a verified FDC proof to resolve a market. Anyone can
    ///         call this — the security comes from the proof verification
    ///         and the request-hash match, not from access control.
    function resolveWithProof(
        bytes32 marketId,
        IWeb2Json.Proof calldata proof
    ) external {
        MarketConfig memory cfg = configs[marketId];
        require(cfg.registered, "market not registered");
        require(!_resolved[marketId], "already resolved");

        IFdcVerification fdc = ContractRegistry.getFdcVerification();
        require(fdc.verifyWeb2Json(proof), "invalid FDC proof");

        bytes32 actualRequestHash = keccak256(abi.encode(proof.data.requestBody));
        require(
            actualRequestHash == cfg.expectedRequestHash,
            "proof answers a different question than this market registered"
        );

        bool yes = abi.decode(proof.data.responseBody.abiEncodedData, (bool));

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
