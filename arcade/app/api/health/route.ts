import { NextResponse } from "next/server";
import { ArcadePlayersStore } from "@/lib/players-sheet";
import { PUZZLE_CHANNEL_ID } from "@/lib/games";

export const runtime = "nodejs";

export async function GET() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !process.env.ARCADE_SIGNING_SECRET || !process.env.ARCADE_PIN_PEPPER) return NextResponse.json({ ready: false }, { status: 503 });
  try {
    const channelResponse = (path: string) => fetch(`https://discord.com/api/v10/channels/${path}`, {
      headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(8000), cache: "no-store",
    });
    const [crossword, puzzle, sheet] = await Promise.allSettled([
      channelResponse("1293667554866499676"),
      channelResponse(`${PUZZLE_CHANNEL_ID}/messages?limit=1`),
      new ArcadePlayersStore().setup(),
    ]);
    const discordReady = crossword.status === "fulfilled" && crossword.value.ok;
    const puzzleReady = puzzle.status === "fulfilled" && puzzle.value.ok;
    const entryReady = sheet.status === "fulfilled";
    const ready = discordReady && puzzleReady && entryReady;
    return NextResponse.json({ ready, discordReady, puzzleReady, entryReady }, { status: ready ? 200 : 503 });
  } catch {
    return NextResponse.json({ ready: false }, { status: 503 });
  }
}
