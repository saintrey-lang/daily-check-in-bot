import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { playerCookieOptions } from "@/lib/activity";
import { DISCORD_PENDING_COOKIE, readPendingDiscordCookie } from "@/lib/discord-auth";
import { DiscordLinksStore } from "@/lib/discord-links-sheet";
import { createPlayerCookie, normalizeGameId, PLAYER_COOKIE, PLAYER_SESSION_AGE_SECONDS, validPin } from "@/lib/player";
import { ArcadePlayersStore, EntryError } from "@/lib/players-sheet";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const identity = readPendingDiscordCookie((await cookies()).get(DISCORD_PENDING_COOKIE)?.value);
  if (!identity) return NextResponse.json({ error: "Your Discord link expired. Reopen the Activity." }, { status: 401 });
  let body: { gameId?: unknown; pin?: unknown };
  try {
    if (Number(request.headers.get("content-length") || 0) > 1000) throw new Error("Too large");
    body = await request.json();
  } catch { return NextResponse.json({ error: "Invalid Game ID." }, { status: 400 }); }
  const gameId = normalizeGameId(body?.gameId);
  if (!gameId) return NextResponse.json({ error: "Enter a Game ID of 4–32 letters or numbers." }, { status: 400 });
  if (body.pin !== undefined && !validPin(body.pin)) return NextResponse.json({ error: "PIN must be exactly four digits." }, { status: 400 });
  try {
    const links = new DiscordLinksStore();
    if (await links.getByDiscordId(identity.discordId)) throw new EntryError("This Discord account is already linked. Reopen the Activity.", 409);
    if (await links.hasGameId(gameId)) throw new EntryError("This Game ID is already linked to another Discord account.", 409);
    const legacy = new ArcadePlayersStore();
    if (await legacy.exists(gameId)) {
      if (!body.pin) return NextResponse.json({ requiresLegacyPin: true, error: "This Game ID has earlier progress. Enter its old PIN once to link it." }, { status: 409 });
      await legacy.login(gameId, body.pin, identity.name);
    }
    await links.link(identity.discordId, gameId, identity.name);
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(PLAYER_COOKIE, createPlayerCookie(gameId, identity.name, identity.discordId), playerCookieOptions(request, PLAYER_SESSION_AGE_SECONDS));
    response.cookies.set(DISCORD_PENDING_COOKIE, "", playerCookieOptions(request, 0));
    return response;
  } catch (error) {
    if (error instanceof EntryError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error("Arcade Discord linking failed:", error);
    return NextResponse.json({ error: "Could not link your Game ID. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
