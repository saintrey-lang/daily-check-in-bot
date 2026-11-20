import { createHash } from "node:crypto";
import { PUZZLE_CHANNEL_ID, type Game } from "./games";

const CROSSWORD_CHANNEL_ID = "1293667554866499676";
const GUILD_ID = "1293483684888055840";

export async function postArcadeMessage(game: Game, message: { content: string; embeds?: Array<{ title: string; image: { url: string }; color: number }> }, nonceKey: string): Promise<string> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord bot token is not configured");
  const channelId = game === "puzzle" ? PUZZLE_CHANNEL_ID : CROSSWORD_CHANNEL_ID;
  const nonce = createHash("sha256").update(nonceKey).digest("hex").slice(0, 24);
  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...message, allowed_mentions: { parse: [] }, nonce, enforce_nonce: true }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Discord returned ${response.status}`);
  const posted: { id?: string } = await response.json();
  if (!posted.id) throw new Error("Discord did not return a message ID");
  return `https://discord.com/channels/${GUILD_ID}/${channelId}/${posted.id}`;
}
