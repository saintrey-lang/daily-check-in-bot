import { NextResponse } from "next/server";
import { boardForSeed, type Game, type PuzzlePictureId } from "@/lib/games";
import { createSession } from "@/lib/session";
import { cookies } from "next/headers";
import { PLAYER_COOKIE, readPlayerCookie } from "@/lib/player";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const player = readPlayerCookie((await cookies()).get(PLAYER_COOKIE)?.value);
    if (!player) return NextResponse.json({ error: "Enter your name, Game ID, and PIN first." }, { status: 401 });
    const body: unknown = await request.json();
    const game = (body as { game?: unknown } | null)?.game;
    const requestedPicture = (body as { pictureId?: unknown } | null)?.pictureId;
    if (game !== "crosswords" && game !== "puzzle") {
      return NextResponse.json({ error: "Choose a game to play." }, { status: 400 });
    }
    if (game === "puzzle" && requestedPicture !== undefined && requestedPicture !== 1 && requestedPicture !== 2) {
      return NextResponse.json({ error: "Choose a puzzle image." }, { status: 400 });
    }
    const pictureId = (requestedPicture ?? 1) as PuzzlePictureId;
    const { token, session } = createSession(game as Game, player.gameId, pictureId);
    return NextResponse.json({ token, board: game === "puzzle" ? boardForSeed(session.seed) : undefined },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The arcade is temporarily unavailable." }, { status: 503 });
  }
}
