import { createHash } from "node:crypto";

export const SCORE_CHANNEL_ID = "1293667554866499676";
const GUILD_ID = "1293483684888055840";
const IMAGE_ORIGIN = "https://golden-spatula-arcade.vercel.app";
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

async function attachedImageMessage(message: { content: string; embeds?: Array<{ title: string; image: { url: string }; color: number }> }, nonce: string): Promise<FormData> {
  const url = new URL(message.embeds![0].image.url);
  if (url.origin !== IMAGE_ORIGIN || !(url.pathname === "/api/puzzle-image" || /^\/puzzle-[12]\.(webp|png)$/.test(url.pathname))) {
    throw new Error("Invalid Arcade picture URL");
  }
  const image = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
  if (!image.ok) throw new Error(`Arcade picture returned ${image.status}`);
  const mime = image.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "";
  const extension = IMAGE_TYPES[mime];
  if (!extension) throw new Error("Arcade picture is not a supported image");
  const bytes = await image.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 4_000_000) throw new Error("Arcade picture is empty or too large");
  const filename = `puzzle-picture.${extension}`;
  const embeds = message.embeds!.map((embed, index) => index === 0 ? { ...embed, image: { url: `attachment://${filename}` } } : embed);
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content: message.content, embeds, attachments: [{ id: 0, filename }], allowed_mentions: { parse: [] }, nonce, enforce_nonce: true }));
  form.append("files[0]", new Blob([bytes], { type: mime }), filename);
  return form;
}

export async function postArcadeMessage(message: { content: string; embeds?: Array<{ title: string; image: { url: string }; color: number }> }, nonceKey: string): Promise<string> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord bot token is not configured");
  const nonce = createHash("sha256").update(nonceKey).digest("hex").slice(0, 24);
  const hasImage = !!message.embeds?.[0]?.image?.url;
  const body = hasImage ? await attachedImageMessage(message, nonce) : JSON.stringify({ ...message, allowed_mentions: { parse: [] }, nonce, enforce_nonce: true });
  const response = await fetch(`https://discord.com/api/v10/channels/${SCORE_CHANNEL_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${token}`, ...(hasImage ? {} : { "Content-Type": "application/json" }) },
    body,
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`Discord returned ${response.status}`);
  const posted: { id?: string } = await response.json();
  if (!posted.id) throw new Error("Discord did not return a message ID");
  return `https://discord.com/channels/${GUILD_ID}/${SCORE_CHANNEL_ID}/${posted.id}`;
}
