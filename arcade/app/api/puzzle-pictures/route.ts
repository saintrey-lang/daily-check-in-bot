import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PLAYER_COOKIE, readPlayerCookie } from "@/lib/player";
import { puzzlePictures } from "@/lib/games";
import { channelPictures } from "@/lib/puzzle-channel";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const player = readPlayerCookie((await cookies()).get(PLAYER_COOKIE)?.value);
  if (!player) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const before = new URL(request.url).searchParams.get("before");
  if (before && !/^\d{17,20}$/.test(before)) return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  try {
    const result = await channelPictures(before || undefined);
    return NextResponse.json({ pictures: before ? result.pictures : [...puzzlePictures, ...result.pictures], nextBefore: result.nextBefore },
      { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    console.error("Puzzle channel unavailable:", error);
    if (before) return NextResponse.json({ pictures: [], nextBefore: null, warning: "Could not load more channel images." });
    return NextResponse.json({ pictures: puzzlePictures, nextBefore: null, warning: "Channel images are unavailable. The bot needs View Channel and Read Message History access." });
  }
}
