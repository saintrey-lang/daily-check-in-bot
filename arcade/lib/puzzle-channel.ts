import { discordPictureId, parseDiscordPictureId, PUZZLE_CHANNEL_ID, type PuzzlePicture } from "./games";

type Attachment = { id: string; filename: string; content_type?: string; description?: string; url: string; size: number; width?: number; height?: number };
type ChannelMessage = { id: string; content?: string; attachments?: Attachment[] };

function token(): string {
  const value = process.env.DISCORD_BOT_TOKEN;
  if (!value) throw new Error("Discord bot token is not configured");
  return value;
}

async function discordGet<T>(path: string): Promise<T> {
  const response = await fetch(`https://discord.com/api/v10/channels/${PUZZLE_CHANNEL_ID}/${path}`, {
    headers: { Authorization: `Bot ${token()}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Could not read puzzle channel (${response.status})`);
  return response.json() as Promise<T>;
}

function isImage(attachment: Attachment): boolean {
  return !!attachment.width && !!attachment.height && attachment.size > 0 && attachment.size <= 4_000_000 &&
    (/^image\/(png|jpeg|webp|gif)$/i.test(attachment.content_type || "") || /\.(png|jpe?g|webp|gif)$/i.test(attachment.filename));
}

export async function channelPictures(before?: string): Promise<{ pictures: PuzzlePicture[]; nextBefore: string | null }> {
  const query = new URLSearchParams({ limit: "100" });
  if (before) query.set("before", before);
  const messages = await discordGet<ChannelMessage[]>(`messages?${query}`);
  const pictures = messages.flatMap((message) => (message.attachments || []).filter(isImage).map((attachment): PuzzlePicture => ({
    id: discordPictureId(message.id, attachment.id),
    src: `/api/puzzle-image?messageId=${message.id}&attachmentId=${attachment.id}`,
    label: (attachment.description || message.content || attachment.filename).replace(/\s+/g, " ").trim().slice(0, 60) || "Community picture",
  })));
  return { pictures, nextBefore: messages.length === 100 ? messages[messages.length - 1].id : null };
}

export async function channelAttachment(pictureId: unknown): Promise<Attachment | null> {
  const parsed = parseDiscordPictureId(pictureId);
  if (!parsed) return null;
  const message = await discordGet<ChannelMessage>(`messages/${parsed.messageId}`);
  return (message.attachments || []).find((item) => item.id === parsed.attachmentId && isImage(item)) || null;
}
