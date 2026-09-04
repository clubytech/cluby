// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title StakingRewards
/// @notice Stake the protocol token, earn USDG streamed by the second. No lock: staking and
/// unstaking are immediate, and unclaimed rewards survive both.
///
/// @dev The Synthetix accumulator, which is the design every staking contract worth trusting uses:
/// a single `rewardPerTokenStored` running total, and a per-account snapshot of it. That is what
/// makes rewards O(1) to distribute — no loop over stakers, so a large staker set cannot make the
/// contract too expensive to use.
///
/// The reward token is USDG and the staking token is ours, and they are deliberately different.
/// When a contract streams the same token it holds as stake, the reward accounting can eat the
/// stake — the mistake that has drained more than one fork of this pattern. Here the two balances
/// cannot touch.
///
/// Rewards are only ever what the treasury has already sent. `notifyRewardAmount` checks the
/// contract's own balance covers the rate it is about to promise, so the contract cannot commit to
/// paying out money that is not here.
contract StakingRewards is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;

    uint256 public periodFinish;
    uint256 public rewardRate;
    uint256 public rewardsDuration = 7 days;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 reward);
    event RewardAdded(uint256 reward, uint256 periodFinish);
    event RewardsDurationUpdated(uint256 duration);

    error ZeroAmount();
    error RewardExceedsBalance(uint256 rate, uint256 balance);
    error PeriodStillActive(uint256 finishesAt);
    error SameToken();

    constructor(address _stakingToken, address _rewardToken, address _owner) Ownable(_owner) {
        if (_stakingToken == _rewardToken) revert SameToken();
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }

    modifier updateReward(address account) {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        if (account != address(0)) {
            rewards[account] = earned(account);
            userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
        _;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply == 0) return rewardPerTokenStored;
        return rewardPerTokenStored
            + ((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) / totalSupply;
    }

    function earned(address account) public view returns (uint256) {
        return (balanceOf[account] * (rewardPerToken() - userRewardPerTokenPaid[account])) / 1e18
            + rewards[account];
    }

    /// @notice Reward paid over the whole current period, for display.
    function getRewardForDuration() external view returns (uint256) {
        return rewardRate * rewardsDuration;
    }

    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        totalSupply += amount;
        balanceOf[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public nonReentrant updateReward(msg.sender) {
        if (amount == 0) revert ZeroAmount();
        totalSupply -= amount;
        balanceOf[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function getReward() public nonReentrant updateReward(msg.sender) {
        uint256 reward = rewards[msg.sender];
        if (reward == 0) return;
        rewards[msg.sender] = 0;
        rewardToken.safeTransfer(msg.sender, reward);
        emit RewardPaid(msg.sender, reward);
    }

    /// @notice Take everything out and claim in one go — the path a user wants when they are leaving.
    function exit() external {
        withdraw(balanceOf[msg.sender]);
        getReward();
    }

    /// @notice Start (or top up) a reward period. The tokens must already be here.
    /// @dev Called daily by the keeper after converting the vault's fee shares to USDG. Topping up
    /// mid-period rolls the remainder into the new rate rather than dropping it.
    function notifyRewardAmount(uint256 reward) external onlyOwner updateReward(address(0)) {
        if (block.timestamp >= periodFinish) {
            rewardRate = reward / rewardsDuration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            rewardRate = (reward + remaining * rewardRate) / rewardsDuration;
        }

        // The contract must be able to pay what it is about to promise. Without this check a typo
        // sets a rate the balance cannot cover, and the last claimants find an empty contract.
        uint256 balance = rewardToken.balanceOf(address(this));
        if (rewardRate * rewardsDuration > balance) revert RewardExceedsBalance(rewardRate, balance);

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + rewardsDuration;
        emit RewardAdded(reward, periodFinish);
    }

    /// @dev Only between periods: changing the duration mid-stream would silently reprice the
    /// remainder of what stakers were told they would earn.
    function setRewardsDuration(uint256 duration) external onlyOwner {
        if (block.timestamp <= periodFinish) revert PeriodStillActive(periodFinish);
        if (duration == 0) revert ZeroAmount();
        rewardsDuration = duration;
        emit RewardsDurationUpdated(duration);
    }

    /// @notice Recover a token sent here by mistake. Never the staking token: that is users' stake.
    function recover(address token, uint256 amount) external onlyOwner {
        if (token == address(stakingToken)) revert SameToken();
        IERC20(token).safeTransfer(owner(), amount);
    }
}
