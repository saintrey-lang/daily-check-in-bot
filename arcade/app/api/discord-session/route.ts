import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PLAYER_COOKIE, readPlayerCookie } from "@/lib/player";

export const runtime = "nodejs";

export async function GET() {
  const player = readPlayerCookie((await cookies()).get(PLAYER_COOKIE)?.value);
  if (!player?.discordId) return NextResponse.json({ error: "Discord sign-in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ discordId: player.discordId, name: player.name }, { headers: { "Cache-Control": "no-store" } });
}
