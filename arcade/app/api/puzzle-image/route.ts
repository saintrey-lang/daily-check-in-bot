import { channelAttachment } from "@/lib/puzzle-channel";
import { discordPictureId } from "@/lib/games";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const messageId = params.get("messageId") || "";
  const attachmentId = params.get("attachmentId") || "";
  if (!/^\d{17,20}$/.test(messageId) || !/^\d{17,20}$/.test(attachmentId)) return new Response("Invalid image", { status: 400 });
  try {
    const attachment = await channelAttachment(discordPictureId(messageId, attachmentId));
    if (!attachment) return new Response("Image not found", { status: 404 });
    if (attachment.size > 4_000_000) return new Response("Image is too large for the arcade", { status: 413 });
    const response = await fetch(attachment.url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok || !response.body) throw new Error(`Image CDN returned ${response.status}`);
    return new Response(response.body, {
      headers: { "Content-Type": attachment.content_type || "image/png", "Cache-Control": "public, max-age=600", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("Puzzle image unavailable:", error);
    return new Response("Image unavailable", { status: 502 });
  }
}
