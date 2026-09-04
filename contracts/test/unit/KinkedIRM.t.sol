// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KinkedIRM} from "../../src/KinkedIRM.sol";
import {Id} from "../../src/interfaces/IMarket.sol";

contract KinkedIRMTest is Test {
    KinkedIRM irm;
    Id id = Id.wrap(keccak256("m"));

    function setUp() public {
        irm = new KinkedIRM(address(this), KinkedIRM.Curve({baseApr: 0.02e18, kinkApr: 0.12e18, maxApr: 1.5e18, kink: 0.8e18}));
    }

    function test_curvePoints() public view {
        assertEq(irm.borrowApr(id, 0), 0.02e18);
        assertEq(irm.borrowApr(id, 0.4e18), 0.07e18);
        assertEq(irm.borrowApr(id, 0.8e18), 0.12e18);
        assertEq(irm.borrowApr(id, 0.9e18), 0.81e18);
        assertEq(irm.borrowApr(id, 1e18), 1.5e18);
        assertEq(irm.borrowApr(id, 2e18), 1.5e18); // clamped
        assertEq(irm.borrowRate(id, 1e18), uint256(1.5e18) / 365 days);
    }

    function test_perMarketOverride() public {
        irm.setCurve(id, KinkedIRM.Curve({baseApr: 0.05e18, kinkApr: 0.5e18, maxApr: 5e18, kink: 0.5e18}));
        assertEq(irm.borrowApr(id, 0.5e18), 0.5e18);
        assertEq(irm.borrowApr(Id.wrap(keccak256("other")), 0.8e18), 0.12e18);
        irm.clearCurve(id);
        assertEq(irm.borrowApr(id, 0.8e18), 0.12e18);
    }

    function test_invalidCurve() public {
        vm.expectRevert(KinkedIRM.InvalidCurve.selector);
        irm.setDefaultCurve(KinkedIRM.Curve({baseApr: 0.2e18, kinkApr: 0.12e18, maxApr: 1.5e18, kink: 0.8e18}));
        vm.expectRevert(KinkedIRM.InvalidCurve.selector);
        irm.setDefaultCurve(KinkedIRM.Curve({baseApr: 0, kinkApr: 0.1e18, maxApr: 1e18, kink: 1e18}));
    }

    function testFuzz_monotonic(uint256 a, uint256 b) public view {
        a = bound(a, 0, 1e18);
        b = bound(b, a, 1e18);
        assertLe(irm.borrowApr(id, a), irm.borrowApr(id, b));
    }
}
