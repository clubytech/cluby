// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {TokenRegistry} from "../../src/token/TokenRegistry.sol";

contract FakeToken {
    function symbol() external pure returns (string memory) { return "CLUBY"; }
    function decimals() external pure returns (uint8) { return 18; }
    function totalSupply() external pure returns (uint256) { return 1_000_000_000e18; }
}

/// A token that answers nothing. The page must still render.
contract MuteToken {
    uint256 public x;
}

contract TokenRegistryTest is Test {
    TokenRegistry reg;
    address owner = address(0xA11CE);
    address stranger = address(0xB0B);

    function setUp() public {
        reg = new TokenRegistry(owner);
    }

    function test_beforeLaunchTheListingIsEmptyRatherThanReverting() public view {
        (address t,, uint64 at, string memory sym,, uint256 supply) = reg.listing();
        assertEq(t, address(0));
        assertEq(at, 0);
        assertEq(bytes(sym).length, 0);
        assertEq(supply, 0);
    }

    function test_ownerPublishesAndTheTickerComesFromTheTokenItself() public {
        address tok = address(new FakeToken());
        vm.prank(owner);
        reg.setToken(tok, address(0));

        (address t,, uint64 at, string memory sym, uint8 dec, uint256 supply) = reg.listing();
        assertEq(t, tok);
        assertEq(sym, "CLUBY");
        assertEq(dec, 18);
        assertEq(supply, 1_000_000_000e18);
        assertEq(at, uint64(block.timestamp));
    }

    function test_proof_aStrangerCannotPublishAnAddress() public {
        address tok = address(new FakeToken());
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        reg.setToken(tok, address(0));
    }

    /// The one that matters: an address with no code is an address someone sends money to.
    function test_proof_anAddressWithNoCodeCannotBePublished() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TokenRegistry.NotAContract.selector, address(0xdeaD)));
        reg.setToken(address(0xdeaD), address(0));
    }

    function test_proof_aPoolWithNoCodeCannotBePublishedEither() public {
        address tok = address(new FakeToken());
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TokenRegistry.NotAContract.selector, address(0xdeaD)));
        reg.setToken(tok, address(0xdeaD));
    }

    function test_aTokenThatAnswersNothingStillRenders() public {
        address mute = address(new MuteToken());
        vm.prank(owner);
        reg.setToken(mute, address(0));
        (address t,,, string memory sym, uint8 dec, uint256 supply) = reg.listing();
        assertEq(t, mute, "the address is still published");
        assertEq(bytes(sym).length, 0, "and the missing symbol is visibly missing");
        assertEq(dec, 0);
        assertEq(supply, 0);
    }

    function test_clearWithdrawsTheAnnouncement() public {
        address tok = address(new FakeToken());
        vm.startPrank(owner);
        reg.setToken(tok, address(0));
        reg.clear();
        vm.stopPrank();
        (address t,, uint64 at,,,) = reg.listing();
        assertEq(t, address(0));
        assertEq(at, 0);
    }
}
