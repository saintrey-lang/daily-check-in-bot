import { NextResponse } from "next/server";
import { PLAYER_COOKIE } from "@/lib/player";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PLAYER_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
