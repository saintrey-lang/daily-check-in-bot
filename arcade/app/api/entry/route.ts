import { NextResponse } from "next/server";
import { createPlayerCookie, normalizeGameId, normalizePlayerName, PLAYER_COOKIE, PLAYER_SESSION_AGE_SECONDS, validPin } from "@/lib/player";
import { ArcadePlayersStore, EntryError } from "@/lib/players-sheet";
import { playerCookieOptions } from "@/lib/activity";
import { DiscordLinksStore } from "@/lib/discord-links-sheet";

export const runtime = "nodejs";
const attempts = new Map<string, { count: number; until: number }>();

export async function POST(request: Request) {
  if (process.env.DISCORD_CLIENT_SECRET && (new URL(request.url).hostname.endsWith(".discordsays.com") || request.headers.get("x-arcade-activity") === "1")) {
    return NextResponse.json({ error: "Use your Discord account to enter this Activity." }, { status: 403 });
  }
  let body: { mode?: unknown; gameId?: unknown; name?: unknown; pin?: unknown; confirmPin?: unknown };
  try {
    if (Number(request.headers.get("content-length") || 0) > 1000) throw new Error("Too large");
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid entry details." }, { status: 400 });
  }
  const gameId = normalizeGameId(body?.gameId);
  if (!gameId) return NextResponse.json({ error: "Enter a Game ID of 4–32 letters or numbers." }, { status: 400 });
  const name = normalizePlayerName(body?.name);
  if (!name) return NextResponse.json({ error: "Enter a name of 2–32 letters or numbers." }, { status: 400 });
  if (!validPin(body.pin)) return NextResponse.json({ error: "PIN must be exactly four digits." }, { status: 400 });
  if (body.mode !== "register" && body.mode !== "login") return NextResponse.json({ error: "Choose Create entry or Sign in." }, { status: 400 });
  if (body.mode === "register" && body.confirmPin !== body.pin) return NextResponse.json({ error: "The two PINs do not match." }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${ip}:${body.mode}`;
  const throttle = attempts.get(key);
  if (throttle && throttle.until > Date.now() && throttle.count >= (body.mode === "register" ? 5 : 20)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }
  attempts.set(key, { count: throttle && throttle.until > Date.now() ? throttle.count + 1 : 1, until: Date.now() + 10 * 60 * 1000 });
  if (attempts.size > 2000) attempts.clear();

  try {
    const store = new ArcadePlayersStore();
    if (body.mode === "register") {
      if (await new DiscordLinksStore().hasGameId(gameId)) throw new EntryError("This Game ID is linked to a Discord account. Open the Activity in Discord.", 409);
      await store.register(gameId, body.pin, name);
    }
    else await store.login(gameId, body.pin, name);
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(PLAYER_COOKIE, createPlayerCookie(gameId, name), playerCookieOptions(request, PLAYER_SESSION_AGE_SECONDS));
    return response;
  } catch (error) {
    if (error instanceof EntryError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Arcade entry failed:", error);
    return NextResponse.json({ error: "Entry is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
