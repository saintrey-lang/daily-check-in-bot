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
});
