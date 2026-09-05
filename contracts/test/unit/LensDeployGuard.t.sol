// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Lens} from "../../src/periphery/Lens.sol";

/// The failure this guards against shipped: a Lens was deployed against an address with no code and
/// answered every question with an empty revert for as long as it took someone to notice.
contract LensDeployGuardTest is Test {
    function test_constructorRejectsAnAddressWithNoCode() public {
        address notAContract = address(0xdeaD);
        vm.expectRevert(abi.encodeWithSelector(Lens.MorphoHasNoCode.selector, notAContract));
        new Lens(notAContract);
    }

    function test_constructorAcceptsAContract() public {
        address hasCode = address(new Dummy());
        Lens lens = new Lens(hasCode);
        assertEq(address(lens.morpho()), hasCode);
    }

    /// The empty revert itself, so the diagnosis is written down rather than remembered: a call into
    /// an address with no code is what `marketView` was doing on every market.
    function test_proof_callIntoCodelessAddressRevertsWithNoData() public {
        Reader r = new Reader();
        (bool ok, bytes memory data) = address(r).call(abi.encodeCall(Reader.read, (address(0xdeaD))));
        assertFalse(ok);
        assertEq(data.length, 0, "an empty revert is indistinguishable from a broken market");
    }
}

contract Dummy {
    uint256 public x;
}

contract Reader {
    function read(address target) external view returns (uint256) {
        return Dummy(target).x();
    }
}
