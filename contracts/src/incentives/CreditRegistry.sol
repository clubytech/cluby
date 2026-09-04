// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title CreditRegistry
/// @notice On-chain record of a borrower's score, computed off chain by the indexer.
///
/// @dev The score changes what a borrower is *paid* — their share of the rebate — and never what
/// they may *borrow*. That line is the whole design: LTV is what protects the lenders, and a number
/// we compute off chain must not be able to move it. The worst a broken score can do here is
/// misallocate a rebate.
///
/// Kept deliberately small. It stores what an updater wrote and by when; anyone reading it can see
/// how stale the number is and decide for themselves.
contract CreditRegistry is Ownable2Step {
    struct Score {
        uint32 value; // 0–1000
        uint64 updatedAt;
    }

    mapping(address => Score) public scores;
    mapping(address => bool) public updaters;

    event ScoreSet(address indexed account, uint32 value);
    event UpdaterSet(address indexed updater, bool allowed);

    error NotUpdater();
    error OutOfRange(uint32 value);
    error LengthMismatch();

    constructor(address _owner) Ownable(_owner) {}

    modifier onlyUpdater() {
        if (!updaters[msg.sender] && msg.sender != owner()) revert NotUpdater();
        _;
    }

    function setUpdater(address updater, bool allowed) external onlyOwner {
        updaters[updater] = allowed;
        emit UpdaterSet(updater, allowed);
    }

    function setScore(address account, uint32 value) public onlyUpdater {
        if (value > 1000) revert OutOfRange(value);
        scores[account] = Score({value: value, updatedAt: uint64(block.timestamp)});
        emit ScoreSet(account, value);
    }

    /// @notice A whole epoch's scores in one transaction, which is how the keeper writes them.
    function setScores(address[] calldata accounts, uint32[] calldata values) external onlyUpdater {
        if (accounts.length != values.length) revert LengthMismatch();
        for (uint256 i; i < accounts.length; ++i) {
            setScore(accounts[i], values[i]);
        }
    }

    /// @return value The score, and how many seconds old it is. A consumer that cares about
    /// freshness can then refuse to act on a stale one rather than being misled by it.
    function scoreOf(address account) external view returns (uint32 value, uint256 ageSeconds) {
        Score memory s = scores[account];
        return (s.value, s.updatedAt == 0 ? type(uint256).max : block.timestamp - s.updatedAt);
    }
}
