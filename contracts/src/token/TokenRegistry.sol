// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IERC20Meta {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
}

/// @title TokenRegistry
/// @notice Where the Cluby token's address is announced, once there is one.
///
/// @dev The site has to say "$CLUBY, at this address" the minute the token exists, and the obvious
/// ways to do that are all worse than this one. An environment variable needs a redeploy. A
/// database row needs a secret, an admin password and a server that can be talked into writing the
/// wrong address. Both make the most impersonatable string on the site — a contract address people
/// will paste into a wallet and send money to — a thing that changes when someone with a login says
/// it does.
///
/// Here it changes when the OWNER sends a transaction, and never otherwise. The site reads this
/// contract, so the address it displays is the address the protocol's owner published, provable by
/// anyone from the chain, and it appears the moment the transaction lands with no deploy at all.
///
/// The ticker is deliberately NOT stored. It is read from the token's own `symbol()`, so the label
/// and the thing cannot disagree — a registry that lets you write "CLUBY" next to somebody else's
/// contract is the exact phishing surface this is meant to avoid.
contract TokenRegistry is Ownable2Step {
    /// @notice The token, or the zero address before launch.
    address public token;
    /// @notice A venue the price can be read from — a Uniswap pool. Optional; zero means none yet.
    address public pool;
    /// @notice When `token` was last set, so a reader can see how new the announcement is.
    uint64 public listedAt;

    event TokenSet(address indexed token, address indexed pool, uint64 at);

    /// @dev The Lens shipped pointing at an address with no code and reverted on every read for
    /// days. The failure here would be quieter and worse: an address with no code published as the
    /// token is an address someone sends money to. It costs one opcode to make impossible.
    error NotAContract(address given);

    constructor(address _owner) Ownable(_owner) {}

    /// @param _token The token contract. Must have code.
    /// @param _pool Optional venue for a price; may be zero, must have code if it is not.
    function setToken(address _token, address _pool) external onlyOwner {
        if (_token.code.length == 0) revert NotAContract(_token);
        if (_pool != address(0) && _pool.code.length == 0) revert NotAContract(_pool);
        token = _token;
        pool = _pool;
        listedAt = uint64(block.timestamp);
        emit TokenSet(_token, _pool, uint64(block.timestamp));
    }

    /// @notice Withdraw the announcement. Used if a launch is aborted or an address was wrong.
    function clear() external onlyOwner {
        token = address(0);
        pool = address(0);
        listedAt = 0;
        emit TokenSet(address(0), address(0), 0);
    }

    /// @notice Everything the site needs in one call, and nothing it has to trust us for.
    /// @dev Each field is read behind a try/catch: a token that does not implement `symbol()` is
    /// unusual, not a reason for the page to fail to render. An empty symbol is visibly wrong,
    /// which is the right way for it to be wrong.
    function listing()
        external
        view
        returns (address _token, address _pool, uint64 _listedAt, string memory symbol, uint8 decimals, uint256 totalSupply)
    {
        _token = token;
        _pool = pool;
        _listedAt = listedAt;
        if (_token == address(0)) return (_token, _pool, _listedAt, "", 0, 0);
        try IERC20Meta(_token).symbol() returns (string memory s) { symbol = s; } catch {}
        try IERC20Meta(_token).decimals() returns (uint8 d) { decimals = d; } catch {}
        try IERC20Meta(_token).totalSupply() returns (uint256 t) { totalSupply = t; } catch {}
    }
}
