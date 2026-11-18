import { NextResponse } from "next/server";
import { verifyCrossword, verifyPuzzle } from "@/lib/games";
import { readSession } from "@/lib/session";

export const runtime = "nodejs";

const CHANNEL_ID = "1293667554866499676";
// A fast local guard; Discord's enforce_nonce handles short-lived retries across instances.
const completed = new Set<string>();

export async function POST(request: Request) {
  let input: { token?: unknown; name?: unknown; letters?: unknown; moves?: unknown };
  try {
    if (Number(request.headers.get("content-length") || 0) > 16000) throw new Error("Too large");
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid score submission." }, { status: 400 });
  }
  const session = readSession(input?.token);
  if (!session) return NextResponse.json({ error: "Game session expired. Start a new game." }, { status: 400 });
  if (typeof input.name !== "string" || !/^[\p{L}\p{N} _.-]{2,24}$/u.test(input.name.trim())) {
    return NextResponse.json({ error: "Use a name of 2–24 letters or numbers." }, { status: 400 });
  }
  const name = input.name.trim();
  const elapsed = Math.floor((Date.now() - session.issuedAt) / 1000);
  const minimum = session.game === "crosswords" ? 15 : 8;
  if (elapsed < minimum) {
    return NextResponse.json({ error: `Finish the game before submitting your score.` }, { status: 400 });
  }
  const valid = session.game === "crosswords" ? verifyCrossword(input.letters) : verifyPuzzle(session.seed, input.moves);
  if (!valid) return NextResponse.json({ error: "That game is not complete yet." }, { status: 400 });
  if (completed.has(session.id)) return NextResponse.json({ error: "This score was already submitted." }, { status: 409 });
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) return NextResponse.json({ error: "Score posting is temporarily unavailable." }, { status: 503 });

  completed.add(session.id);
  const moves = session.game === "puzzle" ? (input.moves as number[]).length : undefined;
  const score = session.game === "crosswords"
    ? Math.max(100, 1200 - elapsed * 4)
    : Math.max(100, 1400 - elapsed * 4 - (moves || 0) * 7);
  const title = session.game === "crosswords" ? "GOLDEN SPATULA CROSSWORDS" : "GOLDEN SPATULA PUZZLE";
  const content = [
    `🏆 **${title} — completed!**`,
    `Player: **${name}** (player-entered name)`,
    `Score: **${score.toLocaleString("en-US")}** · Time: **${Math.floor(elapsed / 60)}m ${elapsed % 60}s**${moves ? ` · Moves: **${moves}**` : ""}`,
  ].join("\n");

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] }, nonce: session.id, enforce_nonce: true }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Discord returned ${response.status}`);
    const message: { id?: string } = await response.json();
    if (!message.id) throw new Error("Discord did not return a message ID");
    return NextResponse.json({ score, elapsed, moves, messageUrl: `https://discord.com/channels/1293483684888055840/${CHANNEL_ID}/${message.id}` },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    completed.delete(session.id);
    console.error("Arcade score posting failed:", error);
    return NextResponse.json({ error: "Could not post to Discord. Please try again." }, { status: 502 });
  }
}
