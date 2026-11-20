import { NextResponse } from "next/server";
import { discordClientId } from "@/lib/activity";

export const runtime = "nodejs";

export function GET() {
  const clientId = discordClientId();
  if (!clientId) return NextResponse.json({ error: "Discord application ID is not configured." }, { status: 503 });
  return NextResponse.json({ clientId, oauthEnabled: !!process.env.DISCORD_CLIENT_SECRET }, { headers: { "Cache-Control": "no-store" } });
}
