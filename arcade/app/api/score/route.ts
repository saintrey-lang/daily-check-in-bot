import { NextResponse } from "next/server";
import { verifyCrossword, verifyPuzzle } from "@/lib/games";
import { readSession } from "@/lib/session";
import { cookies } from "next/headers";
import { PLAYER_COOKIE, readPlayerCookie } from "@/lib/player";
import { buildScoreMessage } from "@/lib/score-message";
import { postArcadeMessage } from "@/lib/discord-post";
import { progressStore } from "@/lib/progress-sheet";

export const runtime = "nodejs";

// A fast local guard; Discord's enforce_nonce handles short-lived retries across instances.
const completed = new Set<string>();

export async function POST(request: Request) {
  const player = readPlayerCookie((await cookies()).get(PLAYER_COOKIE)?.value);
  if (!player) return NextResponse.json({ error: "Enter your name, Game ID, and PIN first." }, { status: 401 });
  let input: { token?: unknown; letters?: unknown; moves?: unknown };
  try {
    if (Number(request.headers.get("content-length") || 0) > 16000) throw new Error("Too large");
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid score submission." }, { status: 400 });
  }
  const session = readSession(input?.token);
  if (!session || session.playerId !== player.gameId) return NextResponse.json({ error: "Game session expired. Start a new game." }, { status: 400 });
  const elapsed = Math.floor((Date.now() - session.issuedAt) / 1000);
  const minimum = session.game === "crosswords" ? 15 : 8;
  if (elapsed < minimum) {
    return NextResponse.json({ error: `Finish the game before submitting your score.` }, { status: 400 });
  }
  const valid = session.game === "crosswords" ? verifyCrossword(input.letters) : verifyPuzzle(session.seed, input.moves);
  if (!valid) return NextResponse.json({ error: "That game is not complete yet." }, { status: 400 });
  if (completed.has(session.id)) return NextResponse.json({ error: "This score was already submitted." }, { status: 409 });
  try {
    const saved = await progressStore().get(player.gameId, session.game);
    if (!saved || saved.token !== input.token || saved.completed) return NextResponse.json({ error: "This game is no longer active." }, { status: 409 });
  } catch (error) {
    console.error("Could not verify active game:", error);
    return NextResponse.json({ error: "Could not verify your game. Please try again." }, { status: 503 });
  }
  completed.add(session.id);
  const moves = session.game === "puzzle" ? (input.moves as number[]).length : undefined;
  const score = session.game === "crosswords"
    ? Math.max(100, 1200 - elapsed * 4)
    : Math.max(100, 1400 - elapsed * 4 - (moves || 0) * 7);
  const message = buildScoreMessage({ game: session.game, name: player.name, score, elapsed, moves, pictureId: session.pictureId });

  try {
    const messageUrl = await postArcadeMessage(session.game, message, `complete:${session.id}`);
    try { await progressStore().markComplete(player.gameId, session.game, input.token as string); }
    catch (error) { console.error("Could not mark arcade progress completed:", error); }
    return NextResponse.json({ score, elapsed, moves, messageUrl },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    completed.delete(session.id);
    console.error("Arcade score posting failed:", error);
    return NextResponse.json({ error: "Could not post to Discord. Please try again." }, { status: 502 });
  }
}
