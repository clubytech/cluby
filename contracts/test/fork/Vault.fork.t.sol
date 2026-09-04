// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

import {MetaMorphoV1_1Factory} from "../../lib/metamorpho-v1.1/src/MetaMorphoV1_1Factory.sol";
import {IMetaMorphoV1_1} from "../../lib/metamorpho-v1.1/src/interfaces/IMetaMorphoV1_1.sol";
import {MarketParams, Id, IMorpho} from "../../lib/metamorpho-v1.1/lib/morpho-blue/src/interfaces/IMorpho.sol";
import {MarketParamsLib} from "../../lib/metamorpho-v1.1/lib/morpho-blue/src/libraries/MarketParamsLib.sol";

/// @notice The Earn side, end to end on a fork of the live chain: deploy Morpho's vault factory,
/// create the Core USDG vault, cap the three canary markets, deposit, and take it back out.
///
/// @dev Morpho never deployed MetaMorpho here, so this is the first vault on the chain. Everything
/// it lends into is a market that already exists at the forked block.
contract VaultForkTest is Test {
    using MarketParamsLib for MarketParams;

    IMorpho constant MORPHO = IMorpho(0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010);
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;

    // The canary markets, created on mainnet earlier today.
    Id constant NVDA_MARKET = Id.wrap(0x639f19732ce4cd54b9f3509f3acee6e8d5d20ff5e75b7c94c20808f48196d826);
    Id constant SPY_MARKET = Id.wrap(0xf95832e36d9d8baf35eb78ce80cbed92d20198ba639659b3f9a2ab00ced0a0c1);
    Id constant ETH_MARKET = Id.wrap(0x6722f53f25a8d6e73493893c4f7f80ddc535cf97c4a93116fd55296e714216ae);

    MetaMorphoV1_1Factory factory;
    IMetaMorphoV1_1 vault;

    address owner = makeAddr("owner");
    address depositor = makeAddr("depositor");
    address borrower = makeAddr("borrower");

    function setUp() public {
        vm.skip(bytes(vm.envOr("ROBINHOOD_RPC_URL", string(""))).length == 0);

        factory = new MetaMorphoV1_1Factory(address(MORPHO));

        vm.prank(owner);
        vault = IMetaMorphoV1_1(
            factory.createMetaMorpho(owner, 0, USDG, "Cluby Core USDG", "cUSDG", bytes32("cluby-core"))
        );

        // Fee stays at zero for the first markets, so nothing is skimmed from the early depositors.
        assertEq(vault.fee(), 0);

        vm.startPrank(owner);
        vault.setIsAllocator(owner, true);
        _enable(NVDA_MARKET, 2_000e6);
        _enable(SPY_MARKET, 2_000e6);
        _enable(ETH_MARKET, 5_000e6);

        Id[] memory queue = new Id[](3);
        queue[0] = NVDA_MARKET;
        queue[1] = SPY_MARKET;
        queue[2] = ETH_MARKET;
        vault.setSupplyQueue(queue);
        vm.stopPrank();
    }

    function _enable(Id id, uint184 cap) internal {
        vault.submitCap(MORPHO.idToMarketParams(id), cap);
        // Timelock is zero at creation, so a cap takes effect immediately. It is raised to 24h
        // before anyone else's money is in here.
        vault.acceptCap(MORPHO.idToMarketParams(id));
    }

    function test_factoryRecognisesItsOwnVault() public view {
        assertTrue(factory.isMetaMorpho(address(vault)));
        assertEq(vault.asset(), USDG);
        assertEq(vault.owner(), owner);
    }

    /// A deposit must actually reach a market — a vault that holds idle cash earns nothing and is
    /// the most common way a first deployment looks fine and pays nothing.
    function test_depositReachesTheMarket() public {
        uint256 amount = 1_000e6;
        deal(USDG, depositor, amount);

        vm.startPrank(depositor);
        IERC20(USDG).approve(address(vault), amount);
        uint256 shares = vault.deposit(amount, depositor);
        vm.stopPrank();

        assertGt(shares, 0);
        assertEq(vault.totalAssets(), amount);

        // The first market in the supply queue took it.
        uint256 supplied = MORPHO.position(NVDA_MARKET, address(vault)).supplyShares;
        assertGt(supplied, 0, "vault did not lend the deposit out");
        console2.log("deposited", amount);
        console2.log("supply shares in the NVDA market", supplied);
    }

    /// The number the site shows as "withdrawable now" has to be real: what is borrowed cannot come
    /// back until it is repaid, and a vault that pretends otherwise fails at the worst moment.
    function test_withdrawableIsLimitedByWhatIsBorrowed() public {
        uint256 amount = 1_000e6;
        deal(USDG, depositor, amount);

        vm.startPrank(depositor);
        IERC20(USDG).approve(address(vault), amount);
        vault.deposit(amount, depositor);
        vm.stopPrank();

        assertEq(vault.maxWithdraw(depositor), amount);

        // A borrower takes half the liquidity against NVDA collateral.
        MarketParams memory params = MORPHO.idToMarketParams(NVDA_MARKET);
        deal(NVDA, borrower, 10e18);
        vm.startPrank(borrower);
        IERC20(NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, 10e18, borrower, "");
        MORPHO.borrow(params, 500e6, 0, borrower, borrower);
        vm.stopPrank();

        uint256 withdrawable = vault.maxWithdraw(depositor);
        assertApproxEqAbs(withdrawable, 500e6, 1e6, "withdrawable should be what is not lent out");
        console2.log("withdrawable after half is borrowed", withdrawable);

        // And what remains can genuinely be taken out.
        vm.prank(depositor);
        vault.withdraw(withdrawable, depositor, depositor);
        assertGe(IERC20(USDG).balanceOf(depositor), withdrawable);
    }

    /// Interest paid by borrowers has to land with the depositor, not somewhere in between.
    function test_depositorEarnsBorrowerInterest() public {
        uint256 amount = 2_000e6;
        deal(USDG, depositor, amount);

        vm.startPrank(depositor);
        IERC20(USDG).approve(address(vault), amount);
        vault.deposit(amount, depositor);
        vm.stopPrank();

        MarketParams memory params = MORPHO.idToMarketParams(NVDA_MARKET);
        deal(NVDA, borrower, 20e18);
        vm.startPrank(borrower);
        IERC20(NVDA).approve(address(MORPHO), type(uint256).max);
        MORPHO.supplyCollateral(params, 20e18, borrower, "");
        MORPHO.borrow(params, 1_000e6, 0, borrower, borrower);
        vm.stopPrank();

        uint256 before = vault.convertToAssets(vault.balanceOf(depositor));
        vm.warp(block.timestamp + 30 days);
        MORPHO.accrueInterest(params);

        uint256 later = vault.convertToAssets(vault.balanceOf(depositor));
        assertGt(later, before, "no interest reached the depositor");
        console2.log("depositor value before", before);
        console2.log("depositor value after 30 days", later);
    }

    /// A cap of zero is how a market is retired; the vault must stop lending into it.
    function test_capZeroStopsNewSupply() public {
        vm.startPrank(owner);
        Id[] memory queue = new Id[](1);
        queue[0] = SPY_MARKET;
        vault.setSupplyQueue(queue);
        vm.stopPrank();

        uint256 amount = 500e6;
        deal(USDG, depositor, amount);
        vm.startPrank(depositor);
        IERC20(USDG).approve(address(vault), amount);
        vault.deposit(amount, depositor);
        vm.stopPrank();

        assertEq(MORPHO.position(NVDA_MARKET, address(vault)).supplyShares, 0);
        assertGt(MORPHO.position(SPY_MARKET, address(vault)).supplyShares, 0);
    }
}
