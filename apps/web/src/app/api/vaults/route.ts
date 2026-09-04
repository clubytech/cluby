import { NextResponse } from "next/server";
import { getVaults } from "@/lib/markets";

export const revalidate = 30;

export async function GET() {
  const vaults = await getVaults();
  return NextResponse.json({ vaults, updatedAt: Date.now() });
}
