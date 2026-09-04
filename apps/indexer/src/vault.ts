import { ponder } from "ponder:registry";
import { vault, vaultAllocation } from "ponder:schema";
import { deployments } from "@cluby/config";

const keyOf = (address: string) =>
  Object.entries(deployments.vaults).find(([, a]) => a.toLowerCase() === address.toLowerCase())?.[0] ??
  address;

async function ensureVault(context: any, address: `0x${string}`, timestamp: number) {
  const existing = await context.db.find(vault, { id: address });
  if (existing) return existing;
  await context.db.insert(vault).values({
    id: address,
    key: keyOf(address),
    asset: "0x0000000000000000000000000000000000000000",
    totalAssets: 0n,
    totalShares: 0n,
    feeShares: 0n,
    depositorCount: 0,
    updatedAt: timestamp,
  });
  return context.db.find(vault, { id: address });
}

ponder.on("Vault:Deposit", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await ensureVault(context, event.log.address, ts);
  await context.db.update(vault, { id: event.log.address }).set((row: any) => ({
    totalAssets: row.totalAssets + event.args.assets,
    totalShares: row.totalShares + event.args.shares,
    // First deposit from an address counts once; later top-ups do not inflate the count.
    depositorCount: row.depositorCount + (event.args.shares > 0n && row.totalShares === 0n ? 1 : 0),
    updatedAt: ts,
  }));
});

ponder.on("Vault:Withdraw", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await ensureVault(context, event.log.address, ts);
  await context.db.update(vault, { id: event.log.address }).set((row: any) => ({
    totalAssets: row.totalAssets - event.args.assets,
    totalShares: row.totalShares - event.args.shares,
    updatedAt: ts,
  }));
});

/** A cap of zero is how a market is retired: the vault may no longer lend into it. */
ponder.on("Vault:SetCap", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  const id = `${event.log.address}-${event.args.id}`;
  const existing = await context.db.find(vaultAllocation, { id });
  if (existing) {
    await context.db.update(vaultAllocation, { id }).set({ cap: event.args.cap, updatedAt: ts });
  } else {
    await context.db.insert(vaultAllocation).values({
      id,
      vault: event.log.address,
      marketId: event.args.id,
      cap: event.args.cap,
      supplied: 0n,
      updatedAt: ts,
    });
  }
});

ponder.on("Vault:ReallocateSupply", async ({ event, context }) => {
  const id = `${event.log.address}-${event.args.id}`;
  const existing = await context.db.find(vaultAllocation, { id });
  if (!existing) return;
  await context.db.update(vaultAllocation, { id }).set((row: any) => ({
    supplied: row.supplied + event.args.suppliedAssets,
    updatedAt: Number(event.block.timestamp),
  }));
});

ponder.on("Vault:ReallocateWithdraw", async ({ event, context }) => {
  const id = `${event.log.address}-${event.args.id}`;
  const existing = await context.db.find(vaultAllocation, { id });
  if (!existing) return;
  await context.db.update(vaultAllocation, { id }).set((row: any) => ({
    supplied: row.supplied - event.args.withdrawnAssets,
    updatedAt: Number(event.block.timestamp),
  }));
});

ponder.on("Vault:AccrueInterest", async ({ event, context }) => {
  const ts = Number(event.block.timestamp);
  await ensureVault(context, event.log.address, ts);
  await context.db.update(vault, { id: event.log.address }).set((row: any) => ({
    totalAssets: event.args.newTotalAssets,
    feeShares: row.feeShares + event.args.feeShares,
    updatedAt: ts,
  }));
});
