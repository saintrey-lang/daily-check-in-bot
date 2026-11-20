import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PLAYER_COOKIE, readPlayerCookie } from "@/lib/player";
import { readSession } from "@/lib/session";
import { readProgress } from "@/lib/progress";
import { ProgressConflict, progressStore } from "@/lib/progress-sheet";
import { buildProgressMessage } from "@/lib/score-message";
import { postArcadeMessage } from "@/lib/discord-post";

export const runtime = "nodejs";

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
  if (!session || !evaluated || !Number.isSafeInteger(input.revision) || (input.revision as number) < 0 || (input.revision as number) > 100000) {
    return NextResponse.json({ error: "Invalid progress." }, { status: 400 });
  }
  try {
    const store = progressStore();
    const saved = await store.save(player.gameId, session.game, input.token as string, evaluated.state, input.revision as number);
    if (saved.lastPostedRevision >= saved.revision) return NextResponse.json({ ok: true, alreadyPosted: true });
    const current = readProgress(session, saved.state)!;
    const message = buildProgressMessage({ game: session.game, name: player.name, gameId: player.gameId, points: current.points, detail: current.detail, pictureId: session.pictureId });
    const messageUrl = await postArcadeMessage(message, `exit:${session.id}:${saved.revision}`);
    await store.markExit(player.gameId, session.game, input.token as string, saved.revision);
    return NextResponse.json({ ok: true, points: current.points, messageUrl });
  } catch (error) {
    if (error instanceof ProgressConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Could not post arcade exit score:", error);
    return NextResponse.json({ error: "Could not share current points. Please use Exit & Share again." }, { status: 502 });
  }
}
