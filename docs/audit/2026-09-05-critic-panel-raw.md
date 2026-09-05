# Critic panel — raw agent reports
One section per agent, in the order the workflow journal recorded them: six role reviews
first, then the adversarial verifiers. The synthesis in the sibling file is the deduped,
ranked version — read that first and come here for the proof behind a specific finding.

---

## Agent 1 (`a51b249f0f4a4ac09`)

## Находки — по цене ошибки

### 1. Кипер умирает НАВСЕГДА после 5 падений за 5 минут, и никто об этом не узнаёт
**Доказательство** — журнал на 178.236.248.22, ночь 5 сентября:
```
00:25:30 Main process exited, code=exited, status=2/INVALIDARGUMENT
00:25:40 restart counter is at 1 … 00:26:11 restart counter is at 5
00:26:21 cluby-keeper.service: Start request repeated too quickly.
00:29:14 (сервис лежал 3 минуты — до РУЧНОГО restart человеком за клавиатурой)
```
Юнит `/etc/systemd/system/cluby-keeper.service`: `Restart=always`, `RestartSec=10`, `StartLimitBurst=5`, `StartLimitIntervalSec=300`. 50 секунд бага на старте (плохой env, плохой чексум адреса, недоступный RPC при загрузке) — и ликвидатор в `failed` до `systemctl reset-failed` руками. Нет `OnFailure=`, нет heartbeat, нет ни одного алерта о том, что процесс не жив.
**Цена**: ликвидатор офлайн часами при движении рынка → безнадёжный долг на депозиторах хранилища.
**Фикс одной фразой**: `StartLimitIntervalSec=0` + `OnFailure=cluby-alert@%n.service`, и heartbeat в Telegram раз в 10 минут.

### 2. Провал ликвидации не порождает НИ ОДНОГО алерта
`apps/keeper/src/liquidate.ts:130` (симуляция реверта) — только `log`. `apps/keeper/src/index.ts:38-41` (`safely`, ловит и отправку транзакции) — только `log`. `apps/keeper/src/liquidate.ts:166`:
```ts
if (c.healthFactor >= WARN_HF || c.healthFactor < WAD) return;
```
— как только HF проваливается ниже 1.0, предупреждение «позиция близко» ЗАМОЛКАЕТ, а `tryLiquidate` алертит только при **успехе**. Позиция под водой, которую нельзя ликвидировать (пул пуст, оракул разошёлся, своп не берёт пол), не производит ни одного сообщения — только строчку в журнале раз в 2 секунды.
**Доказательство**: 00:29:14–00:29:18 кипер валился на `liquidation failed: Address "0x5fC2Cd44…" is invalid` (кривой чексум LENS в env) — восемь минут полной слепоты, ноль строк `ALERT`. За сутки: 5 перезапусков, 5 ALERT — все пять от watchdog'а, ни одного от ликвидатора.
**Цена**: безнадёжный долг растёт молча.
**Фикс**: `alert()` на любой провал `tryLiquidate` и на HF<1, продержавшийся N проходов.

### 3. Ревертов не видно: `.split("\n")[0]` выбрасывает имя кастомной ошибки
`apps/keeper/src/liquidate.ts:130` берёт первую строку сообщения viem. **Доказательство — настоящий `eth_call` к задеплоенному 0x91B3c5b8…**:
```
### ЧТО ЛОГИРУЕТ КИПЕР:
  > The contract function "liquidate" reverted.
### ЧТО СКАЗАЛА ЦЕПОЧКА:
  | The contract function "liquidate" reverted.
  | Error: NotKeeper()
```
Все аккуратно спроектированные ошибки контрактов — `NotKeeper()`, `NoProfit(received, owed)`, `NotMorpho()`, `SwapShortfall` — уничтожаются ровно в той точке, где они единственно и нужны. В три часа ночи оператор видит «reverted» и должен лезть в исходники.
**Фикс**: логировать `e.shortMessage` **плюс** `e.cause?.data?.errorName` с аргументами (или всё `e.message`).

### 4. FlashLiquidator:116 сравнивает выход свопа с размером флеш-займа, а не с тем, что реально вытянула Morpho
```solidity
if (received < assets) revert NoProfit(received, assets);   // assets = flashAmount
```
На момент проверки контракт держит `flashAmount − repaid + received`, а должен `flashAmount`. Условие платёжеспособности — `received >= repaid`, а не `received >= flashAmount`.
**Доказательство**: `test_proof_noProfitRejectsASolventProfitableLiquidation` в `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/Operability.proof.t.sol` — тест утверждает дефект и проходит: при `flashAmount=700`, `repaid=500`, `received=600` контракт держит **800**, должен **700**, и всё равно ревертит `NoProfit(600, 700)`. Та же ликвидация с `flashAmount=505` проходит и платит владельцу 100 USDG — изменился только размер займа.
**Честная оценка цены**: сегодня не срабатывает, потому что `liquidate.ts:102` отсекает случаи `minAmountOut <= flashAmount`. Это заряженный капкан: первый же оператор, который расширит `flashAmount` после реверта «for want of balance» (ровно то, что советует сделать комментарий в `LiquidateParams.flashAmount`), начнёт терять прибыльные ликвидации — с сообщением, обвиняющим пул. В `LeverageRouter:157` та же форма **корректна**, потому что там `assets` и есть точная сумма погашения; из-за этого ошибку особенно легко не заметить при чтении.
**Фикс**: `if (loanToken.balanceOf(address(this)) < assets) revert NoProfit(...)`.

### 5. Один мёртвый оракул ослепляет кипера на всех 17 рынках сразу
`Lens.sol:141-158` — `marketViews` и `healthFactors` идут циклом без защиты на элемент. `liquidate.ts:44-58` — цикл `for (const [id, users] of watch)` без `try/catch`, `Promise.all` по пользователям. `index.ts:64` `safely` ловит на самом верху и просто логирует.
**Доказательство**: `test_proof_oneDeadOracleBlindsTheWholeLensBatch` (тот же файл) — батч из двух рынков, один здоровый, ревертит целиком.
**Цена**: у вас в конфиге уже есть такой рынок — `packages/config/src/index.ts:150`: «INDEX … the only pool has observationCardinality 1 — no TWAP is possible». Один длиннохвостый рынок с пустым пулом снимает наблюдение с SGOV, ETH и всех девяти акций.
**Фикс**: `try/catch` вокруг каждого рынка в `scanHealth` + отдельный алерт «рынок нечитаем».

### 6. У LeverageRouter нет ни владельца, ни паузы, ни спасательного вывода
Проверено на мейннете: `owner()` на `0xBF6cdE3F772cB3939dFCc313AA4E83C3452bab6B` ревертит. `grep -E "onlyOwner|Ownable|pause|sweep|rescue"` по `LeverageRouter.sol` — пусто. Единственный рычаг — каждый пользователь сам вызывает `morpho.setAuthorization(router, false)`.
Что это значит в аварии: SwapRouter02 сменил адрес (он `immutable`) — остановить нечем, только редеплой и просьба всем переавторизоваться; найден баг — остановить нечем. Плюс `_sweep(..., p.onBehalf, ...)` (строки 131-132, 162-163) отдаёт **любой** случайно залетевший баланс следующему постороннему вызывающему.
**Фикс**: `Ownable2Step` + `bool paused` в `open`/`close` + `sweep(token)`.

### 7. Watchdog структурно не видит того сценария, ради которого написан MinOracle
`watchdog.ts:35-70` сравнивает `oracle.price()` с TWAP **того же пула**. Если фид Chainlink замёрз на пятничной цене и пул на выходных тоже стоит — расхождение 0 bps, «всё хорошо». Никто нигде не читает `latestRoundData().updatedAt`: `readFeed`/`ageSeconds` существуют (`packages/sdk/src/reads.ts:79-103`), но кипер их не импортирует — `grep -rn "readFeed\|ageSeconds" apps/keeper/src/` возвращает пусто.
**Цена**: ровно тот weekend-gap, который описан в комментарии `MinOracle.sol:17-22`, проходит незамеченным; в понедельник позиция мгновенно глубоко под водой, а стимул 12.68% меньше гэпа.
**Фикс**: алертить на возраст фида и на возраст последней observation пула, а не только на их расхождение.

### 8. Газ ни кипера, ни аварийного ключа никто не смотрит
**Доказательство** — журнал 00:29:23 и 00:30:44: `scores failed: The total cost … exceeds the balance of the account`, дважды, ноль Telegram-алертов (`scorePass` идёт через `safely` → только `log`). Тот же ключ подписывает и ликвидации. Пополнили руками где-то между 00:30 и 00:38.
Сейчас: keeper signer `0xc2478f68…` — 0.00998 ETH; safe owner EOA `0x9c5c4b4a…` — 0.01115 ETH при gasPrice 0.42 gwei. Порядка 40 ликвидаций запаса, и ни одного порога.
`grep "getBalance" apps/keeper/src/` — пусто.
**Фикс**: `getBalance` в `watchdogPass` с алертом ниже порога.

### 9. У хранилища нет guardian и нет curator — таймлок 24 часа декоративный
Проверено на мейннете (`0x97e81382…`): `guardian() == 0x0`, `curator() == 0x0`, `timelock() == 86400`, `owner() == Safe`, Safe `getThreshold() == 1`, `getOwners() == [0x9c5c4b4a…]`.
Watchdog в своём же алерте пишет «Set this market's cap to 0 in the vault» — понижение капа применяется мгновенно (`MetaMorphoV1_1.sol:310-311`), так что рычаг рабочий, но нажать его может только тот единственный ключ. Это частично покрыто вашим объявленным «Safe is 1-of-1, owner knows». Что **не** покрыто: `onlyGuardianRole` = owner **или** guardian (`MetaMorphoV1_1.sol:173-177`), поэтому при guardian==0 отозвать `submitTimelock`/`submitCap` внутри окна 24 часов способен ровно тот же ключ, который бы их и подал. Таймлок защищает от чужого, только если есть второй ключ с правом вето.
**Фикс**: `submitGuardian(<второй, холодный ключ>)` — стоит ноль и не требует менять порог Safe.

### 10. TwapOracle не проверяет в конструкторе, что пул умеет отдать окно
`TwapOracle.sol:36-54` проверяет `_window >= 300` и принадлежность токенов пулу. Ни одного вызова `observe`. Оракул можно задеплоить против пула с `observationCardinality = 1` — и он будет ревертить вечно, а рынок Morpho неизменяем: `borrow`, `withdrawCollateral` и `liquidate` на нём мертвы окончательно, единственный доступный ход — кап в 0, что уже открытым позициям не помогает. Такой пул у вас в конфиге есть (INDEX).
**Фикс**: вызвать `_meanTick()` в конструкторе.

---

## Опровергнутые гипотезы

- **«Lens разойдётся с транзакцией по здоровью»** — нет. `Lens.sol:89-104` повторяет Morpho `_isHealthy` знак в знак: `mulDivDown` цены, `wMulDown` LLTV, `toAssetsUp` долга, граница `HF == 1e18` = здоров. Плюс `_accrued` (161-180) правильно воспроизводит начисление, включая комиссионные доли против supply без самой комиссии. Симуляция кипера согласуется с тем, что сделает транзакция.
- **«redact() течёт RPC-ключом в Telegram»** — нет. Регексп `env.ts:75` покрывает форму `/v2/<key>`, а `ROBINHOOD_RPC_URL` именно такой формы (Alchemy). **Но** `env.ts:76` — мёртвая строка: `.replace(/0x[a-fA-F0-9]{64}/g, (m) => (m === m.toLowerCase() ? m : m))` заменяет строку на саму себя в обеих ветках. Утечки сегодня нет, защитной сетки для 32-байтных секретов — тоже нет.
- **«Флеш-колбэк можно перехватить»** — нет. Morpho зовёт `onMorphoFlashLoan` у `msg.sender` самого `flashLoan`, чужой вызов туда не попадёт; проверки `msg.sender != morpho` достаточно в обоих контрактах.
- **«Контракты держат баланс между транзакциями»** — нет, утверждение из шапки верное: все пути в обоих периферийных контрактах заканчиваются нулевым остатком.
- **«Застрявший native ETH некому вытащить»** — не проблема: ни `receive`, ни `fallback`, ни `payable` в periphery нет, ETH туда попасть не может.
- **«Кипер не зарегистрирован / потерял права»** — нет. `keepers(0xc2478f68…) == true`, `CreditRegistry.updaters(signer) == true`, `owner()` у FlashLiquidator и CreditRegistry = Safe, `pendingOwner() == 0` у обоих. Передача прав доведена до конца.

---

## Общая оценка блока

Контракты написаны человеком, который думал про аварию: `Ownable2Step` вместо одношагового, `sweep()` «на случай, если сюда что-то прилетит», `NoProfit(received, owed)` с аргументами, `MinOracle.prices()` специально для сторожа, комментарий про выходные у фида. Инварианты держатся — ничего не лежит между транзакциями, LTV не двигается офчейн-числом, ликвидация не эксклюзивна.

Ломается всё на стыке. Контракты умеют объяснить, что пошло не так, а кипер это объяснение выбрасывает (`.split("\n")[0]`). Watchdog умеет кричать про расхождение и кричит, а ликвидатор не умеет кричать вообще. Рычаг «поставить кап в 0» существует и работает мгновенно, но в руках у одного ключа, у которого 0.011 ETH и никакого мониторинга. И сам процесс, который всё это делает, systemd имеет право похоронить через 50 секунд без единого уведомления.

Порядок работ, если брать по одному: **1 → 2 → 3** (это те три, из-за которых поломка становится тихой), потом **8, 5**, потом **6, 7**, потом остальное. Пункты 4 и 10 — латентные, чинить дешевле сейчас, чем объяснять потом.

Тесты: `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/Operability.proof.t.sol` — два теста, оба утверждают наличие дефекта и проходят. Весь набор после добавления: 52 passed, 0 failed, 3 skipped. Production-код не тронут.

---

## Agent 2 (`adc070f49148e1cb6`)

## АРХИТЕКТУРА — отчёт

Все доказательства в одном новом файле, только тесты: `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/ArchProofs.t.sol` (8 тестов, зелёные, `forge test --match-path 'test/unit/ArchProofs.t.sol'`). **Внимание к семантике:** мои `proof_*` утверждают ДЕФЕКТНОЕ поведение — passing здесь значит «гипотеза подтвердилась». Единственный тест, написанный наоборот (`testFuzz_lensLiquidatableMatchesMorphoIsHealthy`), — опровержение.

---

### 1. Пыль залога на SHORT-рынке роняет Lens панікой → кипер слепнет по ВСЕМУ протоколу. Цена: 1e-6 USDG

`Lens.sol:104` — `u.borrowAssets.mulDivUp(ORACLE_PRICE_SCALE, uint256(p.collateral).wMulDown(params.lltv))`. Знаменатель `collateral*lltv/1e18` обнуляется при малом `collateral`. Периферия молча предполагает, что залог всегда 18-десятичный (верно для 15 рынков из 17). У `NVDA-SHORT`/`TSLA-SHORT` залог — USDG, 6 десятичных: `collateral = 1` (одна микро-USDG) — совершенно нормальная позиция, у неё есть реальная заёмная способность (`1 * 5.5e45 / 1e36 = 5.5e9` raw NVDA), Morpho её принимает. `mulDivUp` считает `d - 1` при `d == 0` → panic 0x11.

Радиус поражения (проверен по коду, не по ощущению):
- `apps/keeper/src/liquidate.ts:47-55` — `userView` внутри `Promise.all` без per-user catch;
- `scanHealth` вызывается один раз на ВСЕ рынки из `liquidationPass` (`index.ts:19`);
- `safely()` (`index.ts:36`) ловит и просто логирует — **ни одного алерта**;
- `borrowers.ts:17` — «Nobody is removed», и множество персистится в `.keeser-state.json`, то есть отравление переживает рестарт.

Итог: одна позиция за микро-USDG навсегда выключает ликвидации на всех 17 рынках, тихо, каждые 2 секунды. `Lens.healthFactors` падает целым батчем — тем же механизмом.

Доказательство: `test_proof_dustCollateralOnShortMarketBricksTheKeepersRead`.
**Фикс одной фразой:** при `collateral.wMulDown(lltv) == 0` возвращать `liquidationPrice = type(uint256).max` вместо деления (та же ветка, что уже есть для `collateral == 0`).

---

### 2. Кипер НИКОГДА не ликвидирует ETH (77%) и SGOV (86%). Цена: весь безнадёжный долг на двух рынках с самым тонким буфером

`liquidate.ts:100`: `if (minAmountOut <= flashAmount) { log("nothing to gain"); return; }`. Подставляем формулы оттуда же (строки 96-98): `flashAmount = 1.01·V/LIF`, `minAmountOut = 0.92·V`. Условие пропуска ⟺ `LIF ≤ 1.01/0.92 = 1.0978`.

```
SGOV  lltv 86.0%  LIF 1.043841  -> skipped
ETH   lltv 77.0%  LIF 1.074114  -> skipped
stock lltv 62.5%  LIF 1.126761  -> ok
tail  lltv 38.5%  LIF 1.150000  -> ok
```

Восьмипроцентный допуск проскальзывания шире, чем бонус ликвидатора на высоких LLTV. Это экономическая правда, но реакция кода — молчаливый `return` до симуляции: даже watch-only-алерт «would liquidate» не срабатывает. ETH — рынок с самым большим капом ($5000), SGOV — 86% LLTV. Оба без ликвидатора.

Доказательство: `test_proof_keeperSkipsEveryLiquidationOnHighLltvMarkets` (репликация формул кипера построчно).
**Фикс одной фразой:** сделать допуск проскальзывания функцией LLTV (`minAmountOut = V·(1 − LIF_margin)`), а не константой 0.92, и алертить вместо тихого return.

---

### 3. `FlashLiquidator` привязывает прибыльность к РАЗМЕРУ флеш-займа

`FlashLiquidator.sol:120` — `if (received < assets) revert NoProfit(...)`. Условие солвентности здесь `balance ≥ assets`, где `balance = assets − repaid + received`, то есть `received ≥ repaid`. `assets` (размер флеш-займа) — чистая деталь фондирования, а не экономика. Ликвидация с 500 USDG реальной прибыли ревертится только потому, что кипер занял 1500 вместо 505.

Тонкость границ модулей: **то же самое выражение в `LeverageRouter._close:152` корректно** — там `morpho.repay` уже вытянул `assets`, и баланс действительно равен `received`. Один и тот же инвариант списан в два места, верен в одном. Это ровно тот класс связи, который делает следующее изменение опасным: правка одного файла «по образцу другого» ломает.

Доказательство: `test_proof_oversizedFlashLoanRevertsAProfitableLiquidation`.
**Фикс одной фразой:** проверять `loanToken.balanceOf(address(this)) < assets`, а не `received < assets`.

---

### 4. `Lens` отдаёт `Market`, в котором Morpho не может находиться никогда

`Lens.sol:161-180` (`_accrued`) начисляет проценты, но не двигает `lastUpdate`. Возвращённая структура утверждает, что начисление произошло в момент, в который оно не происходило. Дальше `marketView:60` скармливает эту же структуру обратно в `IIrm.borrowRateView`, а `AdaptiveCurveIrm` берёт `elapsed = block.timestamp − market.lastUpdate` — окно засчитывается второй раз. Публикуемая APY — среднее за прошедшее окно, а не ставка, которую Morpho назовёт после `accrueInterest`.

Доказательство: `test_proof_lensMarketStateIsInternallyInconsistent` (IRM, чувствительный к elapsed, как настоящий; Lens отдаёт `1e9 + 3 days` там, где истина `1e9`).
**Фикс одной фразой:** `m.lastUpdate = uint128(block.timestamp)` в конце `_accrued`.

Смежное: `Lens.sol:172-173` использует непроверяемые `uint128(interest)` там, где Morpho использует `.toUint128()` с ревертом. При текущем TVL недостижимо, но это молчаливое усечение вместо реверта.

---

### 5. `previewBorrow` возвращает структуру с протухшими полями

`Lens.sol:107-133` перезаписывает шесть полей `UserView` из девяти. `safeBorrowAssets` — то самое число, ради которого экран депозита существует, — остаётся описывать залог, которого пользователь ещё не внёс (для нового пользователя это ноль). `supplyAssets` — тоже. Плоская структура из голых `uint256` не может выразить «частично валидна».

Доказательство: `test_proof_previewBorrowLeavesSafeBorrowDescribingTheOldPosition`.
**Фикс одной фразой:** принимать `safeMarginWad` в `previewBorrow` и пересчитывать `safeBorrowAssets`, либо вернуть отдельный `PreviewView` без полей, которые превью не определяет.

---

### 6. Математика долга уже разошлась между Lens и SDK

`packages/sdk/src/reads.ts:72` — `debtOf` использует `toAssetsDown` под комментарием «rounded the way Morpho rounds it against the borrower». Morpho `_isHealthy` и `Lens.sol:88` используют `toAssetsUp`. Комментарий утверждает ровно обратное тому, что делает код. Потребители — `apps/web/src/lib/portfolio.ts:63` и `apps/mcp/src/markets.ts:125`: портфель и MCP показывают долг меньше, чем возьмёт Morpho.

Доказательство: `test_proof_sdkDebtOfUndercountsRelativeToLens`.
**Фикс одной фразой:** `toAssetsUp` в `debtOf`.

Рядом, из той же дубли: `packages/sdk/src/math.ts:50-54` `liquidationPriceWad` возвращает число на шкале 1e36, а не WAD; и его округление отличается от `Lens.sol:104` вложенностью (Lens сначала округляет знаменатель вниз). Направление у Lens консервативное, расхождение на 1 wei — но это две реализации одной формулы, и одна уже врёт именем.

---

### 7. `LeverageRouter.close()` конструктивно не может закрыть позицию

`CloseParams.repayAmount` (`LeverageRouter.sol:55`) — только assets. Morpho `repay` при `assets > 0` считает `shares = assets.toSharesDown(...)` — вниз, — значит остаток долей остаётся всегда; а `repayAmount`, посчитанный по котировке, к моменту включения меньше выросшего долга. Докстринг говорит «Pass the full debt in assets to close the position outright» — этого сделать нельзя. При этом веб-путь в том же продукте (`apps/web/src/components/position-panel.tsx`, `repayAll`) закрывает **по долям**, с комментарием, объясняющим ровно эту причину. Два пути закрытия в одном продукте не согласны насчёт известного инварианта Morpho.

**Фикс одной фразой:** добавить `repayShares` в `CloseParams` и передавать `exactlyOneZero(repayAmount, repayShares)` в `morpho.repay`, как это делает сам Morpho.

---

### 8-9. Латентное: две связи, которые сделают следующее изменение опасным

**`TwapOracle.sol:71`** — `(sqrtPriceX96 * sqrtPriceX96) >> 64` переполняет uint256 выше тика ≈443 636, то есть на половине допустимого диапазона Uniswap (MAX_TICK 887 272). Uniswap `OracleLibrary` использует `FullMath.mulDiv` именно поэтому. Для текущих трёх TWAP-рынков (HIMS/PONS/CASHCAT) недостижимо — я проверил порядок токенов в пулах: у PONS и CASHCAT мемкоин это token0, у HIMS порог требует цены ≤5.4e-8 USDG. Но добавление TWAP-рынка, где дешёвый 18-десятичный токен окажется token1 против 6-десятичного USDG, вводит оракул в зону реверта. Реверт оракула на Morpho — не fail-safe: `liquidate` и `withdrawCollateral` оба зовут `price()`, рынок замерзает вместе с безнадёжным долгом внутри. Доказательство: `test_proof_twapOracleRevertsInsideUniswapsValidTickRange`.
**Фикс:** `Math.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64)`.

**`CreateMarkets.s.sol:132-147`** — ветка `inverse` жёстко оборачивает chainlink-only оракул, и это единственное, что удерживает инвариант. `MinOracle` в собственном докстринге объясняет: `min(feed, twap)` защищает кредитора кэша, `max` — кредитора акций. Инверсия превращает min в max. Если кто-то поставит короткому рынку `oracleKind: "chainlinkTwapMin"`, залог шорта окажется завышен — ничего не отревертится, цена будет выглядеть правдоподобно. Второе, живое следствие той же ветки: у двух SHORT-рынков вообще нет TWAP-ноги, то есть именно они лишены защиты от выходного гэпа, которую `MinOracle` объявляет обязательной.
**Фикс:** `require` в `_deployOracle`, что `inverse` не комбинируется с `chainlinkTwapMin`, либо `MaxOracle` для инвертируемой стороны.

---

### Где тип должен быть типом, а не голым uint

- `LeverageRouter.CloseParams.repayAmount` / `FlashLiquidator.LiquidateParams.{seizedAssets, repaidShares}` — у Morpho это сумма-тип, охраняемый `exactlyOneZero`. Периферия переэкспортирует его двумя голыми uint с комментарием. В shares-ветке ликвидатора `flashAmount` вообще не имеет смысла, и ничто этого не говорит.
- `Lens.UserView` — в одной плоской структуре живут единицы loan-токена (`borrowAssets`), единицы залога (`collateral`), WAD-отношение (`healthFactorWad`) и цена на 1e36 (`liquidationPrice`). Именно поэтому SDK-двойник смог называться `liquidationPriceWad`, возвращая 1e36.
- `packages/sdk/src/math.ts:79` `leveragePlan(equity: bigint, ...)` — `equity`/`exposure` в единицах залога, `debt`/`flashLoan` обязаны быть в единицах займа, все четыре `bigint`. Оно сходится только потому, что USDG случайно 6-десятичный, а `apps/mcp/src/markets.ts:179` случайно подаёт USD·1e6. Плюс третья, независимая копия той же формулы во float: `apps/web/src/lib/position-math.ts:34` — и это та копия, которая строит реальную транзакцию (`position-panel.tsx:165-168`).
- `Market` из `_accrued` — «начисленный» и «сырой» Market это разные типы с разными инвариантами, а в коде один.

---

### Опровергнутые гипотезы

- **`Lens.liquidatable` расходится с `Morpho._isHealthy` на границе.** Нет. `testFuzz_lensLiquidatableMatchesMorphoIsHealthy` (256 прогонов) — `maxBorrow` считается идентично Morpho (`mulDivDown` цены, затем `wMulDown(lltv)`), долг через `toAssetsUp`, граница `hf < WAD` ⟺ `maxBorrow < borrowed` точна. Единственное исключение — панік из находки 1, он исключён из фаззера явным `assume`.
- **`InverseOracle` оборачивает `MinOracle`, инвертируя min в max на живых шорт-рынках.** Нет: `CreateMarkets.s.sol:138` подаёт chainlink-only. Опасность латентная (находка 9), не текущая.
- **`received < assets` в `LeverageRouter._close` неверна так же, как в ликвидаторе.** Нет, там она в точности верна — `morpho.repay` уже вытянул `assets` до свопа.
- **`_sweep(collateral, onBehalf, 0)` в `LeverageRouter` — дыра для кражи застрявших токенов.** Формально да (первый вызвавший забирает), но контракт по конструкции ничего не держит; ассиметрия с `FlashLiquidator` (тот метёт владельцу) — стилистическая, не денежная.
- **`Lens._accrued` расходится с `Morpho._accrueInterest` по комиссии.** Нет, порядок операций и база для `feeShares` совпадают точно.

---

### Общая оценка блока

Границы модулей выбраны правильно и это главное: Morpho держит деньги, периферия ничего не держит между транзакциями, авторизация идёт через `setAuthorization` самого Morpho, ликвидация остаётся открытой всем. Собственная математика Lens согласована с Morpho там, где это решает деньги (проверено фаззером). Оракулы аргументированы, а не просто написаны — доводы в докстрингах `MinOracle` и `TwapOracle` содержательны и верны.

Ломается блок не в контрактах, а **на швах**. Все семь реальных находок — это места, где один инвариант списан в два-три модуля и разошёлся: `received < assets` (верно в роутере, неверно в ликвидаторе), долг вверх/вниз (Lens против SDK), закрытие по долям/по assets (веб против роутера), `leveragePlan` в трёх копиях, и допущение «залог 18-десятичный», которое периферия делает молча, а два шорт-рынка нарушают. Две находки — 1 и 2 — сегодня, на мейннете, означают, что ликвидатор либо выключаем за микро-USDG, либо структурно не работает на двух рынках с самым тонким буфером. Это дороже всего остального в списке вместе взятого.

---

## Agent 3 (`af948a267e374356e`)

Proofs complete. Full existing suite still green (57 passed) with my file added.

**Files I wrote (test-only):** `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/SecurityProofs.t.sol`, `/private/tmp/claude-501/-Users-maksudnasibov-projects-solprojects-Cluby/65a66235-fac3-467b-9126-d4a29ed8eb12/scratchpad/proof_redact.mjs`. No production file touched, no transaction sent, no secret value printed.

Run with: `cd contracts && forge test --match-path 'test/unit/SecurityProofs.t.sol' --skip 'Operability.proof.t.sol'` (a sibling agent's `test/unit/Operability.proof.t.sol` currently does not compile; the `--skip` is only to work around that).

---

# FINDINGS

## F1 — FlashLiquidator has no price floor of its own. "A leaked keeper key cannot steal" is false.
**Proof:** `SecurityProofs.t.sol::SecurityProofsTest::test_proof_keeperCanRouteLiquidationProfitAwayFromOwner` (passes, asserting the hole) and the same claim written as an invariant: `InvariantsThatDoNotHold::test_proof_liquidationCannotSellFarBelowOracle` → `[FAIL: next call did not revert as expected]`.

`FlashLiquidator.sol:35-36` states a keeper key that leaks "cannot steal — but it could burn gas". The only on-chain price check is line 116:

```solidity
if (received < assets) revert NoProfit(received, assets);
```

`assets` is the caller's own `p.flashAmount`; `minAmountOut` on line 111 is the caller's own floor. Both sides of the only invariant come from the same untrusted caller, and **nothing in the contract ever reads `p.marketParams.oracle`** — the oracle address is carried through the struct and never used. The gate is self-certifying.

In the proof, the identical liquidation that honestly pays the owner 500 USDG is re-run with `minAmountOut: 1` against a pool pushed to half the oracle price. It does not revert; the owner receives 5 USDG and 495 stays with whoever was on the other side of the swap.

**Cost of error:** the whole liquidation bonus on every liquidation — LIF−1, which is 12.68% at the 62.5% LLTV used by eleven of the seventeen markets, capped at 15%. It goes to whoever holds the keeper key, or to whoever sandwiches the keeper's swap. This is not only a compromise scenario: the honest keeper sets `minAmountOut` at 92% of oracle (`apps/keeper/src/liquidate.ts:100`), volunteering an 8-point sandwich window on every call, and the contract accepts anything at all. Live exposure today is small ($50 in the vault); the fix is cheap now and structural later.

**Fix (one sentence):** read `IOracle(p.marketParams.oracle).price()` inside `onMorphoFlashLoan` and require `received >= seized·price/1e36 · (1 − maxSlippageWad)` with `maxSlippageWad` an owner-set storage value, so the floor is enforced by the contract instead of by the key that signs the transaction.

---

## F2 — LeverageRouter: any balance it holds belongs to whoever calls `open()` next, and there is no way to rescue it otherwise.
**Proof:** `SecurityProofs.t.sol::LeverageRouterSweepTest::test_proof_anyoneSweepsStuckTokensOutOfLeverageRouter` (passes) — 25,000 USDG mis-sent to the router by one address is taken in full by an unrelated address opening a 1-NVDA position.

`LeverageRouter.sol:19-20` claims "It holds nothing between transactions… there is no float for a bug here to lose." That is an intent, not a mechanism. `_sweep` (`:170-173`) sends the router's **entire** balance of a token named by the caller's own `p.marketParams`, to the caller's own `p.onBehalf`, and `marketParams` is never validated against any whitelist:

```solidity
_sweep(loanToken, p.onBehalf, assets);   // :131 — keeps only what Morpho will pull
_sweep(collateral, p.onBehalf, 0);       // :132 — keeps nothing
```

The contract has no owner, no `sweep(address)`, no rescue. A mis-sent transfer — an ordinary user error against a mainnet address the site links to — is unrecoverable except by front-running the next `open()`.

**Cost of error:** whatever ever lands there, first-come-first-served, permanently. Zero today; unbounded and silent.

**Fix (one sentence):** snapshot `balanceOf(address(this))` at the top of `_open`/`_close` and sweep only the delta, or add an `onlyOwner` rescue and give the contract an owner.

---

## F3 — The keeper's `redact()` is a no-op for 32-byte secrets, and covers exactly one RPC-URL vendor.
**Proof:** `scratchpad/proof_redact.mjs` — 7 of 8 guarantees fail. Additionally verified programmatically against the real `.env` (values never printed): `PRIVATE_KEY` passes through `redact()` **byte-for-byte unchanged**; only the two Alchemy URLs are caught.

`apps/keeper/src/env.ts:78-82`:

```js
.replace(/0x[a-fA-F0-9]{64}/g, (m) => (m === m.toLowerCase() ? m : m));
```

Both arms of the ternary return `m`. This rule is dead code — and 32 bytes of hex is the exact shape of `KEEPER_PK`. The first rule matches only `…/v2/<key>`: Infura `/v3/`, QuickNode `<name>.quiknode.pro/<token>/`, Ankr, and `?apiKey=` forms all survive. The Telegram bot token sits in a URL at `alerts.ts:20` with no rule covering it at all.

The comment at `env.ts:74-77` — "Anything printed — or forwarded to Telegram — goes through here first" — is true of the plumbing and false of the filter. `alerts.ts:11` is the only sanitizer on the Telegram path, so a leak here is a leak into a chat room.

**Cost of error:** the keeper key or the RPC key in a container log or a Telegram history. Given F1, the keeper key is worth the liquidation bonus on every position it touches.

**Fix (one sentence):** make the second rule actually replace (`→ "0x<redacted:32b>"`) and redact the path+query of *any* https URL rather than one vendor's shape.

---

## F4 — The shell scripts print the keyed RPC URL on any transport error, and put the deploy key in `argv`.
**Proof:** foundry prints `Error: error sending request for url (https://…/v2/<KEY>)` as line 1 of every transport failure (verified with a fake key). `scripts/borrow.sh:48-49` and `scripts/canary.sh:88-89` pipe `2>&1` into `grep -E "…|Error"` — that grep matches that exact line by design. Reproduced: the filter printed `FAKE_SECRET_KEY_9999` verbatim.

Separately, `--private-key "$PRIVATE_KEY"` is passed on the command line in `scripts/borrow.sh:48`, `scripts/close.sh:43,50,57`, `scripts/canary.sh:52,88`, `contracts/script/deploy-safe.sh:49`. On a shared or compromised box, `ps` shows the deployer key to every process for the duration of the call.

**Cost of error:** a routine RPC hiccup during a demo, a CI run, or a recorded terminal publishes the Alchemy key; `ps` publishes the deployer key locally.

**Fix (one sentence):** pipe every foundry invocation through `sed -E 's#(https://[^ )]*/)[A-Za-z0-9_-]{16,}#\1<redacted>#g'` before the grep, and move `--private-key` to a keystore (`cast wallet import` + `--account`).

---

## F5 — The keeper turns an unauthenticated HTTP response into signed transaction calldata with no validation.
**Proof:** file:line, mechanism.

`apps/keeper/src/borrowers.ts:117-130` — `fromIndexer()` fetches `${PONDER_URL}/positions/open` and feeds `row.marketId` and `row.user` straight into the watch set. No shape check, no address check, no membership check against `MARKETS`. Those ids then reach `liquidate.ts:46` and `:81` via `getMarketParams`, which resolves them through Morpho's `idToMarketParams` — and **market creation on Morpho Blue is permissionless**, so any id an attacker names resolves to `oracle`, `loanToken` and `collateralToken` that the attacker wrote. The oracle's answer is then what `tryLiquidate` sizes `seized`, `flashAmount` and `minAmountOut` from (`:82-100`).

The reachable damage is not theft — `simulateContract` at `:120` gates the send, and FlashLiquidator holds nothing — it is **denial of the one job that cannot wait**. `scanHealth` sorts ascending by health factor (`:73`), so fabricated positions reporting HF≈0 sort *ahead of the genuinely underwater borrower*, and `liquidationPass` awaits each candidate serially (`index.ts:25-31`) at three RPC round-trips apiece. A few hundred injected rows push real liquidations minutes past the two-second poll, indefinitely.

Same shape, sharper consequence, at `apps/keeper/src/scores.ts:18-53`: rows from `${PONDER_URL}/scores` go unvalidated into a signed `setScores` call made as an authorized updater. `CreditRegistry.sol:45` caps the *value* at 1000 but not *whose* address is in the array, so an injected `{id: attacker, score: 1000}` is published on chain and the rebate follows it. Nothing is paid today — the distributor is deliberately not deployed — so this is a designed-in path rather than a live loss.

**Cost of error:** bad debt, which is the one loss Morpho does not socialise away. Requires control of the indexer response — a compromised indexer, a plain-http `PONDER_URL`, or a poisoned DB row.

**Fix (one sentence):** in `fromIndexer` and `scorePass`, drop every row whose `marketId` is not a key of `MARKETS` and whose `user`/`id` fails `isAddress`, before it enters `known` or the `setScores` array.

---

# REFUTED HYPOTHESES

- **An outsider can drive `onMorphoFlashLoan` / `onMorphoLiquidate`.** No. Morpho calls back only the address that initiated the flash loan, so neither callback is reachable except from a call the contract itself started, and both additionally pin `msg.sender == morpho`. Proved by `test_proof_outsiderCannotCallCallbacks` (passes).
- **A user's standing `morpho.setAuthorization(LeverageRouter, true)` can be exercised by a third party.** No. `open()` (`:79`) and `close()` (`:88`) both pin `p.onBehalf == msg.sender`, and every Morpho call inside `_open`/`_close` uses `p.onBehalf`. There is no path where the router acts for an address other than its caller. Proved by `test_proof_authorisationCannotBeBorrowedByAThirdParty` (passes). This is the single most valuable thing the block gets right.
- **Either contract can be made to `approve` a spender the caller chooses.** No. Every `forceApprove` target is one of the two constructor immutables (`morpho`, `router`); only the token address and amount come from calldata, and a malicious token approved to the real Uniswap router grants nothing.
- **`liquidate()` is open to anyone.** No — keeper/owner gated at `FlashLiquidator.sol:81`. Proved by `test_proof_liquidateIsGated` (passes). (The gate holds; F1 is that it protects less than the comment claims.)
- **A secret was committed at some point.** No. `.env*` is gitignored, no `.env` appears in any of the 37 commits, and every 64-hex string in history is a Morpho market id or constructor calldata under `contracts/broadcast/`.
- **The browser bundle ships the Alchemy key.** Not established. `apps/web/src/lib/wagmi.ts:14` reads `NEXT_PUBLIC_RPC_URL`, which is public by construction and defaults to the public node; the keyed URL is read server-side only (`apps/web/src/lib/chain.ts:16`, `CLUBY_RPC_URL`). Worth a note in the runbook — setting `NEXT_PUBLIC_RPC_URL` to the Alchemy URL would publish the key to every visitor with no warning — but nothing in the repo does it.
- **The site or indexer can be fed a market with an attacker's oracle.** No. `apps/indexer/ponder.config.ts:17,50-52` filters every event by the market ids in `deployments.markets`, and the web catalog comes from `@cluby/config`, not from chain enumeration. The keeper is the only component that accepts an id from outside that set — that is F5.

---

# ASSESSMENT OF THE BLOCK

The trust boundaries that are hard to get right are right. `onBehalf` is pinned at every entry point, both callbacks pin `msg.sender`, every approval target is immutable, and the decision to act through Morpho's authorization rather than by custody means a revoked authorization genuinely locks the router out. Three separate attempts to reach a privileged action from an untrusted input failed against the contracts, and they failed for structural reasons rather than by luck.

The weakness is uniform and has one shape: **the contracts delegate their safety to off-chain callers and then document the delegation as if it were enforcement.** F1 and F2 are the same bug in two places — a comment asserting an invariant (`"cannot steal"`, `"holds nothing"`) that no line of code checks. F3 and F4 are that pattern in the operational layer: a redaction function whose comment describes what it was meant to do rather than what it does. F1 is the one worth fixing before TVL arrives, because it is the only finding here that transfers value out on a path the protocol takes routinely; it is also about fifteen lines.

The oracle stack (Min/Inverse/Twap) is conservative in the right direction on every axis I checked from a trust standpoint — `min()` for collateral, revert rather than substitute a shorter TWAP window, revert rather than return zero. I found nothing in it that an attacker reaches.

---

## Agent 4 (`a613849797adf69cc`)

# ИНЖЕНЕРНАЯ РЕВИЗИЯ — contracts/src (periphery, oracles, libraries, interfaces)

Все проверки — в `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/Proofs.t.sol` (4 теста, зелёные; forge требует префикс `test`, поэтому `test_proof_<claim>`). Production-код не тронут: `git diff --quiet -- contracts/src` → чисто. Мутации прогонялись в изолированной песочнице, оригинал восстановлен.

---

## НАХОДКИ

### F1. `NoProfit` меряет не прибыль. Прибыльная ликвидация ревертится.
**Доказательство:** `test_proof_noProfitRevertsALiquidationThatIsActuallyProfitable`
`contracts/src/periphery/FlashLiquidator.sol:116` — `if (received < assets) revert NoProfit(...)`, где `assets` = **flashAmount**, а не то, что Morpho реально вытянул (`repaid`, строка 97). Баланс после свопа = `assets − repaid + received`; экономически достаточно `received ≥ repaid`. Контракт же требует `received ≥ flashAmount`, то есть требует, чтобы залог покрыл ещё и запас кипера.
При этом doc-комментарий на `LiquidateParams.flashAmount` (строки 46-48) **прямо велит** киперу добавить запас, а `apps/keeper/src/liquidate.ts:99` добавляет 1%. В тесте: Morpho тянет 500 USDG, пул отдаёт 502, `flashAmount=505` → `NoProfit(502, 505)`. Тот же вызов с `flashAmount=500` проходит и платит owner 2 USDG.
**Цена:** ликвидация с положительным нетто не проходит; позиция остаётся под водой, пока цена не уедет ещё дальше — прямой путь к bad debt на волатильном стоке. Две функции, которые должны страховать друг друга (`minAmountOut` и `flashAmount`), в комментарии на строках 51-56 разведены сознательно — а в проверке снова склеены.
**Фикс:** `if (received < repaid) revert NoProfit(received, repaid);`

---

### F2. Кипер конструктивно никогда не ликвидирует SGOV (86%) и ETH (77%).
**Доказательство:** арифметика по формуле самого Morpho (`liquidationIncentiveFactor`, `apps/keeper/src/liquidate.ts:16-19`), на 1 USDG долга:

| tier | LIF | flashAmount = 1.01·R | minAmountOut = 0.92·R·LIF | `minAmountOut <= flashAmount` (liquidate.ts:102) |
|---|---|---|---|---|
| SGOV 86% | 1.0438 | 1 010 000 | 960 333 | **skip, всегда** |
| ETH 77% | 1.0741 | 1 010 000 | 988 183 | **skip, всегда** |
| stocks/short 62.5% | 1.1268 | 1 010 000 | 1 036 619 | ok |
| longTail 38.5% | 1.1500 | 1 010 000 | 1 058 000 | ok |

Допуск на проскальзывание (8%, строка 100) больше, чем сам стимул ликвидации на высоких LLTV. Условие не зависит от здоровья позиции — оно ложно для этих тиров при любой цене. Выход не через `alert`, а через `log` (строка 103), так что тишина читается как «нечего ликвидировать».
**Цена:** два самых консервативных рынка — и ровно те, где есть капы и ликвидность — не имеют автоматической ликвидации вообще.
**Фикс:** сделать допуск функцией LIF (`minAmountOut = repaid·(1 + (LIF−1)/2)`), а не константой 0.92, и алертить при skip.

---

### F3. SDK округляет долг ВНИЗ под комментарием «как Morpho округляет против заёмщика». Lens — вверх.
**Доказательство:** `test_proof_lensRoundsDebtUpWhereTheSdkRoundsItDown`
`contracts/src/periphery/Lens.sol:92` → `toAssetsUp` (верно, как Morpho).
`packages/sdk/src/reads.ts:72-74`:
```ts
/** Debt in loan-token units, rounded the way Morpho rounds it against the borrower. */
export function debtOf(position, state) {
  return toAssetsDown(position.borrowShares, state.totalBorrowAssets, state.totalBorrowShares);
}
```
Комментарий обещает механизм, код делает обратное. `toAssetsUp` в `packages/sdk/src/math.ts:16` написана — и не используется здесь.
Дальше — хуже: `debtOf` кормит **весь** пользовательский путь (`apps/web/src/lib/portfolio.ts:63`, `apps/mcp/src/markets.ts:125`), и он же не применяет накопленные проценты вообще (читает `market()` из сторожа напрямую, `reads.ts:33`). То есть Lens существует ровно затем, чтобы «симуляция не расходилась с транзакцией» (его собственный doc, строки 12-16) — и подключён к одному из трёх потребителей. Сайт получает именно то заниженное число, от которого Lens и был написан.
**Цена:** «repay all», посчитанный сайтом, недоплачивает — остаётся пыль долга, из-за которой нельзя вывести последний коллатерал.
**Фикс:** `debtOf` → `toAssetsUp` над состоянием, прогнанным через ту же аккрецию; либо сайт читает `Lens.userView`, как кипер.

---

### F4. `TwapOracle` защищает нижнюю границу диапазона и не защищает верхнюю.
**Доказательство:** `test_proof_twapOracleOverflowsAtHighTicksInsteadOfReverting`
`contracts/src/oracles/TwapOracle.sol:68` — `(sqrtPriceX96 * sqrtPriceX96) >> 64` — обычная проверяемая арифметика. При `sqrtPriceX96 ≥ 2^128` (tick ≥ 443 637) умножение переполняется: `price()` падает `Panic(0x11)`, а не объявленной `PriceOutOfRange` (она стоит строкой 76 и ловит только нулевой конец). Тест: tick 443 636 работает, 443 637 — паника.
Комментарий на строках 70-71 рассуждает именно про переполнение — но про `ratio · 1e36` двумя строками ниже, и обходит `sqrt·sqrt` прямо над собой. Uniswap в своей `OracleLibrary` ветвится по `ratio < 2^128` ровно поэтому.
**Достижимость — честно: нулевая для текущего листинга.** Порог соответствует 18-decimal токену дешевле ≈ $5.5e-8 при USDG-как-token0; из всех пулов в `packages/config` только HIMS имеет такой порядок токенов, и он на tick +243 140. PONS/CASHCAT/INDEX — token0, у них tick отрицательный.
**Цена, если сработает:** оракул, который ревертит, ревертит и `morpho.liquidate` — рынок замерзает вместе с долгом. Ловушка для следующего листинга, не сегодняшняя дыра.
**Фикс:** `uint256 ratioX128 = Math.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);`

---

### F5. `_accrued` не двигает `lastUpdate` — IRM спрашивают на гибридном состоянии.
**Доказательство:** `test_proof_accruedStateKeepsAStaleLastUpdate`
`contracts/src/periphery/Lens.sol:161-180` продвигает `totalBorrowAssets`/`totalSupplyAssets`/`totalSupplyShares`, но не `m.lastUpdate`. Затем `Lens.sol:64` вызывает `borrowRateView(params, v.state)` уже на этом состоянии: утилизация уехала вперёд, часы стоят. Для AdaptiveCurveIRM (rate зависит и от утилизации, и от `elapsed`) это ставка, которую не увидит ни один блок — ни прошлый, ни следующий. Плюс `MarketView.state.lastUpdate` уходит наружу в ABI как заведомо ложное поле.
**Цена:** отображаемый APY; не деньги. Но это ровно тот класс «наполовину применённого инварианта», ради которого контракт написан.
**Фикс:** `m.lastUpdate = uint128(block.timestamp);` в конце `_accrued`.

---

### F6. Мутационное тестирование: 8 из 12 мутантов выжили.

Прогон в изолированной копии, только предсуществующие тесты (39 шт.):

| # | мутация | результат |
|---|---|---|
| M1 | `Lens:92` `toAssetsUp` → `toAssetsDown` (округление долга) | **выжил** |
| M2 | `Lens:172-179` удалить весь блок fee-shares | **выжил** |
| M3 | `FlashLiquidator:116` убрать guard `NoProfit` | **выжил** |
| M4 | `TwapOracle:95` убрать коррекцию округления отрицательного тика | **выжил** |
| M5 | `Lens:95` убрать clamp `safeLltv` от underflow | **выжил** |
| M7 | `Lens:107` `mulDivUp` → `mulDivDown` в liquidationPrice | **выжил** |
| M8 | `LeverageRouter:157` убрать guard `SwapShortfall` | **выжил** |
| M9 | `Lens:73` `v.price = 0` | убит |
| M10 | `FlashLiquidator:122` не платить owner | убит |
| M11 | `InverseOracle:28` убрать один множитель 1e36 | убит (2 теста) |
| M12 | `Lens:89` цена → 1 в collateralValue | убит (6 тестов) |
| M6 | `MinOracle:37` min → max | убит |

Что это значит по конкретным тестам:

- **`test_revertsWhenSwapOutputIsBelowTheFloor`** (FlashLiquidator.t.sol:85) — бесполезен для контракта. Он ждёт `MockRouter.TooLittleReceived`, то есть проверяет пол **мока**, а не `NoProfit` контракта (M3). Единственная экономическая проверка периферии не покрыта ничем.
- **`test_priceWhenCollateralIsToken0`** (Oracles.t.sol:45) — не может поймать M4 по конструкции: `MockV3Pool.setMeanTick` (Mocks.sol:77-80) ставит `cumulativeEnd = tick·window`, поэтому `delta % window` **всегда** 0 и ветка `if (delta < 0 && …) tick--` не исполняется ни в одном тесте. Мок делает свой предмет непроверяемым.
- **`test_pendingInterestIsApplied`** (Lens.t.sol:113) — весь `fee`-путь `_accrued` мёртв под тестом: `fee: 0` во всех фикстурах (M2). А это единственное место, где Lens воспроизводит нетривиальную формулу Morpho.
- **`test_safeBorrowIsInsideMaxBorrow`** (Lens.t.sol:93) — берёт margin 0.05 при lltv 0.625; ветка `params.lltv > safeMarginWad ? … : 0` не проверена (M5). При `safeMarginWad > lltv` без clamp был бы revert на публичном view, который зовёт кипер.
- Не покрыто вообще: `MinOracle.PriceZero`, `InverseOracle.SourcePriceZero`, `TwapOracle.PriceOutOfRange`, весь `LeverageRouter` в unit-слое (только fork).

---

### F7. R6 — написано и никем не подключено

Ноль вызовов во всём репозитории (кроме собственных unit-тестов):

- `Lens.healthFactors` (`Lens.sol:149`) — doc: *«the keeper's hot path»*. Кипер (`apps/keeper/src/liquidate.ts:48-58`) делает N отдельных `userView` в `Promise.all`. Хот-пас не существует.
- `Lens.previewBorrow` (`Lens.sol:112`) — doc: *«the preview a wallet signs against»*. Кошелёк (`apps/web/src/components/position-panel.tsx`) его не читает; превью считается в TS.
- `Lens.marketView` / `marketViews` (`:55`, `:141`) — ни один off-chain потребитель не вызывает. Сайт считает ставки сам (`packages/sdk/src/reads.ts:46 getRates`), причём на неаккретированном состоянии.
- `MinOracle.prices()` (`MinOracle.sol:43`) — doc: *«for a watchdog that wants to alert on divergence»*. `apps/keeper/src/watchdog.ts:47-68` полностью переписывает это сравнение off-chain через `readTwap`. Сторож есть, функция для сторожа не нужна никому.
- `FlashLiquidator.onMorphoLiquidate` (`:130`) — недостижим по построению: `FlashLiquidator.sol:98` всегда передаёт `""` в `liquidate`, так что Morpho его не вызовет никогда. Doc говорит *«Declared because Morpho will call it if data is non-empty»* — в этом коде `data` непусто быть не может.
- `TwapOracle.meanTick()` (`:81`) — ноль вызовов, и вдобавок затеняет локальную переменную строки 64: solc печатает warning 8760 на **каждой** сборке. Единственный warning в блоке — на мёртвой функции.
- `MathLib.wDivUp`, `MathLib.min`, `MathLib.max` — ноль вызовов где бы то ни было.
- `SharesMath.toSharesUp` — ноль вызовов в Solidity.
- `IExternal.sol`: `IStockToken`, `IWETH9`, `IUniswapV3Factory`, `ISwapRouter02.exactOutputSingle` + `ExactOutputSingleParams` (последнее реализовано только в моке, `Mocks.sol:202`, чтобы вернуть 0).
- `IMorpho.sol`: `IMorphoSupplyCollateralCallback`, `IMorphoRepayCallback`, `struct Authorization`.

Дублирование между соседями: `MathLib` + `SharesMath` (Solidity) и `packages/sdk/src/math.ts` (TS) — одни и те же четыре функции, написанные дважды, и они **уже разошлись** (F3). `IUniswapV3PoolMinimal`/`IStockToken` объявлены трижды: `IExternal.sol`, `packages/abi/src/external.ts`, `packages/sdk/src/abi.ts`.

---

### F8. Мелочи, которые senior переписал бы
- `LeverageRouter._sweep(token, to, 0)` (`:132`, `:163`) отдаёт **весь** баланс вызывающему. Любой донат или пыль fee-on-transfer токена достаётся следующему пользователю. Это цена свойства «ничего не держим», но в отличие от `FlashLiquidator` здесь нет `sweep(onlyOwner)`, и обе доктрины оправданы одним и тем же абзацем комментария.
- `LeverageRouter.CloseParams` не имеет `repayShares`, хотя `morpho.repay` принимает shares, а брат-контракт `LiquidateParams` поле `repaidShares` несёт. `_close` (`:142`) всегда репеит в assets → между симуляцией и майнингом набегает процент → `toSharesDown` оставляет пыль долга и позицию нельзя закрыть полностью. Fork-тест `test_closeReturnsTheRemainder` этого не видит (один блок) и вдобавок закрепляет остаток как ожидаемое: `assertGt(collateral, 0, "collateral should remain")`.
- `LeverageRouter.open/close` проверяют `morpho.isAuthorized(msg.sender, address(this))` (`:80`, `:89`) при уже наложенном `p.onBehalf == msg.sender`. Morpho проверит ровно то же самое внутри `borrow`/`withdrawCollateral`. Инвариант продублирован, а не усилен.

---

## ОПРОВЕРГНУТЫЕ ГИПОТЕЗЫ

1. **«`Lens.liquidatable` разойдётся с `_isHealthy` Morpho на границе округления, и кипер отправит транзакцию, которая упадёт».** Неверно. `hf = floor(maxBorrow·1e18 / borrowed) < 1e18` ⟺ `maxBorrow < borrowed`, что буквально `!(maxBorrow >= borrowed)` из Morpho, и `maxBorrowAssets` считается той же композицией `mulDivDown → wMulDown`. Расхождения нет ни на одной точке.
2. **«Short-рынки получают оптимистичную цену: `InverseOracle` над `MinOracle` превращает min в max».** По логике — да, инверсия переворачивает направление консервативности, и `MinOracle` сам это пишет (*«max(feed, twap) protects a lender of shares»*), а short-рынки как раз лендят shares. Но в деплое этого нет: `contracts/script/CreateMarkets.s.sol:131-146` строит short как `InverseOracle(_chainlinkOracleWithDecimals(...))` — чистый Chainlink, без `MinOracle`. Гипотеза о деньгах опровергнута. Остаётся только doc-ловушка: `InverseOracle.sol:11` требует *«must already be conservative for its own side»* — правильное требование обратное, и один правленный `oracleKind` в конфиге даёт оптимистичную цену на short.
3. **«`_accrued` теряет проценты при `uint128(interest)`».** Нереализуемо: нужен `totalBorrowAssets·taylor > 2^128` при том, что сам `totalBorrowAssets` — `uint128`.
4. **«Пыль/остатки могут застрять в `FlashLiquidator` между транзакциями».** Нет: все пути кончаются `safeTransfer(owner(), …)`, и `test_liquidatesWithoutCapitalAndPaysOwner` это ловит (M10 убит). Свойство «контракт ничего не держит» реально выполняется и реально проверено.
5. **«Уровень approve `type(uint256).max` в `FlashLiquidator:96`/`LeverageRouter:141` оставляет открытый аллованс».** Обе строки перезаписываются на точную сумму до выхода (`:119`, `:159`), и получатель — Morpho.

---

## ОБЩАЯ ОЦЕНКА БЛОКА

Ремесло **хорошее там, где оно про Morpho, и слабое там, где оно про свой периметр.** Инверсия decimals, порядок токенов в пуле, направление min/max, virtual shares, округление долга вверх, воспроизведение fee-shares — всё это написано человеком, который читал Morpho и знал, где именно ошибаются. Комментарии в `MinOracle` и `TwapOracle` — лучшее, что есть в блоке: они объясняют не «что», а «почему не наоборот», и мутация M6/M11/M12 показывает, что эти места действительно охраняются тестами.

Слабость ровно одна и она системная: **экономические инварианты не проверяются, а декларируются.** `NoProfit` (F1) неправильна и никем не покрыта (M3), `SwapShortfall` не покрыта (M8), пол свопа тестируется у мока, а не у контракта. Все три — единственные места, где периферия защищает деньги, и все три пусты. Мутационный счёт 4/12 убитых по критическим строкам — это не «мало тестов», это тесты, направленные не туда: 39 зелёных проверяют арифметику цен (там всё живо) и не проверяют условия выхода.

Второй по значимости дефект — **разрыв между Lens и его потребителями (F3, F7).** Lens написан правильно, задокументирован под трёх потребителей и подключён к одному, а `previewBorrow`/`healthFactors` описаны через пути, которых не существует. Комментарий «keeper's hot path» на функции с нулём вызовов — это не мёртвый код, это ложная карта: следующий человек будет чинить не тот файл.

Что переписал бы:
1. `if (received < repaid)` — одна строка, снимает F1.
2. `debtOf` → `toAssetsUp` в SDK, или сайт на `Lens.userView` — снимает F3 и убирает дубль математики.
3. `minAmountOut` кипера — функция от LIF, не константа — снимает F2.
4. `m.lastUpdate = uint128(block.timestamp)` в `_accrued`; `Math.mulDiv` в `TwapOracle:68` — по строке на F5 и F4.
5. Удалить `onMorphoLiquidate`, `meanTick()`, `prices()`, `marketViews`, неиспользуемые интерфейсы и три функции `MathLib`. Не ради байткода — ради того, чтобы doc-комментарии перестали описывать несуществующие вызовы.
6. `MockV3Pool.setMeanTick` должна уметь давать `delta`, не кратный `window`, иначе коррекция отрицательного тика непроверяема в принципе.

Блок не теряет деньги сегодня — F1 и F2 маскируют друг друга (кипер skip'ает ровно те рынки, где переоценённый `flashAmount` укусил бы), но это совпадение, а не защита: любой ручной вызов `liquidate` с запасом или любое смягчение допуска в кипере вскрывает F1 немедленно.

---

## Agent 5 (`a71018e6aa1ee47d6`)

## НАХОДКИ

### L1. `LeverageRouter.close()` не может закрыть позицию до нуля — и документированный способ «закрыть целиком» ревертит

`contracts/src/periphery/LeverageRouter.sol:142` — `morpho.repay(p.marketParams, assets, 0, p.onBehalf, "")`. Shares-путь жёстко зашит в `0`; в `CloseParams` нет поля для shares. NatSpec на `:54` при этом прямо говорит: «Pass the full debt in assets to close the position outright».

Доказательство (fork, `contracts/test/fork/ProofLeverageClose.fork.t.sol`):

| тест | результат |
|---|---|
| `test_proof_closeLeavesResidualDebtAfterQuoteGoesStale` | FAIL: `residual borrowShares = 1000000`, `residual debt = 1` — котировка долга снята, затем `warp(+24s)`, `roll(+2)`; долг за это время подрос, `assets` уже меньше долга, остаётся пыль |
| `test_proof_residualDebtLocksTheCollateral` | FAIL: `insufficient collateral` — с этой пылью `withdrawCollateral(всё)` реверти́т |
| `test_proof_overRepayingReverts` | FAIL: `panic 0x11` — `repayAmount = debt * 1.001` даёт underflow в `position.borrowShares -= shares` внутри Morpho |
| `test_proof_measureStrandedCollateralAndEscape` | PASS — измерение: заперто `8686714301` wei NVDA (≈ 8.7e-9 токена), выход есть **только** через прямой `morpho.repay(params, 0, shares, ...)` мимо роутера |

Механика: `repay` по assets конвертирует `toSharesDown` против **свежих** `totalBorrowAssets` (Morpho начисляет проценты внутри вызова). Меньше котировки → пыль; ровно котировка в том же блоке → может совпасть; больше → `panic 0x11`. Цель движется, и попасть в неё детерминированно нельзя.

**Цена ошибки.** В долларах ≈ 0 (заперты доли цента). Но: `close()` — единственный выход, который контракт предлагает, и он не доводит позицию до нуля никогда, если между чтением и майнингом прошёл хоть один блок. Позиция навсегда висит с ненулевым долгом, продолжает капать процент, остаётся в списке кипера и в индексаторе, и `close()` нельзя использовать для полного выхода из UI (кнопки close пока нет — то есть баг ещё не выстрелил в проде). Самое естественное действие интегратора — «дам запас, чтобы точно закрыть» — даёт неразмеченный арифметический панк без единого слова о причине.

Проект уже знает правильный паттерн и не применил его в контракте: `packages/sdk/src/tx.ts:43-45` — «Pass shares rather than assets to close a debt exactly: … an assets-denominated repay of "everything" always leaves dust behind».

**Фикс одной фразой.** Добавить `uint256 repayShares` в `CloseParams`, прокинуть его в `morpho.repay(params, repayAmount, repayShares, ...)` и брать флеш-заём на `repayAmount` как верхнюю оценку, возвращая остаток свипом (он уже есть).

---

### L2. Инвариант прибыли ликвидатора написан против числа, которое выбирает вызывающий

`contracts/src/periphery/FlashLiquidator.sol:116` — `if (received < assets) revert NoProfit(received, assets)`, где `assets` = `flashAmount`. Реальная стоимость операции — `repaid` (второе возвращаемое значение `morpho.liquidate` на `:97`), и оно тут же лежит в переменной, но в проверке не участвует.

Два следствия, оба доказаны в `contracts/test/unit/ProofLogic.t.sol` и `ProofLogic2.t.sol`:

**(a) Прибыльная ликвидация ревертит.** `test_proof_profitableLiquidationRevertsOnFlashMargin` → FAIL: `NoProfit(502000000, 505000000)`. Repaid 500, выручка 502 (реальная прибыль 2 USDG), флеш-заём 505 — то есть ровно те `+1%`, которые ставит кипер (`apps/keeper/src/liquidate.ts:96`: `flashAmount = repaid * 101n / 100n`). Комментарий на `:46-47` сам велит киперу «size it from the debt plus a margin», а `:83-85` объясняет, что точный `repaid` до вызова неизвестен — то есть маржа обязательна, и она же ломает проверку.

**(b) Убыточная ликвидация проходит.** `test_proof_strayBalanceFundsALossMakingLiquidation` → FAIL: владелец кончает с 350 USDG вместо 400. Если в контракте лежит посторонний баланс (400), можно взять флеш-заём меньше долга (100), Morpho вытянет 500 из суммы «заём + пожертвование», продажа вернёт 450 — `received(450) >= assets(100)`, гейт доволен, а `profit = balance - assets` уносит владельцу и пожертвование, и убыток.

**Цена ошибки.** По (a) — пропущенные ликвидации ровно в тот момент, когда цена уехала и ликвидация нужнее всего; сегодня это скрыто тем, что киперский `minAmountOut` (≈1.037·repaid) строже гейта, то есть защищает случайно и перестанет, если поменять коэффициенты в `liquidate.ts`. По (b) — потеря на убыточной продаже, ограниченная посторонним балансом; триггерит только кипер/владелец. Считаю (a) главным: это liveness, а не кража.

**Фикс одной фразой.** `if (received < repaid) revert NoProfit(received, repaid);` — сравнивать с тем, что реально вытянули, а излишек флеш-займа и так возвращается свипом.

---

### L3. `Lens.previewBorrow` возвращает структуру, половина которой относится к позиции до транзакции

`contracts/src/periphery/Lens.sol:112-139`: `previewBorrow` пересчитывает `collateral`, `collateralValue`, `borrowAssets`, `maxBorrowAssets`, `healthFactorWad`, `liquidationPrice`, `liquidatable` — и **не трогает** `u.safeBorrowAssets`, унаследованное из `userView(params, user, 0)` на `:117`, то есть посчитанное по залогу *до* довнесения.

Доказательство: `contracts/test/unit/ProofLogic.t.sol::test_proof_previewBorrowLeavesSafeBorrowStale` → FAIL: `collateralValue 2314600000`, `maxBorrowAssets 1446625000`, `safeBorrowAssets 0`. Для первой позиции (залога ещё нет, вносим 10 NVDA) превью говорит «безопасно занять 0» при лимите 1446.6 USDG.

**Цена ошибки.** Число в UI/SDK, которое противоречит соседнему полю той же структуры. Направление консервативное (занизит, не завысит), денег не теряет, но это ровно тот класс «Lens спорит с транзакцией», который просили ловить, и он сломается неприятнее, если кто-то начнёт считать `safeBorrowAssets` источником истины для слайдера.

**Фикс одной фразой.** Пересчитать `u.safeBorrowAssets` из нового `collateralValue` внутри `previewBorrow` (и принять `safeMarginWad` параметром вместо зашитого `0`).

---

### L4. `Lens._accrued` возвращает наполовину обновлённое состояние и сам же его переиспользует

`contracts/src/periphery/Lens.sol:161-180`: `_accrued` прибавляет проценты к `totalBorrowAssets`/`totalSupplyAssets`/`totalSupplyShares`, но оставляет `m.lastUpdate` старым. Затем `:64` подаёт эту структуру в `IIrm.borrowRateView(params, v.state)` — то есть IRM видит утилизацию *после* начисления и `elapsed` *до* него.

Доказательство: `contracts/test/fork/ProofLensState.fork.t.sol::test_proof_marketViewRateUsesHalfUpdatedState` → FAIL: `lens 211456693` против `morpho 211455236`, и `state.lastUpdate` отстаёт от `block.timestamp` на 7 дней.

**Цена ошибки.** Расхождение ставки 0.0007% — косметика. Настоящий риск — экспортируемое поле `MarketView.state`, документированное как «with pending interest applied»: любой потребитель, который начислит по нему ещё раз (`block.timestamp - lastUpdate` даст полный интервал повторно), удвоит проценты. Сегодня никто так не делает — `packages/sdk/src/reads.ts:46` кормит IRM сырым `getMarketState`.

**Фикс одной фразой.** Ставить `m.lastUpdate = uint128(block.timestamp)` в конце `_accrued`, а ставку на `:64` брать от сырого `morpho.market(id)`, как это делает сам Morpho.

---

### Мелочи (механизм, без отдельного теста)

* `LeverageRouter` не имеет ни владельца, ни `sweep`. Любые токены, попавшие на него, уносит следующий вызывающий `open`/`close` — `_sweep(..., p.onBehalf, ...)` на `:131-132` и `:162-163` отдаёт всё сверх удержания вызывающему. Не потеря протокола, но «спасение» чужого доната работает по принципу «кто первый».
* `close()` зависит от свободного баланса loan-токена у самого Morpho: `morpho.flashLoan` делает `safeTransfer` из своего баланса. Проверено — `test_proof_closeNeedsIdleLiquidityItCannotGuarantee` в fork-файле падает с голым `transfer reverted`, без указания причины. Это свойство флеш-займа, не дефект, но означает, что единственный выход через контракт недоступен при высокой утилизации, и сообщение об ошибке пользователю ничего не объясняет.
* `packages/sdk/src/reads.ts:73` — `debtOf` использует `toAssetsDown`, тогда как `Lens.sol:92` и сам Morpho используют `toAssetsUp`. Расхождение в 1 wei в пользу заёмщика. Вне ревьюируемого блока, но это второй источник «долга» в системе.
* `FlashLiquidator` не имеет `receive()`; нативный ETH, доставленный через selfdestruct, не вынимается (`sweep` только ERC20). Ничтожно.

## ОПРОВЕРГНУТЫЕ ГИПОТЕЗЫ

* **«После операции остаётся висеть approve».** Неверно. `test_proof_noDanglingAllowanceAfterLiquidation` (unit) и `test_proof_leverageLeavesNoAllowance` (fork) — **оба PASS**. Безлимитный `forceApprove(morpho, type(uint256).max)` на `FlashLiquidator.sol:96` и `LeverageRouter.sol:141` каждый раз понижается до `assets` (`:119`, `:159`) до выхода из колбэка, и Morpho выбирает ровно `assets`. Allowance к Morpho и к SwapRouter02 по обоим токенам после `liquidate`, `open` и `close` — ноль.
* **«Частично выполненная транзакция оставляет контракт в несогласованном состоянии».** Неверно: обе периферии не имеют собственного стораджа (кроме `keepers`), всё происходит внутри одного колбэка, любой реверт откатывает и `safeTransferFrom` эквити на `LeverageRouter.sol:82`. Состояния «между шагами» не существует.
* **«Колбэк можно вызвать с подделанными данными».** Неверно: `onMorphoFlashLoan` проверяет `msg.sender == morpho` (`FlashLiquidator.sol:90`, `LeverageRouter.sol:95`), а Morpho вызывает колбэк только на инициаторе `flashLoan`, поэтому чужой `data` до `_open`/`_close` не доедет. `onMorphoLiquidate` — `view` и не вызывается (data пустая).
* **«Роутер может действовать за чужой аккаунт».** Неверно: `p.onBehalf != msg.sender` + `isAuthorized(msg.sender, this)` на `:79-80` и `:88-89`, и других входов нет.
* **«Повторный вызов ликвидации повреждает состояние».** Неверно: повторная ликвидация здоровой позиции реверти́т внутри Morpho (`HEALTHY_POSITION`), `seizedAssets > collateral` и `repaidShares > borrowShares` дают underflow-реверт. Идемпотентность обеспечена реверсией, а не компенсацией — для контракта без стораджа это корректно.
* **«`liquidatable` у Lens может разойтись с проверкой здоровья Morpho на границе».** Не подтверждено: `Lens.sol:89/92/94/103-104` использует ту же цепочку `mulDivDown → wMulDown` и `toAssetsUp`, что и `Morpho._isHealthy`; `hf < WAD ⟺ maxBorrow < borrowed` точно, включая равенство. Отдельного теста не писал — это чистая алгебра над теми же библиотеками.

## ОБЩАЯ ОЦЕНКА БЛОКА

Как машина состояний блок сделан хорошо и по правильному принципу: ни один из трёх контрактов не держит стораджа, который можно рассинхронизировать, вся работа умещается в один флеш-колбэк, и «восстановление после сбоя» сведено к атомарному реверту — это дешевле любой компенсирующей логики и здесь действительно работает. Approve-гигиена чистая в обе стороны, авторизация замкнута, подделать колбэк нельзя. Ни одного пути, где деньги утекают наружу, я не нашёл.

Слабое место у блока одно и оно повторяется дважды: **важные величины берутся не оттуда, где они точны.** `close()` погашает долг в assets, хотя долг живёт в shares и растёт между котировкой и майнингом — отсюда позиция, которую собственный контракт закрытия не может закрыть, и `panic 0x11` в ответ на самое очевидное действие пользователя. Ликвидатор сверяет выручку с размером займа, который выбрал вызывающий, хотя себестоимость лежит рядом в переменной `repaid` — отсюда откат прибыльной ликвидации именно в момент обвала. Оба чинятся одной строкой каждый и оба сейчас не стоят денег только потому, что кнопки close в UI ещё нет, а киперский `minAmountOut` случайно строже гейта. Я бы правил их до того, как появится первое, и до того, как кто-нибудь тронет коэффициенты во втором.

Файлы с доказательствами:
- `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/fork/ProofLeverageClose.fork.t.sol`
- `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/fork/ProofLensState.fork.t.sol`
- `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/ProofLogic.t.sol`
- `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/ProofLogic2.t.sol`

Прогон: `forge test --match-path 'test/unit/ProofLogic*.t.sol'` (юнит) и `forge test --match-path 'test/fork/Proof*.fork.t.sol' --fork-url robinhood` (нужен `ROBINHOOD_RPC_URL` из `.env`). Базовые 39 юнит-тестов не тронуты и зелёные; продакшн-код не изменялся.

---

## Agent 6 (`a463b2e3a856f0581`)

## НАХОДКИ

### F1. Три TWAP-рынка можно заморозить так, что ликвидация станет невозможна (HIMS, PONS, CASHCAT)

**Доказательство** — три падающих теста в `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/fork/EconProofs.fork.t.sol`:

```
[FAIL: ring buffer cannot hold the TWAP window: 360 < 1800] test_proof_twapPoolRingCanHoldTheOracleWindow
    HIMS observationCardinality 360 | slots needed at 0.1s blocks: 18000
[FAIL: OLD] test_proof_observeSurvivesAWindowLongerThanTheBuffer   (реальный пул HIMS)
[FAIL: OLD] test_proof_twapMarketStaysLiquidatableWhenObserveIsUnavailable
    health factor after the crash (wad) 527440420619141819   ← настоящий Morpho отказал в liquidate
```

**Механизм.** `TwapOracle.sol:90` вызывает `pool.observe([1800, 0])`. Uniswap v3 пишет максимум одно наблюдение на блок; блок на этой сети — **0.100 s** (измерено: 10 000 блоков за 1 000 s на head 54704842). Кольцевой буфер на N слотов удерживает не более N/10 секунд истории, если кто-то пишет каждый блок. Живые кардинальности: **HIMS 360, PONS 300, CASHCAT 360** — против ~18 000, нужных под окно 1800 s. Атакующий делает по одному пыльному свопу, сдвигающему тик, примерно раз в 6 секунд; `observe` начинает откатываться с `OLD`, `price()` откатывается вместе с ним, а Morpho читает оракул в `borrow`, `withdrawCollateral` и `liquidate`. `supply`/`repay` продолжают работать — то есть замораживается ровно та половина, которая защищает вкладчика.

**Цена ошибки.** Весь долг на трёх TWAP-рынках, пока цена падает. HIMS профинансирован волтом `frontier-usdg`; плановые капы $500 + $5 000 + $1 000, но потолка нет — supply в Morpho открыт кому угодно, минуя волт. Стоимость атаки — газ на 1 tx каждые 6 s.

**Фикс одной фразой.** В конструкторе `TwapOracle` требовать `pool.slot0().observationCardinality >= window / MIN_BLOCK_TIME` (≥ 18 000 при 0.1 s) и вызвать `increaseObservationCardinalityNext` до создания рынка — кардинальность в Uniswap только растёт, поэтому проверка в конструкторе держится вечно.

---

### F2. Кипер пропускает **каждую** ликвидацию на рынках с LLTV ≥ 70.297 % — включая ETH, который волт реально финансирует

**Доказательство** — `test_proof_keeperGateAllowsLiquidationOnEveryDeployedLltv` (тот же файл):
```
long-tail 38.5%  flash 878260869  minOut 920000000   ok
stocks   62.5%   flash 896375000  minOut 920000000   ok
ETH        77%   flash 940310000  minOut 920000000   FAIL
```

**Механизм.** `/Users/maksudnasibov/projects/solprojects/Cluby/apps/keeper/src/liquidate.ts:98-105`: `repaid = seizedValue/LIF`, `flashAmount = repaid·1.01`, `minAmountOut = seizedValue·0.92`, и гейт `if (minAmountOut <= flashAmount) return`. Он проходит только когда `0.92 > 1.01/LIF`, то есть `LIF > 1.09783`, то есть **LLTV < 70.297 %**. Порог не совпадает ни с каким осознанным решением — он выпал из двух независимо выбранных констант.

**Цена ошибки.** ETH (77 %, cap $5 000) — один из пяти рынков волта `core-usdg`; SGOV (86 %, cap $2 000). На них ликвидатор не выйдет никогда, позиция уедет до плохого долга, который сядет на вкладчиков волта. (Про SGOV уже есть находка в `ArchProofs.t.sol`; моя добавка — точный порог и то, что ETH тоже под ним.)

**Фикс одной фразой.** Выводить `minAmountOut` из `repaid` (`repaid · LIF · (1 − допуск)`), а не из фиксированных 92 % от стоимости изъятого — тогда запас автоматически масштабируется вместе с LIF.

---

### F3. `MIN_PROFIT` занижен ровно в 10¹² раз на двух шортовых рынках — газовый порог фактически выключен

**Доказательство** — `apps/keeper/src/env.ts:33` (`MIN_PROFIT = 1_000_000`, комментарий «in loan-token units») против `liquidate.ts:134-138`. Живые числа на NVDA-SHORT (оракул 4.343357150132266e45, LLTV 62.5 %):

| долг | expectedProfit | в долларах | гейт 1e6 | газ |
|---|---|---|---|---|
| $0.10 | 1.156e13 wei NVDA | **$0.0027** | пройден | $0.46 |
| $1.00 | 1.156e14 | $0.027 | пройден | $0.46 |
| $5.00 | 5.78e14 | $0.133 | пройден | $0.46 |

Газ: 450k × 0.413188 gwei × $2 455.22/ETH = **$0.46**. Безубыток наступает примерно на $17 долга.

**Цена ошибки.** Loan-токен шортовых рынков — 18-значная акция, а не 6-значный USDG, поэтому порог «$1» превращается в 10⁻¹² доллара. Кипер отправляет транзакцию за $0.46 ради $0.003 прибыли, платя из собственного кармана; на объёме пыльных позиций это чистый слив. Стоимость газа не учитывается вообще нигде — `MIN_PROFIT` статичен и не следит за `gasPrice`.

**Фикс одной фразой.** Масштабировать `MIN_PROFIT` на `decimals` loan-токена конкретного рынка и вычитать из `expectedProfit` фактическую оценку `gasPrice × estimateGas`.

---

### F4. Тир пула выбирается по `collateralToken`, а на шортах это USDG → всегда хардкод 500

**Доказательство** — `apps/keeper/src/liquidate.ts:21-26`: перебор `stocks` и `nativeTokens` по адресу, иначе `return 500`. Адрес USDG `0x5fc5360D…1d168` **отсутствует** в обоих реестрах (`packages/config/src/index.ts:25-155`). Прогон лукапа по всем 17 рынкам: все 15 длинных резолвятся верно, оба шортовых падают в дефолт, и единственный настоящий mismatch — **TSLA-SHORT: конфиг 3000, кипер шлёт 500** (NVDA-SHORT совпал случайно).

Живая проверка через `factory.getPool` (фабрика `0x1f7d7550b1b028f7571e69a784071f0205fd2efa`, взята из `router.factory()`):

```
TSLA/USDG 100   -> liquidity 0
TSLA/USDG 500   -> 0xc4f0172d…6236  L=1.697e17   price 353.67
TSLA/USDG 3000  -> 0xf4acdaee…89e3  L=8.118e17   price 353.43   ← настроенный
TSLA/USDG 10000 -> liquidity 0
```

**Цена ошибки.** Ликвидация TSLA-SHORT уходит в пул в 4.8 раза тоньше выбранного, за которым никто не следит: watchdog смотрит на пул из каталога (`apps/keeper/src/watchdog.ts:31`, `poolFor(subject)`). Сегодня это проходит (расхождение с оракулом −0.09 %, глубины хватает), но два из четырёх тиров этой пары уже стоят с нулевой ликвидностью. Если 500-тир пересохнет, каждая ликвидация TSLA-SHORT откатится на `amountOutMinimum` — и долг станет плохим, молча.

**Фикс одной фразой.** Брать `fee` из каталога рынка (`markets.json.poolFee`), а не искать по `collateralToken`.

---

### F5 (мелочь, но читает человек). Десятичные в алертах зашиты под длинный рынок

`liquidate.ts:136` `formatUnits(expectedProfit, 6)`, `:160` `formatUnits(seized, 18)` и `repaid, 6`, `:169` `formatUnits(c.debt, 6)`. На шортовых рынках залог — 6-значный USDG, а долг и прибыль — 18-значная акция, то есть все четыре числа перепутаны местами и уезжают на 10¹² в обе стороны. Дежурный читает «ликвидировал на 0.000000000112 USDG».

---

## ОПРОВЕРГНУТЫЕ ГИПОТЕЗЫ

**D1. «Инверсия 1e72/p ломает масштаб на шортах с 6-значным залогом и 18-значным займом».** Неправда, масштаб **точный до последней цифры**. `test_inverseOracleScalingIsExactOnChain` — PASS против живых оракулов:
```
NVDA  long  230236650000000000000000000
NVDA  short 4343357150132266083614402832911267602269230376 == 1e36*1e36 // long   (то же для TSLA)
100 USDG → 0.271459821883266630 NVDA → обратно 62 499 999 raw USDG (цель 62 500 000)
```
Работает это тождественно, а не по совпадению: `price_long = P·10^(dLoan−dColl)·1e36` и `price_short = (1/P)·10^(dColl−dLoan)·1e36`, произведение всегда 1e72 — decimals сокращаются сами. Недобор в 1 raw-единицу из 62.5e6 — обычный floor, и он в сторону протокола. `CreateMarkets.s.sol:139-146` строит внутренний оракул с `base = loanDecimals, quote = collateralDecimals`, что для шорта даёт правильный «длинный» порядок; комментарий там про «10^24» верен.

**D2. «Lens расходится с тем, что реально сделает Morpho».** Неправда. `test_lensLiquidatableAgreesWithMorphoAtTheBoundary` — PASS против настоящего Morpho `0x9D53d5E3…1010` на форке: ровно на границе Lens говорит «здоров» и `MORPHO.liquidate` откатывается; в ту же секунду, когда Lens переворачивается (HF `999999999652531428`), Morpho ликвидацию принимает. Направления округления в `Lens.sol` все правильные — долг `toAssetsUp` (89-92), стоимость залога `mulDivDown`, HF `wDivDown`, `liquidationPrice` `mulDivUp`, начисление процентов и fee-shares один в один с `accrueInterest`. **Ни одного округления в пользу заёмщика я не нашёл.**

**D3. «Проверка `received < assets` (`FlashLiquidator.sol:116`) отъедает прибыль при завышенном flashAmount».** При текущей параметризации кипера — недостижима: `minAmountOut` (0.92·seizedValue) всегда выше `flashAmount` (0.8964·seizedValue при 62.5 %), так что роутер откатится раньше, чем сработает `NoProfit`. Ликвидатор при этом не может уйти в минус в принципе — он либо не выполняется, либо выполняется в плюс; убыток всегда падает на вкладчиков Morpho как плохой долг, а не на владельца.

**D4. «Глубины пулов не хватит, чтобы пробить 8 %-ный пол свопа».** Неправда на текущих размерах. In-range глубина против изъятия при полном срабатывании кэпа: PONS $15.9M против $2 214, CASHCAT $233k против $443, HIMS $49.5M против $221, SPCX $122M против $885. Суммарные издержки свопа 0.05–1.10 % против разрешённых 8 %.

**D5. «Масштаб TwapOracle сломан при обратном порядке токенов / переполняется».** Неправда: `ratioX128` — уже сырое `token1/token0`, decimals вшиты в тик, обе ветки на строках 72-74 дают корректный 1e36. Переполнения `sqrtPriceX96²` на реальных тиках нет (NVDA-пул: 2.7e67 при пределе 1.16e77) — и оно всё равно откатило бы, а не соврало.

---

## ОБЩАЯ ОЦЕНКА БЛОКА

Ончейн-математика хорошая. Оракулы масштабированы верно во всех трёх формах, включая шорты; Lens совпадает с Morpho на границе с точностью до вея; все направления округления играют за вкладчика. Периферия действительно ничего не держит между транзакциями, и это честно закрывает целый класс дыр.

Слабое место — не контракты, а **шов между контрактами и кипером**, и именно там лежат все четыре денежных находки. Кипер — единственный, кто реально приходит ликвидировать, и у него три независимых константы (0.92, 1.01, 1e6) плюс один лукап, которые вместе тихо выключают ликвидацию на ETH и SGOV, обесценивают газовый порог на шортах и уводят своп в неотслеживаемый пул. Ни одна из них не видна из тестов контрактов, потому что контракты в этих сценариях просто не вызываются.

Отдельно — F1: это единственная находка, где страдающая сторона ничего не может сделать. Окно TWAP выбрано правильно (1800 s), но носитель этого окна — кольцевой буфер на 300–360 слотов на сети со стослойными миллисекундными блоками, и он физически в 50 раз короче того, что от него требуют. На $50 в волте сегодня цена всего этого ≈ 0; чинить надо до того, как цифра станет другой, потому что LLTV и оракул рынка в Morpho неизменяемы — HIMS/PONS/CASHCAT придётся пересоздавать, а не править.

Порядок работ по цене ошибки: **F1 → F2 → F4 → F3 → F5**.

Мои тесты: `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/fork/EconProofs.fork.t.sol` (6 тестов: 4 падают как доказательства, 2 проходят как контроли). Запуск: `forge test --match-path 'test/fork/EconProofs.fork.t.sol' --fork-url "$ROBINHOOD_RPC_URL" -vv`. Продакшн-код не тронут; дефолтный `forge test` не затронут.

---

## Agent 7 (`a9c3b9fae505dec60`)

# ВРАЖДЕБНАЯ ПРОВЕРКА — роль «Безопасность»

Я воспроизвёл все proof-тесты (`cd contracts && forge test --match-path 'test/unit/SecurityProofs.t.sol' --skip 'Operability.proof.t.sol'`): **6 passed, 1 failed** — ровно та картина, которую заявляет автор. Механику каждой находки я перепроверил независимо от его тестов. Ни один файл не тронут, транзакций не отправлял, значений секретов не печатал.

---

## F1 — «нет собственного ценового пола в FlashLiquidator» → **ПОДТВЕРЖДЕНА (механизм) / ЗАВЫШЕНА (цена, 4.4×)**

**Что устояло.** `p.marketParams.oracle` действительно проносится через структуру и не читается ни разу — единственная проверка это `received < assets` (`FlashLiquidator.sol:116`), и обе стороны сравнения приходят от одного и того же вызывающего. Комментарий на `:35-36` («a keeper key that leaks cannot steal») ложен. Сломать это я не смог.

**Что развалилось — числа.** Базовая линия «честно 500 USDG, украдено 495» — артефакт мока. `test/mocks/Mocks.sol:150`: `repayPerCollateral = 50e6`, то есть в моке изъятие коллатерала на $100 гасит долг на $50 — премия ликвидатора 100%. Реальный Morpho считает `repaid = seizedValue / LIF`; при LLTV 0.625 LIF = 1.1268, значит потолок увода = `repaid·(LIF−1)` = **11.25% от стоимости изъятого**, а не 50%. Ассерт `assertLt(..., honestProfit / 50, "99% of the liquidation bonus is gone")` в любом живом рынке недостижим: увести можно 100% премии, которая в 4.4 раза меньше нарисованной. Проза находки (12.68%) верна — её собственный тест ей противоречит.

**Второе завышение — ярлык.** Я вывел границу заново: контракт между транзакциями пуст (`sweep` + выметание профита), поэтому `morpho.liquidate` не может дёрнуть `repaid > assets`, откуда `received ≥ assets ≥ repaid`. Депозиты вкладчиков и коллатерал заёмщика недостижимы, bad debt не возникает. Это **перехват выручки владельца**, а не утечка средств из контракта. В рубрике «что теряет деньги» это другая полка.

**Чего находка не установила.** Путь «без компрометации ключа» (сэндвич честного вызова в окне 8%) требует публичного мемпула. В `docs/chain-facts.md` про мемпул/секвенсер нет ничего, в репозитории тоже. На чейне с одним секвенсером и приватным мемпулом сторонний сэндвич недостижим, и F1 схлопывается до «скомпрометированный keeper» — роль, которую владелец выдаёт сам. Это решающая переменная, и она не проверена ни автором, ни мной.

Итог: правка на 15 строк оправдана, но обосновывать её надо словами находки, а не её тестом.

---

## F2 — «LeverageRouter отдаёт застрявший баланс любому» → **ПОДТВЕРЖДЕНА как факт / ЗАВЫШЕНА как находка**

Тест воспроизводится, механика реальна.

**Возражение 1 — экспозиция ровно ноль, и не случайно.** Я прошёл оба пути: `_open` заканчивается на балансе 0 (`_sweep(loan, …, assets)`, затем Morpho забирает `assets`), `_close` так же, коллатерал выметается с `keep = 0`. Пыль не накапливается. Ничто в репозитории не переводит средства на роутер — интерфейс даёт ему `approve`, а не `transfer`. Предусловие находки — чужая ошибка перевода на адрес, который ни один экран не предлагает как получателя.

**Возражение 2 — предложенный фикс бьёт по лучшему свойству блока.** «Добавить owner и rescue» противоречит ровно тому, что сам автор хвалит в разделе опровержений: у LeverageRouter нет привилегированной роли вообще, поэтому отзыв авторизации в Morpho достаточен, чтобы его выключить. Owner — это новый ключ, за который стоит охотиться, в контракте, где сейчас охотиться не за чем. Вторая половина фикса (сweep по дельте) корректна, но меняет исход с «деньги достались случайному пользователю» на «деньги замурованы навсегда» — для потерпевшего это не улучшение.

**Не отмечено автором:** у FlashLiquidator `sweep(address) onlyOwner` есть (`:130`). Асимметрия — следствие сознательной безвладельцевости, а не недосмотр.

---

## F3 — «redact() — no-op для 32 байт» → **ПОДТВЕРЖДЕНА (мёртвый код) / ОПРОВЕРГНУТА (стоимость), фикс ВРЕДЕН**

Тернарник `env.ts:81` действительно возвращает `m` в обеих ветках. Дальше находка не выдерживает трёх проверок.

1. **Проверка проведена не над тем ключом.** В `.env` лежат `ROBINHOOD_RPC_URL, ALCHEMY_RPC_URL, PRIVATE_KEY, DEPLOYER, OWNER, KEEPER`. `KEEPER_PK` там нет вообще. `PRIVATE_KEY`, который автор «прогнал через redact()», — это деплой-ключ shell-скриптов; он никогда не попадает в `apps/keeper` и никогда не вызывает `redact()`. Утверждение верно и не относится к делу.
2. **Пути от ключа к логу не существует.** grep по `apps/keeper/src` на `KEEPER_PK|privateKey` даёт `env.ts:65-66` и один комментарий. Значение не интерполируется ни в одну строку.
3. **Даже рабочий redact не помог бы.** `env.ts:66` — модульная область: бросок `privateKeyToAccount` убивает процесс до `main()` и печатается Node напрямую, мимо `log()`.

**И фикс ломает то, ради чего keeper вообще пишет в Telegram.** Единственные 64-hex строки, которые keeper печатает, — это хеши транзакций (`scores.ts:53`, `alert("scores:"+hash, "Published … "+hash)`) и id рынков (`borrowers.ts:110`). Замена на `0x<redacted:32b>` вырежет хеш из единственного алерта, который стоит читать. Мёртвый тернарник — след, а не дыра; включать его в предложенном виде нельзя.

Что остаётся живым: покрытие вендоров (`/v3/`, QuickNode, `?apiKey=`) — честная латентная заметка. Telegram-токен в URL на `alerts.ts:20` в лог не попадает: `.catch(e => log("telegram failed", e))` печатает `e.message`, а у undici при сбое это `"fetch failed"` без URL.

---

## F4 — «скрипты печатают ключ RPC и кладут ключ в argv» → **URL-половина ОПРОВЕРГНУТА / argv-половина ПОДТВЕРЖДЕНА и ЗАВЫШЕНА**

**URL.** Механику я воспроизвёл сам: `cast base-fee --rpc-url https://…/v2/FAKE_KEY_ABC123` печатает `Error: error sending request for url (…FAKE_KEY_ABC123)`, и `grep -E "…|Error"` это пропускает. Но **ключа в этом URL нет**: `borrow.sh:13` и `canary.sh:37` — `"${CANARY_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"`, публичная нода без ключа, и `canary.sh:30-36` отдельным абзацем объясняет, почему отправки идут именно туда, а не на архивный план. `CANARY_RPC_URL` в `.env` отсутствует. Чтобы находка стала верной, оператор должен подставить ключевой URL вопреки собственному комментарию репозитория; это не показано.

**argv.** Верно и проверки не требует: `borrow.sh:38,48`, `close.sh:43,50,57`, `canary.sh:52,88`, `deploy-safe.sh:49`. Отдельно попадание: `borrow.sh:31` утверждает «The key is read here and never crosses a shell prompt» — он пересекает argv, что хуже промпта. Это тот же жанр «комментарий вместо механизма», что F1 и F2.

**Но цена.** Угроза — локальный процесс на односоставной машине владельца, читающий `ps` те несколько секунд, пока идёт `cast send`. Это не та модель угроз, которую владелец уже принял, согласившись на Safe 1-of-1. Гигиена (keystore + `--account`) — да; находка про потерю денег — нет.

---

## F5 — «keeper доверяет индексеру» → **ПОДТВЕРЖДЕНА, и ЗАНИЖЕНА: выбрана дорогая атака, пропущена дешёвая**

Механика подтверждена чтением: `borrowers.ts:117-130` → `known` → `scanHealth` итерирует **все** ключи `known` (`liquidate.ts:44`) → `getMarketParams` резолвит любой id через permissionless `idToMarketParams`. Фильтра по `MARKETS` нет нигде. Отсутствие кражи я вывел заново и согласен: увести нельзя, потому что USDG должен прийти из пула, который атакующий сам и наполнил, плюс `simulateContract` на `:120`.

**Поправка не в пользу находки.** `saveState()` на индексерном пути недостижим — `refreshBorrowers:67` возвращается раньше. Значит инъектированные строки **не переживают рестарт**: DoS транзиентный, восстановление дешевле, чем следует из формулировки. Основной цикл сериализован (`index.ts:63-66`), проходы не наслаиваются — тут автор прав.

**Поправка в пользу находки, и она весит больше всего остального в отчёте.** `borrowers.ts:67`:

```ts
if (PONDER_URL && (await fromIndexer())) return known;
```

Когда `PONDER_URL` задан и индексер ответил 200, keeper **вообще не читает логи Morpho**. Фолбэк срабатывает только на `!r.ok` или исключение — никогда на «ответил 200 и соврал». Индексер, который просто отстал, переиндексируется или вернул `[]` после реорга, оставляет keeper смотрящим в пустоту: он напечатает «0 open positions» и не поднимет ни одного алерта. Это прямо противоречит доккоменту той же функции на `:52-54` — «the keeper must not depend on it… so it falls back to reading Morpho's own logs». Инъекция требует компрометации индексера; это требует лишь, чтобы индексер был кратко неправ — то есть нормального состояния индексера. Тот же файл, те же три строки, вероятность несопоставимо выше, финал тот же: подводная позиция, которую никто не ликвидировал.

Фикс лучше предложенного: сканирование логов оставить безусловным, индексер считать дополнительным источником, и уже поверх этого — фильтр членства в `MARKETS` + `isAddress`.

---

## Раздел опровержений автора

Все три теста прогнал — проходят, механику проверил, **согласен полностью**: пин `msg.sender` в обоих колбэках, пин `onBehalf` на обоих входах роутера, все `forceApprove` в immutable-адреса, keeper-гейт держит. Утверждение «секрет никогда не коммитился» перепроверил независимо: 37 коммитов, 1418 уникальных путей, из `.env*` в истории только `.env.example`.

---

## Итоговая таблица

| | Вердикт | Что именно не устояло |
|---|---|---|
| F1 | ПОДТВЕРЖДЕНА / ЗАВЫШЕНА 4.4× | базовая линия proof-теста — артефакт `repayPerCollateral = 50e6`; это перехват выручки, не утечка средств; публичность мемпула не установлена |
| F2 | ПОДТВЕРЖДЕНА / ЗАВЫШЕНА | системная экспозиция ноль; предложенный owner-фикс ломает главное свойство контракта |
| F3 | ПОДТВЕРЖДЕНА как мёртвый код / ОПРОВЕРГНУТА по цене | проверен не тот ключ; пути от `KEEPER_PK` в лог нет; фикс вырезает хеши из алертов |
| F4 | URL — ОПРОВЕРГНУТА, argv — ПОДТВЕРЖДЕНА / ЗАВЫШЕНА | в скриптах публичная нода без ключа, и это сознательно; argv — гигиена, не потеря денег |
| F5 | ПОДТВЕРЖДЕНА / **ЗАНИЖЕНА** | инъекция не переживает рестарт; зато пропущен `borrowers.ts:67` — индексер как единственная точка отказа ликвидаций |

**Что я бы чинил в этом порядке:** `borrowers.ts:67` (безусловный лог-скан) → ценовой пол в `onMorphoFlashLoan` из `p.marketParams.oracle` → фильтр `MARKETS`/`isAddress` → keystore вместо argv. F2 и F3 — в бэклог, F3 в предложенной редакции отклонить.

---

## Agent 8 (`acb5c38f37303edfa`)

## АРХИТЕКТУРА — враждебная проверка

Все контр-доказательства в одном новом файле, только тесты: `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/ArchRefutation.t.sol` (7 тестов, зелёные, `forge test --match-path 'test/unit/ArchRefutation.t.sol'`). Семантика обратная авторской: у меня `test_refute_*` passing = утверждение автора **опровергнуто**; `test_narrow_*` / `test_confirm_*` = утверждение выживает, но в суженном виде. Оригинальные 8 тестов автора я перезапустил — они зелёные, я их не трогал.

---

### 1. Пыль залога роняет Lens → кипер слепнет. **ПОДТВЕРЖДЕНА (импакт), ЗАВЫШЕНА (механизм)**

Панік воспроизводится, амплификация проверена по коду и держится: `scanHealth` (`apps/keeper/src/liquidate.ts:41-71`) обходит **все** рынки в одном `for`, реджект любого `Promise.all` роняет `scanHealth` → `liquidationPass` → `safely()` (`index.ts:33-41`) только логирует. Алерт `would-liquidate` стоит **после** этой точки, так что молчание настоящее. `borrowers.ts:17` персистит множество — отравление переживает рестарт. Всё верно.

Опровергается **описание достижимости**. Автор пишет «обнуляется при малом `collateral`… для 6-десятичного залога это совершенно нормальная позиция». Окно — не диапазон, а одно-два сырых юнита: `collateral.wMulDown(lltv) == 0` ⟺ `collateral < 1e18/lltv`, то есть при `lltv 0.625` (а `LLTV.short` в `packages/config/src/index.ts:239` именно 0.625) ровно `collateral == 1`. `test_narrow_lensPanicWindowIsOneOrTwoRawUnits` — окно {1} для 0.86/0.77/0.625 и {1,2} для 0.385.

И это **не про 6 десятичных**: `test_confirm_dustPanicIsNotSpecificToShortMarkets` — 1 wei 18-десятичной NVDA при `borrowShares > 0` панікует так же. Шорт-рынок меняет не наличие бага, а способ *попасть* в состояние: там 1 сырой юнит ещё несёт заёмную способность, поэтому позицию можно создать напрямую, а не ждать остатка после ликвидации. Формулировка «периферия молча предполагает 18-десятичный залог» неверна — предположение о десятичных тут ни при чём.

Цена не завышена: 1 микро-USDG + газ действительно выключают ликвидации по всем 17 рынкам. **Находка остаётся первой по стоимости.** Фикс верный.

### 2. Кипер никогда не ликвидирует ETH и SGOV. **ПОДТВЕРЖДЕНА**

Реплика формул точная (`liquidate.ts:16-19, 96-100`), порог `LIF ≤ 1.01/0.92` арифметически верен, LIF(0.86)=1.0438 и LIF(0.77)=1.0741 под ним. Проверил, что молчание настоящее: `alert("would-liquidate")` на строке 141 — после `return` на строке 102. По каталогу (`packages/config/src/index.ts:284,290`) ETH — cap $5000, крупнейший; SGOV — $2000.

Единственное смягчение, и его автор не назвал: докстринг `FlashLiquidator.sol:26-29` явно объявляет, что контракт не единственный ликвидатор и рынок клирится без него. Это осознанный запас, а не отсутствующий. Но он ничего не говорит о молчании кипера, и на новом чейне сторонних ликвидаторов ждать неоткуда. Находка стоит.

### 3. `received < assets` привязывает прибыль к размеру займа. **ПОДТВЕРЖДЕНА как дефект кода, ОПРОВЕРГНУТА как риск**

Инвариант разобран верно: солвентность — `balance ≥ assets` ⟺ `received ≥ repaid`, и в `LeverageRouter._close:152` то же выражение корректно, потому что `morpho.repay` уже вытянул `assets`. Всё так.

Но ветка **недостижима из единственного вызывающего**. Гард кипера (`liquidate.ts:100`) — это ровно `minAmountOut <= flashAmount`. Значит на любом рынке, где кипер *не* пропускает, `minAmountOut > flashAmount == assets`, а своп ревертится ниже `minAmountOut`. Следовательно `received ≥ minAmountOut > assets` всегда. `testFuzz_refute_noProfitBranchIsUnreachableFromTheKeeper` (256 прогонов, lltv 0.30–0.98) и e2e `test_refute_keeperSizedLiquidationNeverHitsNoProfit`, где пул платит **ровно пол** — ликвидация проходит, владелец получает деньги.

Тест автора достигает `NoProfit` только тем, что подаёт `flashAmount` в 3× больше нужного, чего кипер не делает никогда (он берёт ×1.01). Соседний `ProofLogic.t.sol:70` падает по той же причине — там oracle price выставлен так, что `minAmountOut` кипера был бы 9.2e18, а тест подаёт 502e6.

Главное: **находки 2 и 3 — одно неравенство с двух сторон, они взаимно исключают друг друга.** Именно предложенный автором фикс №2 (сделать допуск проскальзывания функцией LLTV) впервые делает №3 достижимой. Это не «две находки», это «фиксить надо в правильном порядке» — и в отчёте это не сказано.

Последствие в любом случае — реверт, не потеря денег.

### 4. Lens отдаёт Market, в котором Morpho быть не может. **ПОДТВЕРЖДЕНА (узко), механизм «charged twice» ОПРОВЕРГНУТ**

Morpho в `_accrueInterest` сам читает `borrowRate(marketParams, market)` с **ещё не сдвинутым** `lastUpdate` и только потом пишет его. Lens делает то же самое, поэтому начисленный долг бит-в-бит равен морфовскому: `test_refute_lensAccruesExactlyWhatMorphoWouldAccrue` — на том же elapsed-чувствительном IRM, что и у автора, `v.state.totalBorrowAssets == tBorrow + morphoInterest`, и `v.borrowRatePerSecond == morphoRate`, то есть ставка **та же самая, а не удвоенная**. Проценты один раз, не два.

Настоящий дефект уже — второй вызов `borrowRateView` в `marketView:60` на уже начисленной структуре: публикуемая APY оказывается скользящим средним за простой, а не форвардной ставкой. Это число экрана, не число денег, и у `AdaptiveCurveIrm` с его медленной адаптацией расхождение на типичном elapsed микроскопическое. Формулировка «окно засчитывается второй раз» описывает начисление процентов, которого нет. Фикс правильный, приоритет — косметика.

Про `uint128(interest)` без `.toUint128()` — верно и недостижимо, согласен с самим автором.

### 5. `previewBorrow` возвращает протухшие поля. **ПОДТВЕРЖДЕНА, ЗАВЫШЕНА**

`safeBorrowAssets` и `supplyAssets` действительно не перезаписываются. Но `previewBorrow` **не вызывается ниоткуда**: единственное вхождение во всём репозитории — сгенерированный ABI, `packages/abi/src/lens.ts:383`. Ни `apps/web`, ни `apps/mcp`, ни `packages/sdk`, ни кипер её не читают. «Число, ради которого экран депозита существует» этим экраном не читается — `apps/web/src/lib/position-math.ts` считает всё сам во float. Мёртвая ветка внешнего API.

### 6. Долг разошёлся между Lens и SDK. **ПОДТВЕРЖДЕНА, СИЛЬНО ЗАВЫШЕНА**

Комментарий на `packages/sdk/src/reads.ts:71` действительно утверждает обратное коду — это настоящий дефект и фикс на одно слово. Но `toAssetsUp` и `toAssetsDown` — потолок и пол одной дроби: расхождение 0 или 1 сырой юнит при любых входах. `testFuzz_refute_sdkDebtGapIsAtMostOneWei` (fuzz по shares/totalAssets/totalShares). «Портфель и MCP показывают долг меньше, чем возьмёт Morpho» — меньше на 1e-6 USDG. Для `repayAll` веб и так ходит по долям, так что и туда это не течёт.

### 7. `close()` не может закрыть позицию. **ВЫВОД ПОДТВЕРЖДЁН, МЕХАНИЗМ ОПРОВЕРГНУТ**

Единственная находка без доказательства — и единственная, где механизм перевёрнут. Автор: «`shares = assets.toSharesDown(...)` — вниз, — значит остаток долей остаётся всегда». Наоборот: долг в assets получен из долей округлением **вверх** (`toAssetsUp`), обратный ход округляет вниз уже от него, и сгорает **больше** долей, чем есть.

`test_refute_closeWithFullDebtRevertsRatherThanLeavingDust`: держит 1 234 567 890 123 долей, полный долг в assets сжигает 1 234 568 000 000 — на 109 877 больше. `position.borrowShares -= shares` уходит в underflow.

То есть докстринг `LeverageRouter.sol:55` («Pass the full debt in assets to close the position outright») не оставляет пыль — он **ревертит**. Пыль появляется только если подать *меньше* полного долга. Вывод — закрыть по assets нельзя — стоит, и предложенный `repayShares` + `exactlyOneZero` правильный, но обоснование в отчёте описывает не то поведение, которое произойдёт на мейннете.

### 8. `TwapOracle` overflow. **ПОДТВЕРЖДЕНА как латентная, оценена корректно**

`(sqrtPriceX96 * sqrtPriceX96) >> 64` на `TwapOracle.sol:71`, порог тика ≈443 636 — арифметика верна. Отдельно в пользу находки: строкой ниже автор контракта сам применяет `Math.mulDiv` «чтобы сохранить 512-битный промежуток» — приём известен и пропущен на одну строку выше. Каталог подтверждает три живых TWAP-рынка (HIMS/PONS/CASHCAT, `INDEX` blocked). Автор отчёта сам назвал это недостижимым сегодня и не завысил.

### 9. `CreateMarkets` inverse + min. **Первая половина ОПРОВЕРГНУТА, вторая ПОДТВЕРЖДЕНА и ЗАВЫШЕНА**

Сценарий «кто-то поставит короткому рынку `oracleKind: "chainlinkTwapMin"` → min станет max» **не конструируется из этого кода**. Ветки в `_deployOracle` взаимно исключающие: `chainlinkTwapMin` вернёт голый `MinOracle`, построенный «в длинную сторону», без всякой инверсии — шорт-рынок получит цену не с той стороны и не того порядка, что сломается громко и сразу, а не тихо. Чтобы получить `InverseOracle(MinOracle(...))`, ветку надо сначала дописать. Плюс `chainlinkTwapMin` не использует **ни один** из 17 рынков (12 chainlink, 4 twap, 2 inverse) — `MinOracle` сегодня мёртв. `require`, который предлагается добавить, запрещает комбинацию, которую нельзя выразить.

Вторая половина фактически верна: у двух SHORT-рынков нет TWAP-ноги. И направление рассуждения правильное — для инвертированной стороны консервативно `min(shortFeed, shortTwap) = 1/max(longFeed, longTwap)`, то есть нужен `MaxOracle` до инверсии. Но залог там — USDG, стейбл, и «защита от выходного гэпа» относится к заёмному активу, а не к залогу; называть это «именно они лишены обязательной защиты» — натяжка. Осмысленное предложение на будущее, не находка в блоке.

---

### Итог по приоритетам

Из девяти пунктов **денежными сегодня остаются два** — 1 и 2, и здесь я с автором согласен полностью, включая порядок. №3 — настоящий дефект кода с недостижимой веткой, и его правильное место в отчёте — не «третья находка», а **предусловие фикса №2**: пока гард кипера стоит, `NoProfit` мёртв; как только допуск станет функцией LLTV, он оживёт. №7 сохраняет вывод, но должен быть переписан — на мейннете это реверт, а не тихая пыль. №4, 5, 6 — реальные, но косметические: удвоения процентов нет, у `previewBorrow` нет потребителей, расхождение долга ограничено одним wei. №9 в заявленном виде не воспроизводится.

Тезис отчёта — «ломается не в контрактах, а на швах» — проверку выдерживает: пять из семи подтверждённых пунктов действительно про один инвариант, списанный в два модуля. Но два самых громких шва оказались не тем, чем названы: `received < assets` — не разошедшийся инвариант, а инвариант, который держит гард в другом репозитории; а `_accrued` без `lastUpdate` — не расхождение с Morpho, а точное его повторение.

---

## Agent 9 (`a58db4d138b9388a2`)

## Вердикты по 10 находкам

Прогнал `forge test`, воспроизвёл оба proof-теста, перепроверил каждый `file:line`, сделал read-only `cast call` к мейннету и локально воспроизвёл формат ошибки viem.

**Сразу о статусе дерева.** Заявление отчёта «52 passed, 0 failed, 3 skipped» не соответствует текущему состоянию: `forge test --match-path 'test/unit/*'` → **64 теста, 60 passed, 4 failed**. Падают файлы других ревьюеров (`ProofLogic.t.sol` ×2, `ProofLogic2.t.sol`, `SecurityProofs.t.sol`). Сам `Operability.proof.t.sol` — 2 passed, 0 failed. Цифра в отчёте либо снята до появления чужих файлов, либо не снималась.

---

### 1. Systemd хоронит кипера — **НЕ ВОСПРОИЗВОДИМА / ВНЕ БЛОКА**
`grep -rn "StartLimit\|Restart=\|OnFailure\|systemd"` по всему репозиторию (кроме node_modules/.git) → **ноль совпадений**. `grep "178.236.248.22"` → ноль. Юнита в репозитории нет, хост мне недоступен. Механика systemd описана верно (`StartLimitBurst=5`/`StartLimitIntervalSec=300` действительно оставляет юнит в `failed` до `reset-failed`), но это утверждение о чужой машине, а блок под ревизией объявлен как `contracts/src`. Считать доказанным нельзя — только со слов.

### 2. Провал ликвидации не алертит — **ПОДТВЕРЖДЕНА**, с поправкой в механизме
Все три ссылки верны: `liquidate.ts:130` только `log`, `index.ts:40` только `log`, алерт есть только на успехе (`liquidate.ts:158`) и в watch-only (`:141`).
Поправка: причина молчания при HF<1 — **не** `|| c.healthFactor < WAD` на строке 166. `index.ts:26-30` маршрутизирует HF<1 в `tryLiquidate`, а `warnIfClose` при HF<1 вообще не вызывается — условие на 166 мёртвое, а не действующее. Результат тот же, объяснение в отчёте неточное.
Смягчение: `watchdog.ts:42-44` **уже** алертит `oracle-dead:${key}`, так что подслучай «оракул не отвечает» покрыт. Непокрыты: реверт свопа, пустой пул, провал отправки транзакции.

### 3. `.split("\n")[0]` съедает имя кастомной ошибки — **ПОДТВЕРЖДЕНА**, но **фикс в отчёте неверен**
Воспроизвёл локально на закреплённой версии (viem@2.56.3, `apps/keeper/node_modules/viem`):
```
=== FULL e.message ===
The contract function "liquidate" reverted.

Error: NotKeeper()
...
=== что логирует кипер: e.message.split('\n')[0] ===
"The contract function \"liquidate\" reverted."
=== shortMessage ===
"The contract function \"liquidate\" reverted."
```
`e.shortMessage` **байт в байт равен** первой строке — предложенный фикс не даёт ничего. Работает только обход `e.cause` до `ContractFunctionRevertedError.data.errorName`/`.args`, либо логирование всего `e.message`.

### 4. `FlashLiquidator.sol:116` сравнивает с флеш-займом — **ПОДТВЕРЖДЕНА как дефект, ЗАВЫШЕНА как «капкан», ЗАНИЖЕНА по цене**
Тест `test_proof_noProfitRejectsASolventProfitableLiquidation` воспроизведён, проходит. Инвариант платёжеспособности — `received >= repaid`, и сам контракт на строке 119 считает прибыль как `balanceOf - assets = received - repaid`, то есть **противоречит собственной проверке на 116**. Дефект реален.

Недостижимость подтверждаю арифметикой, а не только ссылкой на строку 102:
`minAmountOut/flashAmount = 0.92·LIF/1.01`, а своп гарантирует `received >= minAmountOut`. При LLTV 62.5% это 1.0266 — проверка на 116 никогда не связывает. Реверта в проде быть не может; контракт fail-safe (теряет прибыль, не деньги).

**Но цена занижена в другую сторону.** Из того же неравенства: гейт `minAmountOut > flashAmount` выполняется только при `LIF > 1.098`, то есть при **LLTV < 70.24%**. Значит `liquidate.ts:102` сегодня, на мейннете, безусловно скипает:
- **SGOV, LLTV 86%**: LIF=1.0438 → 0.92·1.0438=0.960 < 1.01 → skip
- **ETH, LLTV 77%**: LIF=1.0741 → 0.92·1.0741=0.988 < 1.01 → skip

Кипер **никогда** не ликвидирует два из 17 рынков, включая единственный T-bill. Это тот же корень (конфликт «сколько занять» и «сколько должен взять своп»), но следствие несравнимо дороже латентного капкана, и в отчёте его нет. Независимо подтверждается уже лежащим в дереве `ArchProofs.t.sol::test_proof_keeperSkipsEveryLiquidationOnHighLltvMarkets` (PASS).

### 5. Мёртвый оракул ослепляет батч — **механизм ПОДТВЕРЖДЁН, но ДОКАЗАН НЕ ТОТ; цена ОПРОВЕРГНУТА**
Тест проходит, но доказывает он `Lens.marketViews` / `Lens.healthFactors`, а `grep -rn "marketViews\|healthFactors" apps packages --include="*.ts"` находит их **только в `packages/abi/src/lens.ts`** — определение ABI. Ни кипер, ни SDK, ни сайт их не вызывают. Доказательство направлено в неиспользуемый код.

Настоящий путь другой и в отчёте назван верно только в прозе: `liquidate.ts:44-58` — цикл по `watch` без `try/catch` + `Promise.all` по `userView`; один реверт роняет `scanHealth` целиком, `safely` ловит на верхнем уровне и пишет строку в лог. Плюс `borrowers.ts` даёт смягчение, которого в отчёте нет: `if (users.size === 0) continue` — рынок без заёмщиков вообще не читается, так что оракул должен умереть **после** того, как на рынке появился долг.

Цена **опровергнута**: `packages/config/src/index.ts:289` — у INDEX `status: "blocked"`, и его **нет среди 17 задеплоенных** (`deployments.markets`, строки 483-499). Рынка с мёртвым оракулом на мейннете сегодня не существует. Утверждение «у вас в конфиге уже есть такой рынок» верно буквально и ложно по смыслу — конфиг помечает его как незапущенный именно по этой причине.

### 6. LeverageRouter без owner/pause — **ПОДТВЕРЖДЕНА фактически, ЗАВЫШЕНА по цене**
Факт проверен: `cast call 0xBF6cdE3F772cB3939dFCc313AA4E83C3452bab6B "owner()"` → `execution reverted`. Grep по `LeverageRouter.sol` пуст.
Цена завышена по трём пунктам:
- Kill switch есть и **задокументирован как проектное решение** (шапка, строки 21-23): `setAuthorization(router,false)` полностью отключает контракт для пользователя. Это per-user, но это не «нечем остановить».
- `_sweep(..., p.onBehalf, ...)` не отдаёт баланс «постороннему»: `open`/`close` требуют `p.onBehalf == msg.sender` (строки 77, 87). Это «случайный донат забирает первый легитимный пользователь», а не утечка чужих средств.
- Добавить `Ownable2Step` + `sweep()` на контракт, который по инварианту ничего не держит между транзакциями, — значит добавить поверхность атаки и доверенную роль там, где их сознательно нет. Из предложенного осмысленна только `bool paused`.

### 7. Watchdog не видит weekend-gap — **ОПРОВЕРГНУТА по цене**
`MinOracle.sol:17-22` описывает ровно этот сценарий и **решает его конструкцией**: фиду разрешено быть старым, живая нога — TWAP, который не закрывается, и `min()` тянет цену залога вниз, как только DEX двинулся. Проверка возраста фида ничего не предотвращает: если пул стоит вместе с фидом — гэпа ещё нет; как только пул двинулся — TWAP уже переоценил залог без всякого алерта. Предложенный фикс не связан с заявленной ценой.
Подтверждаю только фактическую часть: `grep -rn "readFeed\|ageSeconds\|updatedAt" apps/keeper/src/` → пусто, телеметрии по возрасту фида нет. Это отсутствующая диагностика, не защита.

### 8. Газ не мониторится — **ПОДТВЕРЖДЕНА в части кода**
`grep -rn "getBalance" apps/keeper/src/` → пусто. Порога нет, `scorePass` идёт через `safely` → только `log` (`index.ts:60`, `scores.ts`). Журнальная часть (00:29:23 / 00:30:44, остатки на ключах) — с удалённого хоста, не воспроизводима отсюда.

### 9. Vault без guardian/curator — **ПОДТВЕРЖДЕНА и ЗАНИЖЕНА**
On-chain, read-only, подтверждено полностью:
```
guardian()      0x0000000000000000000000000000000000000000
curator()       0x0000000000000000000000000000000000000000
timelock()      86400
owner()         0x90a82053b9012b6ea2D95f88ee81da969d4D8A85
getThreshold()  1
getOwners()     [0x9C5C4b4A985b0A60a1067a0d82020774661d074A]
```
Рассуждение про `onlyGuardianRole` верно: при `guardian == 0` отозвать собственный `submitCap`/`submitTimelock` внутри 24-часового окна может ровно тот ключ, который его подал.

**Занижено вот в чём.** Единственный владелец Safe — `0x9C5C4b4A…` — это ровно тот `DEPLOYER`, про который `.env` самого проекта пишет: *«HOT KEY, was shared in plaintext. Use for deploy only. Never make it a Safe owner; hand every ownership to the Safe after deploy.»* Собственное записанное правило проекта нарушено: ключ, объявленный горячим и раскрытым, стал единственным владельцем Safe, который владеет хранилищем, `FlashLiquidator` и `CreditRegistry`. Объявленное «Safe is 1-of-1, the owner knows» покрывает единственность подписи, но не покрывает того, что подпись стоит на ключе, помеченном как скомпрометированный раскрытием. Это выше по цене, чем отсутствующий guardian.

### 10. TwapOracle не зовёт observe в конструкторе — **ОПРОВЕРГНУТА по цене**
Буквально верно: конструктор (36-54) не делает ни одного `observe`. Но заявленный исход — «рынок Morpho создан и мёртв навсегда» — недостижим по документированному пути деплоя:
```solidity
// contracts/script/CreateMarkets.s.sol:84-85
uint256 price = IOracle(params.oracle).price();
require(price > 0, string.concat("oracle returned 0 for ", key));
...
morpho.createMarket(params);   // :95
```
`price()` вызывается **до** `createMarket`. Оракул над пулом с `cardinality = 1` ревертит здесь, скрипт падает, рынок не создаётся. Именно поэтому INDEX и стоит `blocked`. Проверка в конструкторе продублировала бы уже существующую — вреда нет, цены тоже.

---

## Чего в отчёте нет, а стоило: сжатие кольца наблюдений

Это правильная версия находки 10, и она живая. Данные с мейннета, read-only:

| | window | pool cardinality | текущий разброс кольца |
|---|---|---|---|
| PONS `0x1E5c7F…7dF8` | 1800 s | 300 | 5234 s |
| CASHCAT `0xC343BC…20b3` | 1800 s | 360 | — |
| HIMS `0x13Ed96…57Cd` | 1800 s | 360 | — |

Uniswap v3 пишет **не более одной observation на блок**. Значит 300 слотов покрывают максимум 300 блоков, в которых пул трогали. При ~214 ms блоках `observe([1800,0])` реверт `OLD`, как только пул трогают чаще, чем **раз в 6 секунд** на протяжении получаса — порядка 300 свопов при gasPrice 0.42 gwei. Запас сегодня — 2.9×, не порядок.

Последствие складывается ровно с находкой 5 и стоит денег:
1. `TwapOracle.price()` ревертит → Morpho `liquidate`, `borrow`, `withdrawCollateral` на PONS/CASHCAT/HIMS мертвы, пока идёт спам;
2. `scanHealth` ловит реверт на `userView` этого рынка → `Promise.all` реджектится → падает **весь** проход ликвидации → остальные 16 рынков не проверяются;
3. `safely` пишет одну строку в лог, алерта нет (находка 2).

То есть заёмщик под водой на TWAP-рынке может за свои деньги купить себе окно неликвидируемости и заодно ослепить кипера по всем рынкам. Здесь достижимость доказана состоянием мейннета, а не мысленным экспериментом.

---

## Итог

| # | Вердикт |
|---|---|
| 1 | не воспроизводима (удалённый хост, вне блока); механика systemd верна |
| 2 | **подтверждена**; объяснение через строку 166 неточно, `oracle-dead` уже покрыт watchdog'ом |
| 3 | **подтверждена** (воспроизведено); **предложенный фикс не работает** |
| 4 | подтверждена как дефект, **завышена** как риск, **занижена** по цене: SGOV и ETH не ликвидируются никогда |
| 5 | механизм подтверждён, **доказан не тот код** (Lens-батч мёртв), **цена опровергнута** (INDEX не задеплоен) |
| 6 | факт подтверждён, **цена завышена**: kill switch есть и задокументирован, `_sweep` чужому не отдаёт |
| 7 | **опровергнута** — MinOracle решает этот сценарий по конструкции; остаётся только отсутствие телеметрии |
| 8 | подтверждена в части кода, журнальная часть не проверяема |
| 9 | **подтверждена on-chain и занижена**: единственный владелец Safe — ключ, который `.env` запрещает делать владельцем |
| 10 | **опровергнута по цене** (`CreateMarkets.s.sol:84`); настоящая версия — сжатие кольца, выше |

Переставленный порядок работ по фактической цене: **4-как-скип-высоких-LLTV** → **кольцо+5** → **9 (ключ Safe)** → **3** → **2** → остальное. Находки 7 и 10 в текущем виде чинить не нужно; 6 — только `paused`.

Production-код не тронут, ни одной транзакции не отправлено. Файл с доказательствами ревьюера: `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/Operability.proof.t.sol` (2 passed).

---

## Agent 10 (`ab78235974d7b171c`)

# ВРАЖДЕБНАЯ ПРОВЕРКА ОТЧЁТА «ИНЖЕНЕРИЯ»

Контр-доказательства: `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/EngRefutation.t.sol` — 5 тестов, все зелёные (включая фаззер 256 прогонов). Production-код не тронут: `git diff --quiet -- contracts/src` → чисто. Оригинальные 39 unit-тестов и 4 теста автора отчёта воспроизведены зелёными.

---

## F1. «NoProfit меряет не прибыль» — **ЗАВЫШЕНА**

Механизм верен: `FlashLiquidator.sol:116` сравнивает `received` с `assets` (flashAmount), а экономически достаточно `received ≥ repaid`. Тест автора воспроизводится.

Но путь недостижим, и не по совпадению.

`test_refute_keeperSizingPutsTheSwapFloorAboveTheFlashAmountOnEveryTierItSends` — кипер отправляет транзакцию только когда `minAmountOut > flashAmount` (`liquidate.ts:102`). Это ровно то условие, при котором `NoProfit` не может сработать: роутер требует `received ≥ minAmountOut`, значит `received > flashAmount = assets`. Ворота кипера и охранник контракта — одно и то же неравенство, а не две случайно совместившиеся ошибки. Утверждение отчёта «F1 и F2 маскируют друг друга… это совпадение» опровергнуто: это одна инвариантная связь.

`test_refute_worstAllowedSwapUnderKeeperSizingStillClearsNoProfit` — точные числа кипера (lltv 62.5%, repaid ≈ 887.5, flashAmount ≈ 896.4, minAmountOut = 920), пул платит **ровно пол**, ни вэя больше. Ликвидация проходит, owner получает 32.5 USDG. `NoProfit` не бьёт даже в худшем допустимом исполнении.

`test_refute_theProofsScenarioIsRejectedByTheSwapFloorNotByNoProfit` — тройка из proof-теста (repaid 500 / пул платит 502 / flashAmount 505) кипером не производится: для repaid = 500 его пол равен ≈ 518.3, то есть пул на 11% ниже оракула. Такая ликвидация ревертится `TooLittleReceived` — намеренным «не продавать в сдвинутый пул», — и предложенный фикс `received < repaid` её бы **не** пропустил. Сценарий «позиция остаётся под водой из-за NoProfit» не воспроизводится ни на одном тире.

Что остаётся: строка действительно слабее, чем должна быть, режим отказа — реверт (деньги не утекают), и она бьёт только вручную собранный вызов с завышенным `flashAmount`. Это чистота, а не потеря денег.

## F2. «Кипер никогда не ликвидирует SGOV и ETH» — **ПОДТВЕРЖДЕНА для ETH, опорный аргумент ОПРОВЕРГНУТ**

Арифметика воспроизведена в первом тесте: ворота ложны при lltv 0.86 и 0.77 при любой цене и любом здоровье позиции, истинны при 0.625 и 0.385. Выход через `log`, не `alert` (`liquidate.ts:103`) — тишина читается как «нечего делать». Это подтверждается.

Но опорное утверждение — «два самых консервативных рынка, и ровно те, где есть капы и ликвидность» — **ложно**. `contracts/script/CreateVault.s.sol:43-45` ставит капы на NVDA (2 000), SPY (2 000), ETH (5 000). **SGOV капа не имеет вовсе** — это рынок из категории «нет ликвидности намеренно», и отсутствие автоликвидации на нём стоит ноль. Материальна ровно половина находки: ETH, cap 5 000 USDG, при том что в хранилище сейчас $50.

Вторая поправка: на этих тирах стимул (4.4% / 7.4%) действительно меньше допуска 8%, то есть при реально случившемся 8%-проскальзывании ликвидация была бы убыточной. Кипер не «отказывается от прибыли» — он отказывается рисковать больше, чем стоит стимул. Дефект не в самом отказе, а в том, что допуск — константа, не зависящая от глубины пула, и что отказ не алертит.

## F3. «SDK округляет долг вниз» — **ЗАВЫШЕНА** (расхождение подтверждено, цена опровергнута)

Факт верен: `Lens.sol:92` → `toAssetsUp`, `packages/sdk/src/reads.ts:72-74` → `toAssetsDown` под комментарием, обещающим обратное. Комментарий надо чинить.

Цена — нет.

`testFuzz_refute_lensAndSdkDebtDifferByAtMostOneUnit` (256 прогонов по всему диапазону shares/assets): расхождение **всегда ≤ 1 единицы loan-токена**, то есть 0.000001 USDG. Это не «пыль, из-за которой нельзя вывести коллатерал».

И заявленный путь ущерба не существует. `debtOf` кормит только read-only поверхности — `apps/web/src/lib/portfolio.ts:63` (страница портфеля) и `apps/mcp/src/markets.ts:125`. Транзакционный путь его не трогает: `apps/web/src/components/position-panel.tsx:79-85` считает долг **своей** формулой с округлением ВВЕРХ, а `repayAll` (`:203-228`) репеит **по shares**, не по assets, с комментарием на `:198-202`, объясняющим ровно ту опасность, которую отчёт вменяет сайту. «Repay all, посчитанный сайтом, недоплачивает» — фактически неверно.

Остаётся настоящее, но другое: `portfolio.ts` и `mcp` показывают долг без накопленных процентов, а дублирующая математика в TS уже разошлась с Solidity. Это дефект дублирования, не денежный.

## F4. «TwapOracle не защищает верхнюю границу» — **ЗАВЫШЕНА**

Арифметика верна и тест воспроизводится: `TwapOracle.sol:68` — проверяемое умножение, `TickMath` пропускает тик до 887 272, паника на 443 637.

Достижимость нулевая, и отчёт это признаёт — но всё равно ставит находкой. Проверил независимо по адресам: USDG `0x5fc5…`, из четырёх twap-коллатералов только HIMS `0xCceE…` старше USDG, то есть единственный, где USDG — token0. Порог требует цену HIMS ≤ 5.5·10⁻⁸ USDG при текущих ≈ $30 — падение в 5·10⁸ раз. PONS `0x39dB…`, CASHCAT `0x020b…`, INDEX `0x5691…` — все token0, их тик отрицателен, у них переполнения нет ни при какой цене. Вдобавок все четыре twap-рынка в каталоге имеют статус `planned`/`blocked` и капа не имеют.

Это заметка на будущий листинг, а не находка в блоке под ревизией.

## F5. «`_accrued` не двигает `lastUpdate`» — **ЗАВЫШЕНА, и отчёт себе противоречит**

Факт верен, тест воспроизводится.

Заявленная цена — «отображаемый APY». Но `lastUpdate` в неверном виде выходит наружу **только** через `MarketView.state`, а F7 того же отчёта доказывает, что `marketView`/`marketViews` не вызывает ни один потребитель: сайт считает ставки сам (`packages/sdk/src/reads.ts:46`), кипер зовёт только `userView`. Значит цена не «APY», а ноль. Две находки одного отчёта не могут быть верны одновременно в том виде, в каком написаны.

`test_refute_staleLastUpdateDoesNotMoveAnyUserViewNumber`: `userView` — единственная функция Lens, которую кто-либо зовёт, — не содержит ни поля с часами, ни ставки; при 30-дневном простое она даёт долг и HF, посчитанные корректно, и ошибается против заёмщика (консервативная сторона). Ни одно число, на котором кто-то действует, стрелой не задето.

## F6. Мутационное тестирование — **ПОДТВЕРЖДЕНА, заголовок завышен**

Выживание проверил структурно, не запуская мутации (мутировать `src` запрещено), и оно подтверждается по конструкции тестов:

- **M3** (снять `NoProfit`) — в предсуществующих 39 тестах селектор `NoProfit` не встречается ни разу; `test_revertsWhenSwapOutputIsBelowTheFloor` (`FlashLiquidator.t.sol:89`) ждёт `MockRouter.TooLittleReceived`, то есть пол мока. Выживает. **Это главный выживший, и он настоящий.**
- **M8** (снять `SwapShortfall`) — unit-тестов `LeverageRouter` не существует вовсе, только fork. Выживает.
- **M4** — `MockV3Pool.setMeanTick` (`Mocks.sol:76-80`) ставит `cumulativeStart = 0, cumulativeEnd = tick·window`, поэтому `delta % window ≡ 0` и ветка `TwapOracle.sol:95` недостижима в принципе. Претензия к моку верна.
- **M2** — `fee: 0` во всех фикстурах `Lens.t.sol` (единственное вхождение `fee:` — строка 45). Fee-путь мёртв.
- **M1** — фикстура даёт `toAssetsUp == toAssetsDown` точно (проверил вручную: 4·10²⁵ + 10¹⁵ делится на 4·10¹⁶ + 10⁶ нацело). Мутант невидим.
- **M7** — `assertApproxEqRel(…, 0.0001e18)` не различает 1 вэй. **M5** — ветка `lltv ≤ safeMargin` требует аргумента, которого ни один потребитель не передаёт.

Заголовок «8 из 12 выжили» надувает счёт: M1, M5, M7 — мутанты ценой ≤ 1 вэя или в ветке, управляемой вызывающим, и они «выживают» примерно так же, как выживает мутация комментария. Реально несут вес M3 и M8 — единственные два места, где периферия охраняет деньги. Вывод отчёта («тесты направлены не туда») верен, метрика для него подобрана лестно.

## F7. Мёртвый код и ложные doc-комментарии — **ПОДТВЕРЖДЕНА**

Проверено грепом по всему репо: `healthFactors`, `previewBorrow`, `marketViews`, `MinOracle.prices()`, `TwapOracle.meanTick()`, `MathLib.wDivUp/min/max`, `SharesMath.toSharesUp` — ноль вызовов вне тестов. Кипер (`liquidate.ts:48-58`) действительно делает N отдельных `userView` под комментарием «the keeper's hot path» на неиспользуемой батч-функции. Warning 8760 на `TwapOracle.sol:64` воспроизводится на каждой сборке — это единственный solc-warning в `src` (форджевый линтер даёт ещё три, но это другой класс).

Добавлю к находке: `MinOracle` не задеплоен ни на одном рынке — в каталоге (`packages/config/src/index.ts:285-297`) встречаются только `chainlink`, `twap`, `inverse`; `chainlinkTwapMin` не использован ни разу. Мёртв не метод `prices()`, а весь контракт.

## F8. Мелочи

- **`_sweep(…, 0)` отдаёт весь баланс** — **ПОДТВЕРЖДЕНА**, класс «донат/пыль», не путь потери средств протокола.
- **`CloseParams` без `repayShares`** — механизм **ПОДТВЕРЖДЁН**, доказательство **ОПРОВЕРГНУТО**. Отчёт утверждает, что fork-тест «закрепляет остаток как ожидаемое: `assertGt(collateral, 0)`». Это неверное прочтение: в `test/fork/Leverage.fork.t.sol:114-131` продаётся `toSell`, заведомо меньший `p.collateral` (проверено на строке 115), и `assertGt` относится к **непроданному коллатералу в позиции**. Про долг тот же тест говорит `assertEq(closed.borrowAssets, 0, "debt should be gone")` — в одном блоке долг гасится нацело, потому что Lens округляет вверх, а `toSharesDown` от округлённого вверх значения даёт shares ≥ позиции. Проблема real только при задержке между котировкой и майнингом, и переплатить нельзя (Morpho ревертит на underflow). Плюс `close()` пока не подключён в UI — это будущий баг, не сегодняшний.
- **Дублирование `isAuthorized`** — **ПОДТВЕРЖДЕНА** как стилистика: Morpho проверит то же внутри `borrow`/`withdrawCollateral`, ранняя проверка даёт лучший revert. Не дефект.

## Раздел «Опровергнутые гипотезы» отчёта

Возражений нет. Проверил #2 независимо: `CreateMarkets.s.sol:131-146` строит short как `InverseOracle(_chainlinkOracleWithDecimals(…))`, `MinOracle` в цепочку не входит — самоопровержение корректно. #1 арифметически верно (`hf < 1e18 ⟺ maxBorrow < borrowed`, та же композиция `mulDivDown → wMulDown`).

---

## ИТОГ

| Находка | Вердикт |
|---|---|
| F1 NoProfit | **ЗАВЫШЕНА** — механизм верен, путь недостижим (доказано 3 тестами), режим отказа — реверт |
| F2 SGOV/ETH skip | **ПОДТВЕРЖДЕНА для ETH**; для SGOV опорный факт о капах ложен |
| F3 debtOf | **ЗАВЫШЕНА** — расхождение ≤ 1 вэя (фаззер), транзакционный путь репеит по shares |
| F4 TwapOracle overflow | **ЗАВЫШЕНА** — достижимость нулевая, рынки не задеплоены |
| F5 lastUpdate | **ЗАВЫШЕНА** — потребителей `marketView` нет, цена нулевая; противоречит F7 |
| F6 мутации | **ПОДТВЕРЖДЕНА**, счёт 8/12 надут; вес несут M3 и M8 |
| F7 мёртвый код | **ПОДТВЕРЖДЕНА**, дополнена: `MinOracle` не задеплоен целиком |
| F8 close/sweep/auth | механизмы **ПОДТВЕРЖДЕНЫ**, доказательство по fork-тесту **ОПРОВЕРГНУТО** |

Что выживает после враждебной проверки как реальный дефект: **M3/M8 — два экономических охранника без единого теста**, **ETH без автоликвидации при живом капе 5 000 USDG и без алерта на skip**, и **дублированная TS/Solidity математика, которая уже разошлась**. Остальное — чистота кода и неверные doc-комментарии; денег в блоке сегодня не теряется, и, в отличие от вывода отчёта, не по совпадению.

---

## Agent 11 (`a7ef315aec81b52b5`)

## ВЕРДИКТЫ ПО НАХОДКАМ РОЛИ «ЛОГИКА»

Все четыре находки воспроизведены на моей машине (unit — `forge test`, fork — `--fork-url robinhood`). Продакшн-код не трогал: `git status --short contracts/src` пуст. Базовый прогон — 76 passed, падают только намеренные proof-тесты панели.

Мои контр-тесты:
- `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/unit/RefuteLogic.t.sol` — 4 PASS
- `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/fork/RefuteLeverageClose.fork.t.sol` — 2 PASS

---

### L1. `close()` не закрывает позицию до нуля — **ПОДТВЕРЖДЕНА по механизму, ЗАВЫШЕНА по формулировке и цене**

Воспроизвёл все четыре: residual `borrowShares = 1000000` / debt = 1, `insufficient collateral` на полном выводе, `panic 0x11` на over-repay, stranded `8686714301` wei NVDA.

Что опровергается:

**Заголовок «не может закрыть до нуля» категорически неверен.** `test_refute_closeZeroesTheDebtInTheSameBlock` — **PASS**: котировка и `close()` в одном блоке дают `borrowShares = 0`, коллатерал `939518066839674265` целиком выводим. Дефект — в устаревании котировки, а не в assets-репее как таковом. Верной остаётся только оговорка из тела находки («если прошёл хоть один блок»), а не формулировка «никогда» из заголовка.

**«Позиция навсегда висит» — неверно.** `test_refute_priceOfTheResidue` — **PASS**, и он же оценивает ставку:

| величина | значение |
|---|---|
| остаточный долг | **1** wei USDG (1e-6 $) |
| коллатерал, запертый LLTV за этим долгом | 6 949 371 440 wei NVDA |
| его стоимость | **1** wei USDG ≈ $0.000001 |
| health factor остатка | 1.35e8 (не ликвидируем никогда) |

Выход не «единственный через прямой repay мимо роутера» в смысле обходного манёвра — это штатный вызов Morpho со своего же ключа, который SDK уже экспортирует (`packages/sdk/src/tx.ts:43-45`, `repay({shares})`). Позиция принадлежит пользователю, Morpho permissionless. Утверждение «выход есть только через…» верно буквально, но подано как безвыходность, которой нет.

**Что остаётся и стоит правки:** `panic 0x11` без единого слова о причине в ответ на самое естественное действие интегратора («дам запас»), плюс NatSpec на `LeverageRouter.sol:54`, который прямо предписывает делать то, что приводит к пыли. Это дефект API, а не потеря денег. Фикс (поле `repayShares` в `CloseParams`) корректен и его стоит внести до появления кнопки close в UI. Приоритет — «до релиза UI», не «сегодня».

---

### L2(a). Гейт прибыли написан против `flashAmount` — **дефект ПОДТВЕРЖДЁН, последствие ОПРОВЕРГНУТО**

`test_proof_profitableLiquidationRevertsOnFlashMargin` воспроизводится: `NoProfit(502000000, 505000000)`. Механизм верен, `repaid` действительно лежит в переменной рядом и в проверке не участвует.

**Но путь недостижим, и не «случайно», а по явному охраннику в кипере.** `apps/keeper/src/liquidate.ts:101`: `if (minAmountOut <= flashAmount) { skip }`. Значит на всём, что кипер вообще отправляет, выполняется `received ≥ minAmountOut > flashAmount == assets` — гейт не может быть связывающей проверкой ни при каком исходе свопа.

`test_refute_keeperSizedLiquidationNeverTouchesTheGate` — **PASS**, на точных формулах кипера (LLTV 62.5%, LIF 1.12676):

```
flashAmount   448187500   (1.010 · repaid)
minAmountOut  460000000   (1.0366 · repaid)   ← на 2.6% ВЫШЕ займа
owner profit   16252220   при худшем свопе, который кипер вообще пошлёт
```

Гейт начинает связывать только если маржа флеш-займа превысит `0.92·LIF − 1 = 3.666%`. Кипер ставит 1%. Запас 2.67 п.п.

**Утверждение «пропущенные ликвидации ровно в момент обвала» неверно даже гипотетически.** Когда цена уезжает, первым срабатывает не гейт, а `amountOutMinimum` внутри Uniswap — транзакция ревертит в свопе, до строки `:116`. Гейт не может отменить ликвидацию, которую своп пропустил.

**И направление ошибки безопасное.** Гейт строго консервативнее необходимого. Ранжировать его «главным» неверно: это liveness-дефект без достижимого пути и с fail-safe направлением.

---

### L2(b). Посторонний баланс финансирует убыточную ликвидацию — **ЗАВЫШЕНА**

Воспроизвёл: владелец получает 350 вместо 400. Механизм реален. Три причины снизить цену:

**1. Настоящий инвариант уже обеспечен конструкцией, а не гейтом.** `test_refute_lossMakingLiquidationRevertsWithoutADonation` — **PASS**. На пустом контракте баланс после колбэка = `assets − repaid + received`, и Morpho после колбэка вытягивает `assets`; значит `received ≥ repaid` — необходимое условие того, что транзакция вообще завершится. Убыточная ликвидация с пустого контракта ревертит сама, независимо от гейта. То есть предложенный фикс `received < repaid` — это hardening донат-кейса, а не починка сломанного инварианта.

**2. Убыток строго ограничен размером доната.** `test_refute_strayLossIsCappedByTheStrayBalance` — **PASS**: убыток 450 против 400 донированных → revert, донат остаётся нетронутым. Дальше доната контракт потерять не может.

**3. Тратятся деньги владельца его же ключом.** `test_refute_strangerCannotTriggerTheLossPath` — **PASS** (`NotKeeper`). А сам донат владельцу и так принадлежит: `sweep()` (`:135`) отдал бы его ему. Итог: «владелец может сжечь часть чужого подарка, задав себе заведомо неверный `flashAmount`». Это не утечка стоимости из протокола.

---

### L3. `previewBorrow` возвращает устаревший `safeBorrowAssets` — **ПОДТВЕРЖДЕНА как дефект, ЗАВЫШЕНА как последствие; и это дубль**

Воспроизвёл: `collateralValue 2314600000`, `maxBorrowAssets 1446625000`, `safeBorrowAssets 0`.

**Заявленное последствие («число в UI/SDK, которое противоречит соседнему полю») не существует.** Полный grep по репозиторию: `previewBorrow` не вызывается ни из `apps/web`, ни из `apps/keeper`, ни из `apps/indexer`, ни из `apps/mcp`, ни из `packages/sdk`. Единственные упоминания — `packages/abi/src/lens.ts:383` (сгенерённый ABI) и тесты. Ни один пользователь этого числа не видит.

Добавлю: `previewBorrow` зовёт `userView(params, user, 0)`, то есть при `safeMarginWad = 0` поле `safeBorrowAssets` тождественно равно `maxBorrowAssets` доTX-позиции. Это не «наполовину пересчитанная безопасность», а буквальный дубликат старого максимума. Цена = 0.

Плюс: ту же находку сдала роль «Архитектура» — `contracts/test/unit/ArchProofs.t.sol:206`, `test_proof_previewBorrowLeavesSafeBorrowDescribingTheOldPosition`. При синтезе не считать за две.

---

### L4. `Lens._accrued` возвращает наполовину обновлённое состояние — **ПОДТВЕРЖДЕНА по расхождению, ОПРОВЕРГНУТА по трактовке**

Воспроизвёл: `lens 211243243` против `morpho 211241788`, `lastUpdate 1788570210` при `block.timestamp 1789175010`. Расхождение 0.00069%.

**Ассерт «Lens must publish the rate Morpho will use» — это предпочтение ревьюера, а не спецификация.** Morpho в `_accrueInterest` берёт ставку от сырого стейта потому, что проценты в этот момент ещё не начислены. Ставка, которую надо показывать в UI, — это ставка на утилизации *после* pending-процентов, то есть ровно то, что считает `Lens.sol:64`. Какое из двух чисел «правильное», тест не доказывает, он это постулирует. Предложенный фикс («брать ставку от сырого `morpho.market(id)`») сделает Lens не точнее, а просто согласнее с внутренней механикой Morpho.

**Ключевое: денежная часть начисления корректна.** `Lens.sol:166` считает `interest` от **сырого** `m` до его мутации — точно как Morpho. Значит `borrowAssets`, `healthFactorWad`, `liquidationPrice` — числа, на которые смотрит кипер, — воспроизводят транзакцию верно. Дефект не касается ни одной величины, влияющей на деньги.

**Заявленный «настоящий риск» (двойное начисление потребителем) не имеет носителя.** Проверил: `apps/indexer/src/snapshot.ts:60-95` собирает `state` из сырого `morpho.market()` и его же скармливает IRM — `Lens.marketView` он не читает вовсе. `packages/sdk/src/reads.ts:33-58` делает то же. Ни один потребитель `MarketView.state` не существует.

Остаётся честная мелочь: комментарий `Lens.sol:30` «with pending interest applied» не соответствует полю `lastUpdate` в возвращаемой структуре. Одна строка `m.lastUpdate = uint128(block.timestamp)` — правка комментарийного долга, не бага.

---

## КОРРЕКТИРОВКИ К МЕЛОЧАМ

**`reads.ts:73 debtOf` — находка НЕДООЦЕНЕНА, а не переоценена.** Ревьюер назвал это «расхождением в 1 wei». На деле у `debtOf` два потребителя — `apps/web/src/lib/portfolio.ts:63` и `apps/mcp/src/markets.ts:125` — и оба передают в него `getMarketState`, то есть **сырой, неначисленный** стейт. Портфельная страница считает и долг, и health factor, и цену ликвидации мимо Lens, по состоянию на последнее касание рынка. Ошибка не 1 wei, а весь интервал pending-процентов, и в оптимистичную сторону (долг занижен → HF завышен). Это ровно тот класс «Lens спорит с транзакцией», который просили ловить, — только Lens тут вообще не участвует. Вне ревьюируемого блока, но приоритет выше, чем у L3 и L4.

**Более крупный однокоренной дефект, который ревьюер прошёл мимо.** Гоняясь за гейтом на стороне контракта, он не проверил охранника на стороне вызывающего. `liquidate.ts:99-101`: `minAmountOut = 0.92·seized·price`, `flashAmount = 1.01·repaid`, и `skip`, если `minAmountOut ≤ flashAmount`. Условие «кипер вообще отправит транзакцию» — `0.92·LIF > 1.01`:

| рынок | LLTV | LIF | minOut/repaid | вердикт |
|---|---|---|---|---|
| SGOV | 86% | 1.04384 | 0.96033 | **SKIP — кипер не ликвидирует никогда** |
| ETH | 77% | 1.07411 | 0.98818 | **SKIP — кипер не ликвидирует никогда** |
| акции и шорты | 62.5% | 1.12676 | 1.03662 | работает |
| long-tail | 38.5% | 1.15000 | 1.05800 | работает |

На двух самых высоко-LLTV рынках `FlashLiquidator` не вызывается ни при каком состоянии позиции — кипер молча логирует «swap floor below the flash loan — nothing to gain» и идёт дальше. ETH при этом имеет наибольший `supplyCapUsd` в каталоге (`packages/config/src/index.ts:284`, 5000). Это реальный, достижимый liveness-провал того же семейства («маржа займа против пола свопа»), в отличие от L2(a).

**Остальные мелочи подтверждаю как описано и как оценено:** отсутствие owner/sweep у `LeverageRouter` (`:131-132`, `:162-163` — донат уносит следующий вызывающий; это обратная сторона свойства «не держит ничего», цена нулевая); зависимость `close()` от свободного баланса Morpho (свойство флеш-займа, замечание про немое сообщение об ошибке справедливо); отсутствие `receive()` (ничтожно).

---

## ОПРОВЕРГНУТЫЕ ГИПОТЕЗЫ РЕВЬЮЕРА — ПРОВЕРКА

Прогнал сам: `test_proof_noDanglingAllowanceAfterLiquidation` — **PASS**, `test_proof_leverageLeavesNoAllowance` (fork) — **PASS**. Аллованс-гигиена подтверждается.

Алгебру по `liquidatable` проверил и подтверждаю без теста: `hf = floor(maxBorrow·1e18 / borrowed) < 1e18 ⟺ maxBorrow < borrowed`, что тождественно отрицанию `Morpho._isHealthy` (`maxBorrow >= borrowed`) при той же цепочке `mulDivDown → wMulDown` и `toAssetsUp`. Граница включительно совпадает. Отказ ревьюера писать тест здесь обоснован.

Проверку `msg.sender == morpho` в обоих колбэках и невозможность подать чужой `data` подтверждаю: Morpho вызывает `onMorphoFlashLoan` только на инициаторе `flashLoan`, а инициатор в `LeverageRouter` — только `open`/`close`, обе с `onBehalf == msg.sender`.

---

## ИТОГОВОЕ РАНЖИРОВАНИЕ ПОСЛЕ ВРАЖДЕБНОГО ПРОХОДА

1. **L1** — единственная находка, которую я оставляю к правке в блоке. Механизм доказан, цена — не деньги, а невозможность построить кнопку close без `panic 0x11`. Фикс верный, срок — до релиза UI.
2. **(вне блока) `debtOf` на сыром стейте в портфеле и MCP** — единственное место, где число, которое видит пользователь, систематически оптимистичнее реальности.
3. **(вне блока) охранник кипера на SGOV/ETH** — достижимый liveness-провал, в отличие от L2(a).
4. **L2** — обе половины: (a) недостижима и fail-safe, (b) ограничена донатом владельца и заперта за `onlyKeeper`. Фикс `received < repaid` разумен как уборка, приоритета не имеет.
5. **L3, L4** — комментарийный и структурный долг без потребителей. L3 к тому же дубль находки роли «Архитектура».

Общая оценка блока ревьюером («ни один путь, где деньги утекают наружу, не найден») моей проверкой подтверждается. Слабое место сформулировано верно — важные величины берутся не оттуда, где они точны, — но в обоих случаях цена ошибки оказалась ниже заявленной: в `close()` это единицы wei и отсутствующая кнопка, в ликвидаторе — путь, который вызывающий код не проходит по построению.

---

## Agent 12 (`a3767d0f88f69c2fe`)

## ВЕРДИКТЫ

Все 4 падающих теста из `EconProofs.fork.t.sol` воспроизведены (2 контроля прошли). Дальше — что осталось от находок после проверки достижимости, цены и экспозиции.

**Мои файлы:** `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/fork/EconRefute.fork.t.sol` (6 замеров, все PASS) и `/Users/maksudnasibov/projects/solprojects/Cluby/contracts/test/fork/EconRefuteRing.fork.t.sol` (1 тест, PASS). Продакшн не тронут; оба скипаются без RPC, дефолтный `forge test` не изменился (4 падения в нём — из чужого `test/unit/SecurityProofs.t.sol`).

---

### F1 (заморозка TWAP) — **ЗАВЫШЕНА**. Механизм есть, но арифметика ошиблась в 10 раз, фикс неверен, экспозиция выдумана, и 2 из 3 «доказательств» — тавтологии.

**1. Кольцо крутится раз в СЕКУНДУ, а не раз в блок.** Uniswap v3 `Oracle.write` дедуплицирует по `uint32(block.timestamp)`, не по номеру блока. Доказано против живого пула HIMS — `test_ringAdvancesOncePerSecondNotOncePerBlock` PASS:
```
start index 52
after swap 1: index 53                              tick moved true
after swap 2 (new block, same second): index 53     tick moved again true   ← кольцо НЕ сдвинулось
after swap 3 (new second): index 54
```
Два тик-двигающих свопа в двух разных блоках одной секунды сдвинули кольцо на один слот. Значит нужно `cardinality >= window` = **1800**, а не 18000; блок-рейт (0.1 s против «~214 ms» в самом `env.ts:26`) вообще не входит в формулу. «Физически в 50 раз короче» → в 5 раз (HIMS/CASHCAT) и в 6 раз (PONS). Предложенный фикс `>= window / MIN_BLOCK_TIME (≥18000)` неправильный. Ассерт в самом тесте (`assertGe(cardinality, WINDOW)`) — правильный; неверна проза вокруг него.

**2. Рынки пересоздавать НЕ надо** — это прямо опровергает вывод находки. Кольцо живёт на пуле, а не на рынке, и `increaseObservationCardinalityNext` беспермишенный. `test_measure_cardinalityCanBeGrown` PASS: произвольный адрес (`makeAddr("anyone")`) вырастил кольцо HIMS 360 → 18000 за **392 288 948 газа** (22 238 газа/слот). До корректных 1800 слотов это 1440 слотов ≈ **32.0M газа ≈ $32** по газовым числам самой находки. Морфо при этом не трогается вообще.

**3. Экспозиция заявлена ложно.** `test_measure_marketExposure` против живого Morpho:
```
HIMS      supply 0  borrow 0  vaultCap 0  enabled false
PONS      supply 0  borrow 0  vaultCap 0  enabled false
CASHCAT   supply 0  borrow 0  vaultCap 0  enabled false
```
Волта `frontier-usdg` не существует — `deployments.vaults` содержит только `core-usdg` (`packages/config/src/index.ts:466`). «HIMS профинансирован волтом frontier-usdg» — неверно.

**4. Два из трёх proof-тестов ничего не доказывают.**
* `test_proof_observeSurvivesAWindowLongerThanTheBuffer` просит `span + 600` секунд назад, то есть заведомо за краем буфера. `OLD` там гарантирован конструкцией. Живой запас буфера: **HIMS 15 217 s, PONS 5 597 s, CASHCAT 42 824 s** против окна 1800 s — то есть 3.1×–23.8× головы. Тест — тавтология.
* `test_proof_twapMarketStaysLiquidatableWhenObserveIsUnavailable` держится на `vm.mockCallRevert`. «Оракул ревертит → Morpho ревертит» верно для любого оракула; это следствие, а не достижимость.

Находку несёт только первый тест: 360/300 < 1800.

**5. Цена атаки — измерена, и она обратна порядку находки.** По живым `liquidity` и `sqrtPriceX96` (стоимость LP-комиссии за один сдвиг тика × число слотов, которые надо перекрутить за 1800 s):

| пул | fee | cardinality | $/слот | $/окно 1800 s | $/час |
|---|---|---|---|---|---|
| HIMS | 3000 | 360 | 7.93 | 2 855 | ~5 710 |
| PONS | 10000 | 300 | 7.90 | 2 369 | ~4 738 |
| **CASHCAT** | 10000 | 360 | **0.090** | **32** | **~65** |

Дёшево замораживается CASHCAT (плановый кап $1 000), которого находка ставит последним; HIMS, с которого она начинает, — самый дорогой и с самым маленьким планом ($500).

**6. Частично намеренно.** `TwapOracle.sol:14-19` документирует ровно этот отказ: «если пул не несёт достаточно наблюдений, `observe` ревертит, и реверт — правильный ответ». Доктрина покрывает bootstrap-случай, не покрывает активную перекрутку — поэтому не ОПРОВЕРГНУТА, а ЗАВЫШЕНА.

**Что остаётся:** реальный дефект — `TwapOracle` не проверяет `observationCardinality >= window`, и на CASHCAT это дешёво эксплуатируется. Цена фикса $32 и один беспермишенный вызов. На первое место не тянет.

---

### F2 (кипер пропускает LLTV ≥ 70.297 %) — **ПОДТВЕРЖДЕНА**, самая сильная из пяти. Половина про SGOV — неверна.

Арифметика воспроизведена независимо от теста, порог зажат между 70.29 % и 70.30 %:
```
70.29%  LIF 1.0978515  flash 919978700  minOut 920000000  ACTS
70.30%  LIF 1.0978153  flash 920009000  minOut 920000000  SKIPS
77%     LIF 1.0741139  flash 940310000  minOut 920000000  SKIPS
86%     LIF 1.0438413  flash 967580000  minOut 920000000  SKIPS
```
Это единственная находка, которая не требует атакующего, не требует условий и уже сегодня выключает автоликвидацию на профинансированном рынке. ETH подтверждён на чейне: `vaultCap 5000000000, enabled true`. `tryLiquidate` — единственный автоматический путь ликвидации в кипере (`index.ts` не знает про pre-liquidation).

**Поправки:**
* **SGOV — ложь.** `SGOV vaultCap 0, enabled false, supply 0`. Волт его не финансирует; «cap $2 000» — это план из каталога, а не деплой.
* **«позиция уедет до плохого долга» — завышено.** Ликвидация в Morpho беспермишенная, LIF на 77 % = 1.0741 (бонус 7.41 % против ~0.05 % комиссии пула), и сам `FlashLiquidator` в доке говорит: «это не единственный ликвидатор… если он сломан или выключен, рынок всё равно расчищается». Провал кипера fail-safe (пропуск), а не fail-open.
* Реализованный убыток сегодня $0: `borrowAssets = 0` на всех 17 рынках.

---

### F3 (`MIN_PROFIT` занижен в 10¹²) — **ПОДТВЕРЖДЕНА как баг, ЗАВЫШЕНА как деньги.**

Цифры сходятся до последней: $0.10 долга → 11 561 888 604 617 wei NVDA = $0.0027; безубыток на $17.3. Единичный баг реален — `MIN_PROFIT = 1e6` против 18-значного loan-токена шорта.

**Но «чистый слив» не выдерживает:**
* Прибыль киперу не достаётся **никогда**: `FlashLiquidator.sol:121-122` метёт профит `owner()` (Safe). Кипер платит газ при любом размере позиции, не только на пыли — `MIN_PROFIT` это порог прибыли ПРОТОКОЛА, а не нетто кипера. Претензия «платит из своего кармана» относится ко всем ликвидациям сразу и не специфична для шортов.
* `MIN_PROFIT` переопределяется через env (`env.ts:33`).
* Оба шортовых рынка: `vaultCap 0, enabled false, supply 0, borrow 0`. Максимальный убыток — газ за попытку, $0.46. Чтобы потерять $100, нужно 217 пыльных ликвидаций.

Цена ошибки — центы, а не «слив». В порядке работ должна стоять последней, не четвёртой.

---

### F4 (тир пула по `collateralToken`) — **ПОДТВЕРЖДЕНА**, с одной фактической ошибкой и более мягким вредом.

Лукап проверен: USDG (`0x5fc5360D…1d168`) лежит в `tokens`, а `poolFeeOf` перебирает только `stocks` и `nativeTokens` → `return 500` (`liquidate.ts:21-26`). TSLA сконфигурирован на 3000. Расхождение реально.

Живая проверка через `factory.getPool` — и здесь находка ошиблась:
```
TSLA/USDG 100    0x7868622F…dA48   L 0
TSLA/USDG 500    0xc4f0172D…0236   L 169667743906710695   ← куда шлёт кипер
TSLA/USDG 3000   0xf4ACdAEE…89E3   L 812607299923301716   ← настроенный, 4.79×
TSLA/USDG 10000  0xB349FB08…888B   L 448914779050331      ← НЕ ноль
```
«Два из четырёх тиров стоят с нулевой ликвидностью» — неверно, пустой только тир 100.

**Вред мягче заявленного.** Если 500-тир пересохнет, `pub.simulateContract` (`liquidate.ts:123-131`) поймает реверт и залогирует «simulation reverted» — транзакция не уйдёт, газ не сгорит, плохого свопа не будет. `minAmountOut` продолжает защищать цену. То есть деградация — та же тихая неликвидация, что в F2, а не потеря на свопе. Плюс TSLA-SHORT: `vaultCap 0, enabled false, supply 0`.

---

### F5 (десятичные в алертах) — **ПОДТВЕРЖДЕНА**, ровно как заявлено.

`liquidate.ts:136,143` (`expectedProfit, 6`), `:160` (`seized, 18` и `repaid, 6`), `:169` (`c.debt, 6`). На шортах залог 6-значный, долг и прибыль 18-значные. Денег не теряет.

---

## ЧТО ПРОПУЩЕНО (смежное, подтверждает D3 только частично)

`FlashLiquidator.sol:116` — `if (received < assets) revert NoProfit(received, assets)`, где `assets == flashAmount == 1.01 × repaid`. Но Morpho вытягивает только `repaid`; остаток флэша (`flashAmount − repaid`) остаётся на балансе. Платёжеспособность требует `received >= repaid`, а гейт требует `received >= 1.01 × repaid`. Профит при этом посчитан правильно (`:121` даёт `received − repaid`). То есть ликвидация с `repaid <= received < 1.01·repaid` — прибыльная — ревертит.

D3 назвала этот путь недостижимым. Это верно **только при текущей параметризации кипера** и не является свойством контракта: чужой `test/unit/SecurityProofs.t.sol::test_proof_profitableLiquidationRevertsOnFlashMargin` падает с `NoProfit(502000000, 505000000)` — ровно этот случай, вызванный напрямую. Формулировку D3 надо сузить с «недостижима» до «недостижима через кипер».

---

## ИТОГОВЫЙ ПОРЯДОК ПО ЦЕНЕ ОШИБКИ

**F2 → F1(только CASHCAT) → F4 → F5 → F3.**

F2 поднимается на первое место: безусловна, не требует атакующего, бьёт по единственному рынку с реальным капом ($5 000 ETH), и чинится одной строкой. F1 падает со своего первого места — арифметика на порядок мимо, фикс неверен (кольцо растится беспермишенно за $32, пересоздание рынков не нужно), заявленное финансирование волтом не существует, и дешёвым оказался тот пул, который находка поставила последним. F3 уезжает в конец: максимальная реализуемая потеря — $0.46 за попытку, а прибыль киперу не идёт ни при каком пороге.

Общая оценка блока в исходном отчёте верна по существу — шов «контракты ↔ кипер» действительно слабое место, ончейн-математика действительно чистая (оба контроля, `test_lensLiquidatableAgreesWithMorphoAtTheBoundary` и `test_inverseOracleScalingIsExactOnChain`, воспроизведены как PASS). Но severity в отчёте построена на плановых капах из каталога, а не на задеплоенном состоянии: на чейне 14 из 17 рынков имеют `vaultCap 0, enabled false`, и `borrowAssets = 0` на всех 17.
