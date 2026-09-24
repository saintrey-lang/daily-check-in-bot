import { verifyPassword, sessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  let body: { password?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  try {
    if (typeof body.password !== "string" || !verifyPassword(body.password)) {
      return Response.json({ error: "Incorrect password." }, { status: 401 });
    }
    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${sessionToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Dashboard is not configured." }, { status: 503 });
  }
}
