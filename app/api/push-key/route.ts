import { NextResponse } from "next/server";
import { adminClient, vapidKeys } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The public half of the notification key, which phones need to subscribe. */
export async function GET() {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ publicKey: null });
  const { publicKey } = await vapidKeys(admin);
  return NextResponse.json({ publicKey });
}
