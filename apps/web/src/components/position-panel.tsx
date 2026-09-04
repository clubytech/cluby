"use client";

import { useState } from "react";
import { pct, usd } from "@/lib/format";
import { healthFactor, liquidationPrice, leveragePlan } from "@/lib/position-math";

type Props = {
  side: "long" | "short";
  subject: string;
  loanSymbol: string;
  price: number | null;
  lltv: number;
  safeLtv: number;
  maxLeverage: number;
  status: "listed" | "planned" | "blocked";
};

const tabs = ["Borrow", "Multiply"] as const;

export function PositionPanel(p: Props) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Borrow");
  const [collateral, setCollateral] = useState(1000);
  const [ltv, setLtv] = useState(Math.round(p.safeLtv * 100 * 0.6));
  const [leverage, setLeverage] = useState(2);

  const price = p.price ?? 0;
  const collateralValue = collateral;
  const debt = tab === "Borrow" ? collateralValue * (ltv / 100) : 0;

  const borrowHf = healthFactor(collateralValue, debt, p.lltv);
  const borrowLiq =
    price === 0 || collateral === 0 ? null : liquidationPrice(collateral / price, debt, p.lltv, price);

  const plan = leveragePlan(collateralValue, leverage, p.lltv);

  const disabled = p.status !== "listed";

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-[28px] border border-line bg-white p-6">
        <div className="flex rounded-full border border-line p-1">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-4 py-2 text-sm transition-colors ${
                tab === t ? "bg-bg-strong text-white" : "text-text-soft hover:text-text-strong"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-widest text-text-soft">
              {p.side === "long" ? `${p.subject} collateral, in USD` : "USDG posted, in USD"}
            </span>
            <input
              type="number"
              min={0}
              step={100}
              value={collateral}
              onChange={(e) => setCollateral(Math.max(0, Number(e.target.value)))}
              className="num rounded-2xl border border-line px-4 py-3 text-lg outline-none focus:border-brand"
            />
          </label>

          {tab === "Borrow" ? (
            <label className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-widest text-text-soft">Borrow at LTV</span>
                <span className="num text-sm">{ltv}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.round(p.safeLtv * 100)}
                value={ltv}
                onChange={(e) => setLtv(Number(e.target.value))}
                className="accent-brand"
              />
              <span className="text-xs text-text-soft">
                Capped at {pct(p.safeLtv, 1)} — a margin below the {pct(p.lltv, 1)} liquidation line.
              </span>
            </label>
          ) : (
            <label className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] uppercase tracking-widest text-text-soft">Leverage</span>
                <span className="num text-sm">{leverage.toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min={1}
                max={Math.max(1.1, Number(p.maxLeverage.toFixed(1)))}
                step={0.1}
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                className="accent-brand"
              />
              <span className="text-xs text-text-soft">
                One transaction: flash loan {p.loanSymbol}, swap into {p.subject}, supply, borrow, repay the
                flash loan.
              </span>
            </label>
          )}

          <div className="flex flex-col gap-3 rounded-2xl bg-bg-weak p-4 text-sm">
            {tab === "Borrow" ? (
              <>
                <Row label={`Debt in ${p.loanSymbol}`} value={usd(debt)} />
                <Row label="Health factor" value={borrowHf === null ? "—" : borrowHf.toFixed(2)} tone={hfTone(borrowHf)} />
                <Row
                  label={`${p.subject} liquidation price`}
                  value={borrowLiq === null ? "—" : `$${borrowLiq.toFixed(2)}`}
                />
                <Row
                  label="Room before liquidation"
                  value={borrowLiq === null || price === 0 ? "—" : pct(1 - borrowLiq / price, 1)}
                />
              </>
            ) : (
              <>
                <Row label="Exposure" value={usd(plan.exposure)} />
                <Row label={`Debt in ${p.loanSymbol}`} value={usd(plan.debt)} />
                <Row label="Resulting LTV" value={pct(plan.ltv, 1)} />
                <Row label="Health factor" value={plan.hf === null ? "—" : plan.hf.toFixed(2)} tone={hfTone(plan.hf)} />
                <Row
                  label={`${p.subject} liquidation price`}
                  value={price === 0 ? "—" : `$${(price * plan.liquidationDrop).toFixed(2)}`}
                />
              </>
            )}
          </div>

          <button
            type="button"
            disabled={disabled}
            className={`w-full rounded-full px-6 py-3 text-sm font-medium ${
              disabled
                ? "cursor-not-allowed bg-bg-soft text-text-soft"
                : "bg-brand-bright text-bg-deep hover:bg-brand hover:text-white"
            }`}
          >
            {disabled ? "Market not created yet" : "Connect wallet"}
          </button>
          <p className="text-xs leading-relaxed text-text-soft">
            Every action is simulated first: the health factor and liquidation price above are what you
            sign against, not an estimate produced afterwards.
          </p>
        </div>
      </div>
    </div>
  );
}

function hfTone(hf: number | null) {
  if (hf === null) return undefined;
  if (hf < 1.1) return "text-down";
  if (hf < 1.5) return "text-warn";
  return "text-up";
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-soft">{label}</span>
      <span className={`num ${tone ?? "text-text-strong"}`}>{value}</span>
    </div>
  );
}
