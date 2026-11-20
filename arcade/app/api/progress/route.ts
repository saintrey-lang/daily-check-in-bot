import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PLAYER_COOKIE, readPlayerCookie } from "@/lib/player";
import { readSession } from "@/lib/session";
import { readProgress } from "@/lib/progress";
import { ProgressConflict, progressStore } from "@/lib/progress-sheet";
import type { Game } from "@/lib/games";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const player = readPlayerCookie((await cookies()).get(PLAYER_COOKIE)?.value);
  if (!player) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const game = new URL(request.url).searchParams.get("game");
  if (game !== "crosswords" && game !== "puzzle") return NextResponse.json({ error: "Choose a game." }, { status: 400 });
  try {
    const saved = await progressStore().get(player.gameId, game);
    const session = readSession(saved?.token);
    const evaluated = session && session.playerId === player.gameId && session.game === game && !saved?.completed ? readProgress(session, saved?.state) : null;
    return NextResponse.json({ progress: evaluated && saved ? { token: saved.token, pictureId: session?.pictureId, state: evaluated.state, board: evaluated.board, revision: saved.revision, points: evaluated.points, startedAt: session?.issuedAt } : null },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Could not load arcade progress:", error);
    return NextResponse.json({ error: "Could not load saved progress." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const player = readPlayerCookie((await cookies()).get(PLAYER_COOKIE)?.value);
  if (!player) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  let input: { token?: unknown; state?: unknown; revision?: unknown };
  try {
    if (Number(request.headers.get("content-length") || 0) > 16000) throw new Error("Too large");
    input = await request.json();
  } catch { return NextResponse.json({ error: "Invalid progress." }, { status: 400 }); }
  const session = readSession(input.token);
  const evaluated = session && session.playerId === player.gameId ? readProgress(session, input.state) : null;
  if (!session || !evaluated || !Number.isSafeInteger(input.revision) || (input.revision as number) < 1 || (input.revision as number) > 100000) {
    return NextResponse.json({ error: "Invalid progress." }, { status: 400 });
  }
  try {
    const saved = await progressStore().save(player.gameId, session.game as Game, input.token as string, evaluated.state, input.revision as number);
    return NextResponse.json({ ok: true, points: readProgress(session, saved.state)?.points ?? evaluated.points, revision: saved.revision });
  } catch (error) {
    if (error instanceof ProgressConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Could not save arcade progress:", error);
    return NextResponse.json({ error: "Could not save progress." }, { status: 503 });
  }
}
