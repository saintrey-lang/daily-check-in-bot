import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "checkin_discord_session";
export const STATE_COOKIE = "checkin_discord_state";
const SESSION_HOURS = 2;
const DISCORD_API = "https://discord.com/api/v10";
type Session = { accessToken: string; userId: string; expiresAt: number };

export function oauthConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  const roleId = process.env.DISCORD_ALLOWED_ROLE_ID?.trim();
  const guildId = process.env.CHECKIN_GUILD_ID?.trim() || "1293483684888055840";
  const baseInput = process.env.DASHBOARD_BASE_URL?.trim();
  if (!clientId || !clientSecret || !roleId || !baseInput) {
    throw new Error("Set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_ALLOWED_ROLE_ID and DASHBOARD_BASE_URL.");
  }
  if (![clientId, roleId, guildId].every((id) => /^\d{17,20}$/.test(id))) throw new Error("Invalid Discord application, role, or server ID.");
  const base = new URL(baseInput);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) {
    throw new Error("DASHBOARD_BASE_URL must be HTTPS (or localhost in development).");
  }
  if (base.pathname !== "/" || base.search || base.hash) throw new Error("DASHBOARD_BASE_URL must contain only the site origin.");
  return {
    clientId, clientSecret, roleId, guildId, origin: base.origin,
    redirectUri: new URL("/api/auth/discord/callback", base).toString(),
  };
}

export function randomState(): string { return randomBytes(32).toString("hex"); }

export function stateMatches(sent: string | null, expected: string | undefined): boolean {
  if (!sent || !expected || !/^[0-9a-f]{64}$/.test(sent) || !/^[0-9a-f]{64}$/.test(expected)) return false;
  return timingSafeEqual(Buffer.from(sent, "hex"), Buffer.from(expected, "hex"));
}

function key() {
  return createHash("sha256").update("daily-checkin-discord-session-v1\0").update(oauthConfig().clientSecret).digest();
}

export function encodeSession(session: Session): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const content = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  return [iv, content, cipher.getAuthTag()].map((part) => part.toString("base64url")).join(".");
}

export function decodeSession(value: string | undefined, now = Date.now()): Session | null {
  if (!value || value.length > 3000) return null;
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return null;
    const [iv, content, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8")) as Session;
    if (!/^\d{17,20}$/.test(parsed.userId) || !parsed.accessToken ||
        typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now || parsed.expiresAt > now + SESSION_HOURS * 3_600_000 + 60_000) return null;
    return parsed;
  } catch { return null; }
}

export function createSession(accessToken: string, userId: string, tokenExpiresIn: number, now = Date.now()) {
  const duration = Math.max(0, Math.min(SESSION_HOURS * 3600, tokenExpiresIn - 60));
  if (!duration) throw new Error("Discord authorization expired.");
  return encodeSession({ accessToken, userId, expiresAt: now + duration * 1000 });
}

export function cookieFromRequest(request: Request, name: string): string | undefined {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function cookieHeader(name: string, value: string, maxAge: number, path = "/"): string {
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export async function hasAllowedRole(accessToken: string, userId: string, config = oauthConfig()): Promise<boolean> {
  try {
    const response = await fetch(`${DISCORD_API}/users/@me/guilds/${config.guildId}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return false;
    const member = await response.json() as { roles?: unknown; user?: { id?: string } };
    return (!member.user?.id || member.user.id === userId) && Array.isArray(member.roles) && member.roles.includes(config.roleId);
  } catch { return false; }
}

export async function authorizedSession(value: string | undefined): Promise<Session | null> {
  const session = decodeSession(value);
  if (!session) return null;
  return await hasAllowedRole(session.accessToken, session.userId) ? session : null;
}

export async function requireAdmin(request: Request, mutation = false): Promise<Response | null> {
  if (!await authorizedSession(cookieFromRequest(request, SESSION_COOKIE))) {
    return Response.json({ error: "Discord sign-in and the dashboard role are required." }, { status: 401 });
  }
  if (mutation && request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  return null;
}
