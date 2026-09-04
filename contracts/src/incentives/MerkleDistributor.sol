// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title MerkleDistributor
/// @notice Weekly epochs of borrower rebates and builder shares. The keeper publishes a root, and
/// each recipient claims their own leaf.
///
/// @dev Merkle rather than a payout loop for a reason that matters at our size: pushing to a list
/// costs gas proportional to the list and fails wholesale if one recipient is a contract that
/// reverts. Pull costs the treasury one transaction per epoch regardless of how many people are in
/// it, and a recipient who never claims simply leaves their share behind.
///
/// Each epoch is independent — its own root, its own claim bitmap — so a mistake in one week's
/// numbers is corrected by publishing a new epoch, not by unwinding an old one.
contract MerkleDistributor is Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;

    struct Epoch {
        bytes32 root;
        uint256 total;
        uint256 claimed;
        uint64 publishedAt;
    }

    /// @dev Epoch number → its root and accounting.
    mapping(uint256 => Epoch) public epochs;
    /// @dev epoch → account → claimed. A bitmap would be cheaper; a mapping is clearer, and the
    /// difference is a few thousand gas on a path each account walks once a week.
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    uint256 public latestEpoch;

    event EpochPublished(uint256 indexed epoch, bytes32 root, uint256 total);
    event Claimed(uint256 indexed epoch, address indexed account, uint256 amount);
    event Swept(uint256 indexed epoch, uint256 amount);

    error EpochExists(uint256 epoch);
    error UnknownEpoch(uint256 epoch);
    error AlreadyClaimed(uint256 epoch, address account);
    error BadProof();
    error UnderFunded(uint256 needed, uint256 balance);

    constructor(address _token, address _owner) Ownable(_owner) {
        token = IERC20(_token);
    }

    /// @notice Publish an epoch. The tokens for it must already be here.
    function publish(uint256 epoch, bytes32 root, uint256 total) external onlyOwner {
        if (epochs[epoch].root != bytes32(0)) revert EpochExists(epoch);

        // Everything unclaimed across all epochs, plus this one, has to be covered by the balance:
        // publishing a root the treasury cannot honour turns a rebate into a race.
        uint256 outstanding = _outstanding() + total;
        uint256 balance = token.balanceOf(address(this));
        if (outstanding > balance) revert UnderFunded(outstanding, balance);

        epochs[epoch] = Epoch({root: root, total: total, claimed: 0, publishedAt: uint64(block.timestamp)});
        if (epoch > latestEpoch) latestEpoch = epoch;
        emit EpochPublished(epoch, root, total);
    }

    /// @param proof Merkle proof for `keccak256(abi.encode(account, amount))`.
    function claim(uint256 epoch, address account, uint256 amount, bytes32[] calldata proof) external {
        Epoch storage e = epochs[epoch];
        if (e.root == bytes32(0)) revert UnknownEpoch(epoch);
        if (hasClaimed[epoch][account]) revert AlreadyClaimed(epoch, account);

        // Double hashing keeps a leaf from being mistaken for an internal node, which is how a
        // crafted proof can mint itself a claim in a naive implementation.
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
        if (!MerkleProof.verifyCalldata(proof, e.root, leaf)) revert BadProof();

        hasClaimed[epoch][account] = true;
        e.claimed += amount;
        token.safeTransfer(account, amount);
        emit Claimed(epoch, account, amount);
    }

    /// @notice Claim several epochs at once — the usual case for someone who has not been here in
    /// a while.
    function claimMany(
        uint256[] calldata epochList,
        address account,
        uint256[] calldata amounts,
        bytes32[][] calldata proofs
    ) external {
        for (uint256 i; i < epochList.length; ++i) {
            this.claim(epochList[i], account, amounts[i], proofs[i]);
        }
    }

    /// @notice Take back what an old epoch never paid out. Only after 90 days, so a slow claimant
    /// is not punished for being slow.
    function sweep(uint256 epoch) external onlyOwner {
        Epoch storage e = epochs[epoch];
        if (e.root == bytes32(0)) revert UnknownEpoch(epoch);
        require(block.timestamp > e.publishedAt + 90 days, "too early");

        uint256 unclaimed = e.total - e.claimed;
        e.total = e.claimed;
        if (unclaimed > 0) token.safeTransfer(owner(), unclaimed);
        emit Swept(epoch, unclaimed);
    }

    function _outstanding() internal view returns (uint256 sum) {
        for (uint256 i = 1; i <= latestEpoch; ++i) {
            Epoch storage e = epochs[i];
            sum += e.total - e.claimed;
        }
    }
}
