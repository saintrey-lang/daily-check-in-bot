import { NextResponse } from "next/server";
import { discordClientId, playerCookieOptions } from "@/lib/activity";
import { createPendingDiscordCookie, DISCORD_PENDING_AGE_SECONDS, DISCORD_PENDING_COOKIE, exchangeDiscordCode } from "@/lib/discord-auth";
import { DiscordLinksStore } from "@/lib/discord-links-sheet";
import { createPlayerCookie, PLAYER_COOKIE, PLAYER_SESSION_AGE_SECONDS } from "@/lib/player";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!discordClientId() || !process.env.DISCORD_CLIENT_SECRET) {
    return NextResponse.json({ error: "Discord sign-in is not configured." }, { status: 503 });
  }
  let code: unknown;
  try {
    if (Number(request.headers.get("content-length") || 0) > 5000) throw new Error("Too large");
    code = (await request.json())?.code;
  } catch { return NextResponse.json({ error: "Invalid Discord authorization." }, { status: 400 }); }
  if (typeof code !== "string" || code.length < 10 || code.length > 4000) {
    return NextResponse.json({ error: "Invalid Discord authorization." }, { status: 400 });
  }
  try {
    const { accessToken, identity } = await exchangeDiscordCode(code);
    const store = new DiscordLinksStore();
    const link = await store.getByDiscordId(identity.discordId);
    const response = NextResponse.json({ accessToken, needsGameId: !link, name: identity.name, discordId: identity.discordId },
      { headers: { "Cache-Control": "no-store" } });
    if (link) {
      await store.touch(link, identity.name);
      response.cookies.set(PLAYER_COOKIE, createPlayerCookie(link.gameId, identity.name, identity.discordId), playerCookieOptions(request, PLAYER_SESSION_AGE_SECONDS));
      response.cookies.set(DISCORD_PENDING_COOKIE, "", playerCookieOptions(request, 0));
    } else {
      response.cookies.set(PLAYER_COOKIE, "", playerCookieOptions(request, 0));
      response.cookies.set(DISCORD_PENDING_COOKIE, createPendingDiscordCookie(identity), playerCookieOptions(request, DISCORD_PENDING_AGE_SECONDS));
    }
    return response;
  } catch (error) {
    console.error("Arcade Discord sign-in failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not verify your Discord account. Try reopening the Activity." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
