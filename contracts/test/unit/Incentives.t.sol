// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {StakingRewards} from "../../src/incentives/StakingRewards.sol";
import {MerkleDistributor} from "../../src/incentives/MerkleDistributor.sol";
import {CreditRegistry} from "../../src/incentives/CreditRegistry.sol";
import {MockERC20} from "../mocks/Mocks.sol";

contract StakingRewardsTest is Test {
    MockERC20 stakeToken;
    MockERC20 usdg;
    StakingRewards staking;

    address owner = address(0xA11CE);
    address alice = address(0xA11);
    address bob = address(0xB0B);

    function setUp() public {
        stakeToken = new MockERC20("Cluby", "CLUB", 18);
        usdg = new MockERC20("USDG", "USDG", 6);
        staking = new StakingRewards(address(stakeToken), address(usdg), owner);

        stakeToken.mint(alice, 1_000e18);
        stakeToken.mint(bob, 1_000e18);
        vm.prank(alice);
        stakeToken.approve(address(staking), type(uint256).max);
        vm.prank(bob);
        stakeToken.approve(address(staking), type(uint256).max);
    }

    function _fund(uint256 amount) internal {
        usdg.mint(address(staking), amount);
        vm.prank(owner);
        staking.notifyRewardAmount(amount);
    }

    /// The contract must never promise a rate its balance cannot cover.
    function test_cannotPromiseMoreThanItHolds() public {
        usdg.mint(address(staking), 100e6);
        vm.prank(owner);
        vm.expectRevert();
        staking.notifyRewardAmount(1_000e6);
    }

    function test_rewardsAccrueProportionally() public {
        vm.prank(alice);
        staking.stake(300e18);
        vm.prank(bob);
        staking.stake(100e18);

        _fund(700e6); // 7 days
        vm.warp(block.timestamp + 7 days);

        uint256 aliceEarned = staking.earned(alice);
        uint256 bobEarned = staking.earned(bob);
        // Three quarters of the stake earns three quarters of the reward.
        assertApproxEqRel(aliceEarned, 525e6, 0.01e18);
        assertApproxEqRel(bobEarned, 175e6, 0.01e18);
        assertApproxEqRel(aliceEarned + bobEarned, 700e6, 0.01e18);
    }

    /// Someone who stakes halfway through a period earns from that point, not from the start.
    function test_lateStakerEarnsOnlyFromWhenTheyStaked() public {
        vm.prank(alice);
        staking.stake(100e18);
        _fund(700e6);

        vm.warp(block.timestamp + 3.5 days);
        vm.prank(bob);
        staking.stake(100e18);
        vm.warp(block.timestamp + 3.5 days);

        // Alice had it all for half the period, then half of it: 350 + 175.
        assertApproxEqRel(staking.earned(alice), 525e6, 0.02e18);
        assertApproxEqRel(staking.earned(bob), 175e6, 0.02e18);
    }

    /// Unstaking must not forfeit what has already been earned.
    function test_withdrawKeepsEarnedRewards() public {
        vm.prank(alice);
        staking.stake(100e18);
        _fund(700e6);
        vm.warp(block.timestamp + 7 days);

        uint256 earnedBefore = staking.earned(alice);
        vm.prank(alice);
        staking.withdraw(100e18);
        assertEq(staking.earned(alice), earnedBefore);

        vm.prank(alice);
        staking.getReward();
        assertApproxEqRel(usdg.balanceOf(alice), earnedBefore, 0.0001e18);
    }

    /// A top-up mid-period rolls the remainder in rather than discarding it.
    function test_topUpRollsTheRemainderIn() public {
        vm.prank(alice);
        staking.stake(100e18);
        _fund(700e6);

        vm.warp(block.timestamp + 3.5 days);
        usdg.mint(address(staking), 700e6);
        vm.prank(owner);
        staking.notifyRewardAmount(700e6);

        vm.warp(block.timestamp + 7 days);
        // 350 already accrued, plus the 350 left over rolled in with the new 700.
        assertApproxEqRel(staking.earned(alice), 1_400e6, 0.02e18);
    }

    /// Staking and reward tokens must differ, or reward accounting can consume the stake.
    function test_refusesIdenticalTokens() public {
        vm.expectRevert(StakingRewards.SameToken.selector);
        new StakingRewards(address(stakeToken), address(stakeToken), owner);
    }

    function test_cannotRecoverTheStakingToken() public {
        vm.prank(alice);
        staking.stake(100e18);
        vm.prank(owner);
        vm.expectRevert(StakingRewards.SameToken.selector);
        staking.recover(address(stakeToken), 1e18);
    }
}

contract MerkleDistributorTest is Test {
    MockERC20 usdg;
    MerkleDistributor dist;
    address owner = address(0xA11CE);
    address alice = address(0xA11);
    address bob = address(0xB0B);

    function setUp() public {
        usdg = new MockERC20("USDG", "USDG", 6);
        dist = new MerkleDistributor(address(usdg), owner);
    }

    function _leaf(address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }

    /// A two-leaf tree: the root is the hash of the pair, sorted.
    function _tree(address a, uint256 aAmount, address b, uint256 bAmount)
        internal
        pure
        returns (bytes32 root, bytes32 aLeaf, bytes32 bLeaf)
    {
        aLeaf = _leaf(a, aAmount);
        bLeaf = _leaf(b, bAmount);
        // OpenZeppelin's verifier hashes sorted pairs, so the tree has to be built the same way.
        root = aLeaf < bLeaf
            ? keccak256(bytes.concat(aLeaf, bLeaf))
            : keccak256(bytes.concat(bLeaf, aLeaf));
    }

    function test_claimPaysOnce() public {
        (bytes32 root, , bytes32 bLeaf) = _tree(alice, 100e6, bob, 50e6);
        usdg.mint(address(dist), 150e6);
        vm.prank(owner);
        dist.publish(1, root, 150e6);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = bLeaf;
        dist.claim(1, alice, 100e6, proof);
        assertEq(usdg.balanceOf(alice), 100e6);

        vm.expectRevert(abi.encodeWithSelector(MerkleDistributor.AlreadyClaimed.selector, 1, alice));
        dist.claim(1, alice, 100e6, proof);
    }

    /// A claim for the wrong amount must not verify, even with a valid-looking proof.
    function test_wrongAmountFails() public {
        (bytes32 root, , bytes32 bLeaf) = _tree(alice, 100e6, bob, 50e6);
        usdg.mint(address(dist), 150e6);
        vm.prank(owner);
        dist.publish(1, root, 150e6);

        bytes32[] memory proof = new bytes32[](1);
        proof[0] = bLeaf;
        vm.expectRevert(MerkleDistributor.BadProof.selector);
        dist.claim(1, alice, 101e6, proof);
    }

    /// Publishing a root the treasury cannot honour turns a rebate into a race for the balance.
    function test_cannotPublishUnfunded() public {
        (bytes32 root, , ) = _tree(alice, 100e6, bob, 50e6);
        usdg.mint(address(dist), 100e6);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MerkleDistributor.UnderFunded.selector, 150e6, 100e6));
        dist.publish(1, root, 150e6);
    }

    /// A second epoch cannot be funded out of the first epoch's unclaimed money.
    function test_secondEpochNeedsItsOwnFunding() public {
        (bytes32 root, , ) = _tree(alice, 100e6, bob, 50e6);
        usdg.mint(address(dist), 150e6);
        vm.startPrank(owner);
        dist.publish(1, root, 150e6);
        vm.expectRevert();
        dist.publish(2, root, 150e6);
        vm.stopPrank();
    }

    function test_sweepOnlyAfterNinetyDays() public {
        (bytes32 root, , ) = _tree(alice, 100e6, bob, 50e6);
        usdg.mint(address(dist), 150e6);
        vm.startPrank(owner);
        dist.publish(1, root, 150e6);

        vm.expectRevert("too early");
        dist.sweep(1);

        vm.warp(block.timestamp + 91 days);
        dist.sweep(1);
        vm.stopPrank();
        assertEq(usdg.balanceOf(owner), 150e6);
    }
}

contract CreditRegistryTest is Test {
    CreditRegistry registry;
    address owner = address(0xA11CE);
    address keeper = address(0xCEE9E4);
    address alice = address(0xA11);

    function setUp() public {
        registry = new CreditRegistry(owner);
        vm.prank(owner);
        registry.setUpdater(keeper, true);
    }

    function test_onlyUpdatersMayWrite() public {
        vm.expectRevert(CreditRegistry.NotUpdater.selector);
        registry.setScore(alice, 700);

        vm.prank(keeper);
        registry.setScore(alice, 700);
        (uint32 value,) = registry.scoreOf(alice);
        assertEq(value, 700);
    }

    function test_rejectsOutOfRange() public {
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(CreditRegistry.OutOfRange.selector, uint32(1001)));
        registry.setScore(alice, 1001);
    }

    /// An unset score reads as infinitely stale, so a consumer can tell "no score" from "zero".
    function test_unknownScoreIsInfinitelyStale() public view {
        (uint32 value, uint256 age) = registry.scoreOf(alice);
        assertEq(value, 0);
        assertEq(age, type(uint256).max);
    }

    function test_ageGrows() public {
        vm.prank(keeper);
        registry.setScore(alice, 500);
        vm.warp(block.timestamp + 3 days);
        (, uint256 age) = registry.scoreOf(alice);
        assertEq(age, 3 days);
    }
}
