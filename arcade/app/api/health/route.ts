import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !process.env.ARCADE_SIGNING_SECRET) return NextResponse.json({ ready: false }, { status: 503 });
  try {
    const response = await fetch("https://discord.com/api/v10/channels/1293667554866499676", {
      headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    return NextResponse.json({ ready: response.ok }, { status: response.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ ready: false }, { status: 503 });
  }
}
