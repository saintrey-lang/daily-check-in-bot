import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { discordClientId } from "./activity";
import { normalizePlayerName } from "./player";

export const DISCORD_PENDING_COOKIE = "gs_arcade_discord_pending";
export const DISCORD_PENDING_AGE_SECONDS = 10 * 60;

export type DiscordIdentity = { discordId: string; name: string };

function sign(payload: string): Buffer {
  const key = process.env.ARCADE_SIGNING_SECRET;
  if (!key || key.length < 32) throw new Error("Arcade signing secret is not configured");
  return createHmac("sha256", key).update(`arcade-discord-link\0${payload}`).digest();
}

export function createPendingDiscordCookie(identity: DiscordIdentity): string {
  const payload = Buffer.from(JSON.stringify({ ...identity, issuedAt: Date.now(), nonce: randomBytes(8).toString("hex") })).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

export function readPendingDiscordCookie(value: unknown): DiscordIdentity | null {
  if (typeof value !== "string" || value.length > 512) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload);
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const age = Date.now() - data.issuedAt;
    if (!/^\d{17,20}$/.test(data.discordId) || !normalizePlayerName(data.name) || data.name !== normalizePlayerName(data.name) ||
      !/^[0-9a-f]{16}$/.test(data.nonce) || !Number.isFinite(age) || age < 0 || age > DISCORD_PENDING_AGE_SECONDS * 1000) return null;
    return { discordId: data.discordId, name: data.name };
  } catch { return null; }
}

export async function exchangeDiscordCode(code: string): Promise<{ accessToken: string; identity: DiscordIdentity }> {
  const clientId = discordClientId();
  const secret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("Discord OAuth is not configured");
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: "authorization_code", code }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenResponse.ok) throw new Error("Discord could not authorize this player");
  const token: { access_token?: unknown; token_type?: unknown; scope?: unknown } = await tokenResponse.json();
  if (typeof token.access_token !== "string" || token.access_token.length < 16 ||
      token.token_type !== "Bearer" || typeof token.scope !== "string" || !token.scope.split(" ").includes("identify")) {
    throw new Error("Discord authorization did not include identify");
  }
  const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!userResponse.ok) throw new Error("Discord could not verify this player");
  const user: { id?: unknown; username?: unknown } = await userResponse.json();
  if (typeof user.id !== "string" || !/^\d{17,20}$/.test(user.id)) throw new Error("Discord returned an invalid player");
  const name = normalizePlayerName(user.username) || `Player ${user.id.slice(-4)}`;
  return { accessToken: token.access_token, identity: { discordId: user.id, name } };
}
