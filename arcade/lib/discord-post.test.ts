import { afterEach, describe, expect, it, vi } from "vitest";
import { postArcadeMessage, SCORE_CHANNEL_ID } from "./discord-post";
import { buildProgressMessage, buildScoreMessage } from "./score-message";

describe("Arcade score channel", () => {
  afterEach(() => {
    delete process.env.DISCORD_BOT_TOKEN;
    vi.unstubAllGlobals();
  });

  it("posts crossword scores, puzzle scores, and puzzle exit points to the same score channel", async () => {
    process.env.DISCORD_BOT_TOKEN = "test-bot-token";
    const send = vi.fn().mockImplementation((url: string | URL) => Promise.resolve(
      String(url).startsWith("https://golden-spatula-arcade.vercel.app/")
        ? new Response(new Uint8Array([82, 73, 70, 70]), { status: 200, headers: { "Content-Type": "image/webp" } })
        : new Response(JSON.stringify({ id: "111222333444555666" }), { status: 200 }),
    ));
    vi.stubGlobal("fetch", send);
    const messages = [
      buildScoreMessage({ game: "crosswords", name: "Saint", score: 1000, elapsed: 50 }),
      buildScoreMessage({ game: "puzzle", name: "Saint", score: 900, elapsed: 90, pictureId: 1 }),
      buildProgressMessage({ game: "puzzle", name: "Saint", gameId: "SAINT1", points: 200, detail: "in progress", pictureId: 1 }),
    ];
    for (const [index, message] of messages.entries()) {
      const url = await postArcadeMessage(message, `test:${index}`);
      expect(url).toBe(`https://discord.com/channels/1293483684888055840/${SCORE_CHANNEL_ID}/111222333444555666`);
    }
    const posts = send.mock.calls.filter(([url]) => String(url) === `https://discord.com/api/v10/channels/${SCORE_CHANNEL_ID}/messages`);
    expect(posts).toHaveLength(3);
    expect(JSON.parse(posts[0][1].body).content).toContain("CROSSWORDS");
    for (const [, options] of posts.slice(1)) {
      expect(options.body).toBeInstanceOf(FormData);
      const form = options.body as FormData;
      const payload = JSON.parse(form.get("payload_json") as string);
      expect(payload.embeds[0].image.url).toBe("attachment://puzzle-picture.webp");
      expect((form.get("files[0]") as Blob).size).toBe(4);
      expect(options.headers["Content-Type"]).toBeUndefined();
    }
  });

  it("refuses a puzzle report if its image cannot be uploaded", async () => {
    process.env.DISCORD_BOT_TOKEN = "test-bot-token";
    const send = vi.fn().mockResolvedValue(new Response("Image unavailable", { status: 502 }));
    vi.stubGlobal("fetch", send);
    await expect(postArcadeMessage(buildScoreMessage({ game: "puzzle", name: "Saint", score: 900, elapsed: 60, pictureId: 1 }), "failed-image"))
      .rejects.toThrow("Arcade picture returned 502");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("uploads a fresh image from the Discord puzzle channel for a community picture", async () => {
    process.env.DISCORD_BOT_TOKEN = "test-bot-token";
    const messageId = "1573243616925712495";
    const attachmentId = "1573243616925712496";
    const cdnUrl = "https://cdn.discordapp.com/attachments/source/portrait.png?ex=123";
    const send = vi.fn().mockImplementation((url: string | URL) => {
      const value = String(url);
      if (value.endsWith(`/channels/1573243616925712495/messages/${messageId}`)) {
        return Promise.resolve(new Response(JSON.stringify({ attachments: [{ id: attachmentId, filename: "portrait.png", content_type: "image/png", url: cdnUrl, size: 4, width: 1, height: 1 }] }), { status: 200 }));
      }
      if (value === cdnUrl) return Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { "Content-Type": "image/png" } }));
      return Promise.resolve(new Response(JSON.stringify({ id: "111222333444555666" }), { status: 200 }));
    });
    vi.stubGlobal("fetch", send);
    const message = buildScoreMessage({ game: "puzzle", name: "Saint", score: 900, elapsed: 60, pictureId: `discord:${messageId}:${attachmentId}` });
    await postArcadeMessage(message, "community-image");
    expect(send.mock.calls.map(([url]) => String(url))).toContain(cdnUrl);
    const form = send.mock.calls.at(-1)![1].body as FormData;
    expect(JSON.parse(form.get("payload_json") as string).embeds[0].image.url).toBe("attachment://puzzle-picture.png");
    expect((form.get("files[0]") as Blob).size).toBe(4);
  });
});
