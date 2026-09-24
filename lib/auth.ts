import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "checkin_admin";
const SESSION_HOURS = 12;

function password(): string {
  const value = process.env.DASHBOARD_PASSWORD;
  if (!value || value.length < 16) throw new Error("Set DASHBOARD_PASSWORD to a strong password of at least 16 characters.");
  return value;
}

function same(a: string, b: string): boolean {
  const first = createHash("sha256").update(a).digest();
  const second = createHash("sha256").update(b).digest();
  return timingSafeEqual(first, second);
}

export function verifyPassword(candidate: string): boolean {
  return same(candidate, password());
}

export function sessionToken(now = Date.now()): string {
  const expires = String(now + SESSION_HOURS * 3_600_000);
  const signature = createHmac("sha256", password()).update(expires).digest("hex");
  return `${expires}.${signature}`;
}

export function verifySession(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const match = /^(\d{13})\.([0-9a-f]{64})$/.exec(token);
  if (!match || Number(match[1]) <= now) return false;
  const expected = createHmac("sha256", password()).update(match[1]).digest("hex");
  return same(match[2], expected);
}

export function sessionFromRequest(request: Request): boolean {
  const value = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  return verifySession(value);
}

export function requireAdmin(request: Request, mutation = false): Response | null {
  if (!sessionFromRequest(request)) return Response.json({ error: "Sign in to manage the check-in." }, { status: 401 });
  if (mutation && request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  return null;
}
