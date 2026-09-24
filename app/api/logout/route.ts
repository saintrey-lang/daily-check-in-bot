import { requireAdmin, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  const denied = requireAdmin(request, true);
  if (denied) return denied;
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}
