import { NextResponse } from "next/server";
import { PLAYER_COOKIE } from "@/lib/player";
import { playerCookieOptions } from "@/lib/activity";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PLAYER_COOKIE, "", playerCookieOptions(request, 0));
  return response;
}
