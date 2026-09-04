import { NextResponse } from "next/server";
import { getProtocolStats } from "@/lib/markets";

export const revalidate = 30;

export async function GET() {
  return NextResponse.json({ ...(await getProtocolStats()), updatedAt: Date.now() });
}
