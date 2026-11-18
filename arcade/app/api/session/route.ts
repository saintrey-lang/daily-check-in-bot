import { NextResponse } from "next/server";
import { boardForSeed, type Game } from "@/lib/games";
import { createSession } from "@/lib/session";
import { cookies } from "next/headers";
import { PLAYER_COOKIE, readPlayerCookie } from "@/lib/player";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const playerId = readPlayerCookie((await cookies()).get(PLAYER_COOKIE)?.value);
    if (!playerId) return NextResponse.json({ error: "Enter your Game ID and PIN first." }, { status: 401 });
    const body: unknown = await request.json();
    const game = (body as { game?: unknown } | null)?.game;
    if (game !== "crosswords" && game !== "puzzle") {
      return NextResponse.json({ error: "Choose a game to play." }, { status: 400 });
    }
    const { token, session } = createSession(game as Game, playerId);
    return NextResponse.json({ token, board: game === "puzzle" ? boardForSeed(session.seed) : undefined },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The arcade is temporarily unavailable." }, { status: 503 });
  }
}
