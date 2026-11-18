import { NextResponse } from "next/server";
import { ArcadePlayersStore } from "@/lib/players-sheet";

export const runtime = "nodejs";

export async function GET() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !process.env.ARCADE_SIGNING_SECRET || !process.env.ARCADE_PIN_PEPPER) return NextResponse.json({ ready: false }, { status: 503 });
  try {
    const [response, sheet] = await Promise.allSettled([fetch("https://discord.com/api/v10/channels/1293667554866499676", {
      headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(8000), cache: "no-store",
    }), new ArcadePlayersStore().setup()]);
    const discordReady = response.status === "fulfilled" && response.value.ok;
    const entryReady = sheet.status === "fulfilled";
    return NextResponse.json({ ready: discordReady && entryReady, discordReady, entryReady }, { status: discordReady && entryReady ? 200 : 503 });
  } catch {
    return NextResponse.json({ ready: false }, { status: 503 });
  }
}
