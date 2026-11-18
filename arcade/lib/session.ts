import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Game, PuzzlePictureId } from "./games";

export type Session = { id: string; game: Game; seed: number; issuedAt: number; playerId: string; pictureId?: PuzzlePictureId };
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function key(): string {
  const secret = process.env.ARCADE_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new Error("Arcade signing secret is not configured");
  return secret;
}

function sign(payload: string): Buffer {
  return createHmac("sha256", key()).update(payload).digest();
}

export function createSession(game: Game, playerId: string, pictureId: PuzzlePictureId = 1): { token: string; session: Session } {
  const session: Session = {
    id: randomBytes(12).toString("hex"),
    game,
    seed: randomBytes(4).readUInt32BE(0) || 1,
    issuedAt: Date.now(),
    playerId,
    ...(game === "puzzle" ? { pictureId } : {}),
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return { token: `${payload}.${sign(payload).toString("base64url")}`, session };
}

export function readSession(token: unknown): Session | null {
  if (typeof token !== "string" || token.length > 512) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const actual = Buffer.from(signature, "base64url");
  const expected = sign(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!value || typeof value !== "object") return null;
    const session = value as Session;
    const age = Date.now() - session.issuedAt;
    if (!/^[0-9a-f]{24}$/.test(session.id) || !/^[A-Z0-9#_-]{4,32}$/.test(session.playerId) || !["crosswords", "puzzle"].includes(session.game) ||
        (session.game === "puzzle" && session.pictureId !== undefined && session.pictureId !== 1 && session.pictureId !== 2) ||
        (session.game === "crosswords" && session.pictureId !== undefined) ||
        !Number.isSafeInteger(session.seed) || session.seed < 1 || session.seed > 0xffffffff ||
        !Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return null;
    return session;
  } catch {
    return null;
  }
}
