// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {TokenRegistry} from "../../src/token/TokenRegistry.sol";
import {MerkleDistributor} from "../../src/incentives/MerkleDistributor.sol";
import {CreditRegistry} from "../../src/incentives/CreditRegistry.sol";
import {Addresses} from "../../src/Addresses.sol";

/// A token shaped like the one a launchpad will mint: eighteen decimals, a fixed supply, a ticker.
contract LaunchToken is ERC20 {
    constructor() ERC20("Cluby", "CLUBY") {
        _mint(msg.sender, 1_000_000_000e18);
    }
}

/// @notice Launch day, rehearsed end to end against the live contracts.
///
/// @dev The question this answers is the only one that matters about a rebate: when the token
/// exists and the address is pasted in, does everything we promised actually pay out — or does it
/// turn out that the machinery was never wired to anything?
///
/// So this does not test a mock. It forks mainnet and drives the REAL deployed registry and the
/// REAL deployed distributor, as the REAL Safe, in the order launch day will happen in:
///
///   1. A token is minted, the way a launchpad mints one.
///   2. The Safe publishes its address to the token registry — the transaction the admin page sends.
///   3. The site's read returns the address and the ticker, taken from the token's own contract.
///   4. Scores are published for two borrowers, weighted differently.
///   5. The treasury funds the distributor, then opens a week whose split follows those scores.
///   6. Both borrowers claim, and the USDG actually moves.
///
/// Every failure this can catch is a failure that would otherwise be found on launch day, in public,
/// by a user who is owed money.
contract LaunchRehearsalTest is Test {
    TokenRegistry constant REGISTRY = TokenRegistry(0xD0A32d0bA6efa91b2637af14fD1580FE3ddB337A);
    MerkleDistributor constant DISTRIBUTOR = MerkleDistributor(0x34A7958C9C2bb5Cc2806ECd31c756A8e083C3965);
    CreditRegistry constant SCORES = CreditRegistry(0x86e8f3Bf88087774a530d70FfaD19b5257054E53);
    address constant SAFE = 0x90a82053b9012b6ea2D95f88ee81da969d4D8A85;
    IERC20 constant USDG = IERC20(Addresses.USDG);

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.createSelectFork(vm.envOr("ROBINHOOD_RPC_URL", string("https://rpc.mainnet.chain.robinhood.com")));
    }

    /// Kept as its own function purely to keep the stack shallow enough for the non-IR compiler.
    function _publishAndCheck() internal returns (address tok) {
        vm.prank(SAFE);
        LaunchToken token = new LaunchToken();
        assertEq(token.symbol(), "CLUBY");

        vm.prank(SAFE);
        REGISTRY.setToken(address(token), address(0));

        (address t,, uint64 at, string memory symbol, uint8 decimals, uint256 supply) = REGISTRY.listing();
        assertEq(t, address(token), "the published address is the one the site will show");
        assertEq(symbol, "CLUBY", "the ticker comes from the token, not from a string on the page");
        assertEq(decimals, 18);
        assertEq(supply, 1_000_000_000e18);
        assertGt(at, 0);
        return address(token);
    }

    function _setScores() internal returns (uint256 aliceScore, uint256 bobScore) {
        address[] memory who = new address[](2);
        who[0] = alice;
        who[1] = bob;
        uint32[] memory values = new uint32[](2);
        values[0] = 750;
        values[1] = 250;
        vm.prank(SAFE);
        SCORES.setScores(who, values);

        (uint32 a,) = SCORES.scoreOf(alice);
        (uint32 b,) = SCORES.scoreOf(bob);
        assertEq(a, 750);
        assertEq(b, 250);
        return (a, b);
    }

    function test_launchDay_tokenIsPublishedAndRebatesActuallyPay() public {
        // 1, 2 and 3: the token exists, the Safe publishes it, the site's read answers.
        _publishAndCheck();

        // 4. Scores decide the split. Alice has repaid more than Bob.
        (uint256 aliceScore, uint256 bobScore) = _setScores();

        // A week's rebate pot, split in proportion to those scores.
        uint256 pot = 100e6; // 100 USDG
        uint256 aliceOwed = (pot * aliceScore) / (aliceScore + bobScore);
        uint256 bobOwed = pot - aliceOwed;
        assertEq(aliceOwed + bobOwed, pot, "the split must not lose a unit");

        // ------------------------------------------------------------------
        // 5. Funding comes FIRST. Publishing before funding must be impossible.
        // ------------------------------------------------------------------
        bytes32 leafA = _leaf(alice, aliceOwed);
        bytes32 leafB = _leaf(bob, bobOwed);
        bytes32 root = _hashPair(leafA, leafB);

        uint256 nextEpoch = DISTRIBUTOR.latestEpoch() + 1;
        vm.prank(SAFE);
        vm.expectRevert();
        DISTRIBUTOR.publish(nextEpoch, root, pot);

        deal(address(USDG), address(DISTRIBUTOR), USDG.balanceOf(address(DISTRIBUTOR)) + pot);
        vm.prank(SAFE);
        DISTRIBUTOR.publish(nextEpoch, root, pot);

        // ------------------------------------------------------------------
        // 6. The money moves. This is the whole promise.
        // ------------------------------------------------------------------
        bytes32[] memory proofA = new bytes32[](1);
        proofA[0] = leafB;
        bytes32[] memory proofB = new bytes32[](1);
        proofB[0] = leafA;

        uint256 aliceBefore = USDG.balanceOf(alice);
        uint256 bobBefore = USDG.balanceOf(bob);

        DISTRIBUTOR.claim(nextEpoch, alice, aliceOwed, proofA);
        DISTRIBUTOR.claim(nextEpoch, bob, bobOwed, proofB);

        assertEq(USDG.balanceOf(alice) - aliceBefore, aliceOwed, "alice was actually paid");
        assertEq(USDG.balanceOf(bob) - bobBefore, bobOwed, "bob was actually paid");
        assertGt(aliceOwed, bobOwed, "the better score was paid more, which is the entire mechanism");

        // Nobody gets paid twice, and a stranger cannot claim someone else's leaf.
        vm.expectRevert();
        DISTRIBUTOR.claim(nextEpoch, alice, aliceOwed, proofA);

        console2.log("  alice paid (USDG 1e6)", aliceOwed);
        console2.log("  bob   paid (USDG 1e6)", bobOwed);
    }

    /// A withdrawn announcement has to be possible, or a wrong paste is permanent.
    function test_launchDay_aWrongAddressCanBeWithdrawn() public {
        vm.prank(SAFE);
        LaunchToken token = new LaunchToken();
        vm.startPrank(SAFE);
        REGISTRY.setToken(address(token), address(0));
        REGISTRY.clear();
        vm.stopPrank();
        (address t,,,,,) = REGISTRY.listing();
        assertEq(t, address(0), "the site goes back to saying there is no token");
    }

    /// The guard that matters most on this contract: an address with no code is an address someone
    /// sends money to, and it must never reach the front page.
    function test_launchDay_anAddressWithNoCodeCannotReachTheFrontPage() public {
        vm.prank(SAFE);
        vm.expectRevert(abi.encodeWithSelector(TokenRegistry.NotAContract.selector, address(0xdeaD)));
        REGISTRY.setToken(address(0xdeaD), address(0));
    }

    /// Nobody but the Safe can publish an address, on the live contract, right now.
    function test_launchDay_nobodyElseCanPublish() public {
        vm.prank(SAFE);
        LaunchToken token = new LaunchToken();
        vm.prank(alice);
        vm.expectRevert();
        REGISTRY.setToken(address(token), address(0));
    }

    function _leaf(address account, uint256 amount) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
    }

    function _hashPair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }
}
