Vendored from https://github.com/morpho-org/metamorpho-v1.1 at commit
`89de5264c22e0e6e4e075a67046d120a7e7dbcff` (2026-08-26), together with its
`lib/morpho-blue` dependency.

**Not edited.** These sources are here because they are the code Morpho audited and that runs on
other chains; any change to them forfeits that. OpenZeppelin is not vendored a second time — the
`vault` profile in `foundry.toml` remaps their relative import to the checkout we already have.

Build with `FOUNDRY_PROFILE=vault`: they pin `pragma solidity 0.8.26` exactly, which cannot share a
compilation unit with the 0.8.28 the rest of the tree uses.
