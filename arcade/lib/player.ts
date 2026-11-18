import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const PLAYER_COOKIE = "gs_arcade_player";
export const PLAYER_SESSION_AGE_SECONDS = 24 * 60 * 60;

export function normalizeGameId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toUpperCase();
  return /^[A-Z0-9#_-]{4,32}$/.test(id) ? id : null;
}

export function validPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

function signingKey(): string {
  const key = process.env.ARCADE_SIGNING_SECRET;
  if (!key || key.length < 32) throw new Error("Arcade signing secret is not configured");
  return key;
}

function pinPepper(): string {
  const pepper = process.env.ARCADE_PIN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error("Arcade PIN pepper is not configured");
  return pepper;
}

export function hashPin(pin: string): string {
  if (!validPin(pin)) throw new Error("PIN must contain exactly four digits");
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(`${pin}:${pinPepper()}`, salt, 64).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function checkPin(pin: string, encoded: string): boolean {
  if (!validPin(pin)) return false;
  const [algorithm, salt, stored, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !stored || extra || !/^[A-Za-z0-9_-]{20,30}$/.test(salt)) return false;
  const expected = Buffer.from(stored, "base64url");
  if (expected.length !== 64) return false;
  const actual = scryptSync(`${pin}:${pinPepper()}`, salt, 64);
  return timingSafeEqual(actual, expected);
}

type PlayerSession = { gameId: string; issuedAt: number; nonce: string };

function sign(payload: string): Buffer {
  return createHmac("sha256", signingKey()).update(`arcade-player\0${payload}`).digest();
}

export function createPlayerCookie(gameId: string): string {
  const session: PlayerSession = { gameId, issuedAt: Date.now(), nonce: randomBytes(8).toString("hex") };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

export function readPlayerCookie(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 512) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload);
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const session: PlayerSession = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const age = Date.now() - session.issuedAt;
    if (!normalizeGameId(session.gameId) || session.gameId !== normalizeGameId(session.gameId) ||
      !/^[0-9a-f]{16}$/.test(session.nonce) || !Number.isFinite(age) || age < 0 || age > PLAYER_SESSION_AGE_SECONDS * 1000) return null;
    return session.gameId;
  } catch {
    return null;
  }
}
