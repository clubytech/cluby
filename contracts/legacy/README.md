# legacy/

The stockborrow versions of `Lens` and `FlashLiquidator`, kept for reference only — **not compiled**.

They are written against the bespoke `Market` contract that stockborrow deployed, which Cluby does
not use: the lending primitive here is Morpho Blue, so both contracts have to be rewritten against
`IMorpho` (`market(id)`, `position(id, user)`, `liquidate`, `flashLoan`) rather than ported. The
useful parts to carry over are the shapes, not the code:

- `Lens.MarketView` / `UserView` — the fields the site and keeper actually consume.
- `FlashLiquidator` — the flash-loan → liquidate → swap → repay sequence, and the swap-route
  selection through SwapRouter02.

The tests under `legacy/test` cover the old contract and are equally out of scope; the fork tests in
particular encode useful scenarios (weekend pump liquidation, corporate-action guard) worth
rebuilding on the Morpho versions.
