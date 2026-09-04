# План реализации: кредитный слой для токенизированных акций (клон функционала Longbow)

Документ написан как инструкция для исполняющей модели. Он описывает весь функционал, как каждая часть должна работать и как её построить. Бренд, название, дизайн намеренно не заданы: везде используется рабочее имя `credit`. Целевая сеть в первой версии Robinhood Chain (chain id 4663), но архитектура переносима на любой EVM-чейн, где развёрнут Morpho Blue.

## Context

Референс: longbow.cash (55 рынков, TVL ~$722K, запущен июль 2026). Это не собственный лендинг, а **слой курации поверх Morpho Blue**: команда создаёт изолированные рынки, ставит оракулы, держит вольты ERC-4626, из которых USDG раздаётся по рынкам, и берёт performance fee 10%. Собственных денег в казне нет: ликвидность приносят вкладчики, а спрос и предложение балансирует кривая ставки по утилизации. Заёмщик может взять только то, что уже лежит в пуле; вкладчик может забрать только незанятое.

Ограничения владельца: бюджет $200 (газ и первый депозит), проект должен быть «продаваемым» и без права на ошибку. Отсюда главное архитектурное решение: **не писать свой лендинг**, а стоять на Morpho Blue (иммутабельный, 30+ аудитов), как делает Longbow. Свои контракты сводятся к тонкой периферии, которую можно проверить полностью.

Уже есть репозиторий `/Users/maksudnasibov/projects/solprojects/stockborrow` (протокол займа акций). Из него переиспользуются: `StockOracle` (цена 1e36, совместима с `IOracle` Morpho), `TickMath/MathLib`, `packages/config`, `packages/abi/gen.mjs`, каркас Ponder-индексера и keeper, `ForkBase` + моки, `scripts/e2e-anvil.sh`, `docs/chain-facts.md`. Проверенные факты чейна: USDG 6 знаков, фиды Chainlink по акциям молчат все выходные (~65 ч), настоящая фабрика Uniswap v3 `0x1f7d7550B1b028f7571E69A784071F0205FD2EfA`, пулы акция/USDG с cardinality ≥ 1500 есть для NVDA/TSLA/SPY/AAPL, Morpho Blue `0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010`, AdaptiveCurveIRM `0x2BD3d5965B26B51814AC95127B2b80dD6CcC0fa1`, ChainlinkOracleV2Factory `0xB7c16F6F8cF531447Bf27Ca7220f981E79C9cdF2`.

---

## 1. Полный инвентарь функционала (что есть у референса, как работает, как сделать)

### 1.1 Earn: вольты для вкладчиков
**Что:** пользователь кладёт USDG (или WETH) в один вольт и получает долю (ERC-4626 shares). Вольт раздаёт депозиты по списку разрешённых рынков Morpho с капами. Доход = проценты заёмщиков минус performance fee. Несколько вольтов с разным риском: Core (только Chainlink-оракулы, консервативно), Frontier (long-tail, TWAP-оракулы, выше ставка), ETH-вольт (займы WETH под акции), партнёрские вольты (один рынок, ликвидность вносит эмитент токена). Карточка показывает APY, TVL, «withdrawable now» (незанятая ликвидность).
**Как работает:** Morpho Vault V2 (или MetaMorpho V1.1, если V2 не развёрнут на чейне). Роли: owner (таймлок), curator (капы и список рынков), allocator (перекладывает ликвидность между рынками, реаллокация), guardian/sentinel (вето изменений). Supply queue и withdraw queue задают порядок раздачи и изъятия. Fee 10% от начисленных процентов идёт на `feeRecipient`.
**Как сделать:** развернуть вольты через фабрику Morpho (адрес взять из docs.morpho.org/addresses для chain 4663 и проверить `eth_getCode`). Один вольт на старте (Core USDG). Frontier и ETH добавлять после первых $50K TVL. Партнёрские вольты создавать по запросу проектов: отдельный вольт с одним рынком и капом, депозит вносит партнёр.

### 1.2 Borrow: изолированные рынки
**Что:** список рынков «залог / USDG»: доступно к займу, borrow APR, ликвидность, утилизация, Liq LTV, категория (Stocks / RWA / Crypto / Onchain-native). Страница рынка: цена, LLTV, оракул с ссылкой, supply cap, кривая ставки, графики, Info & risk, панели Supply/Borrow.
**Как работает:** Morpho Blue market = `(loanToken, collateralToken, oracle, irm, lltv)`, параметры иммутабельны. Тиры LLTV у референса: 86% (SGOV, T-bills), 77% (ETH), 62.5% (мегакапы и ETF с Chainlink), 38.5% (long-tail, TWAP, SpaceX, мем-токены). Ставка: AdaptiveCurveIRM (целевая утилизация 90%). Интерфейс держит «safe cap»: не даёт открыть позицию у самого края LLTV.
**Как сделать:** скрипт `CreateMarkets.s.sol`, который для каждого тикера из конфига (а) деплоит оракул, (б) вызывает `morpho.createMarket(params)`, (в) добавляет рынок в вольт с капом. Категории и метаданные хранятся в `packages/config`. В UI safe cap = LLTV − 5 п.п. для стоков и − 8 п.п. для long-tail.

### 1.3 Оракулы
**Что:** акции и ETF по Chainlink, long-tail по Uniswap v3 TWAP с длинным окном. Страница рынка показывает тип оракула и ссылку на контракт.
**Как работает:** `IOracle.price()` Morpho: цена залога в единицах займа, масштаб 1e36. Chainlink: через `ChainlinkOracleV2Factory` Morpho (composable feeds, учитывает decimals). TWAP: свой контракт, читающий `observe()` пула.
**Как сделать:** для Chainlink использовать фабрику Morpho (уже аудирована, ничего своего). Для TWAP переиспользовать `StockOracle` из stockborrow в режиме «только TWAP» плюс тонкая обёртка `MorphoOracleAdapter` с `price()`. Специфика Robinhood: фиды акций 24/5 держат последнюю цену все выходные, значит на стоках проверка свежести должна допускать 5 дней, а вся защита строится на низком LLTV и watchdog, не на staleness. Правило `max(feed, twap)` из stockborrow здесь **не подходит**: для займа под залог нужна консервативная цена залога, то есть `min(feed, twap)` или чистый feed с внешним watchdog. Выбор: чистый Chainlink для стоков (как у референса) плюс off-chain watchdog. Для HIMS и других тикеров без фида: TWAP 30–60 мин по пулу с cardinality ≥ 1000, предварительно вызвать `increaseObservationCardinalityNext`.

### 1.4 Ликвидации и pre-liquidations
**Что:** позиция с HF < 1 ликвидируется: ликвидатор гасит долг и забирает залог с бонусом (Morpho LIF по формуле от LLTV, ≈12.7% при 62.5%). Pre-liquidation: заёмщик может заранее разрешить частичную ликвидацию с меньшим штрафом до достижения LLTV.
**Как работает:** `morpho.liquidate(params, borrower, seizedAssets, repaidShares, data)` с колбэком. PreLiquidation через фабрику Morpho `PreLiquidationFactory`.
**Как сделать:** свой `FlashLiquidator`: flash loan USDG у Morpho (0% комиссии) → `liquidate` → продажа залога по маршруту v4 → v3 → Rialto (propAMM) → возврат займа → профит. Keeper-бот выбирает venue симуляцией. Pre-liquidation: развернуть инстансы через фабрику для стоковых рынков, в UI кнопка «включить защиту».

### 1.5 Multiply: плечо в одну транзакцию
**Что:** «открыть лонг ×2–3.9 на акции»: залог + flash loan USDG → своп в залог → supply → borrow → возврат flash loan. Перед подписью показывается HF и цена ликвидации. Deleverage в обратную сторону.
**Как работает:** Morpho Bundler3 с адаптерами (GeneralAdapter1 для supply/borrow, свой swap-адаптер с фиксированным адресом роутера). Slippage floor задаётся от цены оракула, чтобы смещённый пул ревертил.
**Как сделать:** если Bundler3 развёрнут на чейне, использовать его; иначе свой `LeverageRouter` (по образцу `ShortRouter` из stockborrow, но с flash loan Morpho). Максимальное плечо = 1 / (1 − LTV_safe).

### 1.6 Flash loans
**Что:** любой контракт берёт USDG без залога на одну транзакцию, комиссия 0.
**Как работает:** `morpho.flashLoan(token, assets, data)` и колбэк `onMorphoFlashLoan`. Это функция самого Morpho, свой код не нужен.
**Как сделать:** страница документации с примером контракта и SDK-хелпер.

### 1.7 Staking токена протокола
**Что:** стейк токена, награда в USDG стримится по секундам, без лока. Источники: доля процентов протокола и 5% комиссий с торговли токеном. Split дохода: 80% вкладчикам вольта (это performance fee не трогает), 15% казна, 5% стейкеры.
**Как работает:** классический Synthetix `StakingRewards` (reward token USDG, staking token = токен протокола), `notifyRewardAmount` раз в день из казны.
**Как сделать:** взять аудированный StakingRewards, добавить только владельца-таймлок. Пополнение раз в день keeper-скриптом из `feeRecipient`. Borrow rebates: часть процентов возвращается заёмщикам через Merkle-дистрибьютор по эпохам (контракт `MerkleDistributor`, корни считает индексер).

### 1.8 Портфолио
**Что:** депозиты в вольтах, открытые займы, HF, цена ликвидации, кредитный скор, ребейты к клейму, история.
**Как сделать:** чтение через `Lens` (multicall) и индексер. Все action-кнопки с предварительной симуляцией (`useSimulateContract`).

### 1.9 Stats
**Что:** TVL, доступно к займу, залог, число рынков, застейкано; книга вольтов, распределение по категориям, список всех рынков с supplied/borrowed/APR/LLTV/utilization. Обновление каждые 30 с.
**Как сделать:** снапшоты индексера раз в 5 минут плюс live-чтение через Lens.

### 1.10 Кредитный скор
**Что:** 0–1000 по поведению заёмщика: repayment consistency 35%, volume 20%, tenure 15%, diversity 10%, streak 10%, штраф −20% за каждую ликвидацию. Тиры 0–299 … 850–1000. Живой расчёт в API, периодический снапшот в on-chain реестр.
**Как сделать:** расчёт в индексере из событий Borrow/Repay/Liquidate; контракт `CreditRegistry` (mapping address→score, только keeper пишет); эндпоинты `/api/credit-score/{address}` и `/methodology`.

### 1.11 Builders: реферальная программа
**Что:** интегратор регистрируется подписью, получает код, передаёт `builderCode` в API/MCP; 50% performance fee с приведённого объёма, выплата раз в месяц в USDG, порог $100.
**Как сделать:** таблица builders в Postgres, атрибуция по коду в calldata/URL (deep link `?builder=CODE`, окно 30 дней), расчёт из индексера, ручная выплата.

### 1.12 MCP-сервер для агентов
**Что:** hosted MCP (Streamable HTTP): read-инструменты (list_markets, get_market, get_position, get_vault_stats, plan_multiply, estimate_rebate) и build-инструменты, возвращающие неподписанные транзакции (supply, borrow, repay, stake, claim, multiply, deleverage). Ключей не держит.
**Как сделать:** TypeScript MCP SDK, те же функции, что у REST API. Это фаза 3, но дёшево и сильно продаётся.

### 1.13 NFT-лендинг
**Что:** P2P займы под NFT в эскроу, без оракула, с дедлайном; и мгновенные займы из ликвидности протокола.
**Решение:** **не делать в v1**. Отдельный продукт, отдельный риск, отдельный аудит. Включить в roadmap.

### 1.14 Watchdog
**Что:** off-chain сервис, каждые 15 мин сверяет оракул каждого рынка со спотом DEX и свежестью; при расхождении ставит cap рынка в 0 и реаллоцирует ликвидность вольта из него. В выходные порог ужесточается.
**Как сделать:** часть keeper: роль allocator/curator вольта на горячем ключе с ограниченными правами (curator может только снижать капы без таймлока). Пороги: 5% для стоков в будни, 3% в выходные, 15% для TWAP-рынков.

---

## 1A. Отличия от Longbow и Morpho (обязательная часть продукта, не roadmap)

Паритетные функции (вольты, изолированные рынки, TWAP, flash loans, MCP, кредитный скор, builders) повторяются как база и отличием не считаются. Отличие строится на четырёх вещах, каждая проверяема он-чейн.

### 1A.1 Обе стороны акции: лонг и шорт в одном протоколе (главное)
**Что:** помимо рынков «акция как залог → займ USDG» протокол открывает зеркальные рынки «USDG как залог → займ акции». Держатель NVDA получает два дохода из одного депозита: проценты от заёмщиков USDG и borrow fee от шортистов. Трейдер получает лонг с плечом и шорт на одной площадке. Публичный борд short interest по каждому тикеру: занято в шорт, утилизация, borrow fee, days to cover, премия к NYSE.
**Как работает:** на Morpho Blue рынок с `loanToken = акция, collateralToken = USDG` разрешён (такие рынки уже созданы для NVDA/TSLA/AAPL/GOOGL/SPY и стоят пустыми). Долг номинирован в штуках акции. Оракул для такого рынка обратный: цена USDG в единицах акции, масштаб 1e36, то есть `1e36 * 1e36 / priceStockInUsdg`. Для шорт-рынков используется консервативное для кредитора правило `max(feed, TWAP)` (залог USDG, дорожающая акция опасна), для лонг-рынков `min`-логика (см. 1A.2).
**Как сделать:** переиспользовать готовое из `stockborrow`: `ShortRouter` (открыть шорт одной транзакцией: залог USDG, займ акции, продажа на v3), `FlashLiquidator`, `StockOracle` в режиме `max(feed, TWAP)`, борд и снапшоты индексера (`shortInterestBps`, `premiumBps`, `hardToBorrow`), алерты keeper. Портировать на Morpho: `InverseOracleAdapter` (1e36 обратная цена), рынки создаются тем же `CreateMarkets.s.sol` с флагом `side: "short"`. Отдельный вольт «Stock Lending» на каждую акцию (ERC-4626 с loan asset = акция), чтобы держателю не надо было выбирать рынок. Тесты: перенести `Stack.fork.t.sol` (round trip, weekend pump, corporate action guard) на Morpho-версию.

### 1A.2 Оракул, который видит выходные, и выше LTV на стоках
**Что:** Longbow держит замороженный Chainlink все выходные и страхуется LLTV 62.5% плюс off-chain watchdog. Мы ставим он-чейн оракул `min(feed, TWAP)` для лонг-рынков: как только акция падает на DEX в закрытые часы, залог дешевеет сразу. Токсичный арбитраж «купил дёшево на DEX, заложил по замороженной цене» невозможен по построению, а не по мониторингу. Это позволяет дать LLTV 70–72% на мегакапы и ETF против 62.5% у референса. Для заёмщика это главная сравниваемая цифра.
**Как работает:** `WeekendAwareOracle.price() = min(chainlinkPrice, twapPrice)` при валидных обоих источниках; если TWAP недоступен (нет пула или окно не заполнено), используется Chainlink; если Chainlink старше hardAge (5 дней) и есть TWAP, используется TWAP; оба недоступны: revert (Morpho тогда блокирует borrow и liquidate, supply/repay работают). Окно TWAP 30 мин, пул stock/USDG с cardinality ≥ 1000. Manipulation-cost: чтобы занизить TWAP на X% на 30 мин, атакующему нужно продать в пул объём, сопоставимый с глубиной, и держать цену, что дороже выгоды при LLTV ≤ 72%; расчёт публикуется на странице рынка.
**Как сделать:** контракт `WeekendAwareOracle` из `StockOracle` (замена `max` на `min`, остальное без изменений: feedScale, hardAge/softAge, multiplierGuard, sequencer slot). Тиры: мегакапы и ETF с Chainlink + TWAP → LLTV 70%; только Chainlink (нет пула) → 62.5%; только TWAP → 38.5%. Watchdog остаётся как второй контур: при расхождении > порога cap рынка в 0 и реаллокация вольта.

### 1A.3 Мягкая ликвидация по умолчанию
**Что:** у референса pre-liquidation на стоковых рынках «not available». Мы разворачиваем Morpho PreLiquidation на каждом стоковом рынке при листинге и даём заёмщику кнопку «защита позиции»: частичная разгрузка при LTV между preLltv и LLTV со штрафом 2–4% вместо LIF ≈12.7%. Keeper выполняет pre-liquidation сам, так что заёмщик не теряет всю позицию в гэп понедельника.
**Как сделать:** `PreLiquidationFactory` Morpho (проверить наличие на 4663, иначе развернуть по исходникам Morpho): параметры `preLltv = LLTV − 5 п.п., preLCF1/preLCF2 (close factor) 0.2→1.0, preLIF1/preLIF2 1.02→1.04`. Пользователь один раз вызывает `setAuthorization(preLiquidationInstance, true)`. Keeper: отдельный проход `preLiquidationPass` с приоритетом над обычной ликвидацией. UI: тумблер на странице позиции, показ «цена мягкой ликвидации» и «цена жёсткой ликвидации».

### 1A.4 Экономика для ранних
**Что:** performance fee 0% первые 90 дней (у референса 10%), ребейты заёмщикам с первого дня, партнёрские вольты под мем-пары акций (эмитент вносит ликвидность), поинты Season One с ретро-конверсией в токен.
**Как сделать:** fee вольта параметр, ставится 0 при деплое и поднимается таймлоком; `MerkleDistributor` ребейтов с первой эпохи; шаблон партнёрского вольта (один рынок, cap, депозит партнёра) в `SeedVault.s.sol`; поинты считает индексер по `supply`, `borrow`, `stock-lend`.

### Что это меняет в остальном плане
- Раздел 2: добавить `WeekendAwareOracle.sol`, `InverseOracleAdapter.sol`, `ShortRouter.sol` (порт на Morpho), таблицу рынков с полем `side` (long/short) и вольты Stock Lending.
- Раздел 3.3: строка «Мегакапы, ETF» получает LLTV 70% при наличии пула для TWAP; шорт-рынки: initial margin через LLTV Morpho 66.7% (эквивалент 150% покрытия), cap 30% он-чейн флоата акции.
- Раздел 4: страница рынка получает вкладки Long / Short, борд short interest как отдельная страница `/borrow-desk` или блок на `/stats`.
- Раздел 5: 1A.2 и 1A.3 входят в M1–M2, 1A.1 в M2–M3 (порт готового кода), 1A.4 в M5.

---

## 2. Архитектура

```
credit/
  contracts/        Foundry: периферия поверх Morpho
    src/oracles/TwapOracle.sol, MorphoOracleAdapter.sol
    src/periphery/LeverageRouter.sol, FlashLiquidator.sol, Lens.sol
    src/incentives/StakingRewards.sol, MerkleDistributor.sol, CreditRegistry.sol
    script/DeployCore.s.sol, CreateMarkets.s.sol, SeedVault.s.sol
    test/{unit,fork,invariant}
  packages/config   адреса чейна, Morpho, токенов, фидов, пулов, рынков (id, категория, тир, кап)
  packages/abi      генерация ABI (свои + Morpho Blue, Vault, Bundler3, PreLiquidation)
  packages/sdk      TS: чтение рынков/позиций, построение транзакций (supply/borrow/repay/multiply), расчёт HF, safe cap, план плеча; используется web, API и MCP
  apps/indexer      Ponder: рынки, позиции, события, ликвидации, снапшоты, вольты, скор, ребейты, атрибуция builders
  apps/keeper       ликвидатор (flash loan), watchdog, реаллокатор, ежедневный notifyRewardAmount, merkle-эпохи, снапшот скоров
  apps/api          Hono/Next route handlers: /api/markets, /api/vaults, /api/borrow-plan, /api/multiply-plan, /api/credit-score, /api/builders/*
  apps/mcp          MCP-сервер поверх packages/sdk
  apps/web          Next.js (дизайн задаётся отдельно)
  docs/             chain-facts, risk framework, runbook
```

Принципы: деньги пользователей живут только в Morpho Blue и Vault; свои контракты не кастодиальны (роутеры не держат баланс между транзакциями, ликвидатор работает с flash loan). Все свои контракты неапгрейдимые, параметры через `TimelockController` 24 ч + Safe, горячие роли только на снижение капов и паузу.

### 2.1 Контракты (что своё, что Morpho)

| Компонент | Источник | Примечание |
|---|---|---|
| Лендинг, рынки, ликвидации, flash loans | Morpho Blue (готово) | ничего не деплоить |
| IRM | AdaptiveCurveIRM (готово) | |
| Chainlink-оракулы | ChainlinkOracleV2Factory (готово) | `createMorphoChainlinkOracleV2(baseVault=0, 1, baseFeed1=stock/USD, baseFeed2=0, baseDecimals=18, quoteVault=0, 1, quoteFeed1=0, quoteFeed2=0, quoteDecimals=6, salt)` |
| TWAP-оракулы | свой `TwapOracle` | из `StockOracle`, режим только TWAP, окно 30–60 мин, `price()` 1e36 |
| Вольты | Morpho Vault V2 factory (проверить наличие; fallback MetaMorpho V1.1) | Core USDG первым |
| Плечо | Bundler3 + свой swap-адаптер, либо свой `LeverageRouter` | flash loan Morpho |
| Pre-liquidation | PreLiquidationFactory Morpho (проверить наличие) | |
| Ликвидатор | свой `FlashLiquidator` | flash loan → liquidate → своп v4/v3/Rialto |
| Lens | свой | HF, цена ликвидации, safe cap, план плеча |
| Staking | Synthetix StakingRewards (проверенный код) | |
| Rebates | `MerkleDistributor` (Uniswap-стиль) | |
| Credit registry | свой, 40 строк | |

Адреса фабрик Morpho на 4663: взять из docs.morpho.org/getting-started/resources/addresses и `api.morpho.org` GraphQL (`chains`), каждый подтвердить `eth_getCode`. Если Vault V2 или Bundler3 на чейне нет, в M0 принять решение: MetaMorpho V1.1 (деплой фабрики самим по исходникам Morpho) и свой `LeverageRouter`.

### 2.2 Данные и сервисы
- **Индексер (Ponder):** события Morpho Blue с фильтром по нашим market id (`CreateMarket, Supply, Withdraw, SupplyCollateral, WithdrawCollateral, Borrow, Repay, Liquidate, AccrueInterest, FlashLoan`), события вольтов (`Deposit, Withdraw, SetCap, ReallocateSupply, AccrueInterest`), StakingRewards, MerkleDistributor. Таблицы: `market, vault, vaultAllocation, position, txEvent, liquidation, snapshot(5 мин), feedTick, creditScore, rebateEpoch, builder, builderVolume`. Эндпоинты `/board`, `/positions/open`, `/graphql`, JSON с BigInt-строками.
- **Keeper:** цикл 2 с для ликвидаций (HF из Lens по открытым позициям), watchdog 15 мин, реаллокация вольта по правилу «утилизация рынка > 95% и есть idle → долить, cap 0 → вывести», ежедневно `notifyRewardAmount`, еженедельно merkle-эпоха ребейтов и снапшот скоров.
- **API:** тонкий слой над SDK и индексером; `borrow-plan` и `multiply-plan` возвращают calldata и предпросчёт HF.
- **RPC:** Alchemy `robinhood-mainnet` (публичный узел обрезан и без архива; форк-тесты на нём висят).

---

## 3. Экономика

### 3.1 Потоки денег
1. Заёмщик платит проценты по AdaptiveCurveIRM. Проценты начисляются вкладчикам рынка (вольт).
2. Вольт удерживает performance fee 10% от начисленных процентов → `feeRecipient` протокола.
3. Из fee: 80% условно «остаётся у вольта» (референс так формулирует: доля вкладчиков не тронута), 15% казна, 5% стейкерам. Практически: fee-shares вольта конвертируются keeper'ом в USDG раз в день; 75% → StakingRewards, 25% → казна. Плюс 5% комиссий с торговли токеном (creator fee лаунчпада) → StakingRewards.
4. Часть процентов возвращается заёмщикам ребейтом (например 10% от уплаченных процентов) через Merkle-эпохи: удерживает заёмщиков, стоит из казны.
5. Builders получают 50% performance fee с приведённого объёма.
6. Flash loans бесплатны: это не доход, а маркетинг и ликвидационная инфраструктура.

### 3.2 Старт без капитала
- Из $200: ~$40 на газ деплоя (≈12M газа по 0.9 gwei = 0.011 ETH на весь стек, плюс создание 10 рынков), $100–150 первый депозит в Core-вольт, остаток на keeper.
- Ликвидность покупается стимулами, не деньгами: токен через PONS (стандарт чейна), поинты Season One за supply/borrow с ретро-конверсией в токен, стейкинг с выплатой в USDG, рефералка builders, партнёрские вольты, где депозит вносит проект-партнёр (референс: MonkeyHood $25K).
- Первые заёмщики появляются только при наличии ликвидности; первые вкладчики только при доходности. Разрыв закрывают токен-стимулы на supply в первые 4–6 недель и Frontier-рынки с высокой ставкой (у референса 56% APR на одном рынке тянет средний APY).
- Капы стартовые: $500–2K на стоковый рынок, $5–10K на long-tail с сильным спросом; повышать только по измеренной глубине выхода (доля от объёма пула v3/v4, пересчёт ежедневно).

### 3.3 Риск-параметры (копия референса, подтверждённая централизованными площадками)

| Тир | LLTV | Оракул | Активы | Кап на старте |
|---|---|---|---|---|
| T-bills | 86% | Chainlink | SGOV | $2K |
| Crypto | 77% | Chainlink | ETH | $5K |
| Мегакапы, ETF | 62.5% | Chainlink | NVDA, AAPL, MSFT, SPY, QQQ, TSLA, GOOGL, AMZN, META | $1–2K |
| Long-tail, pre-IPO, мемы | 38.5% | TWAP или Chainlink | HIMS, SPCX, PONS, CASHCAT, INDEX | $500–5K |

Safe cap в UI: LLTV − 5 п.п. (стоки), − 8 п.п. (long-tail). Токсичный арбитраж невозможен, пока дисконт DEX к оракулу меньше (1 − LLTV). Плохой долг на стоках появляется только при гэпе понедельника > ~40%, ограничен капом рынка.

---

## 4. Функциональная спецификация фронтенда (для дизайн-модели)

Страницы: `/earn` (вольты, партнёрские вольты, легаси, список рынков с фильтрами по категории), `/borrow` (рынки, KPI, фильтры), `/borrow/[symbol]` (обзор, графики supplied/borrowed/utilization/rate curve/price, Info & risk, панели Supply via vault / Borrow / Multiply / Repay / Withdraw), `/stake` (стейк/анстейк/клейм, контракты, ребейты), `/portfolio` (депозиты, займы, HF, цена ликвидации, скор, ребейты, история), `/stats`, `/nft` (позже), `/docs` (обзор, withdrawals, risk, credit scores, FAQ, MCP, flash loans, builders), `/builders`.
Каждое действие: предпросчёт через Lens, показ HF и цены ликвидации до подписи, approve при необходимости, симуляция, отправка, тост со ссылкой на Blockscout. Данные: SDK + индексер, live-обновление 30 с.

---

## 5. Вехи

- **M0 (2–3 дня):** инвентарь адресов Morpho на 4663 (Blue, IRM, ChainlinkOracleV2Factory, Vault V2/MetaMorpho factory, Bundler3, PreLiquidationFactory, PublicAllocator) с проверкой кода; решение по вольтам и плечу; форк-скрипт, который создаёт один рынок NVDA/USDG через Morpho и делает supply/borrow/repay.
- **M1 (1 нед):** `TwapOracle`, `MorphoOracleAdapter`, `Lens`, `CreateMarkets.s.sol` на 10 рынков, Core-вольт с капами, unit + fork тесты (создание рынка, займ, ликвидация через `FlashLiquidator` с flash loan, TWAP-манипуляция ревертит своп плеча).
- **M2 (1 нед):** `LeverageRouter`/Bundler3-интеграция, PreLiquidation, `FlashLiquidator` с маршрутизацией v4/v3/Rialto, инварианты, gas.
- **M3 (1 нед):** индексер (рынки, вольты, позиции, снапшоты, скор, ребейты, builders), keeper (ликвидатор, watchdog, реаллокация, награды), API, SDK.
- **M4 (1 нед):** web по готовому дизайну, docs, portfolio.
- **M5 (1 нед):** канарейка на мейннете: 3 рынка (NVDA, SPY, ETH), капы $500, верификация Blockscout, keeper в бою, 7 дней; затем StakingRewards, MerkleDistributor, CreditRegistry, MCP, расширение до 20+ рынков.

## 6. Верификация
1. `forge test` unit/invariant зелёные; форк-тесты на Alchemy: создание рынка через Morpho, supply через вольт, borrow до safe cap, `liquidate` через `FlashLiquidator` после мок-шока оракула, multiply ×2 и deleverage, реверт свопа при смещённом пуле.
2. Anvil-форк e2e: деплой → вольт → рынок → keeper ликвидирует → индексер показывает ликвидацию и снапшот; watchdog при расхождении фида и спота ставит cap 0 и выводит ликвидность.
3. Мейннет-канарейка: контракты верифицированы, реальный цикл supply/borrow/repay/liquidate двумя кошельками, 7 дней без инцидентов до поднятия капов.

## 7. Что нужно от владельца до старта
Alchemy-ключ для Robinhood Chain; ключ деплоера с ~0.03 ETH на 4663; $150 USDG для первого депозита; Safe (2 из 3) для owner/timelock; решение по токену (лаунч через PONS до или после первых рынков).
