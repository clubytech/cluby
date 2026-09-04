// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMorpho, IOracle, Id, MarketParams, Market, Position, MarketParamsLib} from "../../src/interfaces/IMorpho.sol";
import {ISwapRouter02} from "../../src/interfaces/IExternal.sol";

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function burn(address from, uint256 amount) external {
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockOracle is IOracle {
    uint256 public price;

    constructor(uint256 _price) {
        price = _price;
    }

    function set(uint256 _price) external {
        price = _price;
    }
}

/// @dev A pool that returns whatever tick cumulative pair the test wants.
contract MockV3Pool {
    address public immutable token0;
    address public immutable token1;
    int56 public cumulativeStart;
    int56 public cumulativeEnd;

    constructor(address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
    }

    /// @param tick The arithmetic mean tick the pool should report over `window` seconds.
    function setMeanTick(int24 tick, uint32 window) external {
        cumulativeStart = 0;
        cumulativeEnd = int56(tick) * int56(uint56(window));
    }

    function observe(uint32[] calldata) external view returns (int56[] memory, uint160[] memory) {
        int56[] memory cumulatives = new int56[](2);
        cumulatives[0] = cumulativeStart;
        cumulatives[1] = cumulativeEnd;
        return (cumulatives, new uint160[](2));
    }
}

contract MockIrm {
    uint256 public rate;

    constructor(uint256 _rate) {
        rate = _rate;
    }

    function set(uint256 _rate) external {
        rate = _rate;
    }

    function borrowRate(MarketParams memory, Market memory) external view returns (uint256) {
        return rate;
    }

    function borrowRateView(MarketParams memory, Market memory) external view returns (uint256) {
        return rate;
    }
}

/// @dev Enough of Morpho for the periphery: market and position storage, a liquidation that moves
/// the right tokens, and a zero-fee flash loan that insists on being repaid.
contract MockMorpho {
    using MarketParamsLib for MarketParams;

    mapping(bytes32 => Market) internal markets;
    mapping(bytes32 => mapping(address => Position)) internal positions;
    mapping(bytes32 => MarketParams) internal paramsOf;

    function createMarket(MarketParams memory p) external {
        bytes32 id = Id.unwrap(p.id());
        paramsOf[id] = p;
        markets[id].lastUpdate = uint128(block.timestamp);
    }

    function setMarket(MarketParams memory p, Market memory m) external {
        bytes32 id = Id.unwrap(p.id());
        paramsOf[id] = p;
        markets[id] = m;
    }

    function setPosition(MarketParams memory p, address user, Position memory pos) external {
        positions[Id.unwrap(p.id())][user] = pos;
    }

    function market(Id id) external view returns (Market memory) {
        return markets[Id.unwrap(id)];
    }

    function position(Id id, address user) external view returns (Position memory) {
        return positions[Id.unwrap(id)][user];
    }

    function idToMarketParams(Id id) external view returns (MarketParams memory) {
        return paramsOf[Id.unwrap(id)];
    }

    /// @dev Loan-token units repaid per whole unit of collateral seized. Denominating this in the
    /// LOAN token matters: the two sides of a real market differ by twelve decimals, and a mock
    /// that repays in collateral units passes tests a real liquidation would fail.
    uint256 public repayPerCollateral = 50e6;

    function setRepayPerCollateral(uint256 rate) external {
        repayPerCollateral = rate;
    }

    function liquidate(MarketParams memory p, address borrower, uint256 seizedAssets, uint256, bytes memory)
        external
        returns (uint256, uint256)
    {
        bytes32 id = Id.unwrap(p.id());
        Position storage pos = positions[id][borrower];
        uint256 repaid = (seizedAssets * repayPerCollateral) / 1e18;
        pos.collateral -= uint128(seizedAssets);
        IERC20(p.loanToken).transferFrom(msg.sender, address(this), repaid);
        IERC20(p.collateralToken).transfer(msg.sender, seizedAssets);
        return (seizedAssets, repaid);
    }

    function flashLoan(address token, uint256 assets, bytes calldata data) external {
        IERC20(token).transfer(msg.sender, assets);
        IMorphoFlashLoanCallbackMock(msg.sender).onMorphoFlashLoan(assets, data);
        IERC20(token).transferFrom(msg.sender, address(this), assets);
    }
}

interface IMorphoFlashLoanCallbackMock {
    function onMorphoFlashLoan(uint256 assets, bytes calldata data) external;
}

/// @dev Swaps at a fixed rate the test sets, and honours amountOutMinimum.
contract MockRouter {
    uint256 public rateWad; // loan tokens out per collateral token in, WAD

    error TooLittleReceived();

    constructor(uint256 _rateWad) {
        rateWad = _rateWad;
    }

    function set(uint256 _rateWad) external {
        rateWad = _rateWad;
    }

    function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata p) external returns (uint256) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        uint256 out = (p.amountIn * rateWad) / 1e18;
        if (out < p.amountOutMinimum) revert TooLittleReceived();
        IERC20(p.tokenOut).transfer(p.recipient, out);
        return out;
    }

    function exactOutputSingle(ISwapRouter02.ExactOutputSingleParams calldata) external pure returns (uint256) {
        return 0;
    }
}
